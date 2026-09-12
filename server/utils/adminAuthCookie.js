const { JWT_EXPIRES_IN } = require('../middleware/auth');

const COOKIE_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * 设置 Admin JWT authToken cookie（密码登录与 Passkey 登录共用）
 */
function setAuthTokenCookie(res, token) {
    const isLanAccess = process.env.ALLOW_LAN_ACCESS === 'true';
    res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && !isLanAccess,
        sameSite: isLanAccess ? 'lax' : 'strict',
        maxAge: COOKIE_MAX_AGE_MS,
    });
}

function getAuthExpiresAtIso() {
    return new Date(Date.now() + COOKIE_MAX_AGE_MS).toISOString();
}

function buildAuthSuccessPayload(user) {
    return {
        user: {
            id: user.id,
            username: user.username,
            created_at: user.created_at,
            updated_at: user.updated_at,
        },
        expiresAt: getAuthExpiresAtIso(),
    };
}

module.exports = {
    COOKIE_MAX_AGE_MS,
    JWT_EXPIRES_IN,
    setAuthTokenCookie,
    getAuthExpiresAtIso,
    buildAuthSuccessPayload,
};
