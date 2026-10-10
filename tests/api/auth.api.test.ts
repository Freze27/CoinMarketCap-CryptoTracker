import type { Express } from 'express';
import request from 'supertest';
import type { Database } from '../../src/db/database';
import { AUTH_HEADER, TEST_API_KEY, createTestApp } from '../helpers/app';

const ANY_ID = '00000000-0000-4000-8000-000000000000';

describe('API authorization', () => {
  let app: Express;
  let db: Database;
  let cmcGet: jest.Mock;

  beforeEach(() => {
    ({ app, db, cmcGet } = createTestApp());
  });

  afterEach(() => {
    db.close();
  });

  it('Auth_ShouldAllowRequest_WhenBearerTokenIsValid', async () => {
    const response = await request(app).get('/api/cryptocurrencies').set('Authorization', AUTH_HEADER);

    expect(response.status).toBe(200);
  });

  it('Auth_ShouldAllowRequest_WhenSchemeIsLowercase', async () => {
    const response = await request(app)
      .get('/api/cryptocurrencies')
      .set('Authorization', `bearer ${TEST_API_KEY}`);

    expect(response.status).toBe(200);
  });

  it.each([
    ['HeaderIsMissing', undefined],
    ['TokenIsWrong', 'Bearer wrong-key'],
    ['TokenIsPrefixOfKey', `Bearer ${TEST_API_KEY.slice(0, -1)}`],
    ['TokenHasExtraCharacters', `Bearer ${TEST_API_KEY}x`],
    ['TokenIsEmpty', 'Bearer '],
    ['SchemeIsBasic', `Basic ${TEST_API_KEY}`],
    ['SchemeIsMissing', TEST_API_KEY],
    ['HeaderHasExtraParts', `Bearer ${TEST_API_KEY} extra`],
  ])('Auth_ShouldReturn401_When%s', async (_case, header) => {
    const pending = request(app).get('/api/cryptocurrencies');

    const response = await (header === undefined ? pending : pending.set('Authorization', header));

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.body).toEqual({ error: { message: 'Valid Bearer token is required' } });
  });

  it.each([
    ['get', '/api/cryptocurrencies'],
    ['post', '/api/cryptocurrencies'],
    ['get', `/api/cryptocurrencies/${ANY_ID}`],
    ['patch', `/api/cryptocurrencies/${ANY_ID}`],
    ['delete', `/api/cryptocurrencies/${ANY_ID}`],
    ['get', '/api/unknown'],
  ] as const)('Auth_ShouldReturn401_WhenTokenIsMissingFor_%s_%s', async (method, path) => {
    const response = await request(app)[method](path);

    expect(response.status).toBe(401);
  });

  it('Auth_ShouldNotCallCoinMarketCapOrSaveAnything_WhenTokenIsMissing', async () => {
    const response = await request(app).post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });

    expect(response.status).toBe(401);
    expect(cmcGet).not.toHaveBeenCalled();
    const list = await request(app).get('/api/cryptocurrencies').set('Authorization', AUTH_HEADER);
    expect(list.body).toEqual({ data: [] });
  });

  it('Auth_ShouldNotRevealApiKey_WhenTokenIsWrong', async () => {
    const response = await request(app).get('/api/cryptocurrencies').set('Authorization', 'Bearer wrong-key');

    expect(JSON.stringify(response.body) + JSON.stringify(response.headers)).not.toContain(TEST_API_KEY);
  });

  it('Auth_ShouldKeepHealthOpen_WhenTokenIsMissing', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
  });
});
