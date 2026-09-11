const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, '../data');
const ipatoolDir = path.join(dataDir, '.ipatool');
const setupCompletedFile = path.join(ipatoolDir, 'SETUP_COMPLETED');
const usersDbPath = path.join(dataDir, 'users.db');

function ensureIpatoolDir() {
    if (!fs.existsSync(ipatoolDir)) {
        fs.mkdirSync(ipatoolDir, { recursive: true });
    }
}

function isSetupCompleted() {
    return fs.existsSync(setupCompletedFile);
}

function markSetupCompleted() {
    ensureIpatoolDir();
    fs.writeFileSync(setupCompletedFile, `${new Date().toISOString()}\n`, 'utf8');
}

function clearSetupMarker() {
    if (fs.existsSync(setupCompletedFile)) {
        fs.unlinkSync(setupCompletedFile);
    }
}

function peekLegacyUserCount() {
    if (!fs.existsSync(usersDbPath)) {
        return Promise.resolve(0);
    }

    return new Promise((resolve) => {
        const db = new sqlite3.Database(usersDbPath, sqlite3.OPEN_READONLY, (openErr) => {
            if (openErr) {
                resolve(0);
                return;
            }

            db.get(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
                (tableErr, tableRow) => {
                    if (tableErr || !tableRow) {
                        db.close(() => resolve(0));
                        return;
                    }

                    db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
                        db.close(() => {
                            const count = !err && row ? row.count : 0;
                            resolve(count > 0 ? count : 0);
                        });
                    });
                }
            );
        });
    });
}

async function getAdminUserCount(database) {
    if (database?.db) {
        return database.getUserCount();
    }
    return peekLegacyUserCount();
}

/**
 * 根据 users.db 实际用户数同步 SETUP_COMPLETED
 */
async function syncSetupMarkerWithUsers(database) {
    const userCount = await getAdminUserCount(database);

    if (userCount > 0) {
        if (!isSetupCompleted()) {
            markSetupCompleted();
            console.log(`users.db 中有 ${userCount} 个用户，已自动创建 SETUP_COMPLETED 标记`);
        }
        return userCount;
    }

    if (isSetupCompleted()) {
        clearSetupMarker();
        console.log('SETUP_COMPLETED 存在但 users.db 无用户，已清除无效标记');
    }

    return 0;
}

/**
 * 启动前校验：有用户可启动；否则必须配置 ADMIN_INIT_PIN
 */
async function bootstrapAdminStartup() {
    const userCount = await syncSetupMarkerWithUsers(null);

    if (userCount > 0) {
        return;
    }

    if (!process.env.ADMIN_INIT_PIN) {
        console.error(
            'Missing init PIN for first-time admin setup.\n'
            + '↳ Environment variable ADMIN_INIT_PIN\n\n'
            + '缺少用于首次设置管理员的初始化 PIN\n'
            + '↳ 环境变量 ADMIN_INIT_PIN\n'
        );
        process.exit(1);
    }
}

function verifyInitPin(provided) {
    const expected = process.env.ADMIN_INIT_PIN || '';
    if (!expected || typeof provided !== 'string' || provided.length === 0) {
        return false;
    }

    const providedBuffer = Buffer.from(provided, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

module.exports = {
    isSetupCompleted,
    markSetupCompleted,
    bootstrapAdminStartup,
    syncSetupMarkerWithUsers,
    verifyInitPin,
};
