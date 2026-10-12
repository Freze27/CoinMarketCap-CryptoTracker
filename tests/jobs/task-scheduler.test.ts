import { TaskScheduler } from '../../src/jobs/task-scheduler';

const INTERVAL = 1000;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('TaskScheduler', () => {
  let consoleLog: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('Start_ShouldNotRunTask_WhenIntervalHasNotPassed', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: INTERVAL, run }]);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(INTERVAL - 1);

    expect(run).not.toHaveBeenCalled();
    await scheduler.stop();
  });

  it('Start_ShouldRunTaskOnEveryInterval_WhenTimePasses', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: INTERVAL, run }]);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(run).toHaveBeenCalledTimes(3);
    await scheduler.stop();
  });

  it('Start_ShouldRunEachTaskOnItsOwnInterval_WhenSeveralTasksAreScheduled', async () => {
    const fast = jest.fn().mockResolvedValue(undefined);
    const slow = jest.fn().mockResolvedValue(undefined);
    const scheduler = new TaskScheduler([
      { name: 'fast', intervalMs: INTERVAL, run: fast },
      { name: 'slow', intervalMs: INTERVAL * 2, run: slow },
    ]);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(INTERVAL * 4);

    expect(fast).toHaveBeenCalledTimes(4);
    expect(slow).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('Start_ShouldSkipRun_WhenPreviousRunIsStillInProgress', async () => {
    const firstRun = deferred();
    const run = jest.fn().mockReturnValueOnce(firstRun.promise).mockResolvedValue(undefined);
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: INTERVAL, run }]);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(run).toHaveBeenCalledTimes(1);
    expect(consoleWarn).toHaveBeenCalledWith('Task "task" is still running, skipping this run');

    firstRun.resolve();
    await jest.advanceTimersByTimeAsync(INTERVAL);

    expect(run).toHaveBeenCalledTimes(2);
    await scheduler.stop();
  });

  it('Start_ShouldKeepRunningTask_WhenPreviousRunFailed', async () => {
    const run = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: INTERVAL, run }]);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(INTERVAL * 2);

    expect(run).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Task "task" failed'), expect.any(Error));
    await scheduler.stop();
  });

  it('Start_ShouldLogResult_WhenRunSucceeds', async () => {
    const run = jest.fn().mockResolvedValue({ savedPrices: 2 });
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: INTERVAL, run }]);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(INTERVAL);

    expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Task "task" finished'), { savedPrices: 2 });
    await scheduler.stop();
  });

  it('Stop_ShouldClearTimersAndPreventFurtherRuns_WhenCalled', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: INTERVAL, run }]);
    scheduler.start();
    await jest.advanceTimersByTimeAsync(INTERVAL);

    await scheduler.stop();
    await jest.advanceTimersByTimeAsync(INTERVAL * 5);

    expect(run).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('Stop_ShouldWaitForRunningTask_WhenRunIsInProgress', async () => {
    const currentRun = deferred();
    const run = jest.fn().mockReturnValue(currentRun.promise);
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: INTERVAL, run }]);
    scheduler.start();
    await jest.advanceTimersByTimeAsync(INTERVAL);

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(stopped).toBe(false);

    currentRun.resolve();
    await stopping;

    expect(stopped).toBe(true);
  });

  it('Stop_ShouldResolve_WhenSchedulerWasNotStarted', async () => {
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: INTERVAL, run: jest.fn() }]);

    await expect(scheduler.stop()).resolves.toBeUndefined();
  });
});
