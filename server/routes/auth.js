const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const dbModule = require('../db');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const rateLimit = require('express-rate-limit');


const getDb = () => dbModule.getDb();


function verifyPassword(password, storedHash) {
    if (!storedHash) return false;
    if (storedHash.startsWith('$2')) {
        
        return bcrypt.compareSync(password, storedHash);
    }
    
    const parts = storedHash.split('$');
    if (parts.length === 2) {
        const salt = Buffer.from(parts[0], 'base64');
        const expectedHash = Buffer.from(parts[1], 'base64');
        const derivedHash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        return crypto.timingSafeEqual(derivedHash, expectedHash);
    }
    return false;
}


passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_deleted = 0').get(id);
    done(null, user);
});


if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
        passReqToCallback: true
    }, (req, accessToken, refreshToken, profile, done) => {
        try {
            const db = getDb();
            const tokenExpiry = Date.now() + 3600 * 1000;
            const googleId = profile.id;
            const email = profile.emails[0].value;
            const avatar = profile.photos[0]?.value || null;
            const expiry = Math.floor(tokenExpiry / 1000);
            const now = Math.floor(Date.now() / 1000);

            // --- Привязка Google к существующему аккаунту ---
            if (req.session.linkGoogle && req.session.userId) {
                const linkingUser = db.prepare('SELECT * FROM users WHERE id = ? AND is_deleted = 0').get(req.session.userId);
                if (!linkingUser) return done(null, false);

                const alreadyTaken = db.prepare('SELECT id FROM users WHERE google_id = ? AND id != ?').get(googleId, linkingUser.id);
                if (alreadyTaken) return done(null, false);

                db.prepare(`
                    UPDATE users SET
                        google_id = ?, avatar_url = COALESCE(avatar_url, ?),
                        google_access_token = ?, google_refresh_token = COALESCE(?, google_refresh_token),
                        google_token_expiry = ?, google_unlinked = 0, sync_status = 'synced', updated_at = ?
                    WHERE id = ?
                `).run(googleId, avatar, accessToken || null, refreshToken || null, expiry, now, linkingUser.id);
                dbModule.save();

                const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(linkingUser.id);
                updated._wasLinked = true;
                return done(null, updated);
            }

            // --- Обычный вход через Google ---
            let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

            if (user) return done(null, user);

            const existingByEmail = db.prepare('SELECT * FROM users WHERE email = ? AND is_deleted = 0').get(email);

            if (existingByEmail) {
                if (existingByEmail.google_unlinked) {
                    return done(null, false);
                }
                db.prepare(`
                    UPDATE users SET
                        google_id = ?, avatar_url = COALESCE(avatar_url, ?),
                        google_access_token = ?, google_refresh_token = COALESCE(?, google_refresh_token),
                        google_token_expiry = ?, sync_status = 'synced', updated_at = ?
                    WHERE id = ?
                `).run(googleId, avatar, accessToken || null, refreshToken || null, expiry, now, existingByEmail.id);
                dbModule.save();
                user = db.prepare('SELECT * FROM users WHERE id = ?').get(existingByEmail.id);
            } else {
                const id = uuidv4();
                db.prepare(`
                    INSERT INTO users (id, email, name, role, google_id, avatar_url,
                        google_access_token, google_refresh_token, google_token_expiry, sync_status)
                    VALUES (?, ?, ?, 'student', ?, ?, ?, ?, ?, 'synced')
                `).run(id, email, profile.displayName, googleId, avatar,
                       accessToken || null, refreshToken || null, expiry);
                dbModule.save();
                user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            }

            return done(null, user);
        } catch (err) {
            return done(err, null);
        }
    }));
}


const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        const db = getDb();
        const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_deleted = 0').get(req.session.userId);
        if (user) {
            req.user = user;
            return next();
        }
    }
    res.status(401).json({ error: 'Необходима авторизация' });
};


const hasRole = (role) => {
    return (req, res, next) => {
        if (req.user && req.user.role === role) {
            return next();
        }
        res.status(403).json({ error: 'Доступ запрещён' });
    };
};

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Слишком много попыток входа. Попробуйте позже.' }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Слишком много попыток регистрации. Попробуйте позже.' }
});


router.post('/login', loginLimiter, (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDb();
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Введите email и пароль' });
        }
        
        const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_deleted = 0').get(email);
        
        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        if (!user.password_hash) {
            return res.status(401).json({ error: 'Используйте вход через Google' });
        }
        
        const isValid = verifyPassword(password, user.password_hash);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        
        req.session.userId = user.id;
        
        
        const token = uuidv4();
        const expiresAt = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        
        db.prepare(`
            INSERT INTO sessions (id, user_id, token, expires_at)
            VALUES (?, ?, ?, ?)
        `).run(uuidv4(), user.id, token, expiresAt);
        
        dbModule.save();
        
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar_url: user.avatar_url,
                sync_status: user.sync_status || 'local',
                created_offline: user.created_offline === 1,
                google_linked: !!user.google_id,
                has_password: !!user.password_hash
            },
            token
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Ошибка сервера при авторизации' });
    }
});


