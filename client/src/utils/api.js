import Swal from 'sweetalert2';
import i18n, { getIntlLocale } from '../i18n';
import { isOtaInstallEnabled, isOtaSecureContext } from './otaInstallPreference';
import {
    buildApiErrorText,
    resolveApiErrorDetail,
    resolveApiMessage,
    resolveClientErrorMessage,
} from './resolveApiMessage';

export { buildApiErrorText, resolveApiErrorDetail, resolveApiMessage, resolveClientErrorMessage };

const NETWORK_CONNECTION_FAILED = '网络连接失败，请检查服务器是否运行';

function getRequestLang() {
    return getIntlLocale(i18n.language);
}

const API_BASE_URL =
    import.meta.env.MODE === 'production' ?
        window.location.origin : // 生产环境使用当前域名
        import.meta.env.VITE_API_BASE_URL; // 开发环境使用VITE_API_BASE_URL

/** 是否为 429 限流 */
export function isRateLimitError(error) {
    return error?.rateLimited === true;
}

function showRateLimitToast() {
    Swal.fire({
        icon: 'warning',
        title: i18n.t('ui.tooManyRequests'),
        position: 'top',
        toast: true,
        timer: 3000,
        showConfirmButton: false,
    });
}

async function parseResponseBody(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/**
 * @param {string} endpoint - API端点
 * @param {Object} options - fetch选项
 * @returns {Promise} 返回Promise对象
 */
export async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const defaultOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include', // 包含 cookies
    };

    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, finalOptions);

        if (response.status === 429) {
            showRateLimitToast();
            const error = new Error(i18n.t('ui.tooManyRequests'));
            error.rateLimited = true;
            throw error;
        }

        const data = await parseResponseBody(response);
        if (data === null) {
            throw new Error(i18n.t('ui.requestFailed', { status: response.status }));
        }

        // 需要二次验证时直接返回，由登录页展示验证码输入框
        if (!data.success && data.needsTwoFactor) {
            return {
                success: false,
                needsTwoFactor: true,
                message: data.message || '需要二次验证码',
            };
        }

        // 如果请求成功但业务逻辑失败
        if (!data.success) {
            const error = new Error(buildApiErrorText(data, response.status));

            if (data.errorMessageCode) {
                error.errorMessageCode = data.errorMessageCode;
            }
            if (data.errorCode) {
                error.errorCode = data.errorCode;
            }
            if (data.errorType) {
                error.errorType = data.errorType;
            }
            if (data.message) {
                error.backendMessage = data.message;
            }
            if (data.error) {
                error.backendError = data.error;
            }
            error.httpStatus = response.status;

            throw error;
        }

        return data;
    } catch (error) {
        if (error.rateLimited) {
            throw error;
        }

        if (error.message.includes('Failed to fetch')) {
            const networkError = new Error(NETWORK_CONNECTION_FAILED);
            networkError.networkError = true;
            networkError.userMessage = i18n.t('ui.networkConnectionFailed');
            throw networkError;
        }

        throw error;
    }
}

/**
 * 获取信息
 */
export async function getUserInfo() {
    return apiRequest('/v1/auth/info', {
        method: 'POST'
    });
}

/**
 * 撤销认证
 */
export async function revokeAuth() {
    return apiRequest('/v1/auth/revoke', {
        method: 'POST'
    });
}

/**
 * 登录
 * @param {string} email - 邮箱
 * @param {string} password - 密码
 * @param {string} twoFactor - 二次验证码（可选）
 */
export async function login(email, password, twoFactor = null) {
    const body = { email, password };
    if (twoFactor) {
        body.twoFactor = twoFactor;
    }

    return apiRequest('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(body)
    });
}

/**
 * 搜索应用
 * @param {string} keyword - 搜索关键词
 * @param {number} limit - 搜索结果数量限制
 */
export async function searchApps(keyword, limit = 10) {
    const params = new URLSearchParams({ keyword, limit: limit.toString() });
    return apiRequest(`/v1/app/search?${params}`);
}

/**
 * 获取已购项目列表
 * @param {number} page - 页码，从 1 开始
 * @param {number} maxResults - 每页数量，最大 100
 */
