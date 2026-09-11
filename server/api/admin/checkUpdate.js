const { getAppVersion } = require('../../utils/version');
const {
    fetchDockerHubTags,
    getLatestReleaseTag,
    compareSemver,
} = require('../../utils/dockerHub');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const HARBOR_GITHUB_URL = 'https://github.com/ij369/ipa-harbor';
const IPATOOL_GITHUB_URL = 'https://github.com/majd/ipatool';
const DOCKER_HUB_URL = 'https://hub.docker.com/r/uuphy/ipa-harbor/tags';

/**
 * 检查 ipa-harbor 是否有新版本
 */
async function checkUpdateHandler(req, res) {
    try {
        const currentVersion = getAppVersion();
        const tags = await fetchDockerHubTags();
        const latestVersion = getLatestReleaseTag(tags);

        if (!latestVersion) {
            return sendError(res, 502, {
                message: '未能从 Docker Hub 获取有效版本号',
                errorMessageCode: 'ADMIN_CHECK_UPDATE_VERSION_UNAVAILABLE',
                error: '无法从 Docker Hub 获取版本号',
                errorCode: 'ADMIN_CHECK_UPDATE_DOCKER_HUB_FAILED',
            });
        }

        const compareResult = compareSemver(latestVersion, currentVersion);
        const isLatest = compareResult <= 0;

        return sendSuccess(res, {
            errorMessageCode: 'ADMIN_CHECK_UPDATE_SUCCESS',
            data: {
                currentVersion,
                latestVersion,
                isLatest,
                harborGithubUrl: HARBOR_GITHUB_URL,
                ipatoolGithubUrl: IPATOOL_GITHUB_URL,
                dockerHubUrl: DOCKER_HUB_URL,
            },
        });
    } catch (error) {
        console.error('检查更新失败:', error);
        return sendError(res, 500, {
            message: '检查更新失败',
            errorMessageCode: 'ADMIN_CHECK_UPDATE_FAILED',
            error: error.message,
            errorCode: 'ADMIN_CHECK_UPDATE_ERROR_DETAIL',
        });
    }
}

module.exports = checkUpdateHandler;
