const bcrypt = require('bcrypt');
const database = require('../../utils/database');
const { sendSuccess, sendError } = require('../../utils/apiResponse');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;

/**
 * 修改当前管理员登录密码
 */
async function changePasswordHandler(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return sendError(res, 400, {
                message: '当前密码和新密码是必需的参数',
                errorMessageCode: 'ADMIN_CHANGE_PASSWORD_CREDENTIALS_REQUIRED',
                error: 'Current password and new password are required',
                errorCode: 'ADMIN_CHANGE_PASSWORD_CREDENTIALS_MISSING',
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

        const fullUser = await database.getUserByUsername(req.user.username);
        if (!fullUser) {
            return sendError(res, 404, {
                message: '用户不存在',
                errorMessageCode: 'ADMIN_CHANGE_PASSWORD_USER_NOT_FOUND',
                error: 'User not found',
                errorCode: 'ADMIN_CHANGE_PASSWORD_USER_MISSING',
            });
        }

        const isCurrentValid = await bcrypt.compare(currentPassword, fullUser.password_hash);
        if (!isCurrentValid) {
            return sendError(res, 401, {
                message: '当前密码错误',
                errorMessageCode: 'ADMIN_CHANGE_PASSWORD_INVALID_CURRENT',
                error: 'Current password is incorrect',
                errorCode: 'ADMIN_CHANGE_PASSWORD_CURRENT_MISMATCH',
            });
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await database.updateUserPassword(req.user.id, passwordHash);

        console.log(`管理员密码已修改: ${req.user.username}`);

        return sendSuccess(res, {
            message: '密码修改成功',
            errorMessageCode: 'ADMIN_CHANGE_PASSWORD_SUCCESS',
            data: {
                username: req.user.username,
            },
        });
    } catch (error) {
        console.error('修改管理员密码错误:', error);
        return sendError(res, 500, {
            message: '修改密码过程中发生错误',
            errorMessageCode: 'ADMIN_CHANGE_PASSWORD_FAILED',
            error: error.message,
            errorCode: 'ADMIN_CHANGE_PASSWORD_ERROR_DETAIL',
        });
    }
}

module.exports = changePasswordHandler;
