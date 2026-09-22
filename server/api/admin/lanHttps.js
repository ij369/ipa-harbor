const certService = require('../../utils/certService');
const lanConfig = require('../../utils/lanConfig');
const httpsManager = require('../../utils/httpsManager');
const { refreshLanCaTerminalQr, getDefaultHttpPort } = require('../../utils/lanCaTerminalQr');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

function resolveLanHttpsUpdateError(error) {
    switch (error.code) {
        case 'LAN_IP_INVALID':
            return { status: 400, message: 'LAN_IP 格式无效' };
        default:
            return { status: 500, message: '更新局域网 HTTPS 配置失败' };
    }
}

async function syncLanCaTerminalQr(lanIp, lanHostname) {
    try {
        await refreshLanCaTerminalQr({
            lanIp,
            lanHostname,
            httpPort: getDefaultHttpPort(),
        });
    } catch (error) {
        console.error('更新终端 QR 文件失败:', error);
    }
}

function getApp(req) {
    return req.app;
}

async function getLanHttpsHandler(req, res) {
    try {
        return sendSuccess(res, {
            errorMessageCode: 'LAN_HTTPS_STATUS_FETCH_SUCCESS',
            data: {
                ...certService.getLanHttpsStatus(),
                httpsRunning: httpsManager.isRunning(),
            },
        });
    } catch (error) {
        console.error('获取局域网 HTTPS 状态失败:', error);
        return sendError(res, 500, {
            message: '获取局域网 HTTPS 状态失败',
            errorMessageCode: 'LAN_HTTPS_STATUS_FETCH_FAILED',
            error: error.message,
            errorCode: 'LAN_HTTPS_STATUS_ERROR_DETAIL',
        });
    }
}

async function updateLanHttpsHandler(req, res) {
    try {
        if (!certService.isAutoCertEnabled()) {
            return sendError(res, 400, {
                message: '未启用 ENABLE_AUTO_CERT',
                errorMessageCode: 'LAN_HTTPS_AUTO_CERT_DISABLED',
                error: 'ENABLE_AUTO_CERT is not enabled',
                errorCode: 'LAN_HTTPS_AUTO_CERT_DISABLED_DETAIL',
            });
        }

        const { lanHostname, lanIp } = req.body || {};
        if (lanIp == null && lanHostname == null) {
            return sendError(res, 400, {
                message: '请提供 lanHostname 或 lanIp',
                errorMessageCode: 'LAN_HTTPS_INVALID_PAYLOAD',
                error: 'Missing lanHostname or lanIp',
                errorCode: 'LAN_HTTPS_INVALID_PAYLOAD_DETAIL',
            });
        }

        const saved = lanConfig.saveLanConfig({ lanHostname, lanIp });
        if (!saved.lanIp) {
            return sendError(res, 400, {
                message: '需要设置主机 IP（LAN_IP）',
                errorMessageCode: 'LAN_HTTPS_LAN_IP_REQUIRED',
                error: 'LAN_IP is required',
                errorCode: 'LAN_HTTPS_LAN_IP_REQUIRED_DETAIL',
            });
        }

        lanConfig.applyLanHttpsWebAuthnEnv({
            lanIp: saved.lanIp,
            lanHostname: saved.lanHostname,
            httpPort: Number(process.env.PORT || 3080),
            httpsPort: Number(process.env.HTTPS_PORT || 3443),
        });

        certService.generateServerCert(saved.lanIp, saved.lanHostname);
        const material = certService.getServerCertMaterial();
        const httpsPort = Number(process.env.HTTPS_PORT || 3443);
        await httpsManager.reload(getApp(req), material.key, material.cert, httpsPort);
        await syncLanCaTerminalQr(saved.lanIp, saved.lanHostname);

        return sendSuccess(res, {
            message: '局域网 HTTPS 配置已更新，证书已重新签发',
            errorMessageCode: 'LAN_HTTPS_UPDATE_SUCCESS',
            data: {
                ...certService.getLanHttpsStatus(),
                httpsRunning: httpsManager.isRunning(),
            },
        });
    } catch (error) {
        console.error('更新局域网 HTTPS 配置失败:', error);
        const { status, message } = resolveLanHttpsUpdateError(error);
        return sendError(res, status, {
            message,
            errorMessageCode: error.code || 'LAN_HTTPS_UPDATE_FAILED',
            error: error.message,
            errorCode: 'LAN_HTTPS_UPDATE_ERROR_DETAIL',
        });
    }
}

