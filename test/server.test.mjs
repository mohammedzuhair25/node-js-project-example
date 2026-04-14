import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../server.mjs';

function createDbMock(overrides = {}) {
  return {
    config: {
      database: 'test_db',
      table: 'example',
    },
    checkReadiness: jest.fn().mockResolvedValue(true),
    queryExampleRecord: jest.fn().mockResolvedValue({ id: 1, name: 'demo row' }),
    close: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('API, health, and MySQL tests', () => {
  test('GET / returns app metadata', async () => {
    const app = createApp({ db: createDbMock() });
    const res = await request(app).get('/');

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Hello World MZM and Yousif!');
    expect(res.body.mysqlDatabase).toBe('test_db');
    expect(res.body.exampleTable).toBe('example');
  });

  test('GET /hello/:name returns greeting', async () => {
    const app = createApp({ db: createDbMock() });
    const res = await request(app).get('/hello/Mohammed');

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Hello, Mohammed!');
  });

  test('GET /livez returns liveness status', async () => {
    const app = createApp({ db: createDbMock() });
    const res = await request(app).get('/livez');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('alive');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.timestamp).toBeDefined();
  });

  test('GET /readyz returns readiness status from MySQL probe', async () => {
    const db = createDbMock();
    const app = createApp({ db });
    const res = await request(app).get('/readyz');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.mysqlDatabase).toBe('test_db');
    expect(db.checkReadiness).toHaveBeenCalled();
  });

  test('GET /readyz returns 503 when MySQL is unavailable', async () => {
    const app = createApp({
      db: createDbMock({
        checkReadiness: jest.fn().mockResolvedValue(false),
      }),
    });
    const res = await request(app).get('/readyz');

    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  test('GET /example-record returns the first example row', async () => {
    const db = createDbMock();
    const app = createApp({ db });
    const res = await request(app).get('/example-record');

    expect(res.statusCode).toBe(200);
    expect(res.body.table).toBe('example');
    expect(res.body.record).toEqual({ id: 1, name: 'demo row' });
    expect(db.queryExampleRecord).toHaveBeenCalledWith(undefined);
  });

  test('GET /example-record?id=7 returns a selected example row', async () => {
    const db = createDbMock();
    const app = createApp({ db });
    const res = await request(app).get('/example-record?id=7');

    expect(res.statusCode).toBe(200);
    expect(db.queryExampleRecord).toHaveBeenCalledWith(7);
  });

  test('GET /example-record validates id query parameter', async () => {
    const app = createApp({ db: createDbMock() });
    const res = await request(app).get('/example-record?id=abc');

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('must be an integer');
  });

  test('GET /example-record returns 404 when no row exists', async () => {
    const app = createApp({
      db: createDbMock({
        queryExampleRecord: jest.fn().mockResolvedValue(null),
      }),
    });
    const res = await request(app).get('/example-record');

    expect(res.statusCode).toBe(404);
  });

  test('GET /metrics exposes Prometheus metrics', async () => {
    const app = createApp({ db: createDbMock() });
    const res = await request(app).get('/metrics');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('myapp_http_requests_total');
  });
});
