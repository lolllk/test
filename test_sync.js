/**
 * Тест синхронизации между offline (локальный) и online (удалённый) серверами.
 * Запускает два отдельных экземпляра сервера с разными БД и проверяет
 * полный цикл синхронизации через batch API.
 *
 * Запуск: node test_sync.js
 */

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Конфигурация ─────────────────────────────────────────────────────────────
const OFFLINE_PORT = 5101;
const ONLINE_PORT  = 5102;
const OFFLINE_KEY  = 'offline-admin-key-test';
const ONLINE_KEY   = 'online-admin-key-test';
const OFFLINE_DB   = path.join(__dirname, 'database', 'test_sync_offline.db');
const ONLINE_DB    = path.join(__dirname, 'database', 'test_sync_online.db');
const SERVER_READY_TIMEOUT = 10000; // мс
const REQUEST_TIMEOUT = 8000;

// ─── Счётчики ─────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const processes = [];

// ─── Утилиты ──────────────────────────────────────────────────────────────────
function log(msg) { process.stdout.write(msg + '\n'); }
function ok(msg)  { passed++; log('  ✓ ' + msg); }
function fail(msg, detail) { failed++; log('  ✗ ' + msg + (detail ? '\n    ' + detail : '')); }

function request(port, method, path, body, apiKey) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const options = {
            hostname: 'localhost',
            port,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            },
            timeout: REQUEST_TIMEOUT
        };
        const req = http.request(options, res => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        if (data) req.write(data);
        req.end();
    });
}

// ─── Управление серверами ─────────────────────────────────────────────────────
function startServer(port, dbPath, apiKey, label) {
    return new Promise((resolve, reject) => {
        const env = {
            ...process.env,
            PORT: String(port),
            DB_PATH: dbPath,
            ADMIN_API_KEY: apiKey,
            SESSION_SECRET: 'test-secret-' + port,
            APP_MODE: 'offline',
            GOOGLE_CLIENT_ID: '',
            GOOGLE_CLIENT_SECRET: '',
            NODE_ENV: 'development'
        };

        // Remove dotenv auto-read to avoid .env overriding our env
        const proc = spawn('node', ['-e', `
            process.env.PORT = '${port}';
            process.env.DB_PATH = '${dbPath.replace(/\\/g, '\\\\')}';
            process.env.ADMIN_API_KEY = '${apiKey}';
            process.env.SESSION_SECRET = 'test-secret-${port}';
            process.env.APP_MODE = 'offline';
            process.env.GOOGLE_CLIENT_ID = '';
            process.env.GOOGLE_CLIENT_SECRET = '';
            process.env.NODE_ENV = 'development';
            // Prevent dotenv from overriding our env
            require.cache[require.resolve('dotenv')] = { exports: { config: () => {} } };
            require('./server/index.js');
        `], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });

        processes.push(proc);

        let started = false;
        const timeout = setTimeout(() => {
            if (!started) reject(new Error(label + ': timeout waiting for server start'));
        }, SERVER_READY_TIMEOUT);

        const check = setInterval(async () => {
            try {
                const r = await request(port, 'GET', '/api/sync/wpf/stats/summary', null, apiKey);
                if (r.status === 200) {
                    clearInterval(check);
                    clearTimeout(timeout);
                    started = true;
                    resolve(proc);
                }
            } catch {}
        }, 300);

        proc.stderr.on('data', d => {
            const s = d.toString();
            if (s.includes('EADDRINUSE')) {
                clearInterval(check);
                clearTimeout(timeout);
                reject(new Error(label + ': port ' + port + ' already in use'));
            }
        });
    });
}

function stopAll() {
    for (const p of processes) {
        try { p.kill('SIGTERM'); } catch {}
    }
    // Cleanup test DBs
    for (const f of [OFFLINE_DB, ONLINE_DB]) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
}

