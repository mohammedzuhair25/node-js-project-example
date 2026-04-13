import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import client from 'prom-client';
import onFinished from 'on-finished';

const app = express();
const port = 3000;

/* ----------------- Swagger setup ----------------- */
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Node.js API with Metrics',
      version: '1.0.0',
      description: 'API with Swagger docs and Prometheus metrics',
    },
  },
  apis: ['./server.mjs'],
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerOptions)));

/* ---------------- Prometheus setup ---------------- */
const HTTP_APP_LABEL = 'node-swagger-metrics';
client.collectDefaultMetrics({ prefix: 'myapp_' });

const httpRequestCounter = new client.Counter({
  name: 'myapp_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'app'],
});
const httpRequestDuration = new client.Histogram({
  name: 'myapp_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'app'],
  buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5],
});
const httpRequestSize = new client.Histogram({
  name: 'myapp_http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'route', 'status_code', 'app'],
  buckets: [100, 500, 1000, 5000, 10000, 50000],
});
const httpResponseSize = new client.Histogram({
  name: 'myapp_http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'route', 'status_code', 'app'],
  buckets: [100, 500, 1000, 5000, 10000, 50000],
});
const httpRequestSuccessCounter = new client.Counter({
  name: 'myapp_http_requests_success_total',
  help: 'Total number of successful HTTP requests (2xx)',
  labelNames: ['method', 'route', 'app'],
});

/* ---------------- Metrics middleware ---------------- */
app.use(express.json());
app.use((req, res, next) => {
  if (req.path === '/metrics') return next();

  const method = req.method;
  const start = process.hrtime();
  const reqSize = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;

  let responseBytes = 0;
  const originalWrite = res.write;
  const originalEnd = res.end;
  res.write = function (chunk, ...args) {
    if (chunk) responseBytes += Buffer.byteLength(chunk);
    return originalWrite.apply(res, [chunk, ...args]);
  };
  res.end = function (chunk, ...args) {
    if (chunk) responseBytes += Buffer.byteLength(chunk);
    return originalEnd.apply(res, [chunk, ...args]);
  };

  onFinished(res, () => {
    const [sec, nano] = process.hrtime(start);
    const duration = sec + nano / 1e9;
    const statusCode = res.statusCode;
    const route = res.req.route?.path ? res.req.baseUrl + res.req.route.path : req.path;

    const labels = { method, route, status_code: statusCode, app: HTTP_APP_LABEL };

    httpRequestCounter.inc(labels);
    httpRequestDuration.observe(labels, duration);
    httpRequestSize.observe(labels, reqSize);
    httpResponseSize.observe(labels, responseBytes);

    if (statusCode >= 200 && statusCode < 300) {
      httpRequestSuccessCounter.inc({ method, route, app: HTTP_APP_LABEL });
    }
  });

  next();
});

/* ---------------- API endpoints ---------------- */
app.get('/', (req, res) => res.send('Hello World MZM!'));
app.get('/hello/:name', (req, res) => res.send(`Hello, ${req.params.name}!`));

/* ---------------- Metrics endpoint ---------------- */
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

/* ---------------- Start server ---------------- */
// Only start server if NOT in test mode
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`🚀 Server running at http://127.0.0.1:${port}`);
    console.log(`📚 Swagger docs: http://127.0.0.1:${port}/api-docs`);
    console.log(`📊 Prometheus metrics: http://127.0.0.1:${port}/metrics`);
  });
}

// Export app for Jest
export default app;