async function renewLanHttpsHandler(req, res) {
    try {
        if (!certService.isAutoCertEnabled()) {
            return sendError(res, 400, {
                message: '未启用 ENABLE_AUTO_CERT',
                errorMessageCode: 'LAN_HTTPS_AUTO_CERT_DISABLED',
                error: 'ENABLE_AUTO_CERT is not enabled',
                errorCode: 'LAN_HTTPS_AUTO_CERT_DISABLED_DETAIL',
            });
        }

        const { lanIp, lanHostname } = lanConfig.getLanConfig();
        if (!lanIp) {
            return sendError(res, 400, {
                message: '需要设置主机 IP（LAN_IP）',
                errorMessageCode: 'LAN_HTTPS_LAN_IP_REQUIRED',
                error: 'LAN_IP is required',
                errorCode: 'LAN_HTTPS_LAN_IP_REQUIRED_DETAIL',
            });
        }

        lanConfig.applyLanHttpsWebAuthnEnv({
            lanIp,
            lanHostname,
            httpPort: Number(process.env.PORT || 3080),
            httpsPort: Number(process.env.HTTPS_PORT || 3443),
        });

        certService.generateServerCert(lanIp, lanHostname);
        const material = certService.getServerCertMaterial();
        const httpsPort = Number(process.env.HTTPS_PORT || 3443);
        await httpsManager.reload(getApp(req), material.key, material.cert, httpsPort);
        await syncLanCaTerminalQr(lanIp, lanHostname);

        return sendSuccess(res, {
            message: 'TLS 证书已续签，HTTPS 服务已重启',
            errorMessageCode: 'LAN_HTTPS_RENEW_SUCCESS',
            data: {
                ...certService.getLanHttpsStatus(),
                httpsRunning: httpsManager.isRunning(),
            },
        });
    } catch (error) {
        console.error('续签局域网 TLS 证书失败:', error);
        return sendError(res, 500, {
            message: '续签 TLS 证书失败',
            errorMessageCode: 'LAN_HTTPS_RENEW_FAILED',
            error: error.message,
            errorCode: 'LAN_HTTPS_RENEW_ERROR_DETAIL',
        });
    }
}

function downloadCaCertHandler(req, res) {
    try {
        if (!certService.isAutoCertEnabled()) {
            return sendError(res, 404, {
                message: '未启用局域网自动证书',
                errorMessageCode: 'LAN_HTTPS_AUTO_CERT_DISABLED',
                error: 'ENABLE_AUTO_CERT is not enabled',
                errorCode: 'LAN_HTTPS_AUTO_CERT_DISABLED_DETAIL',
            });
        }

        const caPem = certService.getCaCertPem();
        if (!caPem) {
            return sendError(res, 404, {
                message: 'Root CA 尚未生成',
                errorMessageCode: 'LAN_HTTPS_CA_NOT_FOUND',
                error: 'CA certificate not found',
                errorCode: 'LAN_HTTPS_CA_NOT_FOUND_DETAIL',
            });
        }

        res.setHeader('Content-Type', 'application/x-x509-ca-cert');
        res.setHeader('Content-Disposition', 'attachment; filename="ipa-harbor-lan-ca.crt"');
        return res.send(caPem);
    } catch (error) {
        console.error('下载 Root CA 失败:', error);
        return sendError(res, 500, {
            message: '下载 Root CA 失败',
            errorMessageCode: 'LAN_HTTPS_CA_DOWNLOAD_FAILED',
            error: error.message,
            errorCode: 'LAN_HTTPS_CA_DOWNLOAD_ERROR_DETAIL',
        });
    }
}

module.exports = {
    getLanHttpsHandler,
    updateLanHttpsHandler,
    renewLanHttpsHandler,
    downloadCaCertHandler,
};
