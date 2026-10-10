import type { Express } from 'express';
import request from 'supertest';
import type { Database } from '../../src/db/database';
import { AUTH_HEADER, cmcHttpError, cmcMapResponse, cmcNetworkError, createTestApp } from '../helpers/app';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Cryptocurrencies API', () => {
  let app: Express;
  let db: Database;
  let cmcGet: jest.Mock;

  function api(): ReturnType<typeof request.agent> {
    return request.agent(app).set('Authorization', AUTH_HEADER);
  }

  async function createCryptocurrency(symbol: string, name: string): Promise<{ id: string }> {
    const response = await api().post('/api/cryptocurrencies').send({ symbol, name });
    return response.body.data;
  }

  beforeEach(() => {
    ({ app, db, cmcGet } = createTestApp());
  });

  afterEach(() => {
    if (db.isOpen) {
      db.close();
    }
  });

  describe('GET /api/cryptocurrencies', () => {
    it('GetAll_ShouldReturn200AndList_WhenCryptocurrenciesExist', async () => {
      await createCryptocurrency('ETH', 'Ethereum');
      await createCryptocurrency('BTC', 'Bitcoin');

      const response = await api().get('/api/cryptocurrencies');

      expect(response.status).toBe(200);
      expect(response.body.data.map((item: { symbol: string }) => item.symbol)).toEqual(['BTC', 'ETH']);
    });

    it('GetAll_ShouldReturn200AndEmptyList_WhenNoCryptocurrenciesExist', async () => {
      const response = await api().get('/api/cryptocurrencies');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [] });
    });

    it('GetAll_ShouldReturn500WithoutDetails_WhenDatabaseIsUnavailable', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      db.close();

      const response = await api().get('/api/cryptocurrencies');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: { message: 'Internal server error' } });
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('POST /api/cryptocurrencies', () => {
    it('Create_ShouldReturn201AndCryptocurrency_WhenBodyIsValid', async () => {
      const response = await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual({
        id: expect.stringMatching(UUID_PATTERN),
        symbol: 'BTC',
        name: 'Bitcoin',
        cmcId: 1,
        updatedAt: expect.any(String),
      });
    });

    it('Create_ShouldSaveUppercaseSymbolAndTrimmedName_WhenBodyHasLowercaseAndSpaces', async () => {
      const response = await api().post('/api/cryptocurrencies').send({ symbol: ' btc ', name: '  Bitcoin ' });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ symbol: 'BTC', name: 'Bitcoin' });
    });

    it('Create_ShouldRequestCoinMarketCapBySymbolAndSaveItsId_WhenBodyIsValid', async () => {
      cmcGet.mockResolvedValueOnce(
        cmcMapResponse([{ id: 5426, name: 'Solana', symbol: 'SOL', rank: 5, is_active: 1 }]),
      );

      const response = await api().post('/api/cryptocurrencies').send({ symbol: 'sol', name: 'My Solana' });

      expect(cmcGet).toHaveBeenCalledWith('/v1/cryptocurrency/map', { params: { symbol: 'SOL' } });
      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ symbol: 'SOL', name: 'My Solana', cmcId: 5426 });
    });

    it('Create_ShouldSaveHighestRankedActiveCoin_WhenSeveralCoinsShareSymbol', async () => {
      cmcGet.mockResolvedValueOnce(
        cmcMapResponse([
          { id: 300, name: 'Inactive Bitcoin', symbol: 'BTC', rank: 1, is_active: 0 },
          { id: 200, name: 'Bitcoin Clone', symbol: 'BTC', rank: 900, is_active: 1 },
          { id: 1, name: 'Bitcoin', symbol: 'BTC', rank: 1, is_active: 1 },
          { id: 100, name: 'Unranked Bitcoin', symbol: 'BTC', rank: null, is_active: 1 },
        ]),
      );

      const response = await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });

      expect(response.status).toBe(201);
      expect(response.body.data.cmcId).toBe(1);
    });

    it('Create_ShouldReturn400_WhenSymbolIsNotListedOnCoinMarketCap', async () => {
      const response = await api().post('/api/cryptocurrencies').send({ symbol: 'NOSUCH', name: 'Nothing' });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([
        { field: 'symbol', message: 'is not listed on CoinMarketCap' },
      ]);
      await expect(api().get('/api/cryptocurrencies')).resolves.toMatchObject({ body: { data: [] } });
    });

    it('Create_ShouldReturn400_WhenCoinMarketCapReturnsEmptyList', async () => {
      cmcGet.mockResolvedValueOnce(cmcMapResponse([]));

      const response = await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });

      expect(response.status).toBe(400);
    });

    it('Create_ShouldReturn201AfterRetry_WhenCoinMarketCapFailsOnce', async () => {
      cmcGet.mockRejectedValueOnce(cmcHttpError(500));

      const response = await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });

      expect(response.status).toBe(201);
      expect(cmcGet).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['TimesOut', cmcNetworkError('ECONNABORTED'), 2],
      ['IsUnreachable', cmcNetworkError('ENOTFOUND'), 2],
      ['RespondsWith500', cmcHttpError(500), 2],
      ['RespondsWith429', cmcHttpError(429), 2],
      ['RejectsApiKey', cmcHttpError(401), 1],
      ['DeniesAccessToEndpoint', cmcHttpError(403), 1],
    ])('Create_ShouldReturn503AndSaveNothing_WhenCoinMarketCap%s', async (_case, error, expectedCalls) => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      cmcGet.mockRejectedValue(error);

      const response = await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: { message: 'CoinMarketCap is unavailable' } });
      expect(cmcGet).toHaveBeenCalledTimes(expectedCalls);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('test-cmc-key');
      await expect(api().get('/api/cryptocurrencies')).resolves.toMatchObject({ body: { data: [] } });
      consoleError.mockRestore();
    });

    it('Create_ShouldReturn503_WhenCoinMarketCapReturnsUnexpectedResponse', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      cmcGet.mockResolvedValueOnce({ data: { status: { error_code: 0 } } });

      const response = await api().post('/api/cryptocurrencies').send({ symbol: 'BTC', name: 'Bitcoin' });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: { message: 'CoinMarketCap returned an unexpected response' } });
      consoleError.mockRestore();
    });

    it('Create_ShouldReturn409_WhenSymbolAlreadyExists', async () => {
      await createCryptocurrency('BTC', 'Bitcoin');

      const response = await api().post('/api/cryptocurrencies').send({ symbol: 'btc', name: 'Bitcoin 2' });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: { message: 'Cryptocurrency with symbol "BTC" already exists' } });
    });

    it.each([
      ['SymbolIsMissing', { name: 'Bitcoin' }, 'symbol'],
      ['SymbolIsNotAString', { symbol: 123, name: 'Bitcoin' }, 'symbol'],
      ['SymbolHasInvalidCharacters', { symbol: 'BT-C', name: 'Bitcoin' }, 'symbol'],
      ['SymbolIsTooLong', { symbol: 'A'.repeat(21), name: 'Bitcoin' }, 'symbol'],
      ['NameIsMissing', { symbol: 'BTC' }, 'name'],
      ['NameIsBlank', { symbol: 'BTC', name: '   ' }, 'name'],
      ['NameIsTooLong', { symbol: 'BTC', name: 'a'.repeat(101) }, 'name'],
      ['BodyHasUnknownField', { symbol: 'BTC', name: 'Bitcoin', price: 1 }, 'price'],
      ['BodyIsAnArray', [], 'body'],
    ])('Create_ShouldReturn400_When%s', async (_case, body, field) => {
      const response = await api().post('/api/cryptocurrencies').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Request validation failed');
      expect(response.body.error.details).toEqual([{ field, message: expect.any(String) }]);
      expect(cmcGet).not.toHaveBeenCalled();
      await expect(api().get('/api/cryptocurrencies')).resolves.toMatchObject({ body: { data: [] } });
    });

    it('Create_ShouldReturn400_WhenBodyIsNotValidJson', async () => {
      const response = await api()
        .post('/api/cryptocurrencies')
        .set('Content-Type', 'application/json')
        .send('{"symbol": ');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: { message: 'Request body is not valid JSON' } });
    });

    it('Create_ShouldReturn413_WhenBodyIsTooLarge', async () => {
      const response = await api()
        .post('/api/cryptocurrencies')
        .send({ symbol: 'BTC', name: 'a'.repeat(200_000) });

      expect(response.status).toBe(413);
      expect(response.body).toEqual({ error: { message: 'Payload Too Large' } });
    });

    it('Create_ShouldReturn415_WhenCharsetIsNotSupported', async () => {
      const response = await api()
        .post('/api/cryptocurrencies')
        .set('Content-Type', 'application/json; charset=koi8-r')
        .send('{}');

      expect(response.status).toBe(415);
      expect(response.body).toEqual({ error: { message: 'Unsupported Media Type' } });
    });

    it('Create_ShouldReturn400_WhenContentTypeIsNotJson', async () => {
      const response = await api()
        .post('/api/cryptocurrencies')
        .set('Content-Type', 'text/plain')
        .send('symbol=BTC');

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([{ field: 'body', message: 'must be a JSON object' }]);
    });
  });

  describe('GET /api/cryptocurrencies/:id', () => {
    it('GetById_ShouldReturn200AndCryptocurrency_WhenIdExists', async () => {
      const created = await createCryptocurrency('BTC', 'Bitcoin');

      const response = await api().get(`/api/cryptocurrencies/${created.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(created);
    });

    it('GetById_ShouldReturn404_WhenIdDoesNotExist', async () => {
      const response = await api().get(`/api/cryptocurrencies/${MISSING_ID}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: { message: `Cryptocurrency with id "${MISSING_ID}" not found` } });
    });

    it('GetById_ShouldReturn400_WhenIdIsMalformedUrlEncoding', async () => {
      const response = await api().get('/api/cryptocurrencies/%E0%A4%A');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: { message: 'Bad Request' } });
    });

    it('GetById_ShouldReturn400_WhenIdIsNotUuid', async () => {
      const response = await api().get('/api/cryptocurrencies/123');

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([{ field: 'id', message: 'must be a valid UUID' }]);
    });
  });

  describe('PATCH /api/cryptocurrencies/:id', () => {
    it('Update_ShouldReturn200AndChangedName_WhenBodyIsValid', async () => {
      const created = await createCryptocurrency('BTC', 'Bitcoin');

      const response = await api().patch(`/api/cryptocurrencies/${created.id}`).send({ name: 'Bitcoin Core' });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ id: created.id, symbol: 'BTC', name: 'Bitcoin Core' });
    });

    it('Update_ShouldReturn404_WhenIdDoesNotExist', async () => {
      const response = await api().patch(`/api/cryptocurrencies/${MISSING_ID}`).send({ name: 'Bitcoin' });

      expect(response.status).toBe(404);
    });

    it.each([
      ['NameIsMissing', {}, 'name'],
      ['NameIsNotAString', { name: 42 }, 'name'],
      ['BodyTriesToChangeSymbol', { name: 'Bitcoin', symbol: 'ETH' }, 'symbol'],
    ])('Update_ShouldReturn400_When%s', async (_case, body, field) => {
      const created = await createCryptocurrency('BTC', 'Bitcoin');

      const response = await api().patch(`/api/cryptocurrencies/${created.id}`).send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.details).toEqual([{ field, message: expect.any(String) }]);
    });
  });

  describe('DELETE /api/cryptocurrencies/:id', () => {
    it('Delete_ShouldReturn204AndRemoveCryptocurrency_WhenIdExists', async () => {
      const created = await createCryptocurrency('BTC', 'Bitcoin');

      const response = await api().delete(`/api/cryptocurrencies/${created.id}`);

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
      await expect(api().get(`/api/cryptocurrencies/${created.id}`)).resolves.toMatchObject({ status: 404 });
    });

    it('Delete_ShouldReturn404_WhenIdDoesNotExist', async () => {
      const response = await api().delete(`/api/cryptocurrencies/${MISSING_ID}`);

      expect(response.status).toBe(404);
    });

    it('Delete_ShouldReturn400_WhenIdIsNotUuid', async () => {
      const response = await api().delete('/api/cryptocurrencies/abc');

      expect(response.status).toBe(400);
    });
  });
});
