const crypto = require('crypto');
const dayjs = require('dayjs');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { Aaguid } = require('webauthx/server');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const database = require('./database');
const { generateToken } = require('../middleware/auth');
const { setAuthTokenCookie, buildAuthSuccessPayload } = require('./adminAuthCookie');
const lanConfig = require('./lanConfig');
const certService = require('./certService');

const RP_NAME = 'IPA Harbor';
const EMPTY_AAGUID = '00000000-0000-0000-0000-000000000000';
const CHALLENGE_TTL_MS = parseInt(process.env.WEBAUTHN_CHALLENGE_TTL_MS, 10) || 5 * 60 * 1000;
const CHALLENGE_CLEANUP_INTERVAL_MINUTES = Math.min(
    59,
    Math.max(1, parseInt(process.env.WEBAUTHN_CHALLENGE_CLEANUP_INTERVAL_MINUTES, 10) || 5),
);
const CHALLENGE_CLEANUP_CRON = `*/${CHALLENGE_CLEANUP_INTERVAL_MINUTES} * * * *`;

function getDynamicWebAuthnOrigins() {
    if (!certService.isAutoCertEnabled()) {
        return [];
    }

    const { lanHostname } = lanConfig.getLanConfig();
    if (!lanHostname || lanHostname === lanConfig.DEFAULT_HOSTNAME) {
        return [];
    }

    const httpsPort = process.env.HTTPS_PORT || 3443;
    return [lanConfig.formatLanUrl('https', lanHostname, httpsPort)];
}

function parseAllowedOrigins() {
    const configured = (process.env.WEBAUTHN_ALLOWED_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    const merged = [...configured];
    for (const origin of getDynamicWebAuthnOrigins()) {
        if (!merged.includes(origin)) {
            merged.push(origin);
        }
    }
    return merged;
}

function isWebAuthnConfigured() {
    return parseAllowedOrigins().length > 0 && Boolean((process.env.WEBAUTHN_RP_ID || '').trim());
}

function attachLanPasskeyHint(err) {
    if (process.env.ALLOW_LAN_ACCESS !== 'true') {
        return;
    }
    const { lanHostname } = lanConfig.getLanConfig();
    if (!lanHostname || lanHostname === lanConfig.DEFAULT_HOSTNAME) {
        return;
    }
    const httpsPort = process.env.HTTPS_PORT || 3443;
    err.lanPasskeyHint = true;
    err.lanHttpsUrl = lanConfig.formatLanUrl(
        'https',
        lanConfig.normalizeHostname(lanHostname),
        httpsPort,
    );
}

function resolveWebAuthnContext(req) {
    const origin = req.get('Origin') || req.get('origin');
    if (!origin) {
        const err = new Error('缺少 Origin 头');
        err.code = 'WEBAUTHN_ORIGIN_MISSING';
        throw err;
    }

    const allowedOrigins = parseAllowedOrigins();
    if (allowedOrigins.length === 0) {
        const err = new Error('WEBAUTHN_ALLOWED_ORIGINS 未配置');
        err.code = 'WEBAUTHN_ORIGIN_NOT_CONFIGURED';
        throw err;
    }

    if (!lanConfig.isOriginAllowed(origin, allowedOrigins)) {
        const err = new Error('Origin 不在允许列表中');
        err.code = 'WEBAUTHN_ORIGIN_NOT_ALLOWED';
        attachLanPasskeyHint(err);
        throw err;
    }

    const url = new URL(origin);
    const { lanHostname } = lanConfig.getLanConfig();
    let rpId;
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        rpId = 'localhost';
    } else if (lanHostname && lanHostname !== lanConfig.DEFAULT_HOSTNAME && lanConfig.hostnameMatches(url.hostname, lanHostname)) {
        rpId = lanConfig.normalizeHostname(url.hostname);
    } else {
        rpId = (process.env.WEBAUTHN_RP_ID || '').trim();
        if (!rpId) {
            throw new Error('WEBAUTHN_RP_ID 未配置');
        }
    }

    return { origin, rpId, rpName: RP_NAME };
}

function normalizeAaguid(aaguid) {
    if (!aaguid || typeof aaguid !== 'string') {
        return null;
    }
    const normalized = aaguid.trim().toLowerCase();
    if (!normalized || normalized === EMPTY_AAGUID) {
        return null;
    }
    return normalized;
}

