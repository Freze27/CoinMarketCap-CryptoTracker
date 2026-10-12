import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';
import request from 'supertest';
import type { Database } from '../src/db/database';
import { TaskScheduler } from '../src/jobs/task-scheduler';
import { registerGracefulShutdown } from '../src/shutdown';
import { createTestApp } from './helpers/app';

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
  let consoleError: jest.SpyInstance;

  function register(scheduler: TaskScheduler, timeoutMs = 5000): void {
    registerGracefulShutdown({ server, scheduler, db, timeoutMs, processRef: fakeProcess as never });
  }

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fakeProcess = createFakeProcess();

    const testApp = createTestApp();
    db = testApp.db;
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

  it.each(['SIGINT', 'SIGTERM'])('Shutdown_ShouldStopSchedulerCloseServerAndDatabaseAndExitWith0_WhenSignalIs%s', async (signal) => {
    const scheduler = new TaskScheduler([]);
    const stop = jest.spyOn(scheduler, 'stop');
    register(scheduler);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit(signal);
    await exited;

    expect(stop).toHaveBeenCalledTimes(1);
    expect(server.listening).toBe(false);
    expect(db.isOpen).toBe(false);
    expect(fakeProcess.exit).toHaveBeenCalledWith(0);
  });

  it('Shutdown_ShouldServeRequestsBeforeSignal_WhenServerIsRunning', async () => {
    register(new TaskScheduler([]));

    const response = await request(server).get('/health');

    expect(response.status).toBe(200);
    expect(fakeProcess.exit).not.toHaveBeenCalled();
  });

  it('Shutdown_ShouldClearTimersOfScheduledTasks_WhenSignalIsReceived', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const run = jest.fn().mockResolvedValue(undefined);
    const scheduler = new TaskScheduler([{ name: 'task', intervalMs: 1000, run }]);
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
    const scheduler = new TaskScheduler([]);
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
    const scheduler = new TaskScheduler([]);
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
    const scheduler = new TaskScheduler([]);
    jest.spyOn(scheduler, 'stop').mockRejectedValue(new Error('cannot stop'));
    register(scheduler);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit('SIGTERM');
    await exited;

    expect(fakeProcess.exit).toHaveBeenCalledWith(1);
    expect(consoleError).toHaveBeenCalledWith('Shutdown failed:', expect.any(Error));
  });

  it('Shutdown_ShouldForceExitWith1_WhenShutdownDoesNotFinishInTime', async () => {
    const scheduler = new TaskScheduler([]);
    jest.spyOn(scheduler, 'stop').mockReturnValue(new Promise(() => undefined));
    register(scheduler, 100);
    const exited = waitForExit(fakeProcess);

    fakeProcess.emit('SIGTERM');
    await exited;

    expect(fakeProcess.exit).toHaveBeenCalledWith(1);
    expect(consoleError).toHaveBeenCalledWith('Shutdown did not finish in 100 ms, forcing exit');
  });
});
