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
  it.each([
    ['error', ['error']],
    ['warn', ['error', 'warn']],
    ['info', ['error', 'warn', 'info']],
    ['debug', ['error', 'warn', 'info', 'debug']],
    ['trace', ['error', 'warn', 'info', 'debug', 'trace']],
    ['silent', []],
  ] as const)('Log_ShouldWriteOnlyLevelsUpToThreshold_WhenLevelIs%s', (level, expected) => {
    const { logger, lines } = capture(level);

    logAllLevels(logger);

    expect(lines.map(([entryLevel]) => entryLevel)).toEqual(expected);
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