async function lookupProviderName(aaguid) {
    const id = normalizeAaguid(aaguid);
    if (!id) {
        return null;
    }
    try {
        const info = await Aaguid.lookup({ id });
        return info?.name || null;
    } catch (error) {
        console.warn('AAGUID 解析失败:', id, error.message);
        return null;
    }
}

async function lookupProviderNames(aaguids) {
    const uniqueIds = [...new Set(aaguids.map((item) => normalizeAaguid(item)).filter(Boolean))];
    const entries = await Promise.all(uniqueIds.map(async (id) => [id, await lookupProviderName(id)]));
    return new Map(entries);
}

async function warmupAaguidRegistry() {
    await lookupProviderName('fbfc3007-154e-4ecc-8c0b-6e020557d7bd');
}

async function runChallengeCleanup() {
    return database.cleanupExpiredChallenges(dayjs().valueOf());
}

async function runChallengeCleanupOnStartup() {
    try {
        const removed = await runChallengeCleanup();
        if (removed > 0) {
            console.log(`Passkey challenge 启动清理完成，删除 ${removed} 条记录`);
        }
    } catch (error) {
        console.warn('Passkey challenge 启动清理失败:', error.message);
    }
}

function startChallengeCleanupCron() {
    return cron.schedule(CHALLENGE_CLEANUP_CRON, async () => {
        try {
            const removed = await runChallengeCleanup();
            if (removed > 0) {
                console.log(`Passkey challenge 清理完成，删除 ${removed} 条记录`);
            }
        } catch (error) {
            console.error('Passkey challenge 定时清理失败:', error);
        }
    });
}

function getClientIp(req) {
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function toBase64UrlBuffer(base64url) {
    return Buffer.from(base64url, 'base64url');
}

function resolveDisplayName(nickname, providerName) {
    const trimmed = typeof nickname === 'string' ? nickname.trim() : '';
    return trimmed || providerName || null;
}

async function ensureWebAuthnUserHandle(userId) {
    let handle = await database.getUserWebAuthnHandle(userId);
    if (handle) {
        return handle;
    }
    handle = crypto.randomBytes(32).toString('base64url');
    await database.setUserWebAuthnHandle(userId, handle);
    return handle;
}

async function mapPasskeyListItem(row, providerNames) {
    const providerName = row.aaguid
        ? (providerNames.get(normalizeAaguid(row.aaguid)) || null)
        : null;
    return {
        id: row.id,
        aaguid: row.aaguid || null,
        nickname: row.nickname,
        providerName,
        displayName: resolveDisplayName(row.nickname, providerName),
        deviceType: row.device_type,
        backedUp: Boolean(row.backed_up),
        createdAt: Number(row.created_at) || null,
        lastUsedAt: row.last_used_at == null ? null : Number(row.last_used_at),
    };
}

async function createLoginOptions(req) {
    const { origin, rpId, rpName } = resolveWebAuthnContext(req);
    const clientIp = getClientIp(req);
    await database.invalidateLoginChallengesByIp(clientIp);

    const options = await generateAuthenticationOptions({
        rpID: rpId,
        userVerification: 'required',
        timeout: CHALLENGE_TTL_MS,
    });

    const challengeId = uuidv4();
    const createdAt = dayjs().valueOf();
    const expiresAt = dayjs().add(CHALLENGE_TTL_MS, 'millisecond').valueOf();
    await database.createAuthChallenge({
        id: challengeId,
        challenge: options.challenge,
        type: 'login',
        clientIp,
        expiresAt,
        createdAt,
    });

    return {
        challengeId,
        options,
        rpId,
        rpName,
        origin,
    };
}

async function verifyLogin(req, res) {
    const { origin, rpId } = resolveWebAuthnContext(req);
    const { challengeId, credential } = req.body || {};

    if (!challengeId || !credential?.id) {
        const err = new Error('缺少 challengeId 或 credential');
        err.code = 'PASSKEY_LOGIN_INVALID_PAYLOAD';
        throw err;
    }

    const consumed = await database.consumeAuthChallengeById(challengeId, dayjs().valueOf());
    if (!consumed || consumed.type !== 'login') {
        const err = new Error('Challenge 无效或已过期');
        err.code = 'PASSKEY_CHALLENGE_INVALID';
        throw err;
    }

    const passkey = await database.getPasskeyByCredentialId(credential.id);
    if (!passkey) {
        const err = new Error('未找到对应 Passkey');
        err.code = 'PASSKEY_CREDENTIAL_NOT_FOUND';
        throw err;
    }

    const user = await database.getUserById(passkey.user_id);
    if (!user) {
        const err = new Error('用户不存在');
        err.code = 'PASSKEY_USER_NOT_FOUND';
        throw err;
    }

    const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: consumed.challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        credential: {
            id: passkey.credential_id,
            publicKey: passkey.public_key,
            counter: passkey.sign_count,
            transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
        },
    });

    if (!verification.verified) {
        const err = new Error('Passkey 验证失败');
        err.code = 'PASSKEY_VERIFICATION_FAILED';
        throw err;
    }

    await handleSignCountAfterAuth({
        passkey,
        authInfo: verification.authenticationInfo,
        req,
    });

    const token = generateToken({
        userId: user.id,
        username: user.username,
    });
    setAuthTokenCookie(res, token);

    return {
        message: '登录成功',
        errorMessageCode: 'ADMIN_PASSKEY_LOGIN_SUCCESS',
        data: buildAuthSuccessPayload(user),
    };
}

