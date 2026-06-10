# 🔄 Архитектура синхронизации данных

## Обзор

Система поддерживает два режима работы:
- **Offline** — локальный сервер в школьной сети без интернета
- **Online** — сервер с доступом в интернет (поддержка Google OAuth)

## Быстрый старт

### Для существующей базы данных:
```bash
npm run migrate
```

### Настройка синхронизации (.env):
```env
# На локальном сервере
SYNC_URL=https://central-server.com
SYNC_API_KEY=your-secret-api-key

# На центральном сервере
SYNC_API_KEY=your-secret-api-key
```

---

## 📋 Сценарии регистрации

### 1️⃣ Регистрация в Offline-режиме

```
Студент → Вводит email/имя/пароль → Создаётся локальный аккаунт
```

**Данные в БД:**
```sql
users:
  id: UUID (сгенерирован локально)
  email: "student@example.com"
  name: "Иван Петров"
  password_hash: bcrypt(password)
  google_id: NULL
  sync_status: 'local'        -- Новое поле
  remote_id: NULL             -- Новое поле (ID на центральном сервере)
  created_offline: 1          -- Новое поле
```

### 2️⃣ Регистрация в Online-режиме (обычная)

```
Студент → Вводит email/имя/пароль → Создаётся аккаунт
                                  → Опционально: привязка Google
```

**Данные в БД:**
```sql
users:
  id: UUID
  email: "student@example.com"
  password_hash: bcrypt(password)
  google_id: NULL             -- Можно привязать позже
  sync_status: 'synced'
  created_offline: 0
```

### 3️⃣ Регистрация через Google (только Online)

```
Студент → "Войти через Google" → OAuth → Автоматическое создание аккаунта
```

**Данные в БД:**
```sql
users:
  id: UUID
  email: "student@gmail.com"  -- Из Google профиля
  name: "Ivan Petrov"         -- Из Google профиля
  password_hash: NULL         -- Нет пароля!
  google_id: "123456789"      -- Google ID
  avatar_url: "https://..."   -- Фото из Google
  sync_status: 'synced'
  created_offline: 0
```

---

## 🔐 Сценарии входа

### Offline вход
1. Проверяем email + password_hash
2. Создаём локальную сессию
3. ✅ Работаем без интернета

### Online вход (с паролем)
1. Проверяем email + password_hash
2. Если `password_hash = NULL` и `google_id != NULL`:
   - ❌ "Используйте вход через Google"
3. Создаём сессию
4. ✅ Доступ предоставлен

### Online вход через Google
1. Редирект на Google OAuth
2. Google возвращает профиль
3. Ищем пользователя по `google_id`
4. Если не найден — проверяем по email:
   - Если есть аккаунт с таким email без google_id:
     - Привязываем Google к существующему аккаунту
   - Если нет аккаунта:
     - Создаём новый
5. ✅ Доступ предоставлен

---

## 🔄 Синхронизация при переходе Offline → Online

### Сценарий: Студент зарегистрировался офлайн, затем получил интернет

```
┌─────────────────────────────────────────────────────────────────┐
│                    ПРОЦЕСС СИНХРОНИЗАЦИИ                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Режим меняется на Online                                    │
│     └── Проверяем sync_status = 'local'                         │
│                                                                 │
│  2. Для каждого несинхронизированного пользователя:              │
│     └── Проверяем на центральном сервере:                       │
│         │                                                        │
│         ├── Email уже существует?                                │
│         │   ├── ДА: Нужно слияние/конфликт                      │
│         │   └── НЕТ: Создаём на сервере                          │
│         │                                                        │
│         └── Получаем remote_id                                   │
│                                                                 │
│  3. Предлагаем привязать Google (опционально)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### API синхронизации

```javascript
// POST /sync/users
{
  "action": "sync_user",
  "local_user": {
    "id": "local-uuid-xxx",
    "email": "student@example.com",
    "name": "Иван Петров",
    "password_hash": "...",  // Передаём хеш, не пароль!
    "created_at": 1234567890
  }
}

// Ответ:
{
  "status": "success",
  "action": "created",  // или "merged", "conflict"
  "remote_id": "remote-uuid-yyy",
  "merge_required": false
}
```

---

## ⚠️ Разрешение конфликтов

### Конфликт: Email уже занят на сервере

```
┌──────────────────────────────────────────────────────────────┐
│                    ВАРИАНТЫ РАЗРЕШЕНИЯ                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. СЛИЯНИЕ (если это тот же человек)                        │
│     └── Показываем диалог: "Аккаунт найден. Войти?"          │
│         └── Пользователь вводит пароль от удалённого аккаунта│
│         └── При успехе: связываем local_id с remote_id       │
│                                                              │
│  2. ДРУГОЙ EMAIL (если это разные люди)                      │
│     └── "Email занят. Укажите другой email."                 │
│     └── Обновляем email, повторяем синхронизацию             │
│                                                              │
│  3. ЛОКАЛЬНЫЙ РЕЖИМ (отложить синхронизацию)                 │
│     └── Пользователь продолжает работать локально            │
│     └── sync_status = 'pending'                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔗 Привязка Google к существующему аккаунту

### Когда доступна:
- Режим Online
- У пользователя есть password_hash (зарегистрирован с паролем)
- google_id = NULL (ещё не привязан)

### Процесс:
1. Пользователь нажимает "Привязать Google"
2. OAuth с Google
3. Проверяем, что email совпадает (или подтверждаем привязку)
4. Сохраняем google_id и avatar_url
5. Теперь можно входить и через Google, и через пароль

