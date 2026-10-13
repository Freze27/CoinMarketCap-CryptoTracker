const ID_EXAMPLE = '3c9d3977-6c0a-4534-a37a-00f2afef3fc2';
const DATE_EXAMPLE = '2026-10-12T15:36:47.649Z';

const json = (schema: object, example?: unknown) => ({
  'application/json': { schema, ...(example === undefined ? {} : { example }) },
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (name: string) => ({ $ref: `#/components/responses/${name}` });
const dataOf = (schema: object) => ({ type: 'object', required: ['data'], properties: { data: schema } });

const errorResponse = (description: string, message: string) => ({
  description,
  content: json(ref('Error'), { error: { message } }),
});

const errorExamples = (description: string, examples: Record<string, { summary: string; value: object }>) => ({
  description,
  content: { 'application/json': { schema: ref('Error'), examples } },
});

const validationExample = {
  summary: 'Данные не прошли валидацию',
  value: {
    error: {
      message: 'Request validation failed',
      details: [{ field: 'symbol', message: 'must contain 1 to 20 latin letters or digits' }],
    },
  },
};

const cryptocurrencyExample = {
  id: ID_EXAMPLE,
  symbol: 'BTC',
  name: 'Bitcoin',
  cmcId: 1,
  updatedAt: DATE_EXAMPLE,
};

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Crypto Tracker API',
    version: '1.0.0',
    description:
      'Сервис отслеживает цены криптовалют через CoinMarketCap: хранит список монет, получает актуальные цены, ' +
      'сохраняет их историю и обновляет в фоне по расписанию.\n\n' +
      'Все цены указаны в USD. Каждый ответ содержит заголовок `X-Request-Id`, по которому запрос можно найти в логах.',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Health', description: 'Проверка состояния сервиса' },
    { name: 'Cryptocurrencies', description: 'Список отслеживаемых криптовалют' },
    { name: 'Prices', description: 'Актуальные цены и история цен' },
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        operationId: 'getHealth',
        summary: 'Проверить состояние сервиса',
        description: 'Показывает, работает ли сервис и доступна ли база данных. Токен не требуется.',
        security: [],
        responses: {
          200: {
            description: 'Сервис и база данных работают',
            content: json(ref('Health'), { status: 'ok', database: 'ok' }),
          },
          503: {
            description: 'База данных недоступна',
            content: json(ref('Health'), { status: 'error', database: 'unavailable' }),
          },
        },
      },
    },
    '/api/cryptocurrencies': {
      get: {
        tags: ['Cryptocurrencies'],
        operationId: 'listCryptocurrencies',
        summary: 'Получить список монет',
        description: 'Возвращает все отслеживаемые криптовалюты, отсортированные по символу.',
        responses: {
          200: {
            description: 'Список монет',
            content: json(dataOf({ type: 'array', items: ref('Cryptocurrency') }), { data: [cryptocurrencyExample] }),
          },
          401: response('Unauthorized'),
          500: response('InternalError'),
        },
      },
      post: {
        tags: ['Cryptocurrencies'],
        operationId: 'createCryptocurrency',
        summary: 'Добавить монету в отслеживаемые',
        description:
          'Проверяет символ в CoinMarketCap и сохраняет монету вместе с её идентификатором CoinMarketCap. ' +
          'Название задаётся произвольно. Символ приводится к верхнему регистру.',
        requestBody: {
          required: true,
          content: json(ref('CreateCryptocurrency'), { symbol: 'BTC', name: 'Bitcoin' }),
        },
        responses: {
          201: {
            description: 'Монета добавлена',
            content: json(dataOf(ref('Cryptocurrency')), { data: cryptocurrencyExample }),
          },
          400: response('InvalidBody'),
          401: response('Unauthorized'),
          409: errorResponse('Монета уже отслеживается', 'Cryptocurrency with symbol BTC already exists'),
          413: response('PayloadTooLarge'),
          415: response('UnsupportedMediaType'),
          500: response('InternalError'),
          503: response('ExternalApiUnavailable'),
        },
      },
    },
    '/api/cryptocurrencies/{id}': {
      parameters: [{ $ref: '#/components/parameters/CryptocurrencyId' }],
      get: {
        tags: ['Cryptocurrencies'],
        operationId: 'getCryptocurrency',
        summary: 'Получить монету по идентификатору',
        description: 'Возвращает одну отслеживаемую криптовалюту.',
        responses: {
          200: {
            description: 'Монета',
            content: json(dataOf(ref('Cryptocurrency')), { data: cryptocurrencyExample }),
          },
          400: response('ValidationError'),
          401: response('Unauthorized'),
          404: response('CryptocurrencyNotFound'),
          500: response('InternalError'),
        },
      },
      patch: {
        tags: ['Cryptocurrencies'],
        operationId: 'updateCryptocurrency',
        summary: 'Изменить название монеты',
        description: 'Меняет только название. Символ изменить нельзя: для другого символа монету нужно добавить заново.',
        requestBody: {
          required: true,
          content: json(ref('UpdateCryptocurrency'), { name: 'Bitcoin Core' }),
        },
        responses: {
          200: {
            description: 'Монета с новым названием',
            content: json(dataOf(ref('Cryptocurrency')), { data: { ...cryptocurrencyExample, name: 'Bitcoin Core' } }),
          },
          400: response('InvalidBody'),
          401: response('Unauthorized'),
          404: response('CryptocurrencyNotFound'),
          413: response('PayloadTooLarge'),
          415: response('UnsupportedMediaType'),
          500: response('InternalError'),
        },
      },
      delete: {
        tags: ['Cryptocurrencies'],
        operationId: 'deleteCryptocurrency',
        summary: 'Удалить монету из отслеживаемых',
        description: 'Удаляет монету вместе со всей её историей цен.',
        responses: {
          204: { description: 'Монета удалена' },
          400: response('ValidationError'),
          401: response('Unauthorized'),
          404: response('CryptocurrencyNotFound'),
          500: response('InternalError'),
        },
      },
    },
    '/api/prices': {
      get: {
        tags: ['Prices'],
        operationId: 'getLatestPrices',
        summary: 'Получить актуальные цены',
        description:
          'Возвращает последнюю цену каждой отслеживаемой монеты. Если сохранённые цены устарели, ' +
          'запрашивает новые в CoinMarketCap и сохраняет их в историю. Если CoinMarketCap недоступен, ' +
          'отдаёт последние сохранённые цены с признаком `stale: true`.',
        responses: {
          200: {
            description: 'Цены отслеживаемых монет',
            content: json(ref('LatestPrices'), {
              data: [
                {
                  cryptocurrencyId: ID_EXAMPLE,
                  symbol: 'BTC',
                  name: 'Bitcoin',
                  price: 82649.02441512862,
                  fetchedAt: DATE_EXAMPLE,
                },
              ],
              currency: 'USD',
              stale: false,
            }),
          },
          401: response('Unauthorized'),
          500: response('InternalError'),
          503: response('ExternalApiUnavailable'),
        },
      },
    },
    '/api/cryptocurrencies/{id}/prices': {
      parameters: [{ $ref: '#/components/parameters/CryptocurrencyId' }],
      get: {
        tags: ['Prices'],
        operationId: 'getPriceHistory',
        summary: 'Получить историю цен монеты',
        description: 'Возвращает сохранённые цены монеты от новых к старым. Период и размер страницы задаются параметрами.',
        parameters: [
          {
            name: 'from',
            in: 'query',
            description: 'Начало периода включительно, ISO 8601. Время указывается с часовым поясом.',
            schema: { type: 'string', format: 'date-time' },
            example: '2026-10-01T00:00:00Z',
          },
          {
            name: 'to',
            in: 'query',
            description: 'Конец периода включительно, ISO 8601. Не раньше `from`.',
            schema: { type: 'string', format: 'date-time' },
            example: '2026-10-31T23:59:59Z',
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Сколько записей вернуть.',
            schema: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
          },
          {
            name: 'offset',
            in: 'query',
            description: 'Сколько записей пропустить.',
            schema: { type: 'integer', minimum: 0, default: 0 },
          },
        ],
        responses: {
          200: {
            description: 'История цен',
            content: json(ref('PriceHistory'), {
              data: [{ price: 82649.02441512862, fetchedAt: DATE_EXAMPLE }],
              currency: 'USD',
              pagination: { limit: 100, offset: 0 },
            }),
          },
          400: response('ValidationError'),
          401: response('Unauthorized'),
          404: response('CryptocurrencyNotFound'),
          500: response('InternalError'),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Значение переменной окружения `API_KEY`.',
      },
    },
    parameters: {
      CryptocurrencyId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Идентификатор монеты в сервисе.',
        schema: { type: 'string', format: 'uuid' },
        example: ID_EXAMPLE,
      },
    },
    responses: {
      Unauthorized: errorResponse('Токен не передан или неверен', 'Valid Bearer token is required'),
      CryptocurrencyNotFound: errorResponse('Монета не найдена', `Cryptocurrency with id ${ID_EXAMPLE} not found`),
      InternalError: errorResponse('Внутренняя ошибка сервиса', 'Internal server error'),
      PayloadTooLarge: errorResponse('Тело запроса больше 100 КБ', 'Payload Too Large'),
      UnsupportedMediaType: errorResponse('Кодировка тела запроса не поддерживается', 'Unsupported Media Type'),
      ExternalApiUnavailable: errorExamples('CoinMarketCap недоступен или ответил некорректно', {
        unavailable: {
          summary: 'Нет ответа, ошибка или отклонённый ключ',
          value: { error: { message: 'CoinMarketCap is unavailable' } },
        },
        unexpectedResponse: {
          summary: 'Ответ в неожиданном формате',
          value: { error: { message: 'CoinMarketCap returned an unexpected response' } },
        },
      }),
      ValidationError: errorExamples('Параметры запроса некорректны', {
        validation: validationExample,
        malformedUrl: {
          summary: 'Адрес закодирован с ошибкой',
          value: { error: { message: 'Bad Request' } },
        },
      }),
      InvalidBody: errorExamples('Тело или параметры запроса некорректны', {
        validation: validationExample,
        invalidJson: {
          summary: 'Тело запроса не является JSON',
          value: { error: { message: 'Request body is not valid JSON' } },
        },
        malformedUrl: {
          summary: 'Адрес закодирован с ошибкой',
          value: { error: { message: 'Bad Request' } },
        },
      }),
    },
    schemas: {
      Health: {
        type: 'object',
        required: ['status', 'database'],
        properties: {
          status: { type: 'string', enum: ['ok', 'error'] },
          database: { type: 'string', enum: ['ok', 'unavailable'] },
        },
      },
      Cryptocurrency: {
        type: 'object',
        required: ['id', 'symbol', 'name', 'cmcId', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Идентификатор записи' },
          symbol: { type: 'string', description: 'Символ в верхнем регистре', example: 'BTC' },
          name: { type: 'string', description: 'Название, заданное при добавлении', example: 'Bitcoin' },
          cmcId: { type: 'integer', description: 'Идентификатор монеты в CoinMarketCap', example: 1 },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Время последнего изменения записи или получения цены',
          },
        },
      },
      CreateCryptocurrency: {
        type: 'object',
        required: ['symbol', 'name'],
        additionalProperties: false,
        properties: {
          symbol: {
            type: 'string',
            pattern: '^[A-Za-z0-9]{1,20}$',
            description: 'Символ монеты в CoinMarketCap. Пробелы по краям отбрасываются, регистр не важен.',
          },
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Произвольное название. Пробелы по краям отбрасываются, пустым быть не может.',
          },
        },
      },
      UpdateCryptocurrency: {
        type: 'object',
        required: ['name'],
        additionalProperties: false,
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Новое название. Пробелы по краям отбрасываются, пустым быть не может.',
          },
        },
      },
      LatestPrices: {
        type: 'object',
        required: ['data', 'currency', 'stale'],
        properties: {
          data: { type: 'array', items: ref('LatestPrice') },
          currency: { type: 'string', enum: ['USD'] },
          stale: { type: 'boolean', description: 'true, если CoinMarketCap недоступен и отданы сохранённые цены' },
        },
      },
      LatestPrice: {
        type: 'object',
        required: ['cryptocurrencyId', 'symbol', 'name', 'price', 'fetchedAt'],
        properties: {
          cryptocurrencyId: { type: 'string', format: 'uuid' },
          symbol: { type: 'string', example: 'BTC' },
          name: { type: 'string', example: 'Bitcoin' },
          price: { type: 'number', nullable: true, description: 'null, если цена ещё не получена' },
          fetchedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Время получения цены' },
        },
      },
      PriceHistory: {
        type: 'object',
        required: ['data', 'currency', 'pagination'],
        properties: {
          data: { type: 'array', items: ref('PriceRecord') },
          currency: { type: 'string', enum: ['USD'] },
          pagination: {
            type: 'object',
            required: ['limit', 'offset'],
            properties: { limit: { type: 'integer' }, offset: { type: 'integer' } },
          },
        },
      },
      PriceRecord: {
        type: 'object',
        required: ['price', 'fetchedAt'],
        properties: {
          price: { type: 'number' },
          fetchedAt: { type: 'string', format: 'date-time', description: 'Время получения цены' },
        },
      },
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['message'],
            properties: {
              message: { type: 'string' },
              details: {
                type: 'array',
                description: 'Есть только у ошибок валидации',
                items: {
                  type: 'object',
                  required: ['field', 'message'],
                  properties: { field: { type: 'string' }, message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
};
