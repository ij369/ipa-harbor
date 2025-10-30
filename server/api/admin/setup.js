const bcrypt = require('bcrypt');
const database = require('../../utils/database');

// 从环境变量获取配置
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const SINGLE_USER_MODE = process.env.SINGLE_USER_MODE !== 'false'; // 默认为单用户模式

/**
 * 初始设置 - 创建管理员账户
 */
async function setupHandler(req, res) {
    try {
        const { username, password } = req.body;

        // 参数验证
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: '用户名和密码是必需的参数',
                error: 'Username and password are required'
            });
        }

        // 用户名长度验证
        if (username.length < 3 || username.length > 50) {
            return res.status(400).json({
                success: false,
                message: '用户名长度必须在3-50个字符之间',
                error: 'Username length must be between 3-50 characters'
            });
        }

        // 密码强度验证
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: '密码长度至少为6个字符',
                error: 'Password must be at least 6 characters long'
            });
        }

        // 检查是否已有用户
        const userCount = await database.getUserCount();

        if (SINGLE_USER_MODE && userCount > 0) {
            return res.status(409).json({
                success: false,
                message: '系统已初始化，不能创建更多用户',
                error: 'System already initialized in single user mode'
            });
        }

        // 检查用户名是否已存在
        const existingUser = await database.getUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: '用户名已存在',
                error: 'Username already exists'
            });
        }

        // 生成密码哈希
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // 创建用户
        const newUser = await database.createUser(username, passwordHash);

        console.log(`管理员账户创建成功: ${username}`);

        return res.status(201).json({
            success: true,
            message: '管理员账户创建成功',
            data: {
                id: newUser.id,
                username: newUser.username,
                created: true
            }
        });

    } catch (error) {
        console.error('创建管理员账户错误:', error);

        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                success: false,
                message: '用户名已存在',
                error: 'Username already exists'
            });
        }

        return res.status(500).json({
            success: false,
            message: '创建管理员账户时发生错误',
            error: error.message
        });
    }
}

module.exports = setupHandler;