export async function listPurchases(page = 1, maxResults = 50) {
    const params = new URLSearchParams({
        page: page.toString(),
        maxResults: maxResults.toString()
    });
    return apiRequest(`/v1/app/purchases?${params}`);
}

/**
 * 获取应用详情
 * @param {Array<number>} ids - 应用ID数组
 */
export async function getAppDetails(ids) {
    const params = new URLSearchParams({ lang: getRequestLang() });
    return apiRequest(`/v1/app/details?${params}`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
    });
}

/**
 * 获取应用图标URL
 * @param {number} id - 应用ID
 * @param {number} size - 图标尺寸，默认100 支持512
 * @param {string} [country] - iTunes 地区
 * @param {string} [file] - sidecar 文件名
 */
export function getAppIconUrl(id, size = 100, country, file) {
    const params = new URLSearchParams({ size: String(size) });
    if (country) {
        params.set('country', country);
    }
    if (file) {
        params.set('file', String(file).replace(/\.ipa$/i, ''));
    }
    return `${API_BASE_URL}/v1/app/icon/${id}?${params}`;
}

/**
 * 获取应用版本列表
 * @param {number} appId - 应用ID
 * @param {boolean} useThirdPartyApi - 是否使用第三方 API
 */
export async function getAppVersions(appId, useThirdPartyApi = false) {
    const params = new URLSearchParams({
        useThirdPartyApi: String(useThirdPartyApi),
        lang: getRequestLang(),
    });
    return apiRequest(`/v1/app/${appId}/versions?${params}`, {
        method: 'POST',
    });
}

/**
 * 手动拉取单个版本的 Apple 元数据（发布日期等）
 * @param {number|string} appId - 应用ID
 * @param {string} versionId - 版本ID
 */
export async function refreshAppVersionMetadata(appId, versionId) {
    return apiRequest(`/v1/app/${appId}/versions/${versionId}/metadata`, {
        method: 'POST',
    });
}

/**
 * 购买/获取应用
 * @param {string} bundleId - 应用Bundle ID
 */
export async function purchaseApp(bundleId) {
    return apiRequest(`/v1/app/${bundleId}/purchase`, {
        method: 'POST'
    });
}

/**
 * 下载应用
 * @param {number} appId - 应用ID
 * @param {string} versionId - 版本ID，'latest'表示最新版本
 * @param {string} bundleId - 应用Bundle ID 'latest' 用来购买应用
 */
export async function downloadApp(appId, versionId, bundleId) {
    return apiRequest(`/v1/app/${appId}/${versionId}`, {
        method: 'POST',
        body: JSON.stringify({ bundleId })
    });
}

/**
 * 删除任务
 * @param {string} taskId - 任务ID (可选)
 * @param {string} fileName - 文件名 (可选)
 * @param {boolean} clearAll - 是否清空所有任务 (可选)
 */
export async function deleteTask(taskId = null, fileName = null, clearAll = false) {
    const body = {};

    if (clearAll) {
        body.clearAll = true;
    } else if (fileName) {
        body.fileName = fileName;
    } else if (taskId) {
        body.taskId = taskId;
    } else {
        throw new Error('必须提供 taskId、fileName 或 clearAll 参数');
    }

    return apiRequest('/v1/dl-manager/tasks/delete', {
        method: 'DELETE',
        body: JSON.stringify(body)
    });
}

/**
 * 清空所有任务和文件
 */
export async function clearAllTasks() {
    return deleteTask(null, null, true);
}

/**
 * 当前是否可用 OTA 安装（HTTPS + 本地开关）
 */
export function canUseOtaInstall() {
    return isOtaSecureContext() && isOtaInstallEnabled();
}

/**
 * 获取带 ticket 签名的 OTA manifest URL（需管理员登录）
 * @param {string} fileBaseName - 如 6766042246_887851211 或含 .ipa
 */
export async function fetchManifestInstallUrl(fileBaseName) {
    const baseName = String(fileBaseName).replace(/\.ipa$/i, '');
    const response = await apiRequest(`/v1/ipa/install-package-url/${encodeURIComponent(baseName)}`);
    return response.data?.installUrl || null;
}

