const yauzl = require('yauzl');
const plist = require('plist');
const bplist = require('bplist-parser');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { resolveItemId, isValidIpaStorageFileName } = require('../../utils/ipaFileName');
const { normalizePlistMetadata, normalizeStoredMetadata } = require('../../utils/ipaMetadata');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const DATA_DIR = path.join(__dirname, '../../data');

function resolveMetadataPaths(fileName) {
    const baseName = path.basename(String(fileName || ''));
    if (!isValidIpaStorageFileName(baseName)) {
        return null;
    }

    return {
        baseName,
        ipaPath: path.join(DATA_DIR, baseName),
        jsonPath: path.join(DATA_DIR, baseName.replace(/\.ipa$/, '.json')),
    };
}

const CD_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const TARGET_METADATA_FILE = 'iTunesMetadata.plist';

function applyItemIdFromFileName(metadata, fileName) {
    const itemId = resolveItemId(metadata, fileName);
    if (itemId) {
        metadata.itemId = itemId;
    }

    return metadata;
}

function writeSidecarMetadata(fileName, metadata) {
    const paths = resolveMetadataPaths(fileName);
    if (!paths) {
        throw new Error(`无效的文件名: ${fileName}`);
    }

    fs.writeFileSync(paths.jsonPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    return paths.jsonPath;
}

function parsePlistBuffer(buffer) {
    if (buffer.length > 6 && buffer.toString('ascii', 0, 6) === 'bplist') {
        const result = bplist.parseBuffer(buffer);
        return result[0];
    }

    const xmlString = buffer.toString('utf8');
    return plist.parse(xmlString);
}

function locateEndOfCentralDirectory(fd, fileSize) {
    const maxCommentLength = 0xffff;
    const searchLength = Math.min(fileSize, maxCommentLength + 22);
    const tailBuffer = Buffer.alloc(searchLength);
    fs.readSync(fd, tailBuffer, 0, searchLength, fileSize - searchLength);

    for (let index = tailBuffer.length - 22; index >= 0; index -= 1) {
        if (tailBuffer.readUInt32LE(index) === EOCD_SIGNATURE) {
            return {
                offset: fileSize - searchLength + index,
                cdSize: tailBuffer.readUInt32LE(index + 12),
                cdOffset: tailBuffer.readUInt32LE(index + 16),
            };
        }
    }

    return null;
}

function locateZip64CentralDirectory(fd, eocdOffset) {
    const locatorOffset = eocdOffset - 20;
    if (locatorOffset < 0) {
        return null;
    }

    const locatorBuffer = Buffer.alloc(20);
    fs.readSync(fd, locatorBuffer, 0, 20, locatorOffset);
    if (locatorBuffer.readUInt32LE(0) !== ZIP64_EOCD_LOCATOR_SIGNATURE) {
        return null;
    }

    const zip64EocdOffset = Number(locatorBuffer.readBigUInt64LE(8));
    const zip64HeaderBuffer = Buffer.alloc(12);
    fs.readSync(fd, zip64HeaderBuffer, 0, 12, zip64EocdOffset);
    if (zip64HeaderBuffer.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE) {
        return null;
    }

    const zip64RecordSize = Number(zip64HeaderBuffer.readBigUInt64LE(4));
    const zip64Buffer = Buffer.alloc(12 + zip64RecordSize);
    fs.readSync(fd, zip64Buffer, 0, zip64Buffer.length, zip64EocdOffset);

    return {
        cdSize: Number(zip64Buffer.readBigUInt64LE(40)),
        cdOffset: Number(zip64Buffer.readBigUInt64LE(48)),
    };
}

function readCentralDirectory(fd, fileSize) {
    const eocd = locateEndOfCentralDirectory(fd, fileSize);
    if (!eocd) {
        throw new Error('无法定位 ZIP 中央目录');
    }

    let cdSize = eocd.cdSize;
    let cdOffset = eocd.cdOffset;

    if (cdSize === 0xffffffff || cdOffset === 0xffffffff) {
        const zip64 = locateZip64CentralDirectory(fd, eocd.offset);
        if (!zip64) {
            throw new Error('无法定位 ZIP64 中央目录');
        }
        cdSize = zip64.cdSize;
        cdOffset = zip64.cdOffset;
    }

    const cdBuffer = Buffer.alloc(cdSize);
    fs.readSync(fd, cdBuffer, 0, cdSize, cdOffset);

    return { cdBuffer, cdSize };
}

function parseCentralDirectoryEntry(cdBuffer, pos) {
    const compressionMethod = cdBuffer.readUInt16LE(pos + 10);
    const compressedSize = cdBuffer.readUInt32LE(pos + 20);
    const fileNameLength = cdBuffer.readUInt16LE(pos + 28);
    const extraFieldLength = cdBuffer.readUInt16LE(pos + 30);
    const fileCommentLength = cdBuffer.readUInt16LE(pos + 32);
    const localFileHeaderOffset = cdBuffer.readUInt32LE(pos + 42);
    const fileName = cdBuffer.toString('utf8', pos + 46, pos + 46 + fileNameLength);

    return {
        fileName,
        compressionMethod,
        compressedSize,
        localFileHeaderOffset,
        recordLength: 46 + fileNameLength + extraFieldLength + fileCommentLength,
    };
}

/**
 * 在内存中扫描中央目录。ipatool 会把 iTunesMetadata.plist 追加在末尾，保留最后一次匹配。
 */
function findCentralDirectoryEntry(cdBuffer, cdSize, targetFileName) {
    let pos = 0;
    const end = cdSize;
    let matchedEntry = null;

    while (pos + 46 <= end) {
        if (cdBuffer.readUInt32LE(pos) !== CD_SIGNATURE) {
            break;
        }

        const entry = parseCentralDirectoryEntry(cdBuffer, pos);
        if (pos + entry.recordLength > end) {
            break;
        }

        if (entry.fileName === targetFileName) {
            matchedEntry = entry;
        }

        pos += entry.recordLength;
    }

    return matchedEntry;
}

function readZipEntryData(fd, entry) {
    const localHeaderBuffer = Buffer.alloc(30);
    fs.readSync(fd, localHeaderBuffer, 0, 30, entry.localFileHeaderOffset);
    if (localHeaderBuffer.readUInt32LE(0) !== LOCAL_HEADER_SIGNATURE) {
        throw new Error('本地文件头无效');
    }

    const fileNameLength = localHeaderBuffer.readUInt16LE(26);
    const extraFieldLength = localHeaderBuffer.readUInt16LE(28);
    const dataOffset = entry.localFileHeaderOffset + 30 + fileNameLength + extraFieldLength;
    const compressedBuffer = Buffer.alloc(entry.compressedSize);
    fs.readSync(fd, compressedBuffer, 0, entry.compressedSize, dataOffset);

    if (entry.compressionMethod === 0) {
        return compressedBuffer;
    }

    if (entry.compressionMethod === 8) {
        return zlib.inflateRawSync(compressedBuffer);
    }

    throw new Error(`不支持的 ZIP 压缩方式: ${entry.compressionMethod}`);
}

/**
 * 快速路径：一次性读取中央目录，只解压 iTunesMetadata.plist。
 * 相比 yauzl lazyEntries 逐条读盘，大 IPA（数万文件）可快几个数量级。
 */
function parseIpaMetadataFast(ipaPath, fileName, { skipWrite = false } = {}) {
    const fd = fs.openSync(ipaPath, 'r');

    try {
        const fileSize = fs.fstatSync(fd).size;
        const { cdBuffer, cdSize } = readCentralDirectory(fd, fileSize);
        const entry = findCentralDirectoryEntry(cdBuffer, cdSize, TARGET_METADATA_FILE);

        if (!entry) {
            throw new Error('在IPA文件中未找到iTunesMetadata.plist');
        }

        const plistBuffer = readZipEntryData(fd, entry);
        const metadata = parsePlistBuffer(plistBuffer);
        applyItemIdFromFileName(metadata, fileName);
        const normalized = normalizePlistMetadata(metadata);

        if (!skipWrite) {
            writeSidecarMetadata(fileName, normalized);
            console.log(`成功解析并保存: ${fileName.replace('.ipa', '.json')}`);
        }

        return normalized;
    } finally {
        fs.closeSync(fd);
    }
}

function parseIpaMetadataWithYauzl(ipaPath, fileName, { skipWrite = false } = {}) {
    return new Promise((resolve, reject) => {
        yauzl.open(ipaPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                return reject(new Error(`无法打开IPA文件: ${err.message}`));
            }

            let metadataFound = false;

            zipfile.readEntry();

            zipfile.on('entry', (entry) => {
                if (entry.fileName === TARGET_METADATA_FILE) {
                    metadataFound = true;

                    zipfile.openReadStream(entry, (streamErr, readStream) => {
                        if (streamErr) {
                            return reject(new Error(`无法读取iTunesMetadata.plist: ${streamErr.message}`));
                        }

                        const chunks = [];

                        readStream.on('data', (chunk) => {
                            chunks.push(chunk);
                        });

                        readStream.on('end', () => {
                            try {
                                const buffer = Buffer.concat(chunks);
                                const metadata = parsePlistBuffer(buffer);
                                applyItemIdFromFileName(metadata, fileName);
                                const normalized = normalizePlistMetadata(metadata);

                                if (!skipWrite) {
                                    writeSidecarMetadata(fileName, normalized);
                                    console.log(`成功解析并保存: ${fileName.replace('.ipa', '.json')}`);
                                }

                                resolve(normalized);
                            } catch (parseError) {
                                reject(new Error(`解析plist文件失败: ${parseError.message}`));
                            }
                        });

                        readStream.on('error', (streamError) => {
                            reject(new Error(`读取流错误: ${streamError.message}`));
                        });
                    });
                } else {
                    zipfile.readEntry();
                }
            });

            zipfile.on('end', () => {
                if (!metadataFound) {
                    reject(new Error('在IPA文件中未找到iTunesMetadata.plist'));
                }
            });

            zipfile.on('error', (zipError) => {
                reject(new Error(`ZIP文件错误: ${zipError.message}`));
            });
        });
    });
}