async function handleSignCountAfterAuth({ passkey, authInfo, req }) {
    const storedCount = passkey.sign_count;
    const newCount = authInfo.newCounter;
    const credentialId = passkey.credential_id;
    const lastUsedAt = dayjs().valueOf();

    if (newCount > storedCount) {
        await database.updatePasskeySignCount(credentialId, newCount, lastUsedAt);
        return;
    }

    if (newCount === 0 && storedCount === 0) {
        await database.touchPasskeyLastUsed(credentialId, lastUsedAt);
        return;
    }

    if (newCount < storedCount) {
        await database.insertPasskeySecurityEvent({
            id: uuidv4(),
            userId: passkey.user_id,
            credentialId,
            eventType: 'sign_count_anomaly',
            oldSignCount: storedCount,
            newSignCount: newCount,
            credentialDeviceType: authInfo.credentialDeviceType,
            credentialBackedUp: authInfo.credentialBackedUp,
            ip: getClientIp(req),
            userAgent: req.get('User-Agent') || null,
            createdAt: lastUsedAt,
        });
    }

    await database.touchPasskeyLastUsed(credentialId, lastUsedAt);
}

async function createRegisterOptions(req) {
    const user = req.user;
    const { origin, rpId, rpName } = resolveWebAuthnContext(req);
    const clientIp = getClientIp(req);

    await database.invalidateRegisterChallengesByUserId(user.id);

    const webauthnUserHandle = await ensureWebAuthnUserHandle(user.id);
    const existingPasskeys = await database.getPasskeysByUserId(user.id);

    const options = await generateRegistrationOptions({
        rpName,
        rpID: rpId,
        userName: user.username,
        userDisplayName: user.username,
        userID: toBase64UrlBuffer(webauthnUserHandle),
        attestationType: 'none',
        authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
        },
        excludeCredentials: existingPasskeys.map((row) => ({
            id: row.credential_id,
            transports: row.transports ? JSON.parse(row.transports) : undefined,
        })),
        timeout: CHALLENGE_TTL_MS,
    });

    const challengeId = uuidv4();
    const createdAt = dayjs().valueOf();
    const expiresAt = dayjs().add(CHALLENGE_TTL_MS, 'millisecond').valueOf();
    await database.createAuthChallenge({
        id: challengeId,
        challenge: options.challenge,
        type: 'register',
        userId: user.id,
        clientIp,
        expiresAt,
        createdAt,
    });

    return {
        challengeId,
        options,
        rpId,
        rpName,
        origin,
    };
}