// ─── Тест-утилита (регистрация + логин для создания данных через основное API) ─
async function registerAndLogin(port, email, role) {
    await request(port, 'POST', '/auth/register', { email, name: email, password: 'testpass123', role }, '');
    const r = await request(port, 'POST', '/auth/login', { email, password: 'testpass123' }, '');
    return r; // contains cookie not easily accessible via raw http — use sync API only
}

// ─── Тесты ────────────────────────────────────────────────────────────────────
async function runTests() {
    log('\n' + '═'.repeat(60));
    log('  ТЕСТ СИНХРОНИЗАЦИИ offline ↔ online');
    log('═'.repeat(60));

    // ── 1. Запуск серверов ──────────────────────────────────────────────────
    log('\n[1] Запуск серверов...');
    try {
        await startServer(OFFLINE_PORT, OFFLINE_DB, OFFLINE_KEY, 'OFFLINE');
        ok('Offline сервер запущен (порт ' + OFFLINE_PORT + ')');
    } catch (e) { fail('Offline сервер не запустился', e.message); return finalize(); }

    try {
        await startServer(ONLINE_PORT, ONLINE_DB, ONLINE_KEY, 'ONLINE');
        ok('Online сервер запущен (порт ' + ONLINE_PORT + ')');
    } catch (e) { fail('Online сервер не запустился', e.message); return finalize(); }

    // ── 2. Проверка /stats/summary ──────────────────────────────────────────
    log('\n[2] Проверка базовых эндпоинтов...');
    {
        const r = await request(OFFLINE_PORT, 'GET', '/api/sync/wpf/stats/summary', null, OFFLINE_KEY);
        if (r.status === 200 && typeof r.body === 'object' && 'users' in r.body)
            ok('GET /stats/summary offline → 200');
        else fail('GET /stats/summary offline', `status=${r.status}`);
    }
    {
        const r = await request(ONLINE_PORT, 'GET', '/api/sync/wpf/stats/summary', null, ONLINE_KEY);
        if (r.status === 200 && typeof r.body === 'object')
            ok('GET /stats/summary online → 200');
        else fail('GET /stats/summary online', `status=${r.status}`);
    }

    // ── 3. Авторизация отклоняет неверный ключ ──────────────────────────────
    log('\n[3] Проверка авторизации API...');
    {
        const r = await request(OFFLINE_PORT, 'GET', '/api/sync/wpf/stats/summary', null, 'wrong-key');
        if (r.status === 401) ok('Неверный API-ключ → 401');
        else fail('Неверный ключ не блокируется', `status=${r.status}`);
    }
    {
        const r = await request(OFFLINE_PORT, 'GET', '/api/sync/wpf/stats/summary', null, '');
        if (r.status === 401) ok('Пустой API-ключ → 401');
        else fail('Пустой ключ не блокируется', `status=${r.status}`);
    }

    // ── 4. Загрузка данных в offline БД (через sync POST) ───────────────────
    log('\n[4] Заполнение offline БД тестовыми данными...');

    const now = Math.floor(Date.now() / 1000);
    const teacherId = 'teacher-sync-test-001';
    const disciplineId = 'disc-sync-test-001';
    const testId = 'test-sync-test-001';
    const questionId = 'q-sync-test-001';
    const answerId1 = 'ans-sync-test-001';
    const answerId2 = 'ans-sync-test-002';

    const seedData = [
        { table: 'users', row: { id: teacherId, email: 'sync_teacher@test.com', name: 'Sync Teacher', role: 'teacher', password_hash: '$2b$10$aaa', created_at: now, updated_at: now, is_deleted: 0 } },
        { table: 'disciplines', row: { id: disciplineId, title: 'Sync Discipline', description: 'test', created_by: teacherId, created_at: now, updated_at: now, is_deleted: 0 } },
        { table: 'tests', row: { id: testId, title: 'Sync Test', discipline_id: disciplineId, is_published: 1, created_by: teacherId, passing_score: 60, attempts_limit: 1, created_at: now, updated_at: now, is_deleted: 0 } },
        { table: 'questions', row: { id: questionId, test_id: testId, text: 'Test question?', type: 'single', weight: 1, sort_order: 0, created_at: now, updated_at: now, is_deleted: 0 } },
        { table: 'answers', row: { id: answerId1, question_id: questionId, text: 'Correct', is_correct: 1, position: 1, created_at: now, updated_at: now, is_deleted: 0 } },
        { table: 'answers', row: { id: answerId2, question_id: questionId, text: 'Wrong', is_correct: 0, position: 2, created_at: now, updated_at: now, is_deleted: 0 } },
    ];

    for (const { table, row } of seedData) {
        const r = await request(OFFLINE_PORT, 'POST', `/api/sync/wpf/${table}`, row, OFFLINE_KEY);
        if (r.status === 200 && r.body.success)
            ok(`Seeded ${table}: ${row.id || row.title}`);
        else fail(`Seed ${table} failed`, `status=${r.status} body=${JSON.stringify(r.body)}`);
    }

    // ── 5. Проверка что данные есть в offline БД ────────────────────────────
    log('\n[5] Проверка данных в offline БД...');
    {
        const r = await request(OFFLINE_PORT, 'GET', '/api/sync/wpf/disciplines', null, OFFLINE_KEY);
        const found = Array.isArray(r.body) && r.body.some(d => d.id === disciplineId);
        if (found) ok('Дисциплина сохранена в offline БД');
        else fail('Дисциплина не найдена в offline БД', JSON.stringify(r.body));
    }

    // ── 6. Batch upload: offline → online ───────────────────────────────────
    log('\n[6] Синхронизация offline → online (Upload)...');

    const TABLES_TO_SYNC = ['users', 'disciplines', 'tests', 'questions', 'answers'];
    let totalUploaded = 0;

    for (const table of TABLES_TO_SYNC) {
        // GET from offline
        const getResp = await request(OFFLINE_PORT, 'GET', `/api/sync/wpf/${table}`, null, OFFLINE_KEY);
        if (getResp.status !== 200 || !Array.isArray(getResp.body)) {
            fail(`GET /api/sync/wpf/${table} offline`, `status=${getResp.status}`);
            continue;
        }
        const rows = getResp.body;
        if (rows.length === 0) {
            ok(`${table}: нет данных (пропуск)`);
            continue;
        }

        // POST batch to online
        const postResp = await request(ONLINE_PORT, 'POST', `/api/sync/wpf/${table}/batch`, rows, ONLINE_KEY);
        if (postResp.status === 200 && postResp.body.success) {
            totalUploaded += postResp.body.upserted || rows.length;
            ok(`${table}: загружено ${postResp.body.upserted ?? rows.length} записей → online`);
        } else {
            fail(`Batch upload ${table} → online`, `status=${postResp.status} body=${JSON.stringify(postResp.body)}`);
        }
    }

    // ── 7. Проверка что данные появились на online сервере ──────────────────
    log('\n[7] Проверка данных на online сервере...');
    {
        const r = await request(ONLINE_PORT, 'GET', '/api/sync/wpf/disciplines', null, ONLINE_KEY);
        const found = Array.isArray(r.body) && r.body.some(d => d.id === disciplineId);
        if (found) ok('Дисциплина появилась на online сервере');
        else fail('Дисциплина НЕ появилась на online сервере', JSON.stringify(r.body?.slice?.(0,2)));
    }
    {
        const r = await request(ONLINE_PORT, 'GET', '/api/sync/wpf/tests', null, ONLINE_KEY);
        const found = Array.isArray(r.body) && r.body.some(t => t.id === testId);
        if (found) ok('Тест появился на online сервере');
        else fail('Тест НЕ появился на online сервере');
    }
    {
        const r = await request(ONLINE_PORT, 'GET', '/api/sync/wpf/answers', null, ONLINE_KEY);
        const found = Array.isArray(r.body) && r.body.filter(a => a.question_id === questionId).length === 2;
        if (found) ok('Ответы (2 шт.) появились на online сервере');
        else fail('Ответы не появились на online сервере', JSON.stringify(r.body));
    }

    // ── 8. Conflict resolution: более новая запись побеждает ────────────────
    log('\n[8] Разрешение конфликтов (timestamp wins)...');
    {
        const older = { id: disciplineId, title: 'OLD Title', description: 'old', created_by: teacherId, created_at: now - 1000, updated_at: now - 1000, is_deleted: 0 };
        const newer = { id: disciplineId, title: 'NEW Title', description: 'new', created_by: teacherId, created_at: now - 1000, updated_at: now + 1000, is_deleted: 0 };

        // Send older first
        await request(ONLINE_PORT, 'POST', '/api/sync/wpf/disciplines', older, ONLINE_KEY);
        // Send newer — should win
        await request(ONLINE_PORT, 'POST', '/api/sync/wpf/disciplines', newer, ONLINE_KEY);
        // Send older again — should NOT overwrite
        await request(ONLINE_PORT, 'POST', '/api/sync/wpf/disciplines', older, ONLINE_KEY);

        const r = await request(ONLINE_PORT, 'GET', '/api/sync/wpf/disciplines', null, ONLINE_KEY);
        const disc = Array.isArray(r.body) && r.body.find(d => d.id === disciplineId);
        if (disc && disc.title === 'NEW Title')
            ok('Более новая запись (updated_at) побеждает при конфликте');
        else fail('Конфликт решён неверно', `title=${disc?.title}`);
    }

    // ── 9. Мягкое удаление синхронизируется ─────────────────────────────────
    log('\n[9] Синхронизация мягкого удаления (is_deleted=1)...');
    {
        const delRow = { id: 'disc-to-delete-test', title: 'Del me', created_by: teacherId, created_at: now, updated_at: now, is_deleted: 0 };
        await request(OFFLINE_PORT, 'POST', '/api/sync/wpf/disciplines', delRow, OFFLINE_KEY);

        const softDelRow = { ...delRow, is_deleted: 1, updated_at: now + 500 };
        await request(OFFLINE_PORT, 'POST', '/api/sync/wpf/disciplines', softDelRow, OFFLINE_KEY);

        // Sync to online
        const allDiscs = (await request(OFFLINE_PORT, 'GET', '/api/sync/wpf/disciplines', null, OFFLINE_KEY)).body;
        await request(ONLINE_PORT, 'POST', '/api/sync/wpf/disciplines/batch', allDiscs, ONLINE_KEY);

        const r = await request(ONLINE_PORT, 'GET', '/api/sync/wpf/disciplines', null, ONLINE_KEY);
        const disc = Array.isArray(r.body) && r.body.find(d => d.id === 'disc-to-delete-test');
        if (disc && disc.is_deleted === 1)
            ok('is_deleted=1 синхронизируется корректно');
        else fail('Мягкое удаление не синхронизировалось', JSON.stringify(disc));
    }

    // ── 10. Batch: недопустимое поле → 400 ──────────────────────────────────
    log('\n[10] Валидация входных данных...');
    {
        // Unrecognised column name should be rejected
        const r = await request(OFFLINE_PORT, 'POST', '/api/sync/wpf/users/batch',
            [{ id: 'x', email: 'x@x.com', name: 'X', role: 'student', injected_field: 'DROP TABLE users' }],
            OFFLINE_KEY);
        if (r.status === 400)
            ok('Недопустимое поле отклонено → 400');
        else fail('Неизвестное поле не заблокировано', `status=${r.status}`);
    }
    {
        const r = await request(OFFLINE_PORT, 'POST', '/api/sync/wpf/nonexistent_table/batch', [{}], OFFLINE_KEY);
        if (r.status === 400)
            ok('Несуществующая таблица → 400');
        else fail('Несуществующая таблица не заблокирована', `status=${r.status}`);
    }
    {
        const r = await request(OFFLINE_PORT, 'POST', '/api/sync/wpf/users/batch', [], OFFLINE_KEY);
        if (r.status === 400)
            ok('Пустой массив → 400');
        else fail('Пустой массив не отклонён', `status=${r.status}`);
    }

    // ── 11. Синхронизация результатов online → offline ───────────────────────
    log('\n[11] Синхронизация результатов online → offline (Download)...');
    {
        const studentId = 'student-sync-test-001';
        const attemptId = 'attempt-sync-test-001';
        const resultId  = 'result-sync-test-001';

        // Create student + attempt + result on online
        await request(ONLINE_PORT, 'POST', '/api/sync/wpf/users', {
            id: studentId, email: 'sync_student@test.com', name: 'Sync Student',
            role: 'student', created_at: now, updated_at: now, is_deleted: 0
        }, ONLINE_KEY);
        await request(ONLINE_PORT, 'POST', '/api/sync/wpf/attempts', {
            id: attemptId, user_id: studentId, test_id: testId,
            started_at: now, finished_at: now + 300, total_questions: 1, correct_answers: 1,
            score: 100, is_passed: 1, created_at: now, updated_at: now, is_deleted: 0
        }, ONLINE_KEY);
        await request(ONLINE_PORT, 'POST', '/api/sync/wpf/results', {
            id: resultId, user_id: studentId, test_id: testId, attempt_id: attemptId,
            score: 100, is_passed: 1, synced: 1, created_at: now, updated_at: now, is_deleted: 0
        }, ONLINE_KEY);

        // Download: GET from online, POST batch to offline
        for (const table of ['users', 'attempts', 'results']) {
            const rows = (await request(ONLINE_PORT, 'GET', `/api/sync/wpf/${table}`, null, ONLINE_KEY)).body;
            const r = await request(OFFLINE_PORT, 'POST', `/api/sync/wpf/${table}/batch`, rows, OFFLINE_KEY);
            if (r.status === 200 && r.body.success)
                ok(`Download ${table}: ${r.body.upserted ?? rows.length} записей → offline`);
            else fail(`Download ${table}`, `status=${r.status}`);
        }

        // Verify result appeared on offline
        const r = await request(OFFLINE_PORT, 'GET', '/api/sync/wpf/results', null, OFFLINE_KEY);
        const found = Array.isArray(r.body) && r.body.some(res => res.id === resultId);
        if (found) ok('Результаты студента появились в offline БД');
        else fail('Результаты студента НЕ появились в offline БД');
    }

    // ── 12. Идемпотентность (повторная синхронизация) ────────────────────────
    log('\n[12] Идемпотентность (повторная синхронизация)...');
    {
        const rows = (await request(OFFLINE_PORT, 'GET', '/api/sync/wpf/disciplines', null, OFFLINE_KEY)).body;
        const r1 = await request(ONLINE_PORT, 'POST', '/api/sync/wpf/disciplines/batch', rows, ONLINE_KEY);
        const r2 = await request(ONLINE_PORT, 'POST', '/api/sync/wpf/disciplines/batch', rows, ONLINE_KEY);

        const statsAfter = await request(ONLINE_PORT, 'GET', '/api/sync/wpf/stats/summary', null, ONLINE_KEY);
        const count = statsAfter.body?.disciplines;
        const countExpected = rows.length;

        if (r1.status === 200 && r2.status === 200 && count === countExpected)
            ok(`Повторная синхронизация идемпотентна (disciplines: ${count})`);
        else fail('Повторная синхронизация дублирует записи', `count=${count}, expected=${countExpected}`);
    }

    finalize();
}

function finalize() {
    log('\n' + '═'.repeat(60));
    log(`  РЕЗУЛЬТАТ: ${passed} прошло, ${failed} провалено`);
    if (failed === 0) log('  ✅ ВСЕ ТЕСТЫ СИНХРОНИЗАЦИИ ПРОШЛИ');
    else log('  ❌ ЕСТЬ ПРОВАЛЫ');
    log('═'.repeat(60) + '\n');

    stopAll();
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 500);
}

// ─── Запуск ───────────────────────────────────────────────────────────────────
process.on('exit', stopAll);
process.on('SIGINT', () => { stopAll(); process.exit(1); });

runTests().catch(e => {
    log('\nФатальная ошибка: ' + e.message);
    stopAll();
    process.exit(1);
});
