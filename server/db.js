const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './database/test_system.db';
const dbDir = path.dirname(dbPath);


if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;
let SQL = null;


class DatabaseWrapper {
    constructor(database) {
        this.database = database;
    }
    
    prepare(sql) {
        const self = this;
        return {
            run(...params) {
                try {
                    self.database.run(sql, params);
                    const result = {
                        changes: self.database.getRowsModified(),
                        lastInsertRowid: null
                    };
                    return result;
                } catch (err) {
                    console.error('SQL Error:', err.message, '\nQuery:', sql);
                    throw err;
                }
            },
            get(...params) {
                try {
                    const stmt = self.database.prepare(sql);
                    stmt.bind(params);
                    if (stmt.step()) {
                        const row = stmt.getAsObject();
                        stmt.free();
                        return row;
                    }
                    stmt.free();
                    return undefined;
                } catch (err) {
                    console.error('SQL Error:', err.message, '\nQuery:', sql);
                    throw err;
                }
            },
            all(...params) {
                try {
                    const results = [];
                    const stmt = self.database.prepare(sql);
                    stmt.bind(params);
                    while (stmt.step()) {
                        results.push(stmt.getAsObject());
                    }
                    stmt.free();
                    return results;
                } catch (err) {
                    console.error('SQL Error:', err.message, '\nQuery:', sql);
                    throw err;
                }
            }
        };
    }
    
    exec(sql) {
        try {
            this.database.run(sql);
        } catch (err) {
            console.error('SQL Exec Error:', err.message);
            throw err;
        }
    }
    
    pragma(pragma) {
        try {
            this.database.run(`PRAGMA ${pragma}`);
        } catch (err) {
            
        }
    }

    // Returns a function that runs fn() wrapped in BEGIN/COMMIT/ROLLBACK.
    // Matches the better-sqlite3 transaction() API surface used in sync routes.
    transaction(fn) {
        const self = this;
        return function() {
            self.database.run('BEGIN');
            try {
                fn();
                self.database.run('COMMIT');
            } catch (err) {
                try { self.database.run('ROLLBACK'); } catch (_) {}
                throw err;
            }
        };
    }
    
    
    save() {
        const data = this.database.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
    
    close() {
        this.save();
        this.database.close();
    }
}


async function initDatabase() {
    SQL = await initSqlJs();
    
    let database;
    if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        database = new SQL.Database(fileBuffer);
    } else {
        database = new SQL.Database();
    }
    
    db = new DatabaseWrapper(database);
    db.pragma('foreign_keys = ON');

    // Auto-initialize schema if this is a fresh database (users table missing)
    const hasSchema = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).get();
    if (!hasSchema) {
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        if (fs.existsSync(schemaPath)) {
            const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
            // Split on semicolons, respecting parentheses depth
            let stmt = '';
            let depth = 0;
            for (const ch of schemaSql) {
                if (ch === '(') depth++;
                else if (ch === ')') depth--;
                else if (ch === ';' && depth <= 0) {
                    const s = stmt.trim();
                    if (s) { try { db.exec(s + ';'); } catch(e) {} }
                    stmt = '';
                    continue;
                }
                stmt += ch;
            }
            const last = stmt.trim();
            if (last) { try { db.exec(last); } catch(e) {} }
        }
    }

    
    db.exec(`CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_by TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        is_deleted INTEGER DEFAULT 0,
        FOREIGN KEY (created_by) REFERENCES users(id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS student_groups (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        enrolled_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        UNIQUE(user_id, group_id)
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_student_groups_group ON student_groups(group_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_student_groups_user ON student_groups(user_id)`);

    const hasTable = (tableName) => {
        const row = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = ?
        `).get(tableName);
        return !!row;
    };

    const hasColumn = (tableName, columnName) => {
        if (!hasTable(tableName)) return false;
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
        return columns.some(col => col.name === columnName);
    };

    const addColumnIfMissing = (tableName, columnName, definition) => {
        if (hasColumn(tableName, columnName)) return;
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    };

    // Add review columns only when missing to avoid duplicate-column startup noise.
    addColumnIfMissing('attempts', 'needs_review', 'INTEGER DEFAULT 0');
    addColumnIfMissing('attempts', 'review_completed', 'INTEGER DEFAULT 0');
    addColumnIfMissing('user_answers', 'teacher_comment', 'TEXT');
    addColumnIfMissing('results', 'needs_review', 'INTEGER DEFAULT 0');
    addColumnIfMissing('users', 'google_access_token', 'TEXT');
    addColumnIfMissing('users', 'google_refresh_token', 'TEXT');
    addColumnIfMissing('users', 'google_token_expiry', 'INTEGER');
    addColumnIfMissing('users', 'google_unlinked', 'INTEGER DEFAULT 0');

    
    setInterval(() => {
        if (db) {
            db.save();
        }
    }, 30000);
    
    
    process.on('exit', () => {
        if (db) {
            db.save();
        }
    });
    
    process.on('SIGINT', () => {
        if (db) {
            db.save();
        }
        process.exit();
    });
    
    return db;
}


let dbPromise = initDatabase();

module.exports = {
    getDb: () => db,
    ready: dbPromise,
    prepare: (sql) => db.prepare(sql),
    exec: (sql) => db.exec(sql),
    pragma: (p) => db.pragma(p),
    save: () => db.save()
};
