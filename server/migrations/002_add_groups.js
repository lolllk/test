require('dotenv').config();
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || './database/test_system.db';

async function migrate() {
    console.log('🔄 Starting migration: Add groups...\n');

    if (!fs.existsSync(dbPath)) {
        console.log('❌ Database file not found:', dbPath);
        console.log('   Run the server first to create the database.\n');
        process.exit(1);
    }

    try {
        const SQL = await initSqlJs();
        const fileBuffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(fileBuffer);

        // Check if groups table already exists
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='groups'");
        if (tables.length > 0 && tables[0].values.length > 0) {
            console.log('⏭️  Table "groups" already exists, skipping.');
        } else {
            console.log('  ✅ Creating table: groups');
            db.run(`CREATE TABLE groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                created_by TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                is_deleted INTEGER DEFAULT 0,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )`);
        }

        const tables2 = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='student_groups'");
        if (tables2.length > 0 && tables2[0].values.length > 0) {
            console.log('⏭️  Table "student_groups" already exists, skipping.');
        } else {
            console.log('  ✅ Creating table: student_groups');
            db.run(`CREATE TABLE student_groups (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                group_id TEXT NOT NULL,
                enrolled_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                UNIQUE(user_id, group_id)
            )`);
        }

        console.log('\n📇 Creating indexes...');
        db.run(`CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_student_groups_group ON student_groups(group_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_student_groups_user ON student_groups(user_id)`);
        console.log('  ✅ Indexes created');

        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
        console.log('\n✅ Migration completed successfully!\n');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
