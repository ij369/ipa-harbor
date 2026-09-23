import {
    startAuthentication,
    startRegistration,
} from '@simplewebauthn/browser';
import i18n from '../i18n';
import { resolveClientErrorMessage } from './resolveApiMessage';

// Conditional UI 为纯前端行为（mediation: conditional），后端无对应开关。
// 默认开启；构建时设置 VITE_PASSKEY_CONDITIONAL_UI=false 可关闭。
const conditionalUiEnabled = import.meta.env.VITE_PASSKEY_CONDITIONAL_UI !== 'false';

export function isPasskeySupported() {
    return typeof window !== 'undefined'
        && window.isSecureContext
        && typeof window.PublicKeyCredential !== 'undefined';
}

export function isPasskeyConditionalUiEnabled() {
    return conditionalUiEnabled && isPasskeySupported();
}

/** 用户取消或超时（浏览器常抛出 NotAllowedError 及英文说明） */
export function isPasskeyUserCancelled(error) {
    if (!error) {
        return false;
    }
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
        return true;
    }
    const message = (error.message || '').toLowerCase();
    return message.includes('timed out or was not allowed')
        || message.includes('the operation either timed out')
        || message.includes('user canceled')
        || message.includes('user cancelled');
}

/** Passkey 客户端错误文案；返回 null 表示用户取消，无需提示 */
export function resolvePasskeyClientError(error) {
    if (!error) {
        return null;
    }
    if (isPasskeyUserCancelled(error)) {
        return null;
    }
    if (error.errorMessageCode || error.errorCode) {
        return resolveClientErrorMessage(error);
    }

    switch (error.name) {
        // 当前环境无法使用通行密钥
        case 'SecurityError':
            return i18n.t('ui.passkeySecurityError');
        // 通行密钥状态异常，请重试
        case 'InvalidStateError':
            return i18n.t('ui.passkeyInvalidState');
        // 此设备不支持通行密钥
        case 'NotSupportedError':
            return i18n.t('ui.passkeyNotSupported');
        default:
            /* 因为 WebAuthn 对安全上下文要求比较严
             如果用户在证书警告的情况下还会继续，这里没有设计 HSTS，没办法阻止用户绕过信任
             浏览器此时会拒绝 WebAuthn 操作，而不会暴露对应错误和流程
             用户此时会点击多次，在触发429后就拿这个万能的文案来指导用户检查 HTTPS 和证书信任 */
            return i18n.t('ui.passkeyLoginFailed');
    }
}

const passkeyNonRetryableCodes = new Set([
    'PASSKEY_NOT_CONFIGURED',
    'WEBAUTHN_ORIGIN_NOT_CONFIGURED',
    'WEBAUTHN_ORIGIN_NOT_ALLOWED',
    'WEBAUTHN_ORIGIN_MISSING',
    'PASSKEY_OPTIONS_RATE_LIMITED',
]);

/** 浏览器 WebAuthn 错误：Conditional UI 自动重试无意义 */
const passkeyNonRetryableErrorNames = new Set([
    'SecurityError',
    'InvalidStateError',
    'NotSupportedError',
]);

/** 服务端未配置、Origin 不匹配、限流或浏览器 WebAuthn 错误，不应触发 Conditional UI 重试 */
export function isPasskeyNonRetryableError(error) {
    if (!error) {
        return false;
    }
    if (error.rateLimited === true) {
        return true;
    }
    const code = error?.errorMessageCode || error?.errorCode;
    if (passkeyNonRetryableCodes.has(code)) {
        return true;
    }
    return passkeyNonRetryableErrorNames.has(error.name);
}

export async function performPasskeyLogin(optionsPayload) {
    const credential = await startAuthentication({ optionsJSON: optionsPayload });
    return credential;
}

export async function performPasskeyRegister(optionsPayload) {
    const credential = await startRegistration({ optionsJSON: optionsPayload });
    return credential;
}

export async function supportsPasskeyConditionalUi() {
    if (!isPasskeyConditionalUiEnabled()) {
        return false;
    }
    try {
        const capabilities = await PublicKeyCredential.getClientCapabilities?.();
        return capabilities?.conditionalGet === true;
    } catch {
        return false;
    }
}

/**
 * 发起 Conditional Get（autofill）。
 * AbortError / NotAllowedError 视为正常结束，返回 null，由调用方决定是否 re-arm。
 */
export async function startConditionalPasskeyLogin(optionsPayload, abortSignal) {
    if (!isPasskeyConditionalUiEnabled()) {
        return null;
    }

    const conditionalSupported = await supportsPasskeyConditionalUi();
    if (!conditionalSupported) {
        return null;
    }

    try {
        const credential = await startAuthentication({
            optionsJSON: optionsPayload,
            useBrowserAutofill: true,
            verifyBrowserAutofillInput: true,
        }, abortSignal ? { signal: abortSignal } : undefined);
        return credential;
    } catch (error) {
        if (isPasskeyUserCancelled(error)) {
            return null;
        }
        throw error;
    }
}
