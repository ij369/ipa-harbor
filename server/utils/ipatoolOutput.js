/**
 * 解析 ipatool --format json 的 NDJSON 输出（zerolog 日志行）
 * 已知错误映射为 errorMessageCode / errorCode，由前端 i18n 展示
 * 跟进 upstream: https://github.com/majd/ipatool
 */
const IPATOOL_KNOWN_ERRORS = [
    // pkg/appstore/appstore_login.go — normalizeAuthCode
    {
        match: '2FA code must contain exactly six digits',
        errorMessageCode: 'AUTH_LOGIN_INVALID_2FA_FORMAT',
        errorCode: 'AUTH_LOGIN_INVALID_2FA_FORMAT_DETAIL',
    },
    // pkg/appstore/appstore_login.go — sendAuthenticationRequest
    {
        match: 'authentication request failed after 3 attempts',
        errorMessageCode: 'AUTH_LOGIN_AUTH_RETRY_EXHAUSTED',
        errorCode: 'AUTH_LOGIN_AUTH_RETRY_EXHAUSTED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — sendAuthenticationRequest
    {
        match: 'apple requested a wait longer than',
        errorMessageCode: 'AUTH_LOGIN_AUTH_WAIT_TOO_LONG',
        errorCode: 'AUTH_LOGIN_AUTH_WAIT_TOO_LONG_DETAIL',
    },
    // pkg/appstore/appstore_login.go — authenticationRequestError
    {
        match: 'apple rate limited authentication',
        errorMessageCode: 'AUTH_LOGIN_AUTH_RATE_LIMITED',
        errorCode: 'AUTH_LOGIN_AUTH_RATE_LIMITED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — parseLoginResponse / authenticationRequestError
    {
        match: 'apple returned no usable authentication response',
        errorMessageCode: 'AUTH_LOGIN_AUTH_NO_USABLE_RESPONSE',
        errorCode: 'AUTH_LOGIN_AUTH_NO_USABLE_RESPONSE_DETAIL',
    },
    // pkg/http/client.go — authenticationResponseError
    {
        match: 'empty or non-plist authentication response',
        errorMessageCode: 'AUTH_LOGIN_AUTH_NON_PLIST_RESPONSE',
        errorCode: 'AUTH_LOGIN_AUTH_NON_PLIST_RESPONSE_DETAIL',
    },
    // pkg/http/client.go — UnexpectedResponseError.Error
    {
        match: 'empty or non-plist body',
        errorMessageCode: 'AUTH_LOGIN_AUTH_NON_PLIST_BODY',
        errorCode: 'AUTH_LOGIN_AUTH_NON_PLIST_BODY_DETAIL',
    },
    // pkg/http/client.go — UnexpectedResponseError.Error
    {
        match: 'unexpected response from Apple',
        errorMessageCode: 'AUTH_LOGIN_APPLE_UNEXPECTED_RESPONSE',
        errorCode: 'AUTH_LOGIN_APPLE_UNEXPECTED_RESPONSE_DETAIL',
    },
    // pkg/appstore/appstore_login.go — parseLoginResponse
    {
        match: 'apple did not complete verification; try a fresh 2FA code',
        errorMessageCode: 'AUTH_LOGIN_2FA_INCOMPLETE',
        errorCode: 'AUTH_LOGIN_2FA_INCOMPLETE_DETAIL',
    },
    // pkg/appstore/constants.go — CustomerMessageAccountDisabled
    {
        match: 'account is disabled',
        errorMessageCode: 'AUTH_LOGIN_ACCOUNT_DISABLED',
        errorCode: 'AUTH_LOGIN_ACCOUNT_DISABLED_DETAIL',
    },
    // pkg/appstore/constants.go — CustomerMessagePasswordChanged
    {
        match: 'Your password has changed.',
        errorMessageCode: 'AUTH_LOGIN_PASSWORD_CHANGED',
        errorCode: 'AUTH_LOGIN_PASSWORD_CHANGED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — validateAuthenticationEndpoint
    {
        match: 'invalid authentication redirect',
        errorMessageCode: 'AUTH_LOGIN_INVALID_REDIRECT',
        errorCode: 'AUTH_LOGIN_INVALID_REDIRECT_DETAIL',
    },
    // pkg/appstore/appstore_login.go — login（Store pod 阶段）
    {
        match: 'sign-in at Store pod request failed',
        errorMessageCode: 'AUTH_LOGIN_STORE_POD_FAILED',
        errorCode: 'AUTH_LOGIN_STORE_POD_FAILED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — login（2FA 阶段）
    {
        match: '2FA verification request failed',
        errorMessageCode: 'AUTH_LOGIN_2FA_VERIFY_FAILED',
        errorCode: 'AUTH_LOGIN_2FA_VERIFY_FAILED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — login（sign-in 阶段）
    {
        match: 'sign-in request failed',
        errorMessageCode: 'AUTH_LOGIN_SIGN_IN_FAILED',
        errorCode: 'AUTH_LOGIN_SIGN_IN_FAILED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — parseLoginResponse
    {
        match: 'too many attempts',
        errorMessageCode: 'AUTH_LOGIN_TOO_MANY_ATTEMPTS',
        errorCode: 'AUTH_LOGIN_TOO_MANY_ATTEMPTS_DETAIL',
    },
    // pkg/appstore/appstore_login.go — Login
    {
        match: 'failed to initialize SAP action signer',
        errorMessageCode: 'AUTH_LOGIN_SAP_INIT_FAILED',
        errorCode: 'AUTH_LOGIN_SAP_INIT_FAILED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — Login
    {
        match: 'SAP action signer is not configured',
        errorMessageCode: 'AUTH_LOGIN_SAP_NOT_CONFIGURED',
        errorCode: 'AUTH_LOGIN_SAP_NOT_CONFIGURED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — Login
    {
        match: 'SAP action signer factory returned nil',
        errorMessageCode: 'AUTH_LOGIN_SAP_FACTORY_NIL',
        errorCode: 'AUTH_LOGIN_SAP_FACTORY_NIL_DETAIL',
    },
    // pkg/appstore/appstore_login.go — Login / login
    {
        match: 'failed to close SAP action signer',
        errorMessageCode: 'AUTH_LOGIN_SAP_CLOSE_FAILED',
        errorCode: 'AUTH_LOGIN_SAP_CLOSE_FAILED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — Login
    {
        match: 'failed to get mac address',
        errorMessageCode: 'AUTH_LOGIN_MAC_ADDRESS_FAILED',
        errorCode: 'AUTH_LOGIN_MAC_ADDRESS_FAILED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — Login（bag.xml）
    {
        match: 'failed to get bag',
        errorMessageCode: 'AUTH_LOGIN_BAG_FAILED',
        errorCode: 'AUTH_LOGIN_BAG_FAILED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — login
    {
        match: 'failed to save account in keychain',
        errorMessageCode: 'AUTH_LOGIN_KEYCHAIN_SAVE_FAILED',
        errorCode: 'AUTH_LOGIN_KEYCHAIN_SAVE_FAILED_DETAIL',
    },
    // pkg/appstore/appstore_login.go — parseLoginResponse / NewErrorWithMetadata
    {
        match: 'something went wrong',
        errorMessageCode: 'AUTH_LOGIN_APPLE_UNKNOWN',
        errorCode: 'AUTH_LOGIN_APPLE_UNKNOWN_DETAIL',
    },
    // pkg/appstore/appstore_account_info.go — AccountInfo
    {
        match: 'failed to get account',
        errorMessageCode: 'AUTH_LOGIN_ACCOUNT_NOT_FOUND',
        errorCode: 'AUTH_LOGIN_ACCOUNT_NOT_FOUND_DETAIL',
    },
    // cmd/auth.go — loginCmd
    {
        match: 'email is required when not running in interactive mode',
        errorMessageCode: 'AUTH_LOGIN_EMAIL_REQUIRED',
        errorCode: 'AUTH_LOGIN_EMAIL_REQUIRED_DETAIL',
    },
    // cmd/auth.go — loginCmd
    {
        match: 'password is required when not running in interactive mode',
        errorMessageCode: 'AUTH_LOGIN_PASSWORD_REQUIRED',
        errorCode: 'AUTH_LOGIN_PASSWORD_REQUIRED_DETAIL',
    },
    // cmd/auth.go — loginCmd
    {
        match: 'failed to read email',
        errorMessageCode: 'AUTH_LOGIN_READ_EMAIL_FAILED',
        errorCode: 'AUTH_LOGIN_READ_EMAIL_FAILED_DETAIL',
    },
    // cmd/auth.go — loginCmd
    {
        match: 'failed to read password',
        errorMessageCode: 'AUTH_LOGIN_READ_PASSWORD_FAILED',
        errorCode: 'AUTH_LOGIN_READ_PASSWORD_FAILED_DETAIL',
    },
    // cmd/auth.go — loginCmd
    {
        match: 'failed to read auth code',
        errorMessageCode: 'AUTH_LOGIN_READ_2FA_FAILED',
        errorCode: 'AUTH_LOGIN_READ_2FA_FAILED_DETAIL',
    },
    // Rosetta/SAP 运行时 stderr
    {
        match: 'Could not allocate dynamic translator buffer',
        errorMessageCode: 'AUTH_LOGIN_INSUFFICIENT_MEMORY',
        errorCode: 'AUTH_LOGIN_TRANSLATOR_BUFFER_FAILED',
    },
    // ipatool 配置目录 stderr
    {
        match: 'failed to create config directory',
        errorMessageCode: 'AUTH_LOGIN_CONFIG_DIR_FAILED',
        errorCode: 'AUTH_LOGIN_CONFIG_DIR_DETAIL',
    },
];

const IPATOOL_PARSE_FAILED_ERROR = {
    errorMessageCode: 'AUTH_LOGIN_PARSE_FAILED',
    errorCode: 'AUTH_LOGIN_PARSE_FAILED_DETAIL',
};

function parseIpatoolJsonLines(text) {
    if (!text || !text.trim()) {
        return [];
    }

    const parsed = [];
    for (const line of text.trim().split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }

        try {
            parsed.push(JSON.parse(trimmed));
        } catch {
            // 忽略非 JSON 行
        }
    }

    return parsed;
}

/**
 * 在 ipatool 输出文本中匹配已知错误码；未匹配返回 null（由调用方透传原文）
 * @param {...string} texts
 * @returns {{ errorMessageCode: string, errorCode: string } | null}
 */
function resolveKnownIpatoolError(...texts) {
    for (const text of texts) {
        if (typeof text !== 'string' || !text.trim()) {
            continue;
        }
        for (const entry of IPATOOL_KNOWN_ERRORS) {
            if (text.includes(entry.match)) {
                return {
                    errorMessageCode: entry.errorMessageCode,
                    errorCode: entry.errorCode,
                };
            }
        }
    }

    return null;
}

function containsTwoFactorHint(text) {
    return typeof text === 'string' && text.includes('2FA code is required');
}

function detectTwoFactorRequired(lines, rawText) {
    if (containsTwoFactorHint(rawText)) {
        return true;
    }

    return lines.some((line) => containsTwoFactorHint(line.message));
}

function extractAccountFromLines(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line.success === true && line.email) {
            return {
                name: line.name,
                email: line.email,
            };
        }
    }

    return null;
}

function extractErrorFromLines(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line.success === false || line.level === 'error') {
            return line.error || line.message || null;
        }
    }

    return null;
}

function extractListVersionsFromLines(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line.success === true && Array.isArray(line.externalVersionIdentifiers)) {
            return {
                externalVersionIdentifiers: line.externalVersionIdentifiers,
                latestExternalVersionID: line.latestExternalVersionID,
                bundleID: line.bundleID,
            };
        }
    }

    return null;
}

/**
 * @param {string} stdout
 * @param {string} [stderr]
 * @returns {{ success: boolean, data?: object, needsTwoFactor?: boolean, error?: string, knownError?: object, rawOutput?: string }}
 */
function parseIpatoolOutput(stdout, stderr = '') {
    const combined = [stdout, stderr].filter(Boolean).join('\n');
    const lines = parseIpatoolJsonLines(combined);
    const stderrText = typeof stderr === 'string' ? stderr.trim() : '';
    const jsonError = extractErrorFromLines(lines);

    if (jsonError) {
        if (containsTwoFactorHint(jsonError) || detectTwoFactorRequired(lines, combined)) {
            return {
                success: false,
                needsTwoFactor: true,
                message: '需要二次验证码',
                rawOutput: combined,
            };
        }
        return {
            success: false,
            error: jsonError,
            knownError: resolveKnownIpatoolError(jsonError, stderrText, combined),
            rawOutput: combined,
        };
    }

    const stderrKnownError = resolveKnownIpatoolError(stderrText, combined);
    if (stderrKnownError) {
        return {
            success: false,
            error: stderrText || jsonError,
            knownError: stderrKnownError,
            rawOutput: combined,
        };
    }

    if (detectTwoFactorRequired(lines, combined)) {
        return {
            success: false,
            needsTwoFactor: true,
            message: '需要二次验证码',
            rawOutput: combined,
        };
    }

    const account = extractAccountFromLines(lines);
    if (account) {
        return {
            success: true,
            data: account,
        };
    }

    if (stderrText) {
        return {
            success: false,
            error: stderrText,
            knownError: resolveKnownIpatoolError(stderrText, combined),
            rawOutput: combined,
        };
    }

    return {
        success: false,
        error: '未能解析 ipatool 响应',
        knownError: { ...IPATOOL_PARSE_FAILED_ERROR },
        rawOutput: combined,
    };
}

/** @deprecated 使用 resolveKnownIpatoolError */
function extractKnownStderrError(stderr) {
    return resolveKnownIpatoolError(stderr);
}

module.exports = {
    IPATOOL_KNOWN_ERRORS,
    IPATOOL_PARSE_FAILED_ERROR,
    parseIpatoolOutput,
    parseIpatoolJsonLines,
    resolveKnownIpatoolError,
    extractKnownStderrError,
    extractErrorFromLines,
    extractListVersionsFromLines,
};