/**
 * 打开 OTA 安装（先向服务端换取带 ticket 的 manifest 链接）
 * @param {string} fileBaseName
 */
export async function openManifestInstall(fileBaseName) {
    const installUrl = await fetchManifestInstallUrl(fileBaseName);
    if (!installUrl) {
        throw new Error('无法获取 OTA 安装链接');
    }
    window.location.href = installUrl;
}

/**
 * 获取带 ticket 签名的 IPA 下载 URL（需管理员登录）
 * @param {string} fileName - 如 6766042246_887851211.ipa
 */
export async function fetchPackageDownloadUrl(fileName) {
    const response = await apiRequest(`/v1/ipa/package-url/${encodeURIComponent(fileName)}`);
    return response.data?.url || null;
}

/**
 * 打开 IPA 下载（先向服务端换取 ticket 签名链接）
 * @param {string} fileName
 */
export async function openPackageDownload(fileName) {
    const url = await fetchPackageDownloadUrl(fileName);
    if (!url) {
        throw new Error('无法获取下载链接');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

// ===== 管理员认证相关API =====

/**
 * 获取管理员登录状态
 */
export async function getAdminStatus() {
    return apiRequest('/v1/admin/status');
}

/**
 * 检查 ipa-harbor 是否有新版本
 */
export async function checkAppUpdate() {
    return apiRequest('/v1/admin/check-update');
}

/**
 * 更新应用设置
 */
export async function updateAdminSettings(settings) {
    return apiRequest('/v1/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
    });
}

/**
 * 管理员登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 */
export async function adminLogin(username, password) {
    return apiRequest('/v1/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });
}

/**
 * 管理员退出登录
 */
export async function adminLogout() {
    return apiRequest('/v1/admin/logout', {
        method: 'POST'
    });
}

/**
 * 初始设置（创建管理员账户）
 * @param {{ username: string, password: string, initPin?: string }} payload
 */
export async function adminSetup(payload) {
    return apiRequest('/v1/admin/setup', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

/**
 * 管理员恢复（重置密码或重建账户）
 * @param {{ username: string, newPassword: string, initPin?: string }} payload
 */
export async function adminRecover(payload) {
    return apiRequest('/v1/admin/recover', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

/**
 * 修改当前管理员登录密码
 * @param {{ currentPassword: string, newPassword: string }} payload
 */
export async function adminChangePassword(payload) {
    return apiRequest('/v1/admin/change-password', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

/**
 * Passkey 登录 options
 */
export async function passkeyLoginOptions() {
    return apiRequest('/v1/admin/passkey/login/options', {
        method: 'POST',
        body: JSON.stringify({}),
    });
}

/**
 * Passkey 登录 verify
 */
export async function passkeyLoginVerify(challengeId, credential) {
    return apiRequest('/v1/admin/passkey/login/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId, credential }),
    });
}

/**
 * Passkey 注册 options（需已登录）
 */
export async function passkeyRegisterOptions() {
    return apiRequest('/v1/admin/passkey/register/options', {
        method: 'POST',
        body: JSON.stringify({}),
    });
}

/**
 * Passkey 注册 verify
 */
export async function passkeyRegisterVerify(challengeId, credential, nickname) {
    return apiRequest('/v1/admin/passkey/register/verify', {
        method: 'POST',
        body: JSON.stringify({ challengeId, credential, nickname }),
    });
}

/**
 * 获取当前用户 Passkey 列表
 */
export async function listPasskeys() {
    return apiRequest('/v1/admin/passkeys');
}

/**
 * 删除 Passkey
 */
export async function updatePasskeyNickname(id, nickname) {
    return apiRequest(`/v1/admin/passkeys/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ nickname }),
    });
}

export async function deletePasskey(id) {
    return apiRequest(`/v1/admin/passkeys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
}

/**
 * 设置用户地区
 * @param {string} region - 地区代码（如 'us', 'cn' 等）
 * @returns {Promise}
 */
export async function setUserRegion(region) {
    return apiRequest('/v1/auth/region', {
        method: 'POST',
        body: JSON.stringify({ region })
    });
}
