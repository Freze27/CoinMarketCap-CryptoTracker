import { ExternalApiError } from '../../src/errors';
import { createLogger, type LogLevel } from '../../src/logger/logger';
import { runWithRequestId } from '../../src/logger/request-context';

function capture(level: LogLevel | 'silent'): { logger: ReturnType<typeof createLogger>; lines: Array<[string, string]> } {
  const lines: Array<[string, string]> = [];
  const logger = createLogger(level, (entryLevel, line) => lines.push([entryLevel, line]));

  return { logger, lines };
}

function logAllLevels(logger: ReturnType<typeof createLogger>): void {
  logger.error('error message');
  logger.warn('warn message');
  logger.info('info message');
  logger.debug('debug message');
  logger.trace('trace message');
}

describe('createLogger', () => {
  it('Log_ShouldWriteOnlyLevelsUpToThreshold_WhenLevelIsError', () => {
    const { logger, lines } = capture('error');

    logAllLevels(logger);

    expect(lines.map(([entryLevel]) => entryLevel)).toEqual(['error']);
  });

  it('Log_ShouldWriteOnlyLevelsUpToThreshold_WhenLevelIsWarn', () => {
    const { logger, lines } = capture('warn');

    logAllLevels(logger);

    expect(lines.map(([entryLevel]) => entryLevel)).toEqual(['error', 'warn']);
  });

  it('Log_ShouldWriteOnlyLevelsUpToThreshold_WhenLevelIsInfo', () => {
    const { logger, lines } = capture('info');

    logAllLevels(logger);

    expect(lines.map(([entryLevel]) => entryLevel)).toEqual(['error', 'warn', 'info']);
  });

  it('Log_ShouldWriteOnlyLevelsUpToThreshold_WhenLevelIsDebug', () => {
    const { logger, lines } = capture('debug');

    logAllLevels(logger);

    expect(lines.map(([entryLevel]) => entryLevel)).toEqual(['error', 'warn', 'info', 'debug']);
  });

  it('Log_ShouldWriteOnlyLevelsUpToThreshold_WhenLevelIsTrace', () => {
    const { logger, lines } = capture('trace');

    logAllLevels(logger);

    expect(lines.map(([entryLevel]) => entryLevel)).toEqual(['error', 'warn', 'info', 'debug', 'trace']);
  });

  it('Log_ShouldWriteOnlyLevelsUpToThreshold_WhenLevelIsSilent', () => {
    const { logger, lines } = capture('silent');

    logAllLevels(logger);

    expect(lines.map(([entryLevel]) => entryLevel)).toEqual([]);
  });

  it('Log_ShouldWriteJsonLineWithTimestampLevelMessageAndContext_WhenEntryIsWritten', () => {
    const { logger, lines } = capture('info');

    logger.info('Cryptocurrency added to tracking', { symbol: 'BTC', cmcId: 1 });

    const entry = JSON.parse(lines[0][1]);
    expect(entry).toEqual({
      timestamp: expect.any(String),
      level: 'info',
      message: 'Cryptocurrency added to tracking',
      symbol: 'BTC',
      cmcId: 1,
    });
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    expect(lines[0][1]).not.toContain('\n');
  });

  it('Log_ShouldAddRequestId_WhenCalledInsideRequestContext', () => {
    const { logger, lines } = capture('info');

    runWithRequestId('request-1', () => logger.info('inside'));
    logger.info('outside');

    expect(JSON.parse(lines[0][1]).requestId).toBe('request-1');
    expect(JSON.parse(lines[1][1])).not.toHaveProperty('requestId');
  });

  it('Log_ShouldKeepRequestIdAcrossAsyncCalls_WhenRequestsRunConcurrently', async () => {
    const { logger, lines } = capture('info');
    const work = async (requestId: string, delayMs: number): Promise<void> =>
      runWithRequestId(requestId, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        logger.info('done', { expected: requestId });
      });

    await Promise.all([work('slow', 20), work('fast', 1)]);

    for (const [, line] of lines) {
      const entry = JSON.parse(line);
      expect(entry.requestId).toBe(entry.expected);
    }
    expect(lines).toHaveLength(2);
  });

  it('Log_ShouldSerializeErrorWithNameMessageStackContextAndCause_WhenContextContainsError', () => {
    const { logger, lines } = capture('error');
    const cause = new Error('socket hang up');
    const error = new ExternalApiError('CoinMarketCap is unavailable', { status: 500 });
    Object.assign(error, { cause });

    logger.error('Request failed', { error });

    expect(JSON.parse(lines[0][1]).error).toEqual({
      name: 'ExternalApiError',
      message: 'CoinMarketCap is unavailable',
      statusCode: 503,
      context: { status: 500 },
      cause: expect.objectContaining({ name: 'Error', message: 'socket hang up' }),
      stack: expect.stringContaining('ExternalApiError'),
    });
  });

  it('Log_ShouldNotThrowAndKeepMessage_WhenContextIsCircular', () => {
    const { logger, lines } = capture('info');
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;

    expect(() => logger.info('Task finished', { result: circular })).not.toThrow();

    expect(JSON.parse(lines[0][1])).toEqual({
      timestamp: expect.any(String),
      level: 'info',
      message: 'Task finished',
      serializationError: 'Log context could not be serialized',
    });
  });

  it('Log_ShouldWriteBigIntAsString_WhenContextContainsBigInt', () => {
    const { logger, lines } = capture('info');

    logger.info('Row inserted', { rowId: 9007199254740993n });

    expect(JSON.parse(lines[0][1]).rowId).toBe('9007199254740993');
  });

  it('Log_ShouldKeepOwnTimestampLevelAndMessage_WhenContextHasSameKeys', () => {
    const { logger, lines } = capture('info');

    logger.info('real message', { timestamp: 'fake', level: 'error', message: 'fake', extra: 1 });

    const entry = JSON.parse(lines[0][1]);
    expect(entry).toMatchObject({ level: 'info', message: 'real message', extra: 1 });
    expect(entry.timestamp).not.toBe('fake');
  });

  it('Log_ShouldRedactValue_WhenKeyIsLowercaseAuthorization', () => {
    const { logger, lines } = capture('info');

    logger.info('Request failed', { error: { config: { headers: { authorization: 'super-secret-value' } } } });

    expect(lines[0][1]).not.toContain('super-secret-value');
    expect(lines[0][1]).toContain('[redacted]');
  });

  it('Log_ShouldRedactValue_WhenKeyIsAuthorization', () => {
    const { logger, lines } = capture('info');

    logger.info('Request failed', { error: { config: { headers: { Authorization: 'super-secret-value' } } } });

    expect(lines[0][1]).not.toContain('super-secret-value');
    expect(lines[0][1]).toContain('[redacted]');
  });

  it('Log_ShouldRedactValue_WhenKeyIsCoinMarketCapApiKeyHeader', () => {
    const { logger, lines } = capture('info');

    logger.info('Request failed', { error: { config: { headers: { 'X-CMC_PRO_API_KEY': 'super-secret-value' } } } });

    expect(lines[0][1]).not.toContain('super-secret-value');
    expect(lines[0][1]).toContain('[redacted]');
  });

  it('Log_ShouldRedactValue_WhenKeyIsApiKeyInCamelCase', () => {
    const { logger, lines } = capture('info');

    logger.info('Request failed', { error: { config: { headers: { apiKey: 'super-secret-value' } } } });

    expect(lines[0][1]).not.toContain('super-secret-value');
    expect(lines[0][1]).toContain('[redacted]');
  });

  it('Log_ShouldRedactValue_WhenKeyIsApiKeyInSnakeCase', () => {
    const { logger, lines } = capture('info');

    logger.info('Request failed', { error: { config: { headers: { api_key: 'super-secret-value' } } } });

    expect(lines[0][1]).not.toContain('super-secret-value');
    expect(lines[0][1]).toContain('[redacted]');
  });

  it('Log_ShouldRedactValue_WhenKeyIsToken', () => {
    const { logger, lines } = capture('info');

    logger.info('Request failed', { error: { config: { headers: { token: 'super-secret-value' } } } });

    expect(lines[0][1]).not.toContain('super-secret-value');
    expect(lines[0][1]).toContain('[redacted]');
  });

  it('Log_ShouldRedactValue_WhenKeyIsAccessToken', () => {
    const { logger, lines } = capture('info');

    logger.info('Request failed', { error: { config: { headers: { accessToken: 'super-secret-value' } } } });

    expect(lines[0][1]).not.toContain('super-secret-value');
    expect(lines[0][1]).toContain('[redacted]');
  });

  it('Log_ShouldRedactValue_WhenKeyIsPassword', () => {
    const { logger, lines } = capture('info');

    logger.info('Request failed', { error: { config: { headers: { password: 'super-secret-value' } } } });

    expect(lines[0][1]).not.toContain('super-secret-value');
    expect(lines[0][1]).toContain('[redacted]');
  });

  it('Log_ShouldRedactValue_WhenKeyIsSecret', () => {
    const { logger, lines } = capture('info');

    logger.info('Request failed', { error: { config: { headers: { secret: 'super-secret-value' } } } });

    expect(lines[0][1]).not.toContain('super-secret-value');
    expect(lines[0][1]).toContain('[redacted]');
  });

  it('Log_ShouldWriteErrorsAndWarningsToStderrAndRestToStdout_WhenDefaultWriterIsUsed', () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);

    logAllLevels(createLogger('trace'));

    const levelsOf = (spy: jest.SpyInstance): string[] => spy.mock.calls.map(([line]) => JSON.parse(String(line)).level);
    const written = { stdout: levelsOf(stdout), stderr: levelsOf(stderr) };
    stdout.mockRestore();
    stderr.mockRestore();

    expect(written).toEqual({ stdout: ['info', 'debug', 'trace'], stderr: ['error', 'warn'] });
  });
});
