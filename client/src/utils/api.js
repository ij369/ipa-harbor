const API_BASE_URL =
    import.meta.env.MODE === 'production' ?
        window.location.origin : // 生产环境使用当前域名
        import.meta.env.VITE_API_BASE_URL; // 开发环境使用VITE_API_BASE_URL

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
        const data = await response.json();

        // 特殊处理：需要二次验证的情况
        if (!data.success && data.needsTwoFactor) {
            const error = new Error(data.message || '需要二次验证码');
            error.needsTwoFactor = true;
            throw error;
        }

        // 如果请求成功但业务逻辑失败
        if (!data.success) {
            const errorMessage = data.message || `请求失败 (${response.status})`;
            const error = new Error(errorMessage);

            // 保留后端返回的错误类型和其他信息
            if (data.errorType) {
                error.errorType = data.errorType;
            }
            if (data.error) {
                error.backendError = data.error;
            }

            throw error;
        }

        return data;
    } catch (error) {
        if (error.message.includes('Failed to fetch')) {
            const errorMessage = '网络连接失败，请检查服务器是否运行';
            throw new Error(errorMessage);
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
export async function searchApps(keyword, limit = 5) {
    const params = new URLSearchParams({ keyword, limit: limit.toString() });
    return apiRequest(`/v1/app/search?${params}`);
}

/**
 * 获取应用详情
 * @param {Array<number>} ids - 应用ID数组
 */
export async function getAppDetails(ids) {
    return apiRequest('/v1/app/details', {
        method: 'POST',
        body: JSON.stringify({ ids })
    });
}

/**
 * 获取应用图标URL
 * @param {number} id - 应用ID
 * @param {number} size - 图标尺寸，默认100 支持512
 */
export function getAppIconUrl(id, size = 100) {
    return `${API_BASE_URL}/v1/app/icon/${id}?size=${size}`;
}

/**
 * 获取应用版本列表
 * @param {number} appId - 应用ID
 * @param {boolean} useThirdPartyApi - 是否使用第三方 API
 */
export async function getAppVersions(appId, useThirdPartyApi = false) {
    return apiRequest(`/v1/app/${appId}/versions?useThirdPartyApi=${useThirdPartyApi}`, {
        method: 'POST'
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
 * 获取应用安装包URL
 * @param {number} appId - 应用ID
 * @param {string} versionId - 版本ID
 */
export function getAppInstallPackageUrl(appId, versionId) {
    return `itms-services://?action=download-manifest&url=${API_BASE_URL}/v1/ipa/install-package/${appId}_${versionId}/manifest.plist`;
}

/**
 * 获取应用下载包URL
 * @param {number} appId - 应用ID
 * @param {string} versionId - 版本ID
 */
export function getAppDownloadPackageUrl(appId, versionId) {
    return `${API_BASE_URL}/v1/ipa/getpackage/${appId}_${versionId}.ipa`;
}

// ===== 管理员认证相关API =====

/**
 * 获取管理员登录状态
 */
export async function getAdminStatus() {
    return apiRequest('/v1/admin/status');
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
 * @param {string} username - 用户名
 * @param {string} password - 密码
 */
export async function adminSetup(username, password) {
    return apiRequest('/v1/admin/setup', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });
}
