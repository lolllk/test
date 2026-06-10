



const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || './database/test_system.db';

async function migrate() {
    console.log('🔄 Starting migration: Add sync fields to users table...\n');
    
    if (!fs.existsSync(dbPath)) {
        console.log('❌ Database file not found:', dbPath);
        console.log('   Run the server first to create the database.\n');
        process.exit(1);
    }
    
    try {
        const SQL = await initSqlJs();
        const fileBuffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(fileBuffer);
        
        
        const columns = db.exec("PRAGMA table_info(users)")[0];
        const columnNames = columns.values.map(row => row[1]);
        
        const newColumns = [
            { name: 'sync_status', sql: "ALTER TABLE users ADD COLUMN sync_status TEXT DEFAULT 'local'" },
            { name: 'remote_id', sql: "ALTER TABLE users ADD COLUMN remote_id TEXT" },
            { name: 'created_offline', sql: "ALTER TABLE users ADD COLUMN created_offline INTEGER DEFAULT 0" },
            { name: 'last_sync_at', sql: "ALTER TABLE users ADD COLUMN last_sync_at INTEGER" }
        ];
        
        let migrated = 0;
        
        for (const col of newColumns) {
            if (!columnNames.includes(col.name)) {
                console.log(`  ✅ Adding column: ${col.name}`);
                db.run(col.sql);
                migrated++;
            } else {
                console.log(`  ⏭️  Column already exists: ${col.name}`);
            }
        }
        
        
        console.log('\n📇 Creating indexes...');
        
        try {
            db.run("CREATE INDEX IF NOT EXISTS idx_users_sync_status ON users(sync_status)");
            console.log('  ✅ Index idx_users_sync_status');
        } catch (e) {
            console.log('  ⏭️  Index idx_users_sync_status already exists');
        }
        
        try {
            db.run("CREATE INDEX IF NOT EXISTS idx_users_remote_id ON users(remote_id)");
            console.log('  ✅ Index idx_users_remote_id');
        } catch (e) {
            console.log('  ⏭️  Index idx_users_remote_id already exists');
        }
        
        
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
        
        db.close();
        
        console.log(`\n✨ Migration complete! ${migrated} columns added.\n`);
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

migrate();
