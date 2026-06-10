# TestSystem — Система тестирования

## Установка и запуск

```bash
npm install
npm start
```

Скопируй `.env.example` в `.env` и заполни переменные:

```bash
copy .env.example .env
```

## Переменные окружения (`.env`)

| Переменная | Описание |
|---|---|
| `PORT` | Порт сервера (по умолчанию `5000`) |
| `SESSION_SECRET` | Секрет для подписи сессий — **обязательно** сменить на продакшне |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID (оставь пустым чтобы отключить Google-вход) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GOOGLE_CALLBACK_URL` | Redirect URI, должен совпадать с настройкой в Google Cloud Console |
| `DB_PATH` | Путь к файлу базы данных SQLite |
| `APP_MODE` | `online` (Google OAuth включён) или `offline` (только email/пароль) |
| `ADMIN_API_KEY` | API-ключ для WPF-приложения — **обязательно** сменить |
| `ALLOWED_ORIGINS` | Доп. разрешённые CORS-домены через запятую (localhost всегда разрешён) |
| `SYNC_URL` | URL удалённого сервера для синхронизации через WPF |
| `SYNC_API_KEY` | API-ключ удалённого сервера (должен совпадать с его `ADMIN_API_KEY`) |

## Развёртывание в локальной сети

1. Запустите сервер на главном компьютере:
   ```bash
   npm start
   ```

2. Сервер выведет локальный IP — другие компьютеры в той же сети открывают его в браузере:
   ```
   http://192.168.1.100:5000
   ```

3. Брандмауэр Windows должен разрешать входящие подключения на порт `5000`.

## Google OAuth (необязательно)

1. Создай проект в [Google Cloud Console](https://console.cloud.google.com)
2. Включи **Google+ API** / **People API**
3. Создай OAuth 2.0 Client ID (тип — Web application)
4. Добавь в Authorised redirect URIs: `https://ваш-домен/auth/google/callback`
5. Скопируй Client ID и Client Secret в `.env`:
   ```env
   APP_MODE=online
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_CALLBACK_URL=https://ваш-домен/auth/google/callback
   ```

## Учётные записи

Преподаватели регистрируются через WPF-приложение **TestSyncManager**.  
Студенты регистрируются самостоятельно через веб-интерфейс.

## WPF-приложение (TestSyncManager)

Десктопное приложение для управления сервером и синхронизации данных.

**Возможности:**
- Запуск/остановка локального Node.js-сервера
- Создание и инициализация базы данных
- Регистрация преподавателей
- Синхронизация данных с удалённым сервером (batch-загрузка по таблицам)

**Требования:** .NET 8, Windows

**Запуск:**
```
TestSyncManager/bin/Debug/net8.0-windows/TestSyncManager.exe
```

### API для WPF

Все запросы к `/api/sync/wpf/` требуют заголовок:
```
x-api-key: <ADMIN_API_KEY из .env>
```

| Метод | Путь | Описание |
|---|---|---|
| `GET` | `/api/sync/wpf/stats/summary` | Количество строк по таблицам |
| `GET` | `/api/sync/wpf/:table` | Все записи таблицы |
| `POST` | `/api/sync/wpf/:table` | Upsert одной записи |
| `POST` | `/api/sync/wpf/:table/batch` | Batch upsert массива записей |

Допустимые таблицы: `users`, `disciplines`, `topics`, `tests`, `questions`, `answers`, `matching_pairs`, `attempts`, `user_answers`, `results`, `student_disciplines`

## Структура проекта

```
siteTestDiplome/
├── server/
│   ├── index.js              # Express-сервер, CORS, сессии
│   ├── db.js                 # DatabaseWrapper (sql.js + автосохранение)
│   ├── init-db.js            # Инициализация схемы
│   ├── migrations/           # Миграции (ALTER TABLE)
│   └── routes/
│       ├── auth.js           # Регистрация, вход, Google OAuth
│       ├── api.js            # Публичное API (тесты для студентов)
│       ├── teacher.js        # API преподавателя
│       ├── student.js        # API студента (попытки, ответы)
│       ├── admin.js          # Административное API
│       └── sync.js           # Синхронизация (WPF + user-sync)
├── public/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js            # Роутинг, навигация
│       ├── api.js            # HTTP-клиент
│       ├── auth.js           # Авторизация
│       ├── dashboard.js      # Дашборд (учитель/студент)
│       ├── teacher.js        # Управление тестами
│       ├── test.js           # Прохождение теста
│       └── sync.js           # Статус синхронизации
├── database/
│   └── test_system.db        # SQLite (создаётся автоматически)
├── TestSyncManager/          # WPF-приложение (.NET 8)
├── .env                      # Секреты (не в git)
├── .env.example              # Шаблон переменных
└── package.json
```