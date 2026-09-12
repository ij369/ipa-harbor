const express = require('express');
const dayjs = require('dayjs');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../../middleware/auth');
const { sendSuccess, sendError } = require('../../utils/apiResponse');
const passkeyService = require('../../utils/passkeyService');

const authRouter = express.Router();
const manageRouter = express.Router();

function createIpLimiter({ windowMs, max, messageCode }) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                message: '请求过于频繁，请稍后再试',
                errorMessageCode: messageCode,
                errorCode: messageCode,
            });
        },
    });
}

const optionsRateLimit = [
    createIpLimiter({
        windowMs: parseInt(process.env.PASSKEY_OPTIONS_RATE_SHORT_MS, 10) || 10 * 1000,
        max: parseInt(process.env.PASSKEY_OPTIONS_RATE_SHORT_MAX, 10) || 5,
        messageCode: 'PASSKEY_OPTIONS_RATE_LIMITED',
    }),
    createIpLimiter({
        windowMs: parseInt(process.env.PASSKEY_OPTIONS_RATE_LONG_MS, 10) || 60 * 1000,
        max: parseInt(process.env.PASSKEY_OPTIONS_RATE_LONG_MAX, 10) || 20,
        messageCode: 'PASSKEY_OPTIONS_RATE_LIMITED',
    }),
];

const verifyRateLimit = [
    createIpLimiter({
        windowMs: parseInt(process.env.PASSKEY_VERIFY_RATE_WINDOW_MS, 10) || 60 * 1000,
        max: parseInt(process.env.PASSKEY_VERIFY_RATE_MAX, 10) || 30,
        messageCode: 'PASSKEY_VERIFY_RATE_LIMITED',
    }),
];

function webauthnNotConfigured(res) {
    return sendError(res, 503, {
        message: 'Passkey 未配置',
        errorMessageCode: 'PASSKEY_NOT_CONFIGURED',
        errorCode: 'PASSKEY_NOT_CONFIGURED',
    });
}

function handlePasskeyError(res, error, fallbackCode) {
    const status = error.code === 'PASSKEY_CHALLENGE_INVALID'
        || error.code === 'PASSKEY_CREDENTIAL_NOT_FOUND'
        || error.code === 'PASSKEY_VERIFICATION_FAILED'
        || error.code === 'PASSKEY_REGISTRATION_FAILED'
        ? 401
        : error.code === 'PASSKEY_NOT_FOUND'
            || error.code === 'PASSKEY_DELETE_LAST_FORBIDDEN'
            || error.code === 'PASSKEY_ALREADY_REGISTERED'
            || error.code === 'PASSKEY_NICKNAME_TOO_LONG'
            ? 400
            : error.code === 'WEBAUTHN_ORIGIN_NOT_ALLOWED'
                || error.code === 'WEBAUTHN_ORIGIN_MISSING'
                ? 403
                : 500;

    return sendError(res, status, {
        message: error.message || 'Passkey 操作失败',
        errorMessageCode: error.code || fallbackCode,
        error: error.message,
        errorCode: error.code || fallbackCode,
    });
}

authRouter.post('/login/options', ...optionsRateLimit, async (req, res) => {
    try {
        if (!passkeyService.isWebAuthnConfigured()) {
            return webauthnNotConfigured(res);
        }
        const result = await passkeyService.createLoginOptions(req);
        return sendSuccess(res, {
            errorMessageCode: 'PASSKEY_LOGIN_OPTIONS_SUCCESS',
            data: {
                challengeId: result.challengeId,
                options: result.options,
            },
        });
    } catch (error) {
        console.error('Passkey login options 错误:', error);
        return handlePasskeyError(res, error, 'PASSKEY_LOGIN_OPTIONS_FAILED');
    }
});

authRouter.post('/login/verify', ...verifyRateLimit, async (req, res) => {
    try {
        if (!passkeyService.isWebAuthnConfigured()) {
            return webauthnNotConfigured(res);
        }
        const result = await passkeyService.verifyLogin(req, res);
        console.log(`Passkey 登录成功, time: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`);
        return sendSuccess(res, result);
    } catch (error) {
        console.error('Passkey login verify 错误:', error);
        return handlePasskeyError(res, error, 'PASSKEY_LOGIN_VERIFY_FAILED');
    }
});

authRouter.post('/register/options', authenticateToken, ...optionsRateLimit, async (req, res) => {
    try {
        if (!passkeyService.isWebAuthnConfigured()) {
            return webauthnNotConfigured(res);
        }
        const result = await passkeyService.createRegisterOptions(req);
        return sendSuccess(res, {
            errorMessageCode: 'PASSKEY_REGISTER_OPTIONS_SUCCESS',
            data: {
                challengeId: result.challengeId,
                options: result.options,
            },
        });
    } catch (error) {
        console.error('Passkey register options 错误:', error);
        return handlePasskeyError(res, error, 'PASSKEY_REGISTER_OPTIONS_FAILED');
    }
});

authRouter.post('/register/verify', authenticateToken, ...verifyRateLimit, async (req, res) => {
    try {
        if (!passkeyService.isWebAuthnConfigured()) {
            return webauthnNotConfigured(res);
        }
        const result = await passkeyService.verifyRegister(req);
        return sendSuccess(res, result);
    } catch (error) {
        console.error('Passkey register verify 错误:', error);
        return handlePasskeyError(res, error, 'PASSKEY_REGISTER_VERIFY_FAILED');
    }
});

manageRouter.get('/', authenticateToken, async (req, res) => {
    try {
        const passkeys = await passkeyService.listPasskeys(req.user.id);
        return sendSuccess(res, {
            errorMessageCode: 'PASSKEY_LIST_SUCCESS',
            data: { passkeys },
        });
    } catch (error) {
        console.error('Passkey 列表错误:', error);
        return handlePasskeyError(res, error, 'PASSKEY_LIST_FAILED');
    }
});

manageRouter.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const { nickname } = req.body || {};
        const result = await passkeyService.updatePasskeyNickname(
            req.user.id,
            req.params.id,
            nickname,
        );
        return sendSuccess(res, result);
    } catch (error) {
        console.error('Passkey 备注更新错误:', error);
        return handlePasskeyError(res, error, 'PASSKEY_NICKNAME_UPDATE_FAILED');
    }
});

manageRouter.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const result = await passkeyService.deletePasskey(req.user.id, req.params.id);
        return sendSuccess(res, result);
    } catch (error) {
        console.error('Passkey 删除错误:', error);
        return handlePasskeyError(res, error, 'PASSKEY_DELETE_FAILED');
    }
});

module.exports = {
    authRouter,
    manageRouter,
};