router.post('/register', registerLimiter, (req, res) => {
    try {
        const { email, name, password, role } = req.body;
        const db = getDb();
        
        
        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'Введите email' });
        }
        
        if (email.trim().length > 254) {
            return res.status(400).json({ error: 'Email: максимум 254 символа' });
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            return res.status(400).json({ error: 'Введите корректный email' });
        }
        
        
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Введите ФИО' });
        }
        
        if (name.trim().length < 2) {
            return res.status(400).json({ error: 'ФИО должно быть не менее 2 символов' });
        }
        
        if (name.trim().length > 100) {
            return res.status(400).json({ error: 'ФИО: максимум 100 символов' });
        }
        
        
        if (!password) {
            return res.status(400).json({ error: 'Введите пароль' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
        }
        
        if (password.length > 128) {
            return res.status(400).json({ error: 'Пароль: максимум 128 символов' });
        }
        
        
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
        if (existing) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }
        
        
        const appMode = db.prepare("SELECT value FROM settings WHERE key = 'app_mode'").get();
        const isOffline = !appMode || appMode.value === 'offline';
        
        const id = uuidv4();
        const passwordHash = bcrypt.hashSync(password, 10);
        
        db.prepare(`
            INSERT INTO users (id, email, name, role, password_hash, sync_status, created_offline)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, 
            email.trim(), 
            name.trim(), 
            role || 'student', 
            passwordHash,
            isOffline ? 'local' : 'synced',
            isOffline ? 1 : 0
        );
        
        dbModule.save();
        
        res.json({ 
            success: true, 
            message: 'Регистрация успешна',
            created_offline: isOffline
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Ошибка сервера при регистрации' });
    }
});


router.post('/logout', (req, res) => {
    if (req.session.userId) {
        const db = getDb();
        
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.session.userId);
        dbModule.save();
    }
    
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка выхода' });
        }
        res.json({ success: true });
    });
});


router.get('/me', isAuthenticated, (req, res) => {
    res.json({
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            avatar_url: req.user.avatar_url,
            
            sync_status: req.user.sync_status || 'local',
            created_offline: req.user.created_offline === 1,
            google_linked: !!req.user.google_id,
            has_password: !!req.user.password_hash
        }
    });
});


router.post('/change-password', isAuthenticated, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const db = getDb();
    
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Новый пароль должен быть не менее 6 символов' });
    }
    
    if (newPassword.length > 128) {
        return res.status(400).json({ error: 'Пароль: максимум 128 символов' });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    
    
    if (user.password_hash) {
        if (!currentPassword) {
            return res.status(400).json({ error: 'Введите текущий пароль' });
        }
        
        const isValid = verifyPassword(currentPassword, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный текущий пароль' });
        }
    }
    
    
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);
    
    db.prepare(`
        UPDATE users SET 
            password_hash = ?,
            updated_at = ?
        WHERE id = ?
    `).run(newPasswordHash, Math.floor(Date.now() / 1000), req.user.id);
    
    dbModule.save();
    
    
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    req.login(updatedUser, (err) => {
        if (err) {
            console.error('Error updating session:', err);
        }
    });
    
    res.json({ success: true, message: 'Пароль успешно изменён' });
});


router.post('/change-name', isAuthenticated, (req, res) => {
    const { name } = req.body;
    const db = getDb();
    
    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Введите ФИО' });
    }
    
    if (name.trim().length < 2) {
        return res.status(400).json({ error: 'ФИО должно быть не менее 2 символов' });
    }
    
    if (name.trim().length > 100) {
        return res.status(400).json({ error: 'ФИО: максимум 100 символов' });
    }
    
    db.prepare(`
        UPDATE users SET 
            name = ?,
            updated_at = ?
        WHERE id = ?
    `).run(name.trim(), Math.floor(Date.now() / 1000), req.user.id);
    
    dbModule.save();
    
    
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    req.login(updatedUser, (err) => {
        if (err) {
            console.error('Error updating session:', err);
        }
    });
    
    res.json({ success: true, message: 'ФИО успешно изменено', name: name.trim() });
});


router.get('/google-status', (req, res) => {
    res.json({
        available: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    });
});


router.get('/google', (req, res, next) => {
    
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.redirect('/?error=google_not_configured');
    }
    
    
    if (req.query.link === 'true' && req.session.userId) {
        req.session.linkGoogle = true;
    }
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        accessType: 'offline',
        prompt: 'consent'
    })(req, res, next);
});

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/?error=google_auth_failed' }),
    (req, res) => {
        if (req.user?._wasLinked) {
            req.session.userId = req.user.id;
            return res.redirect('/?success=google_linked');
        }
        req.session.userId = req.user.id;
        res.redirect('/');
    }
);


router.post('/link-google', isAuthenticated, (req, res) => {
    const db = getDb();
    
    
    if (req.user.google_id) {
        return res.status(400).json({ error: 'Google уже привязан к аккаунту' });
    }
    
    
    res.json({ 
        redirect_url: '/auth/google?link=true',
        message: 'Перейдите по ссылке для привязки Google'
    });
});


router.post('/unlink-google', isAuthenticated, (req, res) => {
    const db = getDb();
    
    
    if (!req.user.password_hash) {
        return res.status(400).json({ 
            error: 'Сначала установите пароль. Иначе вы не сможете войти в аккаунт.' 
        });
    }
    
    db.prepare(`
        UPDATE users SET 
            google_id = NULL,
            google_access_token = NULL,
            google_refresh_token = NULL,
            google_token_expiry = NULL,
            google_unlinked = 1,
            updated_at = ?
        WHERE id = ?
    `).run(Math.floor(Date.now() / 1000), req.user.id);
    
    dbModule.save();
    
    res.json({ success: true, message: 'Google отвязан от аккаунта' });
});

module.exports = router;
module.exports.isAuthenticated = isAuthenticated;
module.exports.hasRole = hasRole;
