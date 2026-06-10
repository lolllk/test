



const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const dbModule = require('../db');
const { isAuthenticated } = require('./auth');

const getDb = () => dbModule.getDb();


const getCentralServerUrl = () => {
    const db = getDb();
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'sync_url'").get();
    return setting?.value || null;
};

const EXTERNAL_SYNC_TIMEOUT_MS = 10000;
const MAX_SYNC_RESPONSE_BYTES = 5 * 1024 * 1024;

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = EXTERNAL_SYNC_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } catch (error) {
        if (error && error.name === 'AbortError') {
            const timeoutError = new Error('Таймаут подключения к серверу синхронизации');
            timeoutError.code = 'SYNC_TIMEOUT';
            throw timeoutError;
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function parseJsonResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    const contentLength = Number(response.headers.get('content-length') || '0');

    if (contentLength > MAX_SYNC_RESPONSE_BYTES) {
        const err = new Error('Слишком большой ответ сервера синхронизации');
        err.code = 'SYNC_RESPONSE_TOO_LARGE';
        throw err;
    }

    if (!contentType.includes('application/json')) {
        const err = new Error(`Ожидался JSON, получен: ${contentType || 'unknown'}`);
        err.code = 'SYNC_INVALID_CONTENT_TYPE';
        throw err;
    }

    const bodyText = await response.text();
    if (Buffer.byteLength(bodyText, 'utf8') > MAX_SYNC_RESPONSE_BYTES) {
        const err = new Error('Слишком большой JSON ответ сервера синхронизации');
        err.code = 'SYNC_RESPONSE_TOO_LARGE';
        throw err;
    }

    try {
        return bodyText ? JSON.parse(bodyText) : {};
    } catch (parseErr) {
        const err = new Error('Некорректный JSON ответ сервера синхронизации');
        err.code = 'SYNC_INVALID_JSON';
        throw err;
    }
}





router.get('/status', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        
        
        const pendingUsers = db.prepare(`
            SELECT COUNT(*) as count FROM users 
            WHERE sync_status IN ('local', 'pending') 
            AND is_deleted = 0
        `).get();
        
        
        const pendingResults = db.prepare(`
            SELECT COUNT(*) as count FROM results 
            WHERE synced = 0
        `).get();
        
        
        const conflictUsers = db.prepare(`
            SELECT COUNT(*) as count FROM users 
            WHERE sync_status = 'conflict' 
            AND is_deleted = 0
        `).get();
        
        
        const lastSync = db.prepare("SELECT value FROM settings WHERE key = 'last_sync'").get();
        
        
        const appMode = db.prepare("SELECT value FROM settings WHERE key = 'app_mode'").get();
        
        
        const syncUrl = getCentralServerUrl();
        
        res.json({
            mode: appMode?.value || 'offline',
            sync_enabled: !!syncUrl,
            sync_url: syncUrl,
            pending_users: pendingUsers?.count || 0,
            pending_results: pendingResults?.count || 0,
            conflict_users: conflictUsers?.count || 0,
            last_sync: lastSync?.value || null
        });
    } catch (error) {
        console.error('Sync status error:', error);
        res.status(500).json({ error: 'Ошибка получения статуса синхронизации' });
    }
});





router.get('/user-status', isAuthenticated, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare(`
            SELECT sync_status, remote_id, created_offline, last_sync_at, google_id
            FROM users WHERE id = ?
        `).get(req.user.id);
        
        res.json({
            sync_status: user?.sync_status || 'local',
            remote_id: user?.remote_id,
            created_offline: user?.created_offline === 1,
            last_sync_at: user?.last_sync_at,
            google_linked: !!user?.google_id,
            can_link_google: !user?.google_id 
        });
    } catch (error) {
        console.error('User sync status error:', error);
        res.status(500).json({ error: 'Ошибка получения статуса' });
    }
});





