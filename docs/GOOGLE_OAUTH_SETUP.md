# 🔐 Настройка Google OAuth для авторизации

## Пошаговая инструкция

### 1. Создание проекта в Google Cloud Console

1. Перейдите на [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Дайте проекту понятное имя (например, "Test System Auth")

### 2. Включение Google+ API

1. В боковом меню выберите **APIs & Services** → **Library**
2. Найдите **Google+ API** и нажмите **Enable**
3. Также включите **Google Identity Services** (если потребуется)

### 3. Настройка OAuth Consent Screen

1. Перейдите в **APIs & Services** → **OAuth consent screen**
2. Выберите **External** (для любых пользователей) или **Internal** (только для организации)
3. Заполните:
   - **App name**: Тестирующая система
   - **User support email**: ваш email
   - **Developer contact email**: ваш email
4. Нажмите **Save and Continue**

### 4. Создание OAuth Client ID

1. Перейдите в **APIs & Services** → **Credentials**
2. Нажмите **Create Credentials** → **OAuth Client ID**
3. Выберите **Web application**
4. Заполните:
   - **Name**: Test System Web Client
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (для локальной разработки)
     - `http://192.168.x.x:3000` (ваш локальный IP)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/auth/google/callback`
     - `http://192.168.x.x:3000/auth/google/callback`
5. Нажмите **Create**

### 5. Получение Client ID и Secret

После создания вы увидите:
- **Client ID**: что-то вроде `123456789-abcdefg.apps.googleusercontent.com`
- **Client Secret**: что-то вроде `GOCSPX-xxxxxxxxxxxxx`

⚠️ **Не делитесь этими данными публично!**

### 6. Настройка .env файла

Откройте файл `.env` в корне проекта и добавьте:

```env
# Google OAuth
GOOGLE_CLIENT_ID=ваш-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-ваш-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Переключите режим на online (опционально)
APP_MODE=online
```

### 7. Перезапуск сервера

```bash
# Остановите текущий сервер (Ctrl+C)
# Запустите заново
npm start
```

### 8. Проверка

1. Откройте http://localhost:3000
2. На странице входа должна появиться кнопка **"Войти через Google"**
3. Нажмите на неё и авторизуйтесь через Google

---

## Тестирование локально без Google OAuth

Если не хотите настраивать Google OAuth:

1. Регистрируйтесь и входите по email/паролю
2. Кнопка Google автоматически скрывается если не настроена
3. Все функции работают, кроме входа через Google

---

## Возможные проблемы

### "Error: Unknown authentication strategy 'google'"
- Google OAuth не настроен в `.env`
- Перезапустите сервер после добавления credentials в `.env`

### "redirect_uri_mismatch"
- Проверьте **Authorized redirect URIs** в Google Console
- URL должен точно совпадать: `http://localhost:3000/auth/google/callback`

### "access_denied"
- Проверьте **OAuth consent screen** — он должен быть настроен
- Если в режиме Testing — добавьте ваш email в Test users

### Кнопка Google не появляется
- Проверьте наличие `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET` в `.env`
- Перезапустите сервер

---

## Для продакшена

Для использования на боевом сервере:

1. Добавьте домен в **Authorized JavaScript origins**
2. Добавьте callback URL: `https://yourdomain.com/auth/google/callback`
3. Обновите `.env` на сервере
4. При необходимости — опубликуйте OAuth app (верификация Google)
