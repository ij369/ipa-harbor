const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const https = require('https');

// 导入IPA相关的路由
const { metadataHandler, parseIpaMetadata } = require('./metadata');

const { getEffectiveRegion } = require('../../utils/userRegion');
const { optionalAuth, authenticateToken } = require('../../middleware/auth');
const { buildContentDisposition, resolveDownloadFileName } = require('../../utils/filenameTemplate');
const { isValidIpaStorageFileName, isValidIpaStorageBaseName } = require('../../utils/ipaFileName');
const {
    verifyPackageTicket,
    verifyManifestTicket,
    buildPackageDownloadUrl,
    buildManifestInstallUrl,
} = require('../../utils/packageTicket');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

function resolveIpaPackagePath(fileName, dataDir) {
    const baseName = path.basename(fileName);
    if (!isValidIpaStorageFileName(baseName)) {
        return null;
    }

    return path.join(dataDir, baseName);
}

async function streamPackageFile(req, res, fileName) {
    const dataDir = path.join(__dirname, '../../data');
    const filePath = resolveIpaPackagePath(fileName, dataDir);
    if (!filePath) {
        return res.status(400).send('Invalid file name format');
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    let contentDisposition = 'attachment; filename="app.ipa"';
    try {
        const displayName = await resolveDownloadFileName(fileName, req.user?.id);
        contentDisposition = buildContentDisposition(displayName);
    } catch (error) {
        console.warn('解析下载文件名失败，使用默认文件名:', error.message);
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (!range) {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': contentDisposition,
        });
        fs.createReadStream(filePath).pipe(res);
        return undefined;
    }

    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
        res.status(416).send('Requested range not satisfiable');
        return undefined;
    }

    const chunkSize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': contentDisposition,
    });

    fileStream.pipe(res);
    return undefined;
}

// 获取应用图标URL的辅助函数
async function getAppIconUrls(appId, userRegion = null) {
    return new Promise((resolve, reject) => {
        let lookupUrl;
        if (userRegion) {
            lookupUrl = `https://itunes.apple.com/${userRegion}/lookup?id=${appId}`;
        } else {
            lookupUrl = `https://itunes.apple.com/lookup?id=${appId}`;
        }

        https.get(lookupUrl, (response) => {
            let data = '';

            response.on('data', (chunk) => (data += chunk));
            response.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const app = json.results?.[0];

                    resolve({
                        iconUrl60: app?.artworkUrl60 || '',
                        iconUrl100: app?.artworkUrl100 || '',
                        iconUrl512: app?.artworkUrl512 || ''
                    });
                } catch (err) {
                    console.error('解析iTunes响应失败:', err);
                    resolve({
                        iconUrl60: '',
                        iconUrl100: '',
                        iconUrl512: ''
                    });
                }
            });
        }).on('error', (err) => {
            console.error('HTTPS请求失败:', err);
            resolve({
                iconUrl60: '',
                iconUrl100: '',
                iconUrl512: ''
            });
        });
    });
}

// 路由定义
router.post('/metadata', metadataHandler);  // 解析IPA元数据

router.get('/package-url/:fileName', authenticateToken, async (req, res) => {
    const { fileName } = req.params;

    if (!isValidIpaStorageFileName(path.basename(fileName))) {
        return sendError(res, 400, {
            message: '无效的文件格式',
            errorMessageCode: 'IPA_PACKAGE_URL_INVALID_FORMAT',
            error: '文件名须为 appId_versionId.ipa 格式',
            errorCode: 'IPA_PACKAGE_URL_FILENAME_INVALID',
        });
    }

    return sendSuccess(res, {
        message: '获取下载链接成功',
        errorMessageCode: 'IPA_PACKAGE_URL_SUCCESS',
        data: {
            url: buildPackageDownloadUrl(req, fileName),
        },
    });
});

