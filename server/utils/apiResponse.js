/**
 * 统一 API 响应：保留中文 message/error 便于调试，同时附带 errorMessageCode / errorCode 供前端 i18n
 */

function sendSuccess(res, options = {}) {
    const {
        status = 200,
        message,
        errorMessageCode,
        ...extra
    } = options;

    const body = {
        success: true,
        ...extra,
    };

    if (message !== undefined) {
        body.message = message;
    }
    if (errorMessageCode) {
        body.errorMessageCode = errorMessageCode;
    }

    return res.status(status).json(body);
}

function sendError(res, status, options = {}) {
    const {
        message,
        errorMessageCode,
        error,
        errorCode,
        errorType,
        ...extra
    } = options;

    const body = {
        success: false,
        ...extra,
    };

    if (message !== undefined) {
        body.message = message;
    }
    if (errorMessageCode) {
        body.errorMessageCode = errorMessageCode;
    }
    if (error !== undefined) {
        body.error = error;
    }
    if (errorCode) {
        body.errorCode = errorCode;
    }
    if (errorType) {
        body.errorType = errorType;
    }

    return res.status(status).json(body);
}

module.exports = {
    sendSuccess,
    sendError,
};
