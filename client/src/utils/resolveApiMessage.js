import i18n from '../i18n';

/** 解析 API message：优先 errorMessageCode，回退后端中文 message */
export function resolveApiMessage(data) {
    if (data?.errorMessageCode) {
        const key = `apiErrorMessages.${data.errorMessageCode}`;
        const translated = i18n.t(key);
        if (translated !== key) {
            return translated;
        }
    }

    return data?.message ?? '';
}

/** 解析 API error 详情：优先 errorCode，回退后端中文 error */
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
        }, error.status);
    }

    return error?.message ?? '';
}

/** 组合展示用错误文案 */
export function buildApiErrorText(data, status) {
    const message = resolveApiMessage(data);
    const detail = resolveApiErrorDetail(data);

    if (message && detail && message !== detail) {
        return `${message}: ${detail}`;
    }

    return message || detail || i18n.t('ui.requestFailed', { status });
}
