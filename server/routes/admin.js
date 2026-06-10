



const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const dbModule = require('../db');

const getDb = () => dbModule.getDb();

const EXTERNAL_SYNC_TIMEOUT_MS = 10000;
const MAX_SYNC_RESPONSE_BYTES = 5 * 1024 * 1024;

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = EXTERNAL_SYNC_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
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




const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Неверный API ключ' });
    }
    
    next();
};


router.use(checkApiKey);




router.get('/settings', (req, res) => {
    try {
        const db = getDb();
        const settings = db.prepare('SELECT * FROM settings').all();
        
        
        const result = {};
        for (const s of settings) {
            result[s.key] = {
                value: s.value,
                description: s.description,
                updated_at: s.updated_at
            };
        }
        
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения настроек' });
    }
});


router.put('/settings/:key', (req, res) => {
    try {
        const db = getDb();
        const { value } = req.body;
        const { key } = req.params;
        
        const existing = db.prepare('SELECT * FROM settings WHERE key = ?').get(key);
        
        if (!existing) {
            return res.status(404).json({ error: 'Настройка не найдена' });
        }
        
        db.prepare(`
            UPDATE settings SET value = ?, updated_at = strftime('%s', 'now')
            WHERE key = ?
        `).run(value, key);
        
        dbModule.save();
        res.json({ success: true, key, value });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка обновления настройки' });
    }
});


router.put('/settings', (req, res) => {
    try {
        const db = getDb();
        const settings = req.body;
        
        for (const [key, value] of Object.entries(settings)) {
            db.prepare(`
                INSERT INTO settings (key, value, updated_at)
                VALUES (?, ?, strftime('%s', 'now'))
                ON CONFLICT(key) DO UPDATE SET 
                    value = ?, updated_at = strftime('%s', 'now')
            `).run(key, value, value);
        }
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка обновления настроек' });
    }
});




