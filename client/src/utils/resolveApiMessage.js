import i18n from '../i18n';

function hasI18nTranslation(key) {
    return i18n.t(key) !== key;
}

/** 解析 API message：优先 errorMessageCode，回退后端中文 message */
export function resolveApiMessage(data) {
    if (data?.errorMessageCode) {
        const key = `apiErrorMessages.${data.errorMessageCode}`;
        const translated = i18n.t(key);
        if (translated !== key) {
            return translated;
        }
    }

    return data?.message ?? data?.error ?? '';
}

/** 解析 API error 详情：有 errorCode 时优先本地化，否则回退后端 error 原文 */
export function resolveApiErrorDetail(data) {
    if (data?.errorCode) {
        const key = `apiErrorDetails.${data.errorCode}`;
        const translated = i18n.t(key);
        if (translated !== key) {
            return translated;
        }
    }

    return data?.error ?? '';
}

/** 用户可见错误文案：networkError 等带 userMessage 时走 i18n，控制台仍用 error.message */
export function resolveClientErrorMessage(error) {
    if (error?.userMessage) {
        return error.userMessage;
    }

    if (error?.errorMessageCode || error?.errorCode) {
        return buildApiErrorText({
            errorMessageCode: error.errorMessageCode,
            message: error.backendMessage,
            errorCode: error.errorCode,
            error: error.backendError,
            lanPasskeyHint: error.lanPasskeyHint,
            lanHttpsUrl: error.lanHttpsUrl,
        }, error.httpStatus);
    }

    return error?.message ?? '';
}

function resolveWebAuthnOriginNotAllowedLanMessage(data) {
    if (data?.errorMessageCode !== 'WEBAUTHN_ORIGIN_NOT_ALLOWED' || !data?.lanPasskeyHint) {
        return null;
    }
    const key = 'apiErrorMessages.WEBAUTHN_ORIGIN_NOT_ALLOWED_LAN';
    if (!hasI18nTranslation(key)) {
        return null;
    }
    return i18n.t(key, { lanHttpsUrl: data.lanHttpsUrl || '' });
}

/** 组合展示用错误文案 */
export function buildApiErrorText(data, status) {
    const lanPasskeyMessage = resolveWebAuthnOriginNotAllowedLanMessage(data);
    if (lanPasskeyMessage) {
        return lanPasskeyMessage;
    }

    const message = resolveApiMessage(data);
    const detail = resolveApiErrorDetail(data);
    const messageFromCode = data?.errorMessageCode
        && hasI18nTranslation(`apiErrorMessages.${data.errorMessageCode}`);
    const detailFromCode = data?.errorCode
        && hasI18nTranslation(`apiErrorDetails.${data.errorCode}`);

    // 无 errorMessageCode 且 message/error 相同时，直接展示原文（非 ipatool 映射场景）
    if (!data?.errorMessageCode && data?.error && data.message === data.error) {
        return data.error;
    }

    // 有 errorMessageCode 但无对应 i18n 时，透传后端原文
    if (data?.errorMessageCode && !messageFromCode) {
        const raw = data?.error || data?.message;
        if (raw) {
            return raw;
        }
    }

    // 主文案已本地化且无 detail 本地化时，不拼接重复信息
    if (messageFromCode && detail && !detailFromCode) {
        return message;
    }

    if (message && detail && message !== detail) {
        return `${message}: ${detail}`;
    }

    return message || detail || i18n.t('ui.requestFailed', { status });
}
