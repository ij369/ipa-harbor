const bcrypt = require('bcrypt');
const database = require('../../utils/database');
const { sendSuccess, sendError } = require('../../utils/apiResponse');
const { isSetupCompleted, verifyInitPin } = require('../../utils/adminBootstrap');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;

/**
 * 管理员恢复：重置密码或在数据库为空时重建管理员
 */
async function recoverHandler(req, res) {
    try {
        if (process.env.ADMIN_RECOVERY_ENABLED !== 'true') {
            return sendError(res, 403, {
                message: '管理员恢复功能未启用',
                errorMessageCode: 'ADMIN_RECOVERY_DISABLED',
                error: 'Admin recovery is disabled',
                errorCode: 'ADMIN_RECOVERY_NOT_ENABLED',
            });
        }

        if (!isSetupCompleted()) {
            return sendError(res, 409, {
                message: '系统尚未完成初始化，请使用设置向导',
                errorMessageCode: 'ADMIN_RECOVERY_SETUP_NOT_COMPLETED',
                error: 'Setup is not completed',
                errorCode: 'ADMIN_RECOVERY_SETUP_REQUIRED',
            });
        }

        const { username, newPassword, initPin } = req.body;

        if (!username || !newPassword) {
            return sendError(res, 400, {
                message: '用户名和新密码是必需的参数',
                errorMessageCode: 'ADMIN_RECOVERY_CREDENTIALS_REQUIRED',
                error: 'Username and new password are required',
                errorCode: 'ADMIN_RECOVERY_CREDENTIALS_MISSING',
            });
        }

        if (!initPin) {
            return sendError(res, 400, {
                message: '初始化 PIN 是必需的参数',
                errorMessageCode: 'ADMIN_RECOVERY_INIT_PIN_REQUIRED',
                error: 'Init PIN is required',
                errorCode: 'ADMIN_RECOVERY_INIT_PIN_MISSING',
            });
        }

        if (!verifyInitPin(initPin)) {
            return sendError(res, 403, {
                message: '初始化 PIN 错误',
                errorMessageCode: 'ADMIN_INIT_PIN_INVALID',
                error: 'Invalid init PIN',
                errorCode: 'ADMIN_INIT_PIN_MISMATCH',
            });
        }

        if (username.length < 3 || username.length > 50) {
            return sendError(res, 400, {
                message: '用户名长度必须在3-50个字符之间',
                errorMessageCode: 'ADMIN_SETUP_USERNAME_INVALID_LENGTH',
                error: 'Username length must be between 3-50 characters',
                errorCode: 'ADMIN_SETUP_USERNAME_LENGTH_RULE',
            });
        }

        if (newPassword.length < 6) {
            return sendError(res, 400, {
                message: '密码长度至少为6个字符',
                errorMessageCode: 'ADMIN_SETUP_PASSWORD_TOO_SHORT',
                error: 'Password must be at least 6 characters long',
                errorCode: 'ADMIN_SETUP_PASSWORD_MIN_LENGTH',
            });
        }

        const userCount = await database.getUserCount();
        const existingUser = await database.getUserByUsername(username);
        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        if (existingUser) {
            await database.updateUserPassword(existingUser.id, passwordHash);
            console.log(`管理员密码已恢复: ${username}`);

            return sendSuccess(res, {
                message: '管理员密码已重置',
                errorMessageCode: 'ADMIN_RECOVERY_PASSWORD_RESET',
                data: {
                    username: existingUser.username,
                    reset: true,
                },
            });
        }

        if (userCount === 0) {
            const newUser = await database.createUser(username, passwordHash);
            console.log(`管理员账户已重建: ${username}`);

            return sendSuccess(res, {
                status: 201,
                message: '管理员账户已重建',
                errorMessageCode: 'ADMIN_RECOVERY_ACCOUNT_RECREATED',
                data: {
                    id: newUser.id,
                    username: newUser.username,
                    recreated: true,
                },
            });
        }

        return sendError(res, 404, {
            message: '用户名不存在',
            errorMessageCode: 'ADMIN_RECOVERY_USERNAME_NOT_FOUND',
            error: 'Username not found',
            errorCode: 'ADMIN_RECOVERY_USER_MISSING',
        });
    } catch (error) {
        console.error('管理员恢复错误:', error);
        return sendError(res, 500, {
            message: '管理员恢复过程中发生错误',
            errorMessageCode: 'ADMIN_RECOVERY_FAILED',
            error: error.message,
            errorCode: 'ADMIN_RECOVERY_ERROR_DETAIL',
        });
    }
}

module.exports = recoverHandler;
