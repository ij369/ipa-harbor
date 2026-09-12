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
                            .then(() => this.ensurePasskeyTables())
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
     * Passkey / WebAuthn 相关表
     */
    async ensurePasskeyTables() {
        await this.ensureWebAuthnUserHandleColumn();
        await this.runSql(`
            CREATE TABLE IF NOT EXISTS passkeys (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                credential_id TEXT UNIQUE NOT NULL,
                public_key BLOB NOT NULL,
                sign_count INTEGER NOT NULL DEFAULT 0,
                transports TEXT,
                device_type TEXT,
                backed_up INTEGER NOT NULL DEFAULT 0,
                aaguid TEXT,
                nickname TEXT,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await this.ensurePasskeyAaguidColumn();
        await this.runSql('CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id)');
        await this.runSql('CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id)');
        await this.runSql(`
            CREATE TABLE IF NOT EXISTS auth_challenges (
                id TEXT PRIMARY KEY,
                challenge TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('login', 'register')),
                user_id INTEGER,
                client_ip TEXT,
                used INTEGER NOT NULL DEFAULT 0,
                expires_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        await this.runSql('CREATE INDEX IF NOT EXISTS idx_auth_challenges_ip_type ON auth_challenges(client_ip, type)');
        await this.runSql('CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires_at ON auth_challenges(expires_at)');
        await this.runSql(`
            CREATE TABLE IF NOT EXISTS passkey_security_events (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                credential_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                old_sign_count INTEGER,
                new_sign_count INTEGER,
                credential_device_type TEXT,
                credential_backed_up INTEGER,
                ip TEXT,
                user_agent TEXT,
                created_at INTEGER NOT NULL
            )
        `);
    }

    async ensurePasskeyAaguidColumn() {
        return new Promise((resolve, reject) => {
            this.db.all('PRAGMA table_info(passkeys)', (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                const hasColumn = columns.some((column) => column.name === 'aaguid');
                if (hasColumn) {
                    resolve(false);
                    return;
                }
                this.db.run('ALTER TABLE passkeys ADD COLUMN aaguid TEXT', (alterErr) => {
                    if (alterErr) {
                        reject(alterErr);
                        return;
                    }
                    console.log('已为 passkeys 表添加 aaguid 列');
                    resolve(true);
                });
            });
        });
    }

    async ensureWebAuthnUserHandleColumn() {
        return new Promise((resolve, reject) => {
            this.db.all('PRAGMA table_info(users)', (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                const hasColumn = columns.some((column) => column.name === 'webauthn_user_handle');
                if (hasColumn) {
                    resolve(false);
                    return;
                }
                this.db.run('ALTER TABLE users ADD COLUMN webauthn_user_handle TEXT', (alterErr) => {
                    if (alterErr) {
                        reject(alterErr);
                        return;
                    }
                    this.db.run(
                        'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_webauthn_user_handle ON users(webauthn_user_handle) WHERE webauthn_user_handle IS NOT NULL',
                        (indexErr) => {
                            if (indexErr) {
                                reject(indexErr);
                            } else {
                                console.log('已为 users 表添加 webauthn_user_handle 列');
                                resolve(true);
                            }
                        }
                    );
                });
            });
        });
    }

    runSql(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function onRun(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes, lastID: this.lastID });
                }
            });
        });
    }

    getSql(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    allSql(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    async getUserWebAuthnHandle(userId) {
        const row = await this.getSql('SELECT webauthn_user_handle FROM users WHERE id = ?', [userId]);
        return row?.webauthn_user_handle || null;
    }

    async setUserWebAuthnHandle(userId, handle) {
        await this.runSql('UPDATE users SET webauthn_user_handle = ? WHERE id = ?', [handle, userId]);
    }

    async invalidateLoginChallengesByIp(clientIp) {
        await this.runSql(
            'DELETE FROM auth_challenges WHERE type = ? AND client_ip = ? AND used = 0',
            ['login', clientIp]
        );
    }

    async invalidateRegisterChallengesByUserId(userId) {
        await this.runSql(
            'DELETE FROM auth_challenges WHERE type = ? AND user_id = ? AND used = 0',
            ['register', userId]
        );
    }

    async createAuthChallenge({ id, challenge, type, userId = null, clientIp, expiresAt, createdAt }) {
        await this.runSql(
            `INSERT INTO auth_challenges (id, challenge, type, user_id, client_ip, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, challenge, type, userId, clientIp, expiresAt, createdAt]
        );
    }

    /**
     * 原子消费 challenge（防重放）
     */
    async consumeAuthChallengeById(challengeId, nowMs) {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                this.db.run('BEGIN IMMEDIATE TRANSACTION');
                this.db.get(
                    `SELECT * FROM auth_challenges
                     WHERE id = ? AND used = 0 AND expires_at > ?`,
                    [challengeId, nowMs],
                    (err, row) => {
                        if (err) {
                            this.db.run('ROLLBACK');
                            reject(err);
                            return;
                        }
                        if (!row) {
                            this.db.run('ROLLBACK');
                            resolve(null);
                            return;
                        }
                        this.db.run(
                            'UPDATE auth_challenges SET used = 1 WHERE id = ? AND used = 0',
                            [challengeId],
                            (updateErr) => {
                                if (updateErr) {
                                    this.db.run('ROLLBACK');
                                    reject(updateErr);
                                    return;
                                }
                                this.db.run('COMMIT', (commitErr) => {
                                    if (commitErr) {
                                        reject(commitErr);
                                    } else {
                                        resolve(row);
                                    }
                                });
                            }
                        );
                    }
                );
            });
        });
    }

    async cleanupExpiredChallenges(nowMs) {
        const result = await this.runSql(
            `DELETE FROM auth_challenges
             WHERE used = 1 OR expires_at <= ?`,
            [nowMs]
        );
        return result.changes || 0;
    }

    async getPasskeysByUserId(userId) {
        return this.allSql(
            `SELECT id, user_id, credential_id, sign_count, transports, device_type, backed_up,
                    aaguid, nickname, created_at, last_used_at
             FROM passkeys WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
    }

    async getPasskeyByCredentialId(credentialId) {
        return this.getSql('SELECT * FROM passkeys WHERE credential_id = ?', [credentialId]);
    }

    async getPasskeyById(id) {
        return this.getSql('SELECT * FROM passkeys WHERE id = ?', [id]);
    }

    async countPasskeysByUserId(userId) {
        const row = await this.getSql('SELECT COUNT(*) AS count FROM passkeys WHERE user_id = ?', [userId]);
        return row?.count || 0;
    }

    async insertPasskey({
        id,
        userId,
        credentialId,
        publicKey,
        signCount,
        transports,
        deviceType,
        backedUp,
        aaguid,
        nickname,
        createdAt,
        lastUsedAt,
    }) {
        await this.runSql(
            `INSERT INTO passkeys (
                id, user_id, credential_id, public_key, sign_count, transports,
                device_type, backed_up, aaguid, nickname, created_at, last_used_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                userId,
                credentialId,
                publicKey,
                signCount,
                transports ? JSON.stringify(transports) : null,
                deviceType || null,
                backedUp ? 1 : 0,
                aaguid || null,
                nickname || null,
                createdAt,
                lastUsedAt,
            ]
        );
    }

    async updatePasskeySignCount(credentialId, signCount, lastUsedAt) {
        await this.runSql(
            'UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE credential_id = ?',
            [signCount, lastUsedAt, credentialId]
        );
    }

    async touchPasskeyLastUsed(credentialId, lastUsedAt) {
        await this.runSql(
            'UPDATE passkeys SET last_used_at = ? WHERE credential_id = ?',
            [lastUsedAt, credentialId]
        );
    }

    async updatePasskeyNickname(id, userId, nickname) {
        const result = await this.runSql(
            'UPDATE passkeys SET nickname = ? WHERE id = ? AND user_id = ?',
            [nickname, id, userId]
        );
        return result.changes > 0;
    }

    async deletePasskey(id, userId) {
        const result = await this.runSql(
            'DELETE FROM passkeys WHERE id = ? AND user_id = ?',
            [id, userId]
        );
        return result.changes > 0;
    }

    async insertPasskeySecurityEvent({
        id,
        userId,
        credentialId,
        eventType,
        oldSignCount,
        newSignCount,
        credentialDeviceType,
        credentialBackedUp,
        ip,
        userAgent,
        createdAt,
    }) {
        await this.runSql(
            `INSERT INTO passkey_security_events (
                id, user_id, credential_id, event_type, old_sign_count, new_sign_count,
                credential_device_type, credential_backed_up, ip, user_agent, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                userId,
                credentialId,
                eventType,
                oldSignCount,
                newSignCount,
                credentialDeviceType || null,
                credentialBackedUp == null ? null : (credentialBackedUp ? 1 : 0),
                ip || null,
                userAgent || null,
                createdAt,
            ]
        );
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
