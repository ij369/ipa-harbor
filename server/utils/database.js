const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        // 确保data目录存在
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // 数据库文件路径
        this.dbPath = path.join(dataDir, 'users.db');
        this.db = null;
    }

    /**
     * 初始化数据库连接
     */
    async init() {
        return new Promise((resolve, reject) => {
            // 检查数据库文件是否已存在
            const dbExists = require('fs').existsSync(this.dbPath);

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Database connection failed:', err.message);
                    reject(err);
                } else {
                    if (!dbExists) {
                        console.log('Database file created and connected successfully');
                    }
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    /**
     * 创建用户表
     */
    async createTables() {
        return new Promise((resolve, reject) => {
            // 首先检查表是否已存在
            this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
                if (err) {
                    console.error('Failed to check users table:', err.message);
                    reject(err);
                    return;
                }

                const tableExists = !!row;

                const createUserTableSQL = `
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        settings TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `;

                this.db.run(createUserTableSQL, (err) => {
                    if (err) {
                        console.error('Failed to create users table:', err.message);
                        reject(err);
                    } else {
                        if (!tableExists) {
                            console.log('Users table created successfully');
                        }

                        this.ensureSettingsColumn()
                            .then(() => this.ensureAppVersionMetadataTable())
                            .then(() => {
                                this.ensureUpdateTrigger(tableExists, resolve, reject);
                            })
                            .catch(reject);
                    }
                });
            });
        });
    }

    /**
     * 旧版 users 表无 settings 列时补列
     */
    async ensureSettingsColumn() {
        return new Promise((resolve, reject) => {
            this.db.all('PRAGMA table_info(users)', (err, columns) => {
                if (err) {
                    console.error('检查 users 表结构失败:', err.message);
                    reject(err);
                    return;
                }

                const hasSettingsColumn = columns.some((column) => column.name === 'settings');
                if (hasSettingsColumn) {
                    resolve(false);
                    return;
                }

                this.db.run('ALTER TABLE users ADD COLUMN settings TEXT', (alterErr) => {
                    if (alterErr) {
                        console.error('添加 settings 列失败:', alterErr.message);
                        reject(alterErr);
                    } else {
                        console.log('已为 users 表添加 settings 列');
                        resolve(true);
                    }
                });
            });
        });
    }

    ensureUpdateTrigger(tableExists, resolve, reject) {
        // 检查触发器是否已存在
        this.db.get("SELECT name FROM sqlite_master WHERE type='trigger' AND name='update_users_updated_at'", (err, triggerRow) => {
                            if (err) {
                                console.error('检查触发器失败:', err.message);
                                reject(err);
                                return;
                            }

                            const triggerExists = !!triggerRow;

                            // 创建触发器，自动更新updated_at字段
                            const createTriggerSQL = `
                                CREATE TRIGGER IF NOT EXISTS update_users_updated_at 
                                AFTER UPDATE ON users
                                FOR EACH ROW
                                BEGIN
                                    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                                END
                            `;

                            this.db.run(createTriggerSQL, (err) => {
                                if (err) {
                                    console.error('创建触发器失败:', err.message);
                                    reject(err);
                                } else {
                                    if (!triggerExists) {
                                        console.log('触发器创建成功');
                                    }
                                    resolve();
                                }
                            });
                        });
    }

    async ensureAppVersionMetadataTable() {
        return new Promise((resolve, reject) => {
            const createTableSQL = `
                CREATE TABLE IF NOT EXISTS app_version_metadata (
                    app_id TEXT NOT NULL,
                    version_id TEXT NOT NULL,
                    bundle_id TEXT,
                    display_version TEXT,
                    release_date TEXT,
                    apple_metadata TEXT,
                    ipa_metadata TEXT,
                    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (app_id, version_id)
                )
            `;

            this.db.run(createTableSQL, (err) => {
                if (err) {
                    console.error('创建 app_version_metadata 表失败:', err.message);
                    reject(err);
                    return;
                }

                this.db.run(
                    'CREATE INDEX IF NOT EXISTS idx_app_version_metadata_app ON app_version_metadata(app_id)',
                    (indexErr) => {
                        if (indexErr) {
                            console.error('创建 app_version_metadata 索引失败:', indexErr.message);
                            reject(indexErr);
                        } else {
                            resolve();
                        }
                    }
                );
            });
        });
    }

    mapAppVersionMetadataRow(row) {
        if (!row) {
            return null;
        }

        return {
            app_id: row.app_id,
            version_id: row.version_id,
            bundle_id: row.bundle_id,
            display_version: row.display_version,
            release_date: row.release_date,
            apple_metadata: row.apple_metadata ? JSON.parse(row.apple_metadata) : null,
            ipa_metadata: row.ipa_metadata ? JSON.parse(row.ipa_metadata) : null,
            fetched_at: row.fetched_at,
            updated_at: row.updated_at,
        };
    }

    async upsertAppVersionMetadata({
        appId,
        versionId,
        bundleId = null,
        displayVersion = null,
        releaseDate = null,
        appleMetadata = null,
        ipaMetadata = null,
    }) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO app_version_metadata (
                    app_id, version_id, bundle_id, display_version, release_date,
                    apple_metadata, ipa_metadata, fetched_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(app_id, version_id) DO UPDATE SET
                    bundle_id = COALESCE(excluded.bundle_id, app_version_metadata.bundle_id),
                    display_version = COALESCE(excluded.display_version, app_version_metadata.display_version),
                    release_date = COALESCE(excluded.release_date, app_version_metadata.release_date),
                    apple_metadata = COALESCE(excluded.apple_metadata, app_version_metadata.apple_metadata),
                    ipa_metadata = COALESCE(excluded.ipa_metadata, app_version_metadata.ipa_metadata),
                    updated_at = CURRENT_TIMESTAMP
            `;

            this.db.run(
                sql,
                [
                    String(appId),
                    String(versionId),
                    bundleId,
                    displayVersion,
                    releaseDate,
                    appleMetadata ? JSON.stringify(appleMetadata) : null,
                    ipaMetadata ? JSON.stringify(ipaMetadata) : null,
                ],
                function onUpsert(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ appId: String(appId), versionId: String(versionId) });
                    }
                }
            );
        });
    }

    async getAppVersionMetadata(appId, versionId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM app_version_metadata WHERE app_id = ? AND version_id = ? LIMIT 1';
            this.db.get(sql, [String(appId), String(versionId)], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.mapAppVersionMetadataRow(row));
                }
            });
        });
    }

    async getAppVersionMetadataByAppId(appId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM app_version_metadata WHERE app_id = ? ORDER BY CAST(version_id AS INTEGER) DESC';
            this.db.all(sql, [String(appId)], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve((rows || []).map((row) => this.mapAppVersionMetadataRow(row)));
                }
            });
        });
    }

    async getAppVersionMetadataByAppIds(appIds = []) {
        const uniqueAppIds = [...new Set(appIds.map((id) => String(id)).filter(Boolean))];
        if (uniqueAppIds.length === 0) {
            return [];
        }

        return new Promise((resolve, reject) => {
            const placeholders = uniqueAppIds.map(() => '?').join(', ');
            const sql = `SELECT * FROM app_version_metadata WHERE app_id IN (${placeholders})`;
            this.db.all(sql, uniqueAppIds, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve((rows || []).map((row) => this.mapAppVersionMetadataRow(row)));
                }
            });
        });
    }

    /**
     * 读取用户 settings JSON
     */
    async getUserSettings(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT settings FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row?.settings) {
                    resolve(null);
                } else {
                    try {
                        resolve(JSON.parse(row.settings));
                    } catch (parseErr) {
                        console.error(`解析用户 ${userId} 的 settings 失败:`, parseErr.message);
                        resolve(null);
                    }
                }
            });
        });
    }

    /**
     * 保存用户 settings JSON
     */
    async setUserSettings(userId, settings) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET settings = ? WHERE id = ?';
            this.db.run(sql, [JSON.stringify(settings), userId], function (err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('用户不存在'));
                } else {
                    resolve(settings);
                }
            });
        });
    }

    /**
     * 获取用户数量
     */
    async getUserCount() {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    /**
     * 创建用户
     */
    async createUser(username, passwordHash) {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT INTO users (username, password_hash) VALUES (?, ?)';
            this.db.run(sql, [username, passwordHash], function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, username });
                }
            });
        });
    }

    /**
     * 根据用户名获取用户
     */
    async getUserByUsername(username) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE username = ?';
            this.db.get(sql, [username], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * 更新用户密码
     */
    async updateUserPassword(userId, passwordHash) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            this.db.run(sql, [passwordHash, userId], function (err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('用户不存在'));
                } else {
                    resolve({ id: userId, updated: true });
                }
            });
        });
    }

    /**
     * 根据ID获取用户
     */
    async getUserById(id) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT id, username, created_at, updated_at FROM users WHERE id = ?';
            this.db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * 关闭数据库连接
     */
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('关闭数据库连接失败:', err.message);
                } else {
                    console.log('数据库连接已关闭');
                }
            });
        }
    }
}

// 创建单例实例
const database = new Database();

module.exports = database;
