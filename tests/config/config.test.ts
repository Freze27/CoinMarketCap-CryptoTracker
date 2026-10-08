import { loadConfig } from '../../src/config';

describe('loadConfig', () => {
  it('LoadConfig_ShouldReturnDefaults_WhenVariablesAreNotSet', () => {
    expect(loadConfig({})).toEqual({ port: 3000, databasePath: './data/app.db' });
  });

  it('LoadConfig_ShouldReturnValuesFromEnvironment_WhenVariablesAreSet', () => {
    const config = loadConfig({ PORT: '8080', DATABASE_PATH: './storage/prices.db' });

    expect(config).toEqual({ port: 8080, databasePath: './storage/prices.db' });
  });

  it.each(['abc', '0', '65536', '3000.5', '-1'])('LoadConfig_ShouldThrow_WhenPortIs%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow('PORT must be an integer between 1 and 65535');
  });

  it('LoadConfig_ShouldThrow_WhenDatabasePathIsEmpty', () => {
    expect(() => loadConfig({ DATABASE_PATH: '  ' })).toThrow('DATABASE_PATH must not be empty');
  });
});
