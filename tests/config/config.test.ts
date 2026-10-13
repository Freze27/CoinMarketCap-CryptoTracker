import { loadConfig } from '../../src/config';

const REQUIRED = { API_KEY: 'api-key', CMC_API_KEY: 'key' };

describe('loadConfig', () => {
  it('LoadConfig_ShouldReturnDefaults_WhenOnlyRequiredVariablesAreSet', () => {
    expect(loadConfig(REQUIRED)).toEqual({
      port: 3000,
      logLevel: 'info',
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
      LOG_LEVEL: 'debug',
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
      logLevel: 'debug',
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

  it('LoadConfig_ShouldThrow_WhenPortIsNotANumber', () => {
    expect(() => loadConfig({ ...REQUIRED, PORT: 'abc' })).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('LoadConfig_ShouldThrow_WhenPortIsZero', () => {
    expect(() => loadConfig({ ...REQUIRED, PORT: '0' })).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('LoadConfig_ShouldThrow_WhenPortIsAboveMaximum', () => {
    expect(() => loadConfig({ ...REQUIRED, PORT: '65536' })).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('LoadConfig_ShouldThrow_WhenPortIsFractional', () => {
    expect(() => loadConfig({ ...REQUIRED, PORT: '3000.5' })).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('LoadConfig_ShouldThrow_WhenPortIsNegative', () => {
    expect(() => loadConfig({ ...REQUIRED, PORT: '-1' })).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('LoadConfig_ShouldThrow_WhenDatabasePathIsEmpty', () => {
    expect(() => loadConfig({ ...REQUIRED, DATABASE_PATH: '  ' })).toThrow('DATABASE_PATH must not be empty');
  });

  it('LoadConfig_ShouldThrow_WhenCmcApiKeyIsNotSet', () => {
    expect(() => loadConfig({ API_KEY: 'api-key' })).toThrow('CMC_API_KEY must not be empty');
  });

  it('LoadConfig_ShouldThrow_WhenCmcApiKeyIsEmpty', () => {
    expect(() => loadConfig({ API_KEY: 'api-key', CMC_API_KEY: '' })).toThrow('CMC_API_KEY must not be empty');
  });

  it('LoadConfig_ShouldThrow_WhenCmcApiKeyIsBlank', () => {
    expect(() => loadConfig({ API_KEY: 'api-key', CMC_API_KEY: '   ' })).toThrow('CMC_API_KEY must not be empty');
  });

  it('LoadConfig_ShouldThrow_WhenApiKeyIsNotSet', () => {
    expect(() => loadConfig({ CMC_API_KEY: 'key' })).toThrow('API_KEY must not be empty');
  });

  it('LoadConfig_ShouldThrow_WhenApiKeyIsEmpty', () => {
    expect(() => loadConfig({ CMC_API_KEY: 'key', API_KEY: '' })).toThrow('API_KEY must not be empty');
  });

  it('LoadConfig_ShouldThrow_WhenApiKeyIsBlank', () => {
    expect(() => loadConfig({ CMC_API_KEY: 'key', API_KEY: '   ' })).toThrow('API_KEY must not be empty');
  });

  it('LoadConfig_ShouldThrow_WhenPriceCacheTtlIsNegative', () => {
    expect(() => loadConfig({ ...REQUIRED, PRICE_CACHE_TTL_MS: '-1' })).toThrow('PRICE_CACHE_TTL_MS must be an integer between');
  });

  it('LoadConfig_ShouldThrow_WhenPriceSyncIntervalIsBelowMinimum', () => {
    expect(() => loadConfig({ ...REQUIRED, PRICE_SYNC_INTERVAL_MS: '999' })).toThrow('PRICE_SYNC_INTERVAL_MS must be an integer between');
  });

  it('LoadConfig_ShouldThrow_WhenShutdownTimeoutIsZero', () => {
    expect(() => loadConfig({ ...REQUIRED, SHUTDOWN_TIMEOUT_MS: '0' })).toThrow('SHUTDOWN_TIMEOUT_MS must be an integer between');
  });

  it('LoadConfig_ShouldThrow_WhenCmcTimeoutIsZero', () => {
    expect(() => loadConfig({ ...REQUIRED, CMC_TIMEOUT_MS: '0' })).toThrow('CMC_TIMEOUT_MS must be an integer between');
  });

  it('LoadConfig_ShouldThrow_WhenCmcMaxRetriesIsAboveMaximum', () => {
    expect(() => loadConfig({ ...REQUIRED, CMC_MAX_RETRIES: '6' })).toThrow('CMC_MAX_RETRIES must be an integer between');
  });

  it('LoadConfig_ShouldThrow_WhenCmcRetryDelayIsNegative', () => {
    expect(() => loadConfig({ ...REQUIRED, CMC_RETRY_DELAY_MS: '-5' })).toThrow('CMC_RETRY_DELAY_MS must be an integer between');
  });

  it('LoadConfig_ShouldThrow_WhenPriceSyncEnabledIsYes', () => {
    expect(() => loadConfig({ ...REQUIRED, PRICE_SYNC_ENABLED: 'yes' })).toThrow(
      'PRICE_SYNC_ENABLED must be "true" or "false"',
    );
  });

  it('LoadConfig_ShouldThrow_WhenPriceSyncEnabledIsOne', () => {
    expect(() => loadConfig({ ...REQUIRED, PRICE_SYNC_ENABLED: '1' })).toThrow(
      'PRICE_SYNC_ENABLED must be "true" or "false"',
    );
  });

  it('LoadConfig_ShouldThrow_WhenPriceSyncEnabledIsUppercaseTrue', () => {
    expect(() => loadConfig({ ...REQUIRED, PRICE_SYNC_ENABLED: 'TRUE' })).toThrow(
      'PRICE_SYNC_ENABLED must be "true" or "false"',
    );
  });

  it('LoadConfig_ShouldAcceptLogLevel_WhenValueIsError', () => {
    expect(loadConfig({ ...REQUIRED, LOG_LEVEL: 'error' }).logLevel).toBe('error');
  });

  it('LoadConfig_ShouldAcceptLogLevel_WhenValueIsWarn', () => {
    expect(loadConfig({ ...REQUIRED, LOG_LEVEL: 'warn' }).logLevel).toBe('warn');
  });

  it('LoadConfig_ShouldAcceptLogLevel_WhenValueIsInfo', () => {
    expect(loadConfig({ ...REQUIRED, LOG_LEVEL: 'info' }).logLevel).toBe('info');
  });

  it('LoadConfig_ShouldAcceptLogLevel_WhenValueIsDebug', () => {
    expect(loadConfig({ ...REQUIRED, LOG_LEVEL: 'debug' }).logLevel).toBe('debug');
  });

  it('LoadConfig_ShouldAcceptLogLevel_WhenValueIsTrace', () => {
    expect(loadConfig({ ...REQUIRED, LOG_LEVEL: 'trace' }).logLevel).toBe('trace');
  });

  it('LoadConfig_ShouldAcceptLogLevel_WhenValueIsSilent', () => {
    expect(loadConfig({ ...REQUIRED, LOG_LEVEL: 'silent' }).logLevel).toBe('silent');
  });

  it('LoadConfig_ShouldThrow_WhenLogLevelIsUnknownWord', () => {
    expect(() => loadConfig({ ...REQUIRED, LOG_LEVEL: 'verbose' })).toThrow('LOG_LEVEL must be one of');
  });

  it('LoadConfig_ShouldThrow_WhenLogLevelIsUppercase', () => {
    expect(() => loadConfig({ ...REQUIRED, LOG_LEVEL: 'INFO' })).toThrow('LOG_LEVEL must be one of');
  });

  it('LoadConfig_ShouldThrow_WhenLogLevelIsNumber', () => {
    expect(() => loadConfig({ ...REQUIRED, LOG_LEVEL: '1' })).toThrow('LOG_LEVEL must be one of');
  });
});