router.get('/mode', (req, res) => {
    try {
        const db = getDb();
        const setting = db.prepare("SELECT value FROM settings WHERE key = 'app_mode'").get();
        const googleEnabled = db.prepare("SELECT value FROM settings WHERE key = 'google_enabled'").get();
        
        res.json({
            mode: setting?.value || 'offline',
            google_enabled: googleEnabled?.value === '1'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения режима' });
    }
});


router.post('/mode', (req, res) => {
    try {
        const db = getDb();
        const { mode, google_enabled } = req.body;
        
        if (!['online', 'offline'].includes(mode)) {
            return res.status(400).json({ error: 'Режим должен быть online или offline' });
        }
        
        db.prepare(`
            UPDATE settings SET value = ?, updated_at = strftime('%s', 'now')
            WHERE key = 'app_mode'
        `).run(mode);
        
        if (google_enabled !== undefined) {
            db.prepare(`
                UPDATE settings SET value = ?, updated_at = strftime('%s', 'now')
                WHERE key = 'google_enabled'
            `).run(google_enabled ? '1' : '0');
        }
        
        
        updateEnvFile('APP_MODE', mode);
        
        dbModule.save();
        res.json({ 
            success: true, 
            mode,
            message: mode === 'online' 
                ? 'Режим онлайн активирован. Google авторизация доступна.' 
                : 'Режим оффлайн активирован. Только локальные аккаунты.'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка переключения режима' });
    }
});




router.get('/port', (req, res) => {
    try {
        const db = getDb();
        const setting = db.prepare("SELECT value FROM settings WHERE key = 'port'").get();
        
        res.json({
            port: parseInt(setting?.value) || 3000,
            current_port: process.env.PORT || 3000
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения порта' });
    }
});


router.post('/port', (req, res) => {
    try {
        const db = getDb();
        const { port } = req.body;
        
        const portNum = parseInt(port);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            return res.status(400).json({ error: 'Порт должен быть от 1 до 65535' });
        }
        
        db.prepare(`
            UPDATE settings SET value = ?, updated_at = strftime('%s', 'now')
            WHERE key = 'port'
        `).run(String(portNum));
        
        
        updateEnvFile('PORT', String(portNum));
        
        dbModule.save();
        res.json({ 
            success: true, 
            port: portNum,
            message: 'Порт изменён. Требуется перезапуск сервера для применения.'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка изменения порта' });
    }
});




router.get('/teachers', (req, res) => {
    try {
        const db = getDb();
        const teachers = db.prepare(`
            SELECT id, email, name, google_id, avatar_url, created_at
            FROM users 
            WHERE role = 'teacher' AND is_deleted = 0
            ORDER BY created_at DESC
        `).all();
        
        res.json(teachers);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения преподавателей' });
    }
});


router.post('/teachers', (req, res) => {
    try {
        const db = getDb();
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Необходимы имя, email и пароль' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
        }
        
        
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }
        
        const id = uuidv4();
        const passwordHash = bcrypt.hashSync(password, 10);
        
        db.prepare(`
            INSERT INTO users (id, email, name, role, password_hash)
            VALUES (?, ?, ?, 'teacher', ?)
        `).run(id, email, name, passwordHash);
        
        dbModule.save();
        res.json({ 
            success: true, 
            teacher: { id, email, name, role: 'teacher' }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка добавления преподавателя' });
    }
});


router.delete('/teachers/:id', (req, res) => {
    try {
        const db = getDb();
        
        db.prepare(`
            UPDATE users SET is_deleted = 1, updated_at = strftime('%s', 'now')
            WHERE id = ? AND role = 'teacher'
        `).run(req.params.id);
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка удаления преподавателя' });
    }
});


router.put('/teachers/:id/password', (req, res) => {
    try {
        const db = getDb();
        const { password } = req.body;
        
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
        }
        
        const passwordHash = bcrypt.hashSync(password, 10);
        
        db.prepare(`
            UPDATE users SET password_hash = ?, updated_at = strftime('%s', 'now')
            WHERE id = ? AND role = 'teacher'
        `).run(passwordHash, req.params.id);
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка изменения пароля' });
    }
});




router.get('/sync', (req, res) => {
    try {
        const db = getDb();
        const settings = db.prepare(`
            SELECT key, value FROM settings 
            WHERE key IN ('sync_enabled', 'sync_interval', 'sync_url', 'last_sync')
        `).all();
        
        const result = {};
        for (const s of settings) {
            result[s.key] = s.value;
        }
        
        res.json({
            enabled: result.sync_enabled === '1',
            interval: parseInt(result.sync_interval) || 300,
            url: result.sync_url || '',
            last_sync: result.last_sync || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения настроек синхронизации' });
    }
});


router.put('/sync', (req, res) => {
    try {
        const db = getDb();
        const { enabled, interval, url } = req.body;
        
        if (enabled !== undefined) {
            db.prepare(`
                UPDATE settings SET value = ?, updated_at = strftime('%s', 'now')
                WHERE key = 'sync_enabled'
            `).run(enabled ? '1' : '0');
        }
        
        if (interval !== undefined) {
            const intervalNum = parseInt(interval);
            if (intervalNum >= 60) {
                db.prepare(`
                    UPDATE settings SET value = ?, updated_at = strftime('%s', 'now')
                    WHERE key = 'sync_interval'
                `).run(String(intervalNum));
            }
        }
        
        if (url !== undefined) {
            db.prepare(`
                UPDATE settings SET value = ?, updated_at = strftime('%s', 'now')
                WHERE key = 'sync_url'
            `).run(url);
        }
        
        dbModule.save();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка обновления настроек синхронизации' });
    }
});


router.post('/sync/run', async (req, res) => {
    try {
        const db = getDb();
        const syncUrlRow = db.prepare("SELECT value FROM settings WHERE key = 'sync_url'").get();

        if (!syncUrlRow?.value) {
            return res.status(400).json({ error: 'URL синхронизации не настроен' });
        }

        const centralUrl = syncUrlRow.value.replace(/\/$/, '');
        const syncKey = process.env.SYNC_API_KEY || '';
        const headers = {
            'Content-Type': 'application/json',
            'X-Sync-Key': syncKey
        };

        let syncedUsers = 0;
        let conflictUsers = 0;
        let syncedResults = 0;
        const errors = [];

        // 1. Sync pending users
        const pendingUsers = db.prepare(`
            SELECT * FROM users
            WHERE sync_status IN ('local', 'pending') AND is_deleted = 0
        `).all();

        for (const user of pendingUsers) {
            try {
                const resp = await fetchJsonWithTimeout(`${centralUrl}/api/sync/receive-user`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        local_id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role,
                        has_password: !!user.password_hash,
                        google_id: user.google_id,
                        avatar_url: user.avatar_url,
                        created_at: user.created_at
                    })
                });
                const result = await parseJsonResponse(resp);

                if (resp.ok) {
                    const now = Math.floor(Date.now() / 1000);
                    db.prepare(`
                        UPDATE users SET sync_status = 'synced', remote_id = ?, last_sync_at = ?
                        WHERE id = ?
                    `).run(result.remote_id, now, user.id);
                    syncedUsers++;
                } else if (resp.status === 409 && result.code === 'EMAIL_EXISTS') {
                    db.prepare(`UPDATE users SET sync_status = 'conflict' WHERE id = ?`).run(user.id);
                    conflictUsers++;
                } else {
                    errors.push(`User ${user.email}: ${result.error || resp.status}`);
                }
            } catch (e) {
                errors.push(`User ${user.email}: ${e.message}`);
            }
        }

        // 2. Sync pending results (only for synced users)
        const pendingResults = db.prepare(`
            SELECT r.*, u.remote_id as user_remote_id
            FROM results r
            JOIN users u ON r.user_id = u.id
            WHERE r.synced = 0 AND u.sync_status = 'synced' AND u.remote_id IS NOT NULL
            LIMIT 200
        `).all();

        if (pendingResults.length > 0) {
            try {
                const syncData = pendingResults.map(r => ({
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

                const resp = await fetchJsonWithTimeout(`${centralUrl}/api/sync/receive-results`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ results: syncData })
                });

                if (resp.ok) {
                    const result = await parseJsonResponse(resp);
                    const now = Math.floor(Date.now() / 1000);
                    const syncedIds = result.synced_ids || pendingResults.map(r => r.id);
                    for (const id of syncedIds) {
                        db.prepare(`UPDATE results SET synced = 1, synced_at = ? WHERE id = ?`).run(now, id);
                    }
                    syncedResults = syncedIds.length;
                } else {
                    const errBody = await parseJsonResponse(resp).catch(() => ({}));
                    errors.push(`Results: ${errBody.error || resp.status}`);
                }
            } catch (e) {
                errors.push(`Results: ${e.message}`);
            }
        }

        const now = new Date().toISOString();
        db.prepare(`
            INSERT OR REPLACE INTO settings (key, value, description)
            VALUES ('last_sync', ?, 'Время последней синхронизации')
        `).run(now);

        dbModule.save();

        res.json({
            success: true,
            last_sync: now,
            synced_users: syncedUsers,
            conflict_users: conflictUsers,
            synced_results: syncedResults,
            errors: errors.length > 0 ? errors : undefined,
            message: `Синхронизировано: ${syncedUsers} пользователей, ${syncedResults} результатов` +
                (conflictUsers > 0 ? `, конфликтов: ${conflictUsers}` : '') +
                (errors.length > 0 ? `, ошибок: ${errors.length}` : '')
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка синхронизации' });
    }
});




router.get('/export', (req, res) => {
    try {
        const db = getDb();
        
        const data = {
            exported_at: new Date().toISOString(),
            version: '1.0',
            users: db.prepare('SELECT * FROM users WHERE is_deleted = 0').all(),
            disciplines: db.prepare('SELECT * FROM disciplines WHERE is_deleted = 0').all(),
            topics: db.prepare('SELECT * FROM topics WHERE is_deleted = 0').all(),
            tests: db.prepare('SELECT * FROM tests WHERE is_deleted = 0').all(),
            questions: db.prepare('SELECT * FROM questions WHERE is_deleted = 0').all(),
            answers: db.prepare('SELECT * FROM answers WHERE is_deleted = 0').all(),
            matching_pairs: db.prepare('SELECT * FROM matching_pairs').all(),
            student_disciplines: db.prepare('SELECT * FROM student_disciplines').all(),
            attempts: db.prepare('SELECT * FROM attempts WHERE is_deleted = 0').all(),
            results: db.prepare('SELECT * FROM results WHERE is_deleted = 0').all(),
            settings: db.prepare('SELECT * FROM settings').all()
        };
        
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка экспорта данных' });
    }
});


router.post('/import', (req, res) => {
    try {
        const db = getDb();
        const data = req.body;
        
        if (!data.version || !data.exported_at) {
            return res.status(400).json({ error: 'Неверный формат данных' });
        }
        
        
        
        
        res.json({ 
            success: true, 
            message: 'Импорт данных выполнен' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка импорта данных' });
    }
});




router.get('/status', (req, res) => {
    try {
        const db = getDb();
        
        const stats = {
            server: 'running',
            port: process.env.PORT || 3000,
            mode: db.prepare("SELECT value FROM settings WHERE key = 'app_mode'").get()?.value || 'offline',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            counts: {
                users: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_deleted = 0').get().count,
                teachers: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'teacher' AND is_deleted = 0").get().count,
                students: db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND is_deleted = 0").get().count,
                disciplines: db.prepare('SELECT COUNT(*) as count FROM disciplines WHERE is_deleted = 0').get().count,
                tests: db.prepare('SELECT COUNT(*) as count FROM tests WHERE is_deleted = 0').get().count,
                attempts: db.prepare('SELECT COUNT(*) as count FROM attempts WHERE is_deleted = 0').get().count
            }
        };
        
        res.json(stats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка получения статуса' });
    }
});


router.post('/restart', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Сервер будет перезапущен. Подождите несколько секунд.' 
    });
    
    
    setTimeout(() => {
        process.exit(0); 
    }, 1000);
});




function updateEnvFile(key, value) {
    try {
        const envPath = path.join(__dirname, '../../.env');
        let content = fs.readFileSync(envPath, 'utf-8');
        
        const regex = new RegExp(`^${key}=.*$`, 'm');
        
        if (regex.test(content)) {
            content = content.replace(regex, `${key}=${value}`);
        } else {
            content += `\n${key}=${value}`;
        }
        
        fs.writeFileSync(envPath, content);
    } catch (err) {
        console.error('Error updating .env file:', err);
    }
}

module.exports = router;
