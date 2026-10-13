import type { Logger } from '../logger/logger';

export interface ScheduledTask {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

export class TaskScheduler {
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly tasks: ScheduledTask[],
    private readonly logger: Logger,
  ) {}

  start(): void {
    for (const task of this.tasks) {
      this.timers.push(setInterval(() => this.runTask(task), task.intervalMs));
      this.logger.info('Task scheduled', { task: task.name, intervalMs: task.intervalMs });
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.timers.splice(0)) {
      clearInterval(timer);
    }

    await Promise.all(this.running.values());
  }

  private runTask(task: ScheduledTask): void {
    if (this.running.has(task.name)) {
      this.logger.warn('Task is still running, skipping this run', { task: task.name });
      return;
    }

    const startedAt = Date.now();
    const execution = task
      .run()
      .then((result) => {
        this.logger.info('Task finished', { task: task.name, durationMs: Date.now() - startedAt, result });
      })
      .catch((error: unknown) => {
        this.logger.error('Task failed', { task: task.name, durationMs: Date.now() - startedAt, error });
      })
      .finally(() => {
        this.running.delete(task.name);
      });

    this.running.set(task.name, execution);
  }
}
