import { loadConfig } from '../../src/config';

const REQUIRED = { API_KEY: 'api-key', CMC_API_KEY: 'key' };

describe('loadConfig', () => {
  it('LoadConfig_ShouldReturnDefaults_WhenOnlyRequiredVariablesAreSet', () => {
    expect(loadConfig(REQUIRED)).toEqual({
      port: 3000,
      databasePath: './data/app.db',
      apiKey: 'api-key',
      priceCacheTtlMs: 60000,
      priceSync: { enabled: true, intervalMs: 300000 },
      shutdownTimeoutMs: 10000,
      coinMarketCap: {
        apiKey: 'key',
        baseUrl: 'https://pro-api.coinmarketcap.com',
        timeoutMs: 10000,
        maxRetries: 2,
        retryDelayMs: 500,
      },
    });
  });

  it('LoadConfig_ShouldReturnValuesFromEnvironment_WhenVariablesAreSet', () => {
    const config = loadConfig({
      PORT: '8080',
      DATABASE_PATH: './storage/prices.db',
      API_KEY: ' my-api-key ',
      PRICE_CACHE_TTL_MS: '0',
      PRICE_SYNC_ENABLED: 'false',
      PRICE_SYNC_INTERVAL_MS: '60000',
      SHUTDOWN_TIMEOUT_MS: '5000',
      CMC_API_KEY: ' secret ',
      CMC_BASE_URL: 'https://sandbox-api.coinmarketcap.com',
      CMC_TIMEOUT_MS: '3000',
      CMC_MAX_RETRIES: '0',
      CMC_RETRY_DELAY_MS: '100',
    });

    expect(config).toEqual({
      port: 8080,
      databasePath: './storage/prices.db',
      apiKey: 'my-api-key',
      priceCacheTtlMs: 0,
      priceSync: { enabled: false, intervalMs: 60000 },
      shutdownTimeoutMs: 5000,
      coinMarketCap: {
        apiKey: 'secret',
        baseUrl: 'https://sandbox-api.coinmarketcap.com',
        timeoutMs: 3000,
        maxRetries: 0,
        retryDelayMs: 100,
      },
    });
  });

  it.each(['abc', '0', '65536', '3000.5', '-1'])('LoadConfig_ShouldThrow_WhenPortIs%s', (port) => {
    expect(() => loadConfig({ ...REQUIRED, PORT: port })).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('LoadConfig_ShouldThrow_WhenDatabasePathIsEmpty', () => {
    expect(() => loadConfig({ ...REQUIRED, DATABASE_PATH: '  ' })).toThrow('DATABASE_PATH must not be empty');
  });

  it.each([{}, { CMC_API_KEY: '' }, { CMC_API_KEY: '   ' }])('LoadConfig_ShouldThrow_WhenCmcApiKeyIsMissing', (env) => {
    expect(() => loadConfig({ API_KEY: 'api-key', ...env })).toThrow('CMC_API_KEY must not be empty');
  });

  it.each([{}, { API_KEY: '' }, { API_KEY: '   ' }])('LoadConfig_ShouldThrow_WhenApiKeyIsMissing', (env) => {
    expect(() => loadConfig({ CMC_API_KEY: 'key', ...env })).toThrow('API_KEY must not be empty');
  });

  it.each([
    ['PRICE_CACHE_TTL_MS', '-1'],
    ['PRICE_SYNC_INTERVAL_MS', '999'],
    ['SHUTDOWN_TIMEOUT_MS', '0'],
    ['CMC_TIMEOUT_MS', '0'],
    ['CMC_MAX_RETRIES', '6'],
    ['CMC_RETRY_DELAY_MS', '-5'],
  ])('LoadConfig_ShouldThrow_When%sIsOutOfRange', (name, value) => {
    expect(() => loadConfig({ ...REQUIRED, [name]: value })).toThrow(`${name} must be an integer between`);
  });

  it.each(['yes', '1', 'TRUE'])('LoadConfig_ShouldThrow_WhenPriceSyncEnabledIs%s', (value) => {
    expect(() => loadConfig({ ...REQUIRED, PRICE_SYNC_ENABLED: value })).toThrow(
      'PRICE_SYNC_ENABLED must be "true" or "false"',
    );
  });
});
