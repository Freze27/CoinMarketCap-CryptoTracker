export interface ScheduledTask {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
}

export class TaskScheduler {
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Map<string, Promise<void>>();

  constructor(private readonly tasks: ScheduledTask[]) {}

  start(): void {
    for (const task of this.tasks) {
      this.timers.push(setInterval(() => this.runTask(task), task.intervalMs));
      console.log(`Task "${task.name}" is scheduled every ${task.intervalMs} ms`);
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
      console.warn(`Task "${task.name}" is still running, skipping this run`);
      return;
    }

    const startedAt = Date.now();
    const execution = task
      .run()
      .then((result) => {
        console.log(`Task "${task.name}" finished in ${Date.now() - startedAt} ms`, result);
      })
      .catch((error: unknown) => {
        console.error(`Task "${task.name}" failed after ${Date.now() - startedAt} ms:`, error);
      })
      .finally(() => {
        this.running.delete(task.name);
      });

    this.running.set(task.name, execution);
  }
}