```javascript
// PATCH /auth/link-google
{
  "google_id": "123456789",
  "email": "student@gmail.com",
  "avatar_url": "https://..."
}
```

---

## 📊 Синхронизация результатов тестов

### Offline → Online sync

```sql
-- Находим несинхронизированные результаты
SELECT * FROM results WHERE synced = 0;

-- После успешной синхронизации
UPDATE results SET 
  synced = 1,
  synced_at = strftime('%s', 'now')
WHERE id = ?;
```

### Структура запроса синхронизации:

```javascript
// POST /sync/results
{
  "results": [
    {
      "id": "local-result-uuid",
      "user_id": "local-user-uuid",
      "test_id": "test-uuid",
      "score": 85,
      "answers": [...],
      "started_at": 1234567890,
      "finished_at": 1234567950
    }
  ]
}
```

---

## 🗄️ Изменения в схеме БД

```sql
-- Добавляем поля синхронизации к users
ALTER TABLE users ADD COLUMN sync_status TEXT DEFAULT 'local';
-- Значения: 'local', 'synced', 'pending', 'conflict'

ALTER TABLE users ADD COLUMN remote_id TEXT;
-- ID на центральном сервере (для связи)

ALTER TABLE users ADD COLUMN created_offline INTEGER DEFAULT 0;
-- 1 = создан в offline режиме

ALTER TABLE users ADD COLUMN last_sync_at INTEGER;
-- Время последней синхронизации

-- Индексы
CREATE INDEX IF NOT EXISTS idx_users_sync_status ON users(sync_status);
CREATE INDEX IF NOT EXISTS idx_users_remote_id ON users(remote_id);
```

---

## 🔄 Логика синхронизации в коде

### Frontend (auth.js)

```javascript
// При регистрации - определяем режим
async register(data) {
    const mode = await API.get('/app-mode');
    
    const result = await API.post('/auth/register', {
        ...data,
        created_offline: mode.mode === 'offline' ? 1 : 0
    });
    
    return result;
}

// При смене режима на Online - проверяем синхронизацию
async checkSync() {
    const syncStatus = await API.get('/sync/status');
    
    if (syncStatus.pending_users > 0) {
        this.showSyncDialog(syncStatus);
    }
}
```

### Backend (sync.js)

```javascript
// Проверка статуса синхронизации
router.get('/status', isAuthenticated, (req, res) => {
    const db = getDb();
    
    const pendingUsers = db.prepare(
        "SELECT COUNT(*) as count FROM users WHERE sync_status IN ('local', 'pending')"
    ).get();
    
    const pendingResults = db.prepare(
        "SELECT COUNT(*) as count FROM results WHERE synced = 0"
    ).get();
    
    res.json({
        pending_users: pendingUsers.count,
        pending_results: pendingResults.count,
        last_sync: getSettings().last_sync
    });
});

// Синхронизация пользователя
router.post('/user', isAuthenticated, async (req, res) => {
    const { user_id } = req.body;
    const db = getDb();
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Проверяем на центральном сервере
    try {
        const response = await fetch(CENTRAL_SERVER + '/api/sync/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: user.email,
                name: user.name,
                password_hash: user.password_hash,
                local_id: user.id
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'conflict') {
            db.prepare("UPDATE users SET sync_status = 'conflict' WHERE id = ?")
              .run(user_id);
            return res.json({ status: 'conflict', message: result.message });
        }
        
        db.prepare(`
            UPDATE users SET 
                sync_status = 'synced',
                remote_id = ?,
                last_sync_at = strftime('%s', 'now')
            WHERE id = ?
        `).run(result.remote_id, user_id);
        
        dbModule.save();
        res.json({ status: 'synced' });
        
    } catch (error) {
        res.status(500).json({ error: 'Sync failed', details: error.message });
    }
});
```

---

## 📱 UX Flow: Синхронизация после офлайн-регистрации

```
┌─────────────────────────────────────────────────────────────┐
│                      ДИАЛОГ СИНХРОНИЗАЦИИ                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  🔄 Обнаружен интернет!                                      │
│                                                              │
│  Ваш аккаунт был создан офлайн.                              │
│  Выберите действие:                                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ 🔗 Синхронизировать сейчас                          │     │
│  │    Связать с центральным сервером                    │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ 🔵 Привязать Google аккаунт                          │     │
│  │    Вход и синхронизация через Google                 │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ ⏭️ Пропустить                                        │     │
│  │    Продолжить работу локально                        │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Безопасность

### При синхронизации паролей:
- **НИКОГДА** не передаём открытые пароли
- Передаём только bcrypt хеши
- Центральный сервер принимает хеши как есть
- При входе на другом сервере — пароль проверяется локально

### При OAuth:
- Используем стандартный OAuth 2.0 flow
- Токены не сохраняются долгосрочно
- Только google_id для идентификации

### Токены синхронизации:
- Каждый локальный сервер получает API_KEY
- Все запросы синхронизации подписаны
- Логирование всех операций

---

## 📝 Итоговая таблица сценариев

| Сценарий | Режим | Метод входа | password_hash | google_id | sync_status |
|----------|-------|-------------|---------------|-----------|-------------|
| Офлайн регистрация | Offline | Пароль | ✅ | ❌ | local |
| Онлайн регистрация | Online | Пароль | ✅ | ❌ | synced |
| Google регистрация | Online | Google | ❌ | ✅ | synced |
| После синхронизации | Any | Пароль/Google | ✅/❌ | ✅/❌ | synced |
| Офлайн + привязал Google | Online | Оба | ✅ | ✅ | synced |

