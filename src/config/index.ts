export interface AppConfig {
  port: number;
  databasePath: string;
}

const DEFAULT_PORT = 3000;
const DEFAULT_DATABASE_PATH = './data/app.db';

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, received "${value}"`);
  }

  return port;
}

function readDatabasePath(value: string | undefined): string {
  if (value === undefined) {
    return DEFAULT_DATABASE_PATH;
  }

  if (value.trim() === '') {
    throw new Error('DATABASE_PATH must not be empty');
  }

  return value.trim();
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: readPort(env.PORT),
    databasePath: readDatabasePath(env.DATABASE_PATH),
  };
}
