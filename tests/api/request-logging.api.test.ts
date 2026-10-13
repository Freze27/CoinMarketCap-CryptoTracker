import type { Express } from 'express';
import request from 'supertest';
import type { Database } from '../../src/db/database';
import { AUTH_HEADER, TEST_API_KEY, cmcHttpError, createTestApp } from '../helpers/app';
import type { LogEntry } from '../helpers/logger';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('request logging', () => {
  let app: Express;
  let db: Database;
  let cmcGet: jest.Mock;
  let logs: LogEntry[];

  function api(): ReturnType<typeof request.agent> {
    return request.agent(app).set('Authorization', AUTH_HEADER);
  }

  function logsWith(message: string): LogEntry[] {
    return logs.filter((entry) => entry.message === message);
  }

  beforeEach(() => {
    ({ app, db, cmcGet, logs } = createTestApp());
  });

  afterEach(() => {
    if (db.isOpen) {
      db.close();
    }
  });

  it('RequestId_ShouldBeGeneratedAndReturnedInHeader_WhenRequestHasNoRequestId', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('RequestId_ShouldBeDifferentForEachRequest_WhenRequestsHaveNoRequestId', async () => {
    const first = await request(app).get('/health');
    const second = await request(app).get('/health');

    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  it('RequestId_ShouldBeReused_WhenRequestHasValidRequestId', async () => {
    const response = await request(app).get('/health').set('X-Request-Id', 'client-trace-42');

    expect(response.headers['x-request-id']).toBe('client-trace-42');
    expect(logsWith('Request completed')[0].requestId).toBe('client-trace-42');
  });

  it.each([
    ['ContainsSpaces', 'has spaces'],
    ['ContainsJson', '{"injected":true}'],
    ['IsTooLong', 'a'.repeat(65)],
  ])('RequestId_ShouldBeReplaced_WhenIncomingRequestId%s', async (_case, incoming) => {
    const response = await request(app).get('/health').set('X-Request-Id', incoming);

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('RequestLog_ShouldContainMethodPathStatusAndDuration_WhenRequestCompletes', async () => {
    const response = await api().get('/api/cryptocurrencies');

    expect(logsWith('Request completed')).toEqual([
      {
        timestamp: expect.any(String),
        level: 'info',
        message: 'Request completed',
        requestId: response.headers['x-request-id'],
        method: 'GET',
        path: '/api/cryptocurrencies',
        status: 200,
        durationMs: expect.any(Number),
      },
    ]);
  });

  it('RequestLog_ShouldShareRequestIdAcrossAllLayers_WhenRequestPassesThroughServiceAndClient', async () => {
    const response = await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });
    const requestId = response.headers['x-request-id'];

    const messages = logs.filter((entry) => entry.requestId === requestId).map((entry) => entry.message);

    expect(messages).toEqual([
      'Request received',
      'CoinMarketCap request',
      'Cryptocurrency added to tracking',
      'Request completed',
    ]);
    expect(logs.every((entry) => entry.requestId === requestId)).toBe(true);
  });

  it('RequestLog_ShouldKeepRequestIdsSeparate_WhenRequestsAreConcurrent', async () => {
    const [bitcoin, ethereum] = await Promise.all([
      api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' }),
      api().post('/api/cryptocurrencies').send({ symbol: 'ETH', name: 'Ethereum' }),
    ]);

    const added = logsWith('Cryptocurrency added to tracking');

    expect(added.find((entry) => entry.symbol === 'BTC')?.requestId).toBe(bitcoin.headers['x-request-id']);
    expect(added.find((entry) => entry.symbol === 'ETH')?.requestId).toBe(ethereum.headers['x-request-id']);
  });

  it('RequestLog_ShouldWarnWithReason_WhenRequestIsRejectedByValidation', async () => {
    const response = await api().post('/api/cryptocurrencies').send({ name: 'Bitcoin' });

    expect(logsWith('Request rejected')).toEqual([
      expect.objectContaining({
        level: 'warn',
        requestId: response.headers['x-request-id'],
        status: 400,
        reason: 'Request validation failed',
        details: [{ field: 'symbol', message: 'is required and must be a string' }],
      }),
    ]);
  });

  it('RequestLog_ShouldWarn_WhenTokenIsWrong', async () => {
    await request(app).get('/api/cryptocurrencies').set('Authorization', 'Bearer wrong-key');

    expect(logsWith('Request rejected')).toEqual([
      expect.objectContaining({ level: 'warn', status: 401, method: 'GET', path: '/api/cryptocurrencies' }),
    ]);
  });

  it('RequestLog_ShouldKeepRequestId_WhenBodyIsNotValidJson', async () => {
    const response = await api().post('/api/cryptocurrencies').set('Content-Type', 'application/json').send('{"symbol": ');

    expect(logsWith('Request rejected')).toEqual([
      expect.objectContaining({ requestId: response.headers['x-request-id'], status: 400 }),
    ]);
  });

  it('RequestLog_ShouldLogErrorWithDetails_WhenExternalApiFails', async () => {
    cmcGet.mockRejectedValue(cmcHttpError(500));

    const response = await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });

    expect(logsWith('CoinMarketCap request failed, retrying')).toEqual([
      expect.objectContaining({ level: 'warn', attempt: 1, status: 500, requestId: response.headers['x-request-id'] }),
    ]);
    expect(logsWith('Request failed')).toEqual([
      expect.objectContaining({
        level: 'error',
        status: 503,
        requestId: response.headers['x-request-id'],
        error: expect.objectContaining({ name: 'ExternalApiError', context: { status: 500 } }),
      }),
    ]);
  });

  it('RequestLog_ShouldNotContainApiKeys_WhenRequestsAreLogged', async () => {
    await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });
    await api().get('/api/prices');
    await request(app).get('/api/prices').set('Authorization', 'Bearer leaked-wrong-token');

    const output = JSON.stringify(logs);

    expect(output).not.toContain(TEST_API_KEY);
    expect(output).not.toContain('test-cmc-key');
    expect(output).not.toContain('leaked-wrong-token');
  });

  it('BusinessLog_ShouldRecordRenameAndRemoval_WhenCryptocurrencyIsChanged', async () => {
    const created = await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });
    const id = created.body.data.id;

    await api().patch(`/api/cryptocurrencies/${id}`).send({ name: 'Bitcoin Core' });
    await api().delete(`/api/cryptocurrencies/${id}`);

    expect(logsWith('Cryptocurrency renamed')).toEqual([expect.objectContaining({ level: 'info', id, name: 'Bitcoin Core' })]);
    expect(logsWith('Cryptocurrency removed from tracking')).toEqual([expect.objectContaining({ level: 'info', id })]);
  });

  it('BusinessLog_ShouldRecordPriceRefresh_WhenPricesAreRequested', async () => {
    await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });

    await api().get('/api/prices');

    expect(logsWith('Prices refreshed')).toEqual([expect.objectContaining({ level: 'info', tracked: 1, savedPrices: 1 })]);
  });
});
