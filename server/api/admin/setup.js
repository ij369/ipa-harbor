const bcrypt = require('bcrypt');
const database = require('../../utils/database');
const { sendSuccess, sendError } = require('../../utils/apiResponse');
const {
    isSetupCompleted,
    markSetupCompleted,
    syncSetupMarkerWithUsers,
    verifyInitPin,
} = require('../../utils/adminBootstrap');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;
const SINGLE_USER_MODE = process.env.SINGLE_USER_MODE !== 'false';

/**
 * 初始设置 - 创建管理员账户
 */
async function setupHandler(req, res) {
    try {
        await syncSetupMarkerWithUsers(database);

        if (isSetupCompleted()) {
            return sendError(res, 410, {
                message: '系统已完成初始化',
                errorMessageCode: 'ADMIN_SETUP_ALREADY_INITIALIZED',
                error: 'System setup already completed',
                errorCode: 'ADMIN_SETUP_COMPLETED',
            });
        }

        const { username, password, initPin } = req.body;

        if (!username || !password) {
            return sendError(res, 400, {
                message: '用户名和密码是必需的参数',
                errorMessageCode: 'ADMIN_SETUP_CREDENTIALS_REQUIRED',
                error: 'Username and password are required',
                errorCode: 'ADMIN_SETUP_CREDENTIALS_MISSING',
            });
        }

        if (!initPin) {
            return sendError(res, 400, {
                message: '初始化 PIN 是必需的参数',
                errorMessageCode: 'ADMIN_SETUP_INIT_PIN_REQUIRED',
                error: 'Init PIN is required',
                errorCode: 'ADMIN_SETUP_INIT_PIN_MISSING',
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

        if (password.length < 6) {
            return sendError(res, 400, {
                message: '密码长度至少为6个字符',
                errorMessageCode: 'ADMIN_SETUP_PASSWORD_TOO_SHORT',
                error: 'Password must be at least 6 characters long',
                errorCode: 'ADMIN_SETUP_PASSWORD_MIN_LENGTH',
            });
        }

        const userCount = await database.getUserCount();

        if (SINGLE_USER_MODE && userCount > 0) {
            return sendError(res, 409, {
                message: '系统已初始化，不能创建更多用户',
                errorMessageCode: 'ADMIN_SETUP_ALREADY_INITIALIZED',
                error: 'System already initialized in single user mode',
                errorCode: 'ADMIN_SETUP_SINGLE_USER_LIMIT',
            });
        }

        const existingUser = await database.getUserByUsername(username);
        if (existingUser) {
            return sendError(res, 409, {
                message: '用户名已存在',
                errorMessageCode: 'ADMIN_SETUP_USERNAME_EXISTS',
                error: 'Username already exists',
                errorCode: 'ADMIN_SETUP_USERNAME_TAKEN',
            });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const newUser = await database.createUser(username, passwordHash);
        markSetupCompleted();

        console.log(`管理员账户创建成功: ${username}`);

        return sendSuccess(res, {
            status: 201,
            message: '管理员账户创建成功',
            errorMessageCode: 'ADMIN_SETUP_SUCCESS',
            data: {
                id: newUser.id,
                username: newUser.username,
                created: true,
            },
        });
    } catch (error) {
        console.error('创建管理员账户错误:', error);

        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return sendError(res, 409, {
                message: '用户名已存在',
                errorMessageCode: 'ADMIN_SETUP_USERNAME_EXISTS',
                error: 'Username already exists',
                errorCode: 'ADMIN_SETUP_USERNAME_TAKEN',
            });
        }

        return sendError(res, 500, {
            message: '创建管理员账户时发生错误',
            errorMessageCode: 'ADMIN_SETUP_FAILED',
            error: error.message,
            errorCode: 'ADMIN_SETUP_ERROR_DETAIL',
        });
    }
}

module.exports = setupHandler;
