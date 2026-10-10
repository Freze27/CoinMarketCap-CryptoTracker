import request from 'supertest';
import { AUTH_HEADER, createTestApp } from '../helpers/app';

describe('GET /health', () => {
  it('Health_ShouldReturn200_WhenDatabaseIsAvailable', async () => {
    const { app, db } = createTestApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'ok' });
    db.close();
  });

  it('Health_ShouldReturn503_WhenDatabaseIsUnavailable', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, db } = createTestApp();
    db.close();

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', database: 'unavailable' });
    consoleError.mockRestore();
  });
});

describe('unknown route', () => {
  it('UnknownRoute_ShouldReturn404_WhenRouteIsOutsideApi', async () => {
    const { app, db } = createTestApp();

    const response = await request(app).get('/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { message: 'Route GET /unknown not found' } });
    db.close();
  });

  it('UnknownRoute_ShouldReturn404_WhenApiRouteDoesNotExistAndTokenIsValid', async () => {
    const { app, db } = createTestApp();

    const response = await request(app).get('/api/unknown').set('Authorization', AUTH_HEADER);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { message: 'Route GET /api/unknown not found' } });
    db.close();
  });
});
