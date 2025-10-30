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
                    console.error('数据库连接失败:', err.message);
                    reject(err);
                } else {
                    if (!dbExists) {
                        console.log('数据库文件创建并连接成功');
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
                    console.error('检查用户表失败:', err.message);
                    reject(err);
                    return;
                }

                const tableExists = !!row;

                const createUserTableSQL = `
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `;

                this.db.run(createUserTableSQL, (err) => {
                    if (err) {
                        console.error('创建用户表失败:', err.message);
                        reject(err);
                    } else {
                        if (!tableExists) {
                            console.log('用户表创建成功');
                        }

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
                });
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