router.post('/user', isAuthenticated, async (req, res) => {
    const centralServerUrl = getCentralServerUrl();
    
    if (!centralServerUrl) {
        return res.status(400).json({ 
            error: 'Синхронизация не настроена',
            code: 'SYNC_NOT_CONFIGURED'
        });
    }
    
    try {
        const db = getDb();
        const user = req.user;
        
        
        if (user.sync_status === 'synced' && user.remote_id) {
            return res.json({ 
                status: 'already_synced',
                remote_id: user.remote_id 
            });
        }
        
        
        const syncData = {
            local_id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            has_password: !!user.password_hash,
            google_id: user.google_id,
            avatar_url: user.avatar_url,
            created_at: user.created_at
        };
        
        const response = await fetchJsonWithTimeout(`${centralServerUrl}/api/sync/receive-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Sync-Key': process.env.SYNC_API_KEY || ''
            },
            body: JSON.stringify(syncData)
        });
        
        const result = await parseJsonResponse(response);
        
        if (!response.ok) {
            
            if (result.code === 'EMAIL_EXISTS') {
                db.prepare(`
                    UPDATE users SET sync_status = 'conflict'
                    WHERE id = ?
                `).run(user.id);
                dbModule.save();
                
                return res.status(409).json({
                    status: 'conflict',
                    code: 'EMAIL_EXISTS',
                    message: 'Пользователь с таким email уже существует на сервере',
                    existing_user: result.existing_user
                });
            }
            
            throw new Error(result.error || 'Ошибка синхронизации');
        }
        
        
        const now = Math.floor(Date.now() / 1000);
        db.prepare(`
            UPDATE users SET 
                sync_status = 'synced',
                remote_id = ?,
                last_sync_at = ?
            WHERE id = ?
        `).run(result.remote_id, now, user.id);
        
        
        db.prepare(`
            INSERT OR REPLACE INTO settings (key, value, description)
            VALUES ('last_sync', ?, 'Время последней синхронизации')
        `).run(now.toString());
        
        dbModule.save();
        
        res.json({
            status: 'synced',
            remote_id: result.remote_id,
            message: 'Аккаунт успешно синхронизирован'
        });
        
    } catch (error) {
        console.error('User sync error:', error);
        const status = error.code === 'SYNC_TIMEOUT' ? 504 : 502;
        res.status(status).json({ 
            error: 'Ошибка синхронизации',
            details: error.message 
        });
    }
});





router.post('/resolve-conflict', isAuthenticated, async (req, res) => {
    const { action, password, new_email } = req.body;
    const centralServerUrl = getCentralServerUrl();
    
    if (!centralServerUrl) {
        return res.status(400).json({ error: 'Синхронизация не настроена' });
    }
    
    try {
        const db = getDb();
        const user = req.user;
        
        if (user.sync_status !== 'conflict') {
            return res.status(400).json({ error: 'Нет конфликта для разрешения' });
        }
        
        switch (action) {
            case 'merge':
                
                
                const mergeResponse = await fetchJsonWithTimeout(`${centralServerUrl}/api/sync/merge-user`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Sync-Key': process.env.SYNC_API_KEY || ''
                    },
                    body: JSON.stringify({
                        email: user.email,
                        password: password, 
                        local_id: user.id
                    })
                });
                
                const mergeResult = await parseJsonResponse(mergeResponse);
                
                if (!mergeResponse.ok) {
                    return res.status(mergeResponse.status).json(mergeResult);
                }
                
                
                db.prepare(`
                    UPDATE users SET 
                        sync_status = 'synced',
                        remote_id = ?,
                        last_sync_at = ?
                    WHERE id = ?
                `).run(mergeResult.remote_id, Math.floor(Date.now() / 1000), user.id);
                
                dbModule.save();
                
                return res.json({
                    status: 'merged',
                    message: 'Аккаунты успешно объединены'
                });
                
            case 'change_email':

                if (!new_email) {
                    return res.status(400).json({ error: 'Укажите новый email' });
                }

                if (new_email.trim().length > 254) {
                    return res.status(400).json({ error: 'Email: максимум 254 символа' });
                }

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(new_email.trim())) {
                    return res.status(400).json({ error: 'Введите корректный email' });
                }

                const existing = db.prepare(
                    'SELECT id FROM users WHERE email = ? AND id != ?'
                ).get(new_email.trim(), user.id);
                
                if (existing) {
                    return res.status(400).json({ error: 'Этот email уже используется' });
                }
                
                
                db.prepare(`
                    UPDATE users SET 
                        email = ?,
                        sync_status = 'pending'
                    WHERE id = ?
                `).run(new_email.trim(), user.id);
                
                dbModule.save();
                
                return res.json({
                    status: 'email_changed',
                    message: 'Email изменён. Попробуйте синхронизировать снова.'
                });
                
            case 'keep_local':
                
                db.prepare(`
                    UPDATE users SET sync_status = 'pending'
                    WHERE id = ?
                `).run(user.id);
                
                dbModule.save();
                
                return res.json({
                    status: 'kept_local',
                    message: 'Аккаунт останется локальным'
                });
                
            default:
                return res.status(400).json({ error: 'Неизвестное действие' });
        }
        
    } catch (error) {
        console.error('Resolve conflict error:', error);
        res.status(500).json({ error: 'Ошибка разрешения конфликта' });
    }
});





router.post('/results', isAuthenticated, async (req, res) => {
    const centralServerUrl = getCentralServerUrl();
    
    if (!centralServerUrl) {
        return res.status(400).json({ error: 'Синхронизация не настроена' });
    }
    
    try {
        const db = getDb();
        
        
        const results = db.prepare(`
            SELECT r.*, u.remote_id as user_remote_id
            FROM results r
            JOIN users u ON r.user_id = u.id
            WHERE r.synced = 0 AND r.user_id = ?
            LIMIT 50
        `).all(req.user.id);
        
        if (results.length === 0) {
            return res.json({ 
                status: 'no_pending',
                synced_count: 0 
            });
        }
        
        
        if (!req.user.remote_id) {
            return res.status(400).json({
                error: 'Сначала синхронизируйте аккаунт',
                code: 'USER_NOT_SYNCED'
            });
        }
        
        
        const syncData = results.map(r => ({
            local_id: r.id,
            user_remote_id: r.user_remote_id,
            test_id: r.test_id,
            score: r.score,
            total_questions: r.total_questions,
            correct_answers: r.correct_answers,
            time_spent: r.time_spent,
            started_at: r.started_at,
            finished_at: r.finished_at,
            answers: r.answers
        }));
        
        
        const response = await fetchJsonWithTimeout(`${centralServerUrl}/api/sync/receive-results`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Sync-Key': process.env.SYNC_API_KEY || ''
            },
            body: JSON.stringify({ results: syncData })
        });
        
        const result = await parseJsonResponse(response);
        
        if (!response.ok) {
            throw new Error(result.error || 'Ошибка синхронизации результатов');
        }
        
        
        const now = Math.floor(Date.now() / 1000);
        const syncedIds = result.synced_ids || results.map(r => r.id);
        
        for (const id of syncedIds) {
            db.prepare(`
                UPDATE results SET synced = 1, synced_at = ?
                WHERE id = ?
            `).run(now, id);
        }
        
        dbModule.save();
        
        res.json({
            status: 'synced',
            synced_count: syncedIds.length,
            message: `Синхронизировано результатов: ${syncedIds.length}`
        });
        
    } catch (error) {
        console.error('Results sync error:', error);
        const status = error.code === 'SYNC_TIMEOUT' ? 504 : 502;
        res.status(status).json({ 
            error: 'Ошибка синхронизации результатов',
            details: error.message 
        });
    }
});






router.post('/receive-user', async (req, res) => {
    const syncKey = process.env.SYNC_API_KEY;
    const apiKey = req.headers['x-sync-key'];
    if (!syncKey || !apiKey || apiKey !== syncKey) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    
    try {
        const db = getDb();
        const { local_id, email, name, role, google_id, avatar_url, created_at } = req.body;
        
        
        const existing = db.prepare('SELECT id, name, google_id FROM users WHERE email = ?').get(email);
        
        if (existing) {
            
            
            if (existing.google_id && google_id && existing.google_id === google_id) {
                
                return res.json({
                    status: 'linked',
                    remote_id: existing.id,
                    message: 'Аккаунт связан с существующим'
                });
            }
            
            
            return res.status(409).json({
                code: 'EMAIL_EXISTS',
                message: 'Пользователь с таким email уже существует',
                existing_user: {
                    name: existing.name,
                    has_google: !!existing.google_id
                }
            });
        }
        
        
        const id = uuidv4();
        db.prepare(`
            INSERT INTO users (id, email, name, role, google_id, avatar_url, 
                             sync_status, remote_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'synced', ?, ?)
        `).run(id, email, name, role, google_id, avatar_url, local_id, created_at);
        
        dbModule.save();
        
        res.json({
            status: 'created',
            remote_id: id,
            message: 'Пользователь создан'
        });
        
    } catch (error) {
        console.error('Receive user error:', error);
        res.status(500).json({ error: 'Ошибка создания пользователя' });
    }
});






router.post('/merge-user', async (req, res) => {
    const syncKey = process.env.SYNC_API_KEY;
    const apiKey = req.headers['x-sync-key'];
    if (!syncKey || !apiKey || apiKey !== syncKey) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    
    try {
        const db = getDb();
        const bcrypt = require('bcryptjs');
        const { email, password, local_id } = req.body;
        
        
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        
        if (user.password_hash) {
            const isValid = bcrypt.compareSync(password, user.password_hash);
            if (!isValid) {
                return res.status(401).json({ error: 'Неверный пароль' });
            }
        } else if (user.google_id) {
            
            return res.status(400).json({ 
                error: 'Этот аккаунт использует вход через Google',
                code: 'GOOGLE_ONLY'
            });
        }
        
        
        
        db.prepare(`
            UPDATE users SET remote_id = ?, updated_at = ?
            WHERE id = ?
        `).run(local_id, Math.floor(Date.now() / 1000), user.id);
        
        dbModule.save();
        
        res.json({
            status: 'merged',
            remote_id: user.id,
            message: 'Аккаунты объединены'
        });
        
    } catch (error) {
        console.error('Merge user error:', error);
        res.status(500).json({ error: 'Ошибка объединения аккаунтов' });
    }
});





const WPF_SYNC_TABLES = [
    'users',
    'disciplines', 
    'topics',
    'tests',
    'questions',
    'answers',
    'matching_pairs',
    'attempts',
    'user_answers',
    'results',
    'student_disciplines'
];

// Per-table allowed column names (whitelist for SQL injection prevention)
const WPF_TABLE_COLUMNS = {
    users: ['id','email','name','role','password_hash','google_id','avatar_url','sync_status','remote_id','created_offline','last_sync_at','created_at','updated_at','is_deleted'],
    disciplines: ['id','title','description','created_by','created_at','updated_at','is_deleted'],
    topics: ['id','discipline_id','title','description','sort_order','created_at','updated_at','is_deleted'],
    tests: ['id','title','description','discipline_id','topic_id','time_limit','attempts_limit','questions_limit','passing_score','shuffle_questions','shuffle_answers','is_published','created_by','created_at','updated_at','is_deleted'],
    questions: ['id','test_id','text','type','weight','image_url','explanation','sort_order','created_at','updated_at','is_deleted'],
    answers: ['id','question_id','text','is_correct','position','created_at','updated_at','is_deleted'],
    matching_pairs: ['id','question_id','left_text','right_text'],
    attempts: ['id','user_id','test_id','started_at','finished_at','total_questions','correct_answers','score','is_passed','needs_review','review_completed','created_at','updated_at','is_deleted'],
    user_answers: ['id','attempt_id','question_id','answer_id','text_answer','is_correct','teacher_comment','created_at'],
    results: ['id','user_id','test_id','attempt_id','score','is_passed','synced','synced_at','google_classroom_id','needs_review','created_at','updated_at','is_deleted'],
    student_disciplines: ['id','user_id','discipline_id','enrolled_at']
};

function requireWpfApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Требуется API ключ' });
    }
    next();
}


router.get('/wpf/stats/summary', requireWpfApiKey, (req, res) => {
    try {
        const db = getDb();
        
        const stats = {};
        for (const table of WPF_SYNC_TABLES) {
            try {
                const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                stats[table] = result?.count || 0;
            } catch (e) {
                stats[table] = 0;
            }
        }
        
        res.json(stats);
    } catch (err) {
        console.error('WPF stats error:', err);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});


router.get('/wpf/:table', requireWpfApiKey, (req, res) => {
    try {
        const { table } = req.params;
        
        if (!WPF_SYNC_TABLES.includes(table)) {
            return res.status(400).json({ error: 'Недопустимая таблица' });
        }
        
        const db = getDb();
        const columns = table === 'users'
            ? WPF_TABLE_COLUMNS.users.filter(col => col !== 'password_hash')
            : WPF_TABLE_COLUMNS[table];
        const data = db.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all();
        
        res.json(data);
    } catch (err) {
        console.error('WPF Sync GET error:', err);
        res.status(500).json({ error: 'Ошибка получения данных' });
    }
});


function _normalizeUserPassword(record) {
    if (!record.password_hash) return;
    const hash = record.password_hash;
    // Already bcrypt — leave as-is
    if (hash.startsWith('$2')) return;
    // PBKDF2 format from C# (salt$hash in base64) — leave as-is, verifyPassword handles it
    const parts = hash.split('$');
    if (parts.length === 2 && parts[0].length > 10 && parts[1].length > 10) return;
    // Plain-text password or unknown format — hash with bcrypt
    const bcrypt = require('bcryptjs');
    record.password_hash = bcrypt.hashSync(hash, 10);
}

function _upsertRow(db, table, record, allowedCols) {
    if (table === 'users' && record.password_hash) {
        _normalizeUserPassword(record);
    }
    let existing;
    if (table === 'student_disciplines') {
        existing = db.prepare(`
            SELECT * FROM student_disciplines 
            WHERE user_id = ? AND discipline_id = ?
        `).get(record.user_id, record.discipline_id);
    } else {
        existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(record.id);
    }

    if (existing) {
        const existingUpdated = existing.updated_at || existing.enrolled_at || existing.created_at || 0;
        const newUpdated = record.updated_at || record.enrolled_at || record.created_at || 0;

        if (newUpdated >= existingUpdated) {
            if (table === 'student_disciplines') {
                db.prepare(`
                    UPDATE student_disciplines 
                    SET enrolled_at = ?
                    WHERE user_id = ? AND discipline_id = ?
                `).run(record.enrolled_at || Math.floor(Date.now() / 1000), record.user_id, record.discipline_id);
            } else {
                const columns = Object.keys(record).filter(k => k !== 'id');
                const setClause = columns.map(c => `${c} = ?`).join(', ');
                const values = [...columns.map(c => record[c]), record.id];
                db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values);
            }
        }
    } else {
        const columns = Object.keys(record);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(c => record[c]);
        db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
    }
}

router.post('/wpf/:table', requireWpfApiKey, (req, res) => {
    try {
        const { table } = req.params;
        const record = req.body;
        
        if (!WPF_SYNC_TABLES.includes(table)) {
            return res.status(400).json({ error: 'Недопустимая таблица' });
        }
        
        if (!record.id && table !== 'student_disciplines') {
            return res.status(400).json({ error: 'Отсутствует id записи' });
        }
        
        // Validate all column names against the whitelist to prevent SQL injection
        const allowedCols = WPF_TABLE_COLUMNS[table];
        const invalidKey = Object.keys(record).find(k => !allowedCols.includes(k));
        if (invalidKey) {
            return res.status(400).json({ error: `Недопустимое поле: ${invalidKey}` });
        }
        
        if (table === 'users') {
            console.log('[WPF] User upsert:', record.email, '| role:', record.role,
                '| has password_hash:', !!record.password_hash,
                '| hash preview:', record.password_hash ? record.password_hash.substring(0, 30) : 'NONE');
        }

        const db = getDb();
        _upsertRow(db, table, record, allowedCols);
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error('WPF Sync POST error:', err);
        res.status(500).json({ error: 'Ошибка сохранения данных' });
    }
});

// Batch upsert: accepts an array of records for a single table in one request
router.post('/wpf/:table/batch', requireWpfApiKey, (req, res) => {
    try {
        const { table } = req.params;
        const records = req.body;

        if (!WPF_SYNC_TABLES.includes(table)) {
            return res.status(400).json({ error: 'Недопустимая таблица' });
        }
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ error: 'Ожидается непустой массив записей' });
        }

        const allowedCols = WPF_TABLE_COLUMNS[table];
        for (const record of records) {
            const invalidKey = Object.keys(record).find(k => !allowedCols.includes(k));
            if (invalidKey) {
                return res.status(400).json({ error: `Недопустимое поле: ${invalidKey}` });
            }
            if (!record.id && table !== 'student_disciplines') {
                return res.status(400).json({ error: 'Отсутствует id записи' });
            }
        }

        const db = getDb();
        let upserted = 0;
        // Run all upserts in a single transaction for performance
        const txn = db.transaction(() => {
            for (const record of records) {
                _upsertRow(db, table, record, allowedCols);
                upserted++;
            }
        });
        txn();

        dbModule.save();
        res.json({ success: true, upserted });
    } catch (err) {
        console.error('WPF Batch Sync POST error:', err);
        res.status(500).json({ error: 'Ошибка пакетного сохранения данных' });
    }
});

module.exports = router;
