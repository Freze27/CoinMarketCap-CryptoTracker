import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import request from 'supertest';
import type { Database } from '../src/db/database';
import { TaskScheduler } from '../src/jobs/task-scheduler';
import type { Logger } from '../src/logger/logger';
import { registerGracefulShutdown } from '../src/shutdown';
import { createTestApp } from './helpers/app';
import type { LogEntry } from './helpers/logger';

type FakeProcess = EventEmitter & { exit: jest.Mock };

function createFakeProcess(): FakeProcess {
  return Object.assign(new EventEmitter(), { exit: jest.fn() });
}

function waitForExit(fakeProcess: FakeProcess): Promise<void> {
  return new Promise((resolve) => {
    fakeProcess.exit.mockImplementation(() => resolve());
  });
}

describe('registerGracefulShutdown', () => {
  let db: Database;
  let server: Server;
  let fakeProcess: FakeProcess;
  let logger: Logger;
  let logs: LogEntry[];

  function register(scheduler: TaskScheduler, timeoutMs = 5000): void {
    registerGracefulShutdown({ server, scheduler, db, logger, timeoutMs, processRef: fakeProcess as never });
  }

  beforeEach(async () => {
    fakeProcess = createFakeProcess();

    const testApp = createTestApp();
    ({ db, logger, logs } = testApp);
    server = await new Promise<Server>((resolve) => {
      const listening = testApp.app.listen(0, () => resolve(listening));
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (db.isOpen) {
      db.close();
    }
  });

  it('Shutdown_ShouldStopSchedulerCloseServerAndDatabaseAndExitWith0_WhenSignalIsSigint', async () => {
    const scheduler = new TaskScheduler([], logger);
    const stop = jest.spyOn(scheduler, 'stop');
    register(scheduler);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit('SIGINT');
    await exited;

    expect(stop).toHaveBeenCalledTimes(1);
    expect(server.listening).toBe(false);
    expect(db.isOpen).toBe(false);
    expect(fakeProcess.exit).toHaveBeenCalledWith(0);
    expect(logs).toContainEqual(
      expect.objectContaining({ level: 'info', message: 'Shutdown signal received', signal: 'SIGINT' }),
    );
    expect(logs).toContainEqual(expect.objectContaining({ level: 'info', message: 'Shutdown completed' }));
  });

  it('Shutdown_ShouldStopSchedulerCloseServerAndDatabaseAndExitWith0_WhenSignalIsSigterm', async () => {
    const scheduler = new TaskScheduler([], logger);
    const stop = jest.spyOn(scheduler, 'stop');
    register(scheduler);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit('SIGTERM');
    await exited;

    expect(stop).toHaveBeenCalledTimes(1);
    expect(server.listening).toBe(false);
    expect(db.isOpen).toBe(false);
    expect(fakeProcess.exit).toHaveBeenCalledWith(0);
    expect(logs).toContainEqual(
      expect.objectContaining({ level: 'info', message: 'Shutdown signal received', signal: 'SIGTERM' }),
    );
    expect(logs).toContainEqual(expect.objectContaining({ level: 'info', message: 'Shutdown completed' }));
  });

  it('Shutdown_ShouldServeRequestsBeforeSignal_WhenServerIsRunning', async () => {
    register(new TaskScheduler([], logger));

    const response = await request(server).get('/health');

    expect(response.status).toBe(200);
    expect(fakeProcess.exit).not.toHaveBeenCalled();
  });

  it('Shutdown_ShouldClearTimersOfScheduledTasks_WhenSignalIsReceived', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const run = jest.fn().mockResolvedValue(undefined);
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: 1000, run }], logger);
    scheduler.start();
    register(scheduler);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit('SIGTERM');
    await exited;
    await jest.advanceTimersByTimeAsync(10_000);

    expect(run).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('Shutdown_ShouldWaitForRunningTaskBeforeClosingDatabase_WhenTaskIsInProgress', async () => {
    let finishTask = (): void => undefined;
    const scheduler = new TaskScheduler([], logger);
    jest.spyOn(scheduler, 'stop').mockReturnValue(
      new Promise<void>((resolve) => {
        finishTask = resolve;
      }),
    );
    register(scheduler);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(db.isOpen).toBe(true);
    expect(fakeProcess.exit).not.toHaveBeenCalled();

    finishTask();
    await exited;

    expect(db.isOpen).toBe(false);
    expect(fakeProcess.exit).toHaveBeenCalledWith(0);
  });

  it('Shutdown_ShouldRunOnlyOnce_WhenSignalIsReceivedTwice', async () => {
    const scheduler = new TaskScheduler([], logger);
    const stop = jest.spyOn(scheduler, 'stop');
    register(scheduler);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit('SIGINT');
    fakeProcess.emit('SIGTERM');
    await exited;

    expect(stop).toHaveBeenCalledTimes(1);
    expect(fakeProcess.exit).toHaveBeenCalledTimes(1);
  });

  it('Shutdown_ShouldExitWith1_WhenSchedulerFailsToStop', async () => {
    const scheduler = new TaskScheduler([], logger);
    jest.spyOn(scheduler, 'stop').mockRejectedValue(new Error('cannot stop'));
    register(scheduler);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit('SIGTERM');
    await exited;

    expect(fakeProcess.exit).toHaveBeenCalledWith(1);
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: 'Shutdown failed',
        error: expect.objectContaining({ message: 'cannot stop' }),
      }),
    );
  });

  it('Shutdown_ShouldForceExitWith1_WhenShutdownDoesNotFinishInTime', async () => {
    const scheduler = new TaskScheduler([], logger);
    jest.spyOn(scheduler, 'stop').mockReturnValue(new Promise(() => undefined));
    register(scheduler, 100);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit('SIGTERM');
    await exited;

    expect(fakeProcess.exit).toHaveBeenCalledWith(1);
    expect(logs).toContainEqual(
      expect.objectContaining({ level: 'error', message: 'Shutdown did not finish in time, forcing exit', timeoutMs: 100 }),
    );
  });
});
