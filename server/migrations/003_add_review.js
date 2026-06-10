require('dotenv').config();
const initSqlJs = require('sql.js');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './database/test_system.db';

async function migrate() {
    console.log('🔄 Starting migration: Add review fields...\n');

    if (!fs.existsSync(dbPath)) {
        console.log('❌ Database file not found:', dbPath);
        console.log('   Run the server first to create the database.\n');
        process.exit(1);
    }

    try {
        const SQL = await initSqlJs();
        const fileBuffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(fileBuffer);

        // Add needs_review to attempts
        const attemptsInfo = db.exec("PRAGMA table_info(attempts)");
        const attemptsCols = attemptsInfo[0]?.values.map(r => r[1]) || [];

        if (!attemptsCols.includes('needs_review')) {
            db.run(`ALTER TABLE attempts ADD COLUMN needs_review INTEGER DEFAULT 0`);
            console.log('  ✅ attempts.needs_review added');
        } else {
            console.log('  ⏭️  attempts.needs_review already exists');
        }

        if (!attemptsCols.includes('review_completed')) {
            db.run(`ALTER TABLE attempts ADD COLUMN review_completed INTEGER DEFAULT 0`);
            console.log('  ✅ attempts.review_completed added');
        } else {
            console.log('  ⏭️  attempts.review_completed already exists');
        }

        // Add teacher_comment to user_answers
        const answersInfo = db.exec("PRAGMA table_info(user_answers)");
        const answersCols = answersInfo[0]?.values.map(r => r[1]) || [];

        if (!answersCols.includes('teacher_comment')) {
            db.run(`ALTER TABLE user_answers ADD COLUMN teacher_comment TEXT`);
            console.log('  ✅ user_answers.teacher_comment added');
        } else {
            console.log('  ⏭️  user_answers.teacher_comment already exists');
        }

        // Add needs_review to results
        const resultsInfo = db.exec("PRAGMA table_info(results)");
        const resultsCols = resultsInfo[0]?.values.map(r => r[1]) || [];

        if (!resultsCols.includes('needs_review')) {
            db.run(`ALTER TABLE results ADD COLUMN needs_review INTEGER DEFAULT 0`);
            console.log('  ✅ results.needs_review added');
        } else {
            console.log('  ⏭️  results.needs_review already exists');
        }

        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
        console.log('\n✅ Migration completed successfully!\n');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
