# Crypto Tracker API

REST API для отслеживания цен криптовалют через CoinMarketCap. Сервис хранит список отслеживаемых монет, отдаёт их актуальные цены и историю цен, а в фоне обновляет цены по расписанию.

## Запуск

Требуется Node.js 26.10 или новее.

Создайте файл `.env` из образца `.env.example` и заполните в нём `API_KEY` и `CMC_API_KEY`.

Соберите и запустите приложение:

```bash
npm ci
npm run build
npm start
```

## Документация API

После запуска приложения описание API доступно в Swagger UI: `http://localhost:3000/docs`.

## Запуск в Docker

Файл `.env` нужен так же, как при обычном запуске.

```bash
docker compose up -d --build
```

Остановка:

```bash
docker compose down
```

## Переменные окружения

| Название | По умолчанию | Назначение |
|---|---|---|
| `PORT` | `3000` | Порт HTTP-сервера |
| `LOG_LEVEL` | `info` | Уровень логов: `error`, `warn`, `info`, `debug`, `trace`, `silent` |
| `DATABASE_PATH` | `./data/app.db` | Путь к файлу базы данных SQLite |
| `API_KEY` | — обязательная | Ключ доступа к API; передаётся в заголовке `Authorization: Bearer <API_KEY>` |
| `PRICE_CACHE_TTL_MS` | `60000` | Сколько миллисекунд сохранённые цены считаются актуальными |
| `PRICE_SYNC_ENABLED` | `true` | Включить фоновое обновление цен |
| `PRICE_SYNC_INTERVAL_MS` | `300000` | Интервал фонового обновления цен, мс |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Сколько миллисекунд ждать корректной остановки |
| `CMC_API_KEY` | — обязательная | Ключ CoinMarketCap API |
| `CMC_BASE_URL` | `https://pro-api.coinmarketcap.com` | Адрес CoinMarketCap API |
| `CMC_TIMEOUT_MS` | `10000` | Таймаут запроса к CoinMarketCap, мс |
| `CMC_MAX_RETRIES` | `2` | Число повторных попыток при сбое запроса к CoinMarketCap |
| `CMC_RETRY_DELAY_MS` | `500` | Задержка перед первой повторной попыткой, мс |

## Тесты

```bash
npm test
```