async function verifyRegister(req) {
    const user = req.user;
    const { origin, rpId } = resolveWebAuthnContext(req);
    const { challengeId, credential, nickname } = req.body || {};

    if (!challengeId || !credential?.id) {
        const err = new Error('缺少 challengeId 或 credential');
        err.code = 'PASSKEY_REGISTER_INVALID_PAYLOAD';
        throw err;
    }

    const consumed = await database.consumeAuthChallengeById(challengeId, dayjs().valueOf());
    if (!consumed || consumed.type !== 'register' || consumed.user_id !== user.id) {
        const err = new Error('Challenge 无效或已过期');
        err.code = 'PASSKEY_CHALLENGE_INVALID';
        throw err;
    }

    const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: consumed.challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
        const err = new Error('Passkey 注册验证失败');
        err.code = 'PASSKEY_REGISTRATION_FAILED';
        throw err;
    }

    const {
        credential: regCredential,
        credentialDeviceType,
        credentialBackedUp,
        aaguid: rawAaguid,
    } = verification.registrationInfo;

    const existing = await database.getPasskeyByCredentialId(regCredential.id);
    if (existing) {
        const err = new Error('该 Passkey 已注册');
        err.code = 'PASSKEY_ALREADY_REGISTERED';
        throw err;
    }

    const aaguid = normalizeAaguid(rawAaguid);
    const providerName = aaguid ? await lookupProviderName(aaguid) : null;
    const userNickname = typeof nickname === 'string' ? nickname.trim() : '';
    const finalNickname = userNickname || providerName || null;
    const registeredAt = dayjs().valueOf();

    await database.insertPasskey({
        id: uuidv4(),
        userId: user.id,
        credentialId: regCredential.id,
        publicKey: Buffer.from(regCredential.publicKey),
        signCount: regCredential.counter,
        transports: regCredential.transports,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        aaguid,
        nickname: finalNickname,
        createdAt: registeredAt,
        lastUsedAt: registeredAt,
    });

    return {
        message: 'Passkey 注册成功',
        errorMessageCode: 'PASSKEY_REGISTER_SUCCESS',
    };
}

async function listPasskeys(userId) {
    const rows = await database.getPasskeysByUserId(userId);
    const providerNames = await lookupProviderNames(rows.map((row) => row.aaguid));
    return Promise.all(rows.map((row) => mapPasskeyListItem(row, providerNames)));
}

async function updatePasskeyNickname(userId, passkeyId, nickname) {
    const passkey = await database.getPasskeyById(passkeyId);
    if (!passkey || passkey.user_id !== userId) {
        const err = new Error('Passkey 不存在');
        err.code = 'PASSKEY_NOT_FOUND';
        throw err;
    }

    const normalized = typeof nickname === 'string' ? nickname.trim() : '';
    if (normalized.length > 64) {
        const err = new Error('备注长度不能超过 64 个字符');
        err.code = 'PASSKEY_NICKNAME_TOO_LONG';
        throw err;
    }

    const updated = await database.updatePasskeyNickname(passkeyId, userId, normalized || null);
    if (!updated) {
        const err = new Error('Passkey 备注更新失败');
        err.code = 'PASSKEY_NICKNAME_UPDATE_FAILED';
        throw err;
    }

    const providerName = passkey.aaguid ? await lookupProviderName(passkey.aaguid) : null;

    return {
        message: 'Passkey 备注已更新',
        errorMessageCode: 'PASSKEY_NICKNAME_UPDATE_SUCCESS',
        data: {
            id: passkeyId,
            aaguid: passkey.aaguid || null,
            nickname: normalized || null,
            providerName,
            displayName: resolveDisplayName(normalized, providerName),
        },
    };
}

async function deletePasskey(userId, passkeyId) {
    const passkey = await database.getPasskeyById(passkeyId);
    if (!passkey || passkey.user_id !== userId) {
        const err = new Error('Passkey 不存在');
        err.code = 'PASSKEY_NOT_FOUND';
        throw err;
    }

    const count = await database.countPasskeysByUserId(userId);
    if (count <= 1) {
        const err = new Error('不能删除最后一个 Passkey');
        err.code = 'PASSKEY_DELETE_LAST_FORBIDDEN';
        throw err;
    }

    const deleted = await database.deletePasskey(passkeyId, userId);
    if (!deleted) {
        const err = new Error('Passkey 删除失败');
        err.code = 'PASSKEY_DELETE_FAILED';
        throw err;
    }

    return {
        message: 'Passkey 已删除',
        errorMessageCode: 'PASSKEY_DELETE_SUCCESS',
    };
}

module.exports = {
    CHALLENGE_TTL_MS,
    isWebAuthnConfigured,
    warmupAaguidRegistry,
    runChallengeCleanupOnStartup,
    startChallengeCleanupCron,
    createLoginOptions,
    verifyLogin,
    createRegisterOptions,
    verifyRegister,
    listPasskeys,
    updatePasskeyNickname,
    deletePasskey,
};
