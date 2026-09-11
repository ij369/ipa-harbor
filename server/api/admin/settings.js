const { writeAppSettings, mergeSettings } = require('../../utils/appSettings');
const { templateHasVariable } = require('../../utils/filenameTemplate');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

/**
 * 更新应用设置（下载文件名模板持久化）
 */
async function updateSettingsHandler(req, res) {
    try {
        const { downloadFileNameTemplate, showVersionMetadataRefresh } = req.body || {};

        if (downloadFileNameTemplate !== undefined && !templateHasVariable(downloadFileNameTemplate)) {
            return sendError(res, 400, {
                message: '文件名至少保留一个变量',
                errorMessageCode: 'ADMIN_SETTINGS_FILENAME_TEMPLATE_INVALID',
                error: '至少保留一个变量',
                errorCode: 'ADMIN_SETTINGS_FILENAME_NO_VARIABLE',
            });
        }

        if (showVersionMetadataRefresh !== undefined && typeof showVersionMetadataRefresh !== 'boolean') {
            return sendError(res, 400, {
                message: 'showVersionMetadataRefresh 必须是布尔值',
                errorMessageCode: 'ADMIN_SETTINGS_SHOW_METADATA_REFRESH_INVALID',
                error: '该值必须为布尔类型',
                errorCode: 'ADMIN_SETTINGS_BOOLEAN_REQUIRED',
            });
        }

        const nextSettings = mergeSettings({
            ...(downloadFileNameTemplate !== undefined ? { downloadFileNameTemplate } : {}),
            ...(showVersionMetadataRefresh !== undefined ? { showVersionMetadataRefresh } : {}),
        });

        const saved = await writeAppSettings(req.user.id, nextSettings);

        return sendSuccess(res, {
            message: '设置已保存',
            errorMessageCode: 'ADMIN_SETTINGS_SAVE_SUCCESS',
            data: {
                settings: saved,
            },
        });
    } catch (error) {
        console.error('保存应用设置失败:', error);
        return sendError(res, 500, {
            message: '保存设置失败',
            errorMessageCode: 'ADMIN_SETTINGS_SAVE_FAILED',
            error: error.message,
            errorCode: 'ADMIN_SETTINGS_ERROR_DETAIL',
        });
    }
}

module.exports = updateSettingsHandler;