router.get('/install-package-url/:fileName', authenticateToken, async (req, res) => {
    const baseName = path.basename(String(req.params.fileName || '')).replace(/\.ipa$/i, '');

    if (!isValidIpaStorageBaseName(baseName)) {
        return sendError(res, 400, {
            message: '无效的文件格式',
            errorMessageCode: 'IPA_INSTALL_PACKAGE_URL_INVALID_FORMAT',
            error: '文件名须为 appId_versionId 格式',
            errorCode: 'IPA_INSTALL_PACKAGE_URL_FILENAME_INVALID',
        });
    }

    const manifestUrl = buildManifestInstallUrl(req, baseName, { forceHttps: true });

    return sendSuccess(res, {
        message: '获取 OTA 安装链接成功',
        errorMessageCode: 'IPA_INSTALL_PACKAGE_URL_SUCCESS',
        data: {
            manifestUrl,
            installUrl: `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`,
        },
    });
});

// 生成manifest.plist文件用于无线安装 (目前有问题，貌似不可用)
router.get('/install-package/:fileName/:ticket/manifest.plist', async (req, res) => {
    try {
        const { fileName, ticket } = req.params;

        if (!isValidIpaStorageBaseName(fileName)) {
            return res.status(400).send('Invalid file name format');
        }

        if (!verifyManifestTicket(fileName, ticket)) {
            return res.status(403).send('Invalid or expired ticket');
        }

        const ipaFileName = `${fileName}.ipa`;
        const dataDir = path.join(__dirname, '../../data');
        const ipaPath = resolveIpaPackagePath(ipaFileName, dataDir);
        if (!ipaPath) {
            return res.status(400).send('Invalid file name format');
        }

        // 检查IPA文件是否存在
        if (!fs.existsSync(ipaPath)) {
            return res.status(404).send('IPA file not found');
        }

        try {
            // 解析IPA元数据
            const metadata = await parseIpaMetadata(ipaFileName);

            // 提取所需信息
            const bundleIdentifier = metadata.softwareVersionBundleId || 'unknown.bundle.id';
            const kind = metadata.kind || 'full';
            const bundleVersion = metadata.bundleShortVersionString || metadata.bundleVersion || '1.0.0';
            const appName = metadata.itemName || metadata.playlistName || 'Unknown App';
            const developerName = metadata.playlistName || 'Unknown Developer';
            // 从文件名中提取appId
            const appId = fileName.split('_')[0];

            // 获取用户地区设置
            const userRegion = await getEffectiveRegion();

            // 获取图标URL
            const iconUrls = await getAppIconUrls(appId, userRegion);
            const iconUrl57 = metadata.softwareIcon57x57URL || iconUrls.iconUrl60 || '';
            const iconUrl512 = iconUrls.iconUrl512 || '';

            // OTA 安装必须使用 HTTPS 且带 ticket 签名
            const ipaUrl = buildPackageDownloadUrl(req, ipaFileName, { forceHttps: true });
            console.log(
                'ipaUrl', ipaUrl,
                'iconUrl57', iconUrl57,
                'iconUrl512', iconUrl512,
            )
            // 生成manifest.plist内容
            const manifestContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>display-image</string>
                    <key>url</key>
                    <string>${iconUrl512}</string>
                </dict>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>${ipaUrl}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${bundleIdentifier}</string>
                <key>bundle-version</key>
                <string>${bundleVersion}</string>
                <key>developer-name</key>
                <string>${developerName}</string>
                <key>kind</key>
                <string>${kind}</string>
                <key>title</key>
                <string>${appName}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;

            // 设置正确的Content-Type和文件名
            res.setHeader('Content-Type', 'text/xml');
            res.setHeader('Content-Disposition', `attachment; filename="manifest.plist"`);
            res.send(manifestContent);

        } catch (metadataError) {
            console.error('解析IPA元数据失败:', metadataError);
            return res.status(500).send('Failed to parse IPA metadata');
        }

    } catch (error) {
        console.error('生成manifest.plist失败:', error);
        return res.status(500).send('Internal server error');
    }
});

router.get('/getpackage/:fileName/:ticket', optionalAuth, async (req, res) => {
    const { fileName, ticket } = req.params;

    if (!fileName || !ticket) {
        return res.status(400).send('fileName and ticket are required');
    }

    if (!verifyPackageTicket(fileName, ticket)) {
        return res.status(403).send('Invalid or expired ticket');
    }

    return streamPackageFile(req, res, fileName);
});

module.exports = router;
