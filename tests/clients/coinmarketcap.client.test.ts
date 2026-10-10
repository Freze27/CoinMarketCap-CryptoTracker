import axios from 'axios';
import { CoinMarketCapClient } from '../../src/clients/coinmarketcap.client';
import { ExternalApiError } from '../../src/errors';
import { CMC_TEST_CONFIG, cmcHttpError, cmcMapResponse, cmcNetworkError } from '../helpers/app';

jest.mock('axios');

describe('CoinMarketCapClient', () => {
  let get: jest.Mock;
  let client: CoinMarketCapClient;

  beforeEach(() => {
    get = jest.fn();
    jest.mocked(axios.create).mockReset().mockReturnValue({ get } as never);
    client = new CoinMarketCapClient(CMC_TEST_CONFIG);
  });

  it('Constructor_ShouldConfigureBaseUrlTimeoutAndApiKeyHeader_WhenCreated', () => {
    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'https://cmc.test',
      timeout: 1000,
      headers: { 'X-CMC_PRO_API_KEY': 'test-cmc-key', Accept: 'application/json' },
    });
  });

  it('FindCoinBySymbol_ShouldReturnCoin_WhenSymbolIsListed', async () => {
    get.mockResolvedValue(cmcMapResponse([{ id: 1, name: 'Bitcoin', symbol: 'BTC', rank: 1, is_active: 1 }]));

    await expect(client.findCoinBySymbol('BTC')).resolves.toEqual({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
    expect(get).toHaveBeenCalledWith('/v1/cryptocurrency/map', { params: { symbol: 'BTC' } });
  });

  it('FindCoinBySymbol_ShouldIgnoreMalformedAndForeignEntries_WhenResponseContainsThem', async () => {
    get.mockResolvedValue(
      cmcMapResponse([
        null,
        { id: 'not-a-number', name: 'Broken', symbol: 'BTC' },
        { id: 2, name: 'Litecoin', symbol: 'LTC', rank: 1, is_active: 1 },
        { id: 1, name: 'Bitcoin', symbol: 'BTC', rank: 1, is_active: 1 },
      ]),
    );

    await expect(client.findCoinBySymbol('BTC')).resolves.toMatchObject({ cmcId: 1 });
  });

  it('FindCoinBySymbol_ShouldReturnNull_WhenCoinMarketCapRespondsWith400', async () => {
    get.mockRejectedValue(cmcHttpError(400));

    await expect(client.findCoinBySymbol('NOSUCH')).resolves.toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('FindCoinBySymbol_ShouldRetryAndReturnCoin_WhenFirstAttemptTimesOut', async () => {
    get
      .mockRejectedValueOnce(cmcNetworkError('ECONNABORTED'))
      .mockResolvedValueOnce(cmcMapResponse([{ id: 1, name: 'Bitcoin', symbol: 'BTC' }]));

    await expect(client.findCoinBySymbol('BTC')).resolves.toMatchObject({ cmcId: 1 });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('FindCoinBySymbol_ShouldThrowExternalApiErrorWithoutApiKey_WhenAllAttemptsFail', async () => {
    get.mockRejectedValue({ ...cmcHttpError(500), config: { headers: { 'X-CMC_PRO_API_KEY': 'test-cmc-key' } } });

    const error: ExternalApiError = await client.findCoinBySymbol('BTC').then(
      () => {
        throw new Error('expected findCoinBySymbol to fail');
      },
      (caught) => caught,
    );

    expect(error).toBeInstanceOf(ExternalApiError);
    expect(error).toMatchObject({ statusCode: 503, context: { status: 500 } });
    expect(JSON.stringify([error.message, error.context, error.cause])).not.toContain('test-cmc-key');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('FindCoinBySymbol_ShouldNotRetry_WhenApiKeyIsRejected', async () => {
    get.mockRejectedValue(cmcHttpError(401));

    await expect(client.findCoinBySymbol('BTC')).rejects.toMatchObject({ context: { status: 401 } });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('FindCoinBySymbol_ShouldThrowExternalApiError_WhenResponseHasNoDataArray', async () => {
    get.mockResolvedValue({ data: 'not json' });

    await expect(client.findCoinBySymbol('BTC')).rejects.toMatchObject({
      message: 'CoinMarketCap returned an unexpected response',
    });
  });
});
