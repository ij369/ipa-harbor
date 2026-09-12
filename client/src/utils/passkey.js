import {
    startAuthentication,
    startRegistration,
} from '@simplewebauthn/browser';
import i18n from '../i18n';
import { resolveClientErrorMessage } from './resolveApiMessage';

// 默认开启；设置 VITE_PASSKEY_CONDITIONAL_UI=false 可关闭
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
    if (error.name === 'SecurityError') {
        return i18n.t('ui.passkeySecurityError');
    }
    if (error.name === 'InvalidStateError') {
        return i18n.t('ui.passkeyInvalidState');
    }
    if (error.name === 'NotSupportedError') {
        return i18n.t('ui.passkeyNotSupported');
    }
    return i18n.t('ui.passkeyLoginFailed');
}

const passkeyNonRetryableCodes = new Set([
    'PASSKEY_NOT_CONFIGURED',
    'WEBAUTHN_ORIGIN_NOT_CONFIGURED',
    'WEBAUTHN_ORIGIN_NOT_ALLOWED',
    'WEBAUTHN_ORIGIN_MISSING',
]);

/** 服务端未配置或 Origin 不匹配等错误，不应触发 Conditional UI 重试 */
export function isPasskeyNonRetryableError(error) {
    const code = error?.errorMessageCode || error?.errorCode;
    return passkeyNonRetryableCodes.has(code);
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
