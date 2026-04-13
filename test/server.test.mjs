import request from 'supertest';
import app from '../server.mjs';

describe('API & Metrics Tests', () => {
  test('GET / returns Hello World MZM!', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Hello World MZM!');
  });

  test('GET /hello/:name returns greeting', async () => {
    const res = await request(app).get('/hello/Mohammed');
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Hello, Mohammed!');
  });

  test('GET /metrics exposes Prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('myapp_http_requests_total');
  });

  test('Success counter increases on 2xx', async () => {
    await request(app).get('/');
    const metrics = await request(app).get('/metrics');
    expect(metrics.text).toContain('myapp_http_requests_success_total');
  });
});