require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const passport = require('passport');

const dbModule = require('./db');

const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction) {
    const missing = [];
    if (!sessionSecret || sessionSecret.length < 32 || sessionSecret === 'secret-key') {
        missing.push('SESSION_SECRET');
    }
    if (!process.env.ADMIN_API_KEY) {
        missing.push('ADMIN_API_KEY');
    }
    if (missing.length) {
        console.error(`FATAL: missing/weak required env vars in production: ${missing.join(', ')}`);
        process.exit(1);
    }
}

const effectiveSessionSecret = sessionSecret || 'dev-secret-change-me';

const app = express();
const PORT = process.env.PORT || 3000;


class SqlJsSessionStore extends session.Store {
    constructor() {
        super();
        this._ensureTable();
        this._cleanupTimer = setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
        if (this._cleanupTimer && typeof this._cleanupTimer.unref === 'function') {
            this._cleanupTimer.unref();
        }
    }

    _ensureTable() {
        try {
            const db = dbModule.getDb();
            if (db) {
                db.exec(`CREATE TABLE IF NOT EXISTS http_sessions (
                    sid TEXT PRIMARY KEY,
                    sess TEXT NOT NULL,
                    expired_at INTEGER NOT NULL
                )`);
            }
        } catch (e) {  }
    }

    cleanupExpiredSessions() {
        try {
            const db = dbModule.getDb();
            if (!db) return;
            this._ensureTable();
            const now = Math.floor(Date.now() / 1000);
            db.prepare('DELETE FROM http_sessions WHERE expired_at <= ?').run(now);
            dbModule.save();
        } catch (e) {
            console.error('Session cleanup error:', e.message);
        }
    }

    get(sid, callback) {
        try {
            const db = dbModule.getDb();
            if (!db) return callback(null, null);
            this._ensureTable();
            const now = Math.floor(Date.now() / 1000);
            const row = db.prepare('SELECT sess FROM http_sessions WHERE sid = ? AND expired_at > ?').get(sid, now);
            if (row && row.sess) {
                return callback(null, JSON.parse(row.sess));
            }
            callback(null, null);
        } catch (e) { callback(e); }
    }

    set(sid, sess, callback) {
        try {
            const db = dbModule.getDb();
            if (!db) return callback();
            this._ensureTable();
            const maxAge = (sess.cookie && sess.cookie.maxAge) ? sess.cookie.maxAge / 1000 : 86400;
            const expiredAt = Math.floor(Date.now() / 1000) + Math.floor(maxAge);
            const sessJson = JSON.stringify(sess);
            db.prepare('INSERT OR REPLACE INTO http_sessions (sid, sess, expired_at) VALUES (?, ?, ?)').run(sid, sessJson, expiredAt);
            callback();
        } catch (e) { callback(e); }
    }

    destroy(sid, callback) {
        try {
            const db = dbModule.getDb();
            if (db) db.prepare('DELETE FROM http_sessions WHERE sid = ?').run(sid);
            if (callback) callback();
        } catch (e) { if (callback) callback(e); }
    }

    touch(sid, sess, callback) {
        this.set(sid, sess, callback);
    }
}


// Trust reverse proxies (ngrok, nginx, etc.) so X-Forwarded-For is handled correctly
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY);
} else if (process.env.NODE_ENV !== 'production') {
    app.set('trust proxy', 1);
}

// CORS: restrict to explicit allowed origins (comma-separated in ALLOWED_ORIGINS),
// or default to localhost only. WPF/server-to-server calls are not affected by CORS.
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : [];

app.use(cors({
    origin(origin, callback) {
        // Allow requests with no Origin header (e.g. WPF HttpClient, curl, same-origin)
        if (!origin) return callback(null, true);
        // Allow localhost on any port
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin) ||
            /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        // Allow explicitly configured origins
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(session({
    store: new SqlJsSessionStore(),
    secret: effectiveSessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 
    }
}));


app.use(passport.initialize());
app.use(passport.session());


app.use(express.static(path.join(__dirname, '../public')));


dbModule.ready.then(() => {
    const authRoutes = require('./routes/auth');
    const apiRoutes = require('./routes/api');
    const teacherRoutes = require('./routes/teacher');
    const studentRoutes = require('./routes/student');
    const adminRoutes = require('./routes/admin');
    const syncRoutes = require('./routes/sync');

    
    app.use('/auth', authRoutes);
    app.use('/api', apiRoutes);
    app.use('/api/teacher', teacherRoutes);
    app.use('/api/student', studentRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/sync', syncRoutes);
    
    
    app.get('/api/app-mode', (req, res) => {
        try {
            const db = dbModule.getDb();
            const mode = db.prepare("SELECT value FROM settings WHERE key = 'app_mode'").get();
            
            
            const googleAvailable = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
            
            res.json({
                mode: mode?.value || process.env.APP_MODE || 'offline',
                google_enabled: googleAvailable
            });
        } catch (err) {
            res.json({ 
                mode: process.env.APP_MODE || 'offline', 
                google_enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
            });
        }
    });

    
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    
    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).json({ error: 'Что-то пошло не так!' });
    });

    
    const getLocalIP = () => {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return 'localhost';
    };

    const HOST = '0.0.0.0'; 
    const localIP = getLocalIP();
    
    const server = app.listen(PORT, HOST, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════╗');
        console.log('║         🚀 СЕРВЕР ТЕСТИРОВАНИЯ ЗАПУЩЕН               ║');
        console.log('╠══════════════════════════════════════════════════════╣');
        console.log(`║  📍 Локальный:    http://localhost:${PORT}              ║`);
        console.log(`║  🌐 В сети:       http://${localIP}:${PORT}          ║`);
        console.log(`║  📁 Режим:        ${(process.env.APP_MODE || 'offline').padEnd(30)}  ║`);
        console.log('╠══════════════════════════════════════════════════════╣');
        console.log('║  💡 Другие компьютеры в сети могут подключиться      ║');
        console.log(`║     по адресу: http://${localIP}:${PORT}             ║`);
        console.log('╚══════════════════════════════════════════════════════╝');
        console.log('');
    });

    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            console.error(`Порт ${PORT} уже занят. Остановите предыдущий процесс или измените PORT в .env`);
        } else {
            console.error('Ошибка запуска HTTP сервера:', err);
        }
        process.exit(1);
    });
}).catch(err => {
    console.error('Ошибка инициализации БД:', err);
    process.exit(1);
});
