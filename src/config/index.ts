interface AppConfig {
  port: number;
  databasePath: string;
}

export const config: AppConfig = {
  port: 3000,
  databasePath: './data/app.db',
};