/**
 * 解析IPA文件中的 iTunesMetadata.plist
 * @param {string} fileName - IPA文件名
 * @param {{ forceReparse?: boolean, skipWrite?: boolean }} options
 * @returns {Promise} 返回解析结果
 */
function parseIpaMetadata(fileName, options = {}) {
    const { forceReparse = false, skipWrite = false } = options;
    const paths = resolveMetadataPaths(fileName);
    if (!paths) {
        return Promise.reject(new Error(`无效的文件名: ${fileName}`));
    }

    const { baseName, ipaPath, jsonPath } = paths;

    if (!fs.existsSync(ipaPath)) {
        return Promise.reject(new Error(`IPA文件不存在: ${baseName}`));
    }

    if (!forceReparse && fs.existsSync(jsonPath)) {
        try {
            const existingJson = normalizeStoredMetadata(JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
            return Promise.resolve(applyItemIdFromFileName(existingJson, baseName));
        } catch (error) {
            console.log('读取现有JSON文件失败，重新解析IPA');
        }
    }

    try {
        return Promise.resolve(parseIpaMetadataFast(ipaPath, baseName, { skipWrite }));
    } catch (fastError) {
        console.warn(`快速解析 metadata 失败，回退 yauzl: ${baseName}`, fastError.message);
        return parseIpaMetadataWithYauzl(ipaPath, baseName, { skipWrite });
    }
}

/**
 * 获取IPA元数据的HTTP
 */
async function metadataHandler(req, res) {
    try {
        const { fileName } = req.body;

        if (!fileName) {
            return sendError(res, 400, {
                message: '文件名是必需的参数',
                errorMessageCode: 'IPA_METADATA_FILENAME_REQUIRED',
                error: '请在请求体中提供fileName参数',
                errorCode: 'IPA_METADATA_FILENAME_MISSING_IN_BODY',
            });
        }

        const paths = resolveMetadataPaths(fileName);
        if (!paths) {
            return sendError(res, 400, {
                message: '无效的文件格式',
                errorMessageCode: 'IPA_METADATA_INVALID_FORMAT',
                error: '文件名须为 appId_versionId.ipa 格式',
                errorCode: 'IPA_METADATA_FILENAME_INVALID',
            });
        }

        console.log(`开始解析IPA文件: ${paths.baseName}`);

        try {
            const metadata = await parseIpaMetadata(paths.baseName);
            return sendSuccess(res, {
                message: 'IPA元数据解析成功',
                errorMessageCode: 'IPA_METADATA_FETCH_SUCCESS',
                data: metadata,
            });
        } catch (parseError) {
            console.error('解析IPA文件时出错:', parseError);

            return sendError(res, 500, {
                message: '解析IPA文件失败',
                errorMessageCode: 'IPA_METADATA_PARSE_FAILED',
                error: parseError.message,
                errorCode: 'IPA_METADATA_PARSE_ERROR_DETAIL',
            });
        }

    } catch (error) {
        console.error('IPA元数据错误:', error);
        return sendError(res, 500, {
            message: '服务器内部错误',
            errorMessageCode: 'INTERNAL_SERVER_ERROR',
            error: error.message,
            errorCode: 'INTERNAL_ERROR_DETAIL',
        });
    }
}

module.exports = {
    metadataHandler,
    parseIpaMetadata,
    writeSidecarMetadata,
};
