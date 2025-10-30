const yauzl = require('yauzl');
const plist = require('plist');
const bplist = require('bplist-parser');
const fs = require('fs');
const path = require('path');

/**
 * 解析IPA文件中的 iTunesMetadata.plist
 * @param {string} fileName - IPA文件名
 * @returns {Promise} 返回解析结果
 */
function parseIpaMetadata(fileName) {
    return new Promise((resolve, reject) => {
        const dataDir = path.join(__dirname, '../../data');
        const ipaPath = path.join(dataDir, fileName);
        const jsonPath = path.join(dataDir, fileName.replace('.ipa', '.json'));

        // 检查IPA文件是否存在
        if (!fs.existsSync(ipaPath)) {
            return reject(new Error(`IPA文件不存在: ${fileName}`));
        }

        // 检查是否已经有对应的JSON文件
        if (fs.existsSync(jsonPath)) {
            try {
                const existingJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                return resolve(existingJson);
            } catch (error) {
                console.log('读取现有JSON文件失败，重新解析IPA');
            }
        }

        // 打开IPA文件（实际上是ZIP文件）
        yauzl.open(ipaPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) {
                return reject(new Error(`无法打开IPA文件: ${err.message}`));
            }

            let metadataFound = false;

            zipfile.readEntry();

            zipfile.on('entry', (entry) => {
                // 查找iTunesMetadata.plist文件
                if (entry.fileName === 'iTunesMetadata.plist') {
                    metadataFound = true;

                    zipfile.openReadStream(entry, (err, readStream) => {
                        if (err) {
                            return reject(new Error(`无法读取iTunesMetadata.plist: ${err.message}`));
                        }

                        const chunks = [];

                        readStream.on('data', (chunk) => {
                            chunks.push(chunk);
                        });

                        readStream.on('end', () => {
                            try {
                                // 合并所有数据块
                                const buffer = Buffer.concat(chunks);

                                let metadata;

                                // 检查是否为二进制plist文件（以bplist开头）
                                if (buffer.length > 6 && buffer.toString('ascii', 0, 6) === 'bplist') {
                                    // 使用bplist-parser解析二进制plist
                                    try {
                                        const result = bplist.parseBuffer(buffer);
                                        metadata = result[0]; // bplist-parser返回数组，取第一个元素
                                    } catch (binaryError) {
                                        throw new Error(`解析二进制plist失败: ${binaryError.message}`);
                                    }
                                } else {
                                    // 尝试作为XML plist解析
                                    try {
                                        const xmlString = buffer.toString('utf8');
                                        metadata = plist.parse(xmlString);
                                    } catch (xmlError) {
                                        throw new Error(`解析XML plist失败: ${xmlError.message}`);
                                    }
                                }

                                // 保存为JSON文件
                                const jsonData = JSON.stringify(metadata, null, 2);
                                fs.writeFileSync(jsonPath, jsonData, 'utf8');

                                console.log(`成功解析并保存: ${path.basename(jsonPath)}`);

                                resolve(metadata);

                            } catch (parseError) {
                                reject(new Error(`解析plist文件失败: ${parseError.message}`));
                            }
                        });

                        readStream.on('error', (streamError) => {
                            reject(new Error(`读取流错误: ${streamError.message}`));
                        });
                    });
                } else {
                    // 继续读取下一个条目
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
 * 获取IPA元数据的HTTP
 */
async function metadataHandler(req, res) {
    try {
        const { fileName } = req.body;

        // 参数验证
        if (!fileName) {
            return res.status(400).json({
                success: false,
                message: '文件名是必需的参数',
                error: '请在请求体中提供fileName参数'
            });
        }

        // 验证文件名格式
        if (!fileName.endsWith('.ipa')) {
            return res.status(400).json({
                success: false,
                message: '无效的文件格式',
                error: '文件名必须以.ipa结尾'
            });
        }

        console.log(`开始解析IPA文件: ${fileName}`);

        try {
            const metadata = await parseIpaMetadata(fileName);

            // 直接返回解析后的JSON内容
            return res.json(metadata);

        } catch (parseError) {
            console.error('解析IPA文件时出错:', parseError);

            return res.status(500).json({
                success: false,
                message: '解析IPA文件失败',
                error: parseError.message
            });
        }

    } catch (error) {
        console.error('IPA元数据错误:', error);
        return res.status(500).json({
            success: false,
            message: '服务器内部错误',
            error: error.message
        });
    }
}

module.exports = {
    metadataHandler,
    parseIpaMetadata
};
