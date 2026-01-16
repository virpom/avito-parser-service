# Avito Parser Service

Сервис для парсинга Avito через браузерную автоматизацию (Puppeteer).

## Возможности

- ✅ Парсинг чатов Avito без API ключей
- ✅ Отправка сообщений через браузер
- ✅ Обход капчи через операторов (ручное решение)
- ✅ Поддержка прокси для каждого аккаунта
- ✅ Автоматическое обновление cookies
- ✅ **Удаленная авторизация через CDP WebSocket** - открывает браузер в админке для ввода SMS

## Архитектура

```
┌─────────────────┐
│  Admin Panel    │ ← Открывает браузер для авторизации
└────────┬────────┘
         │ WebSocket (CDP)
         ↓
┌─────────────────┐
│ Parser Service  │ ← Puppeteer + Stealth
│  (Kubernetes)   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Avito.ru      │
└─────────────────┘
```

## API Endpoints

### Browser Gateway (CDP)

#### POST `/api/v1/browser/start`
Запустить браузер для ручной авторизации

**Request:**
```json
{
  "accountId": 123,
  "proxyConfig": {
    "protocol": "http",
    "host": "1.2.3.4",
    "port": 8080,
    "username": "user",
    "password": "pass"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "wsEndpoint": "ws://127.0.0.1:xxxxx/devtools/browser/xxx",
    "publicWsUrl": "wss://api.lead-schem.ru/api/v1/browser/ws/xxx"
  }
}
```

#### GET `/api/v1/browser/:accountId/cookies`
Получить cookies из браузера после авторизации

**Response:**
```json
{
  "success": true,
  "data": {
    "cookies": "[{\"name\":\"...\",\"value\":\"...\"}]"
  }
}
```

#### GET `/api/v1/browser/:accountId/status`
Проверить статус авторизации

**Response:**
```json
{
  "success": true,
  "data": {
    "isAuthorized": true,
    "hasSession": true
  }
}
```

#### DELETE `/api/v1/browser/:accountId`
Закрыть браузер

### Parser API

#### POST `/api/v1/parser/login`
Авторизация в Avito

**Request:**
```json
{
  "login": "79001234567",
  "password": "encrypted_password",
  "cookies": "[{...}]",
  "proxy": {
    "protocol": "http",
    "host": "1.2.3.4",
    "port": 8080,
    "username": "user",
    "password": "pass"
  }
}
```

#### POST `/api/v1/parser/chats`
Получить список чатов

**Request:**
```json
{
  "cookies": "[{...}]",
  "proxy": {...}
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "chat_123",
      "title": "iPhone 13",
      "lastMessage": "Здравствуйте!",
      "unreadCount": 2
    }
  ],
  "cookies": "[{...}]"
}
```

#### POST `/api/v1/parser/messages`
Получить сообщения чата

**Request:**
```json
{
  "chatId": "chat_123",
  "cookies": "[{...}]",
  "proxy": {...}
}
```

#### POST `/api/v1/parser/send`
Отправить сообщение

**Request:**
```json
{
  "chatId": "chat_123",
  "message": "Здравствуйте!",
  "cookies": "[{...}]",
  "proxy": {...}
}
```

### Captcha API

#### GET `/api/v1/captcha/pending`
Получить список ожидающих капч

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "captcha_123",
      "accountId": 1,
      "image": "base64_png",
      "timestamp": "2025-11-25T12:00:00Z",
      "resolved": false
    }
  ]
}
```

#### POST `/api/v1/captcha/submit`
Отправить решение капчи

**Request:**
```json
{
  "captchaId": "captcha_123",
  "answer": "abc123"
}
```

## Переменные окружения

```env
PORT=5011
NODE_ENV=production
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUBLIC_HOST=api.lead-schem.ru
```

## Deployment

### Docker Build
```bash
docker build -t jes11sy/avito-parser-service:latest .
docker push jes11sy/avito-parser-service:latest
```

### Kubernetes
```bash
kubectl apply -f k8s/secrets/avito-parser-secrets.yaml
kubectl apply -f k8s/deployments/avito-parser-service.yaml
kubectl apply -f k8s/ingress/backend-ingress.yaml
```

### GitHub Actions
CI/CD настроен автоматически:
- Push в `main`/`master` → автоматический build и deploy
- Требуется секрет: `DOCKERHUB_TOKEN`

## Как работает авторизация через браузер

1. **Админ** в админке нажимает "Добавить аккаунт Avito" → ставит галку "Использовать парсер"
2. **Фронт** создает аккаунт и вызывает `POST /api/v1/browser/start`
3. **Парсер** запускает Puppeteer браузер в Kubernetes
4. **Фронт** открывает модальное окно с инструкцией "Откройте Avito в новой вкладке"
5. **Админ** открывает `https://www.avito.ru/profile/login` → вводит логин/пароль/SMS
6. **Парсер** каждые 2 секунды проверяет URL страницы (если не `/login` → авторизован)
7. **Фронт** получает уведомление "Авторизован!" → вызывает `GET /api/v1/browser/:id/cookies`
8. **Парсер** возвращает cookies → **Фронт** сохраняет их в базу
9. **Парсер** закрывает браузер `DELETE /api/v1/browser/:id`

**Готово!** Cookies сохранены, SMS нужна только один раз.

## Troubleshooting

### Браузер не запускается
```bash
# Проверить логи
kubectl logs -f deployment/avito-parser-service -n backend

# Проверить ресурсы
kubectl describe pod <pod-name> -n backend
```

### WebSocket не подключается
- Проверить Ingress: `nginx.ingress.kubernetes.io/websocket-services`
- Проверить CORS в `main.ts`
- Проверить firewall/SSL

### Капча не отображается
- Проверить `/api/v1/captcha/pending` endpoint
- Проверить `CaptchaModal` в `frontend callcentre`

## License
MIT
