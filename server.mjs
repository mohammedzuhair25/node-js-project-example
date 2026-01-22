// server.mjs
// -------------------------------
// Node.js API with Swagger and Prometheus metrics
// - Default Node metrics prefixed with 'myapp_'
// - Explicit SUCCESS metrics (2xx)
// - Safe route labels
// - Accurate request/response sizes
// -------------------------------

import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import client from 'prom-client';
import onFinished from 'on-finished';

const app = express();
const port = 3000;

/* ------------------------------------------------
 * 1. Swagger setup
 * ------------------------------------------------ */
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

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* ------------------------------------------------
 * 2. Prometheus setup
 * ------------------------------------------------ */

// Prefix default Node.js metrics
client.collectDefaultMetrics({ prefix: 'myapp_' });

const HTTP_APP_LABEL = 'node-swagger-metrics';

// Total requests
const httpRequestCounter = new client.Counter({
  name: 'myapp_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'app'],
});

// Request duration
const httpRequestDuration = new client.Histogram({
  name: 'myapp_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code', 'app'],
  buckets: [0.1, 0.3, 0.5, 1, 1.5, 2, 5],
});

// Request size
const httpRequestSize = new client.Histogram({
  name: 'myapp_http_request_size_bytes',
  help: 'HTTP request size in bytes',
  labelNames: ['method', 'route', 'status_code', 'app'],
  buckets: [100, 500, 1000, 5000, 10000, 50000],
});

// Response size
const httpResponseSize = new client.Histogram({
  name: 'myapp_http_response_size_bytes',
  help: 'HTTP response size in bytes',
  labelNames: ['method', 'route', 'status_code', 'app'],
  buckets: [100, 500, 1000, 5000, 10000, 50000],
});

// ✅ SUCCESS metric (2xx only)
const httpRequestSuccessCounter = new client.Counter({
  name: 'myapp_http_requests_success_total',
  help: 'Total number of successful HTTP requests (2xx)',
  labelNames: ['method', 'route', 'app'],
});

/* ------------------------------------------------
 * 3. Metrics middleware
 * ------------------------------------------------ */

app.use(express.json());

app.use((req, res, next) => {
  // Do not observe Prometheus scraping itself
  if (req.path === '/metrics') {
    return next();
  }

  const method = req.method;
  const start = process.hrtime();

  // Request size
  const reqSize = req.headers['content-length']
    ? parseInt(req.headers['content-length'], 10)
    : 0;

  // Accurate response size tracking
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
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds + nanoseconds / 1e9;
    const statusCode = res.statusCode;

    // Safe route label
    const route =
      res.req.route?.path
        ? res.req.baseUrl + res.req.route.path
        : req.path;

    const commonLabels = {
      method,
      route,
      status_code: statusCode,
      app: HTTP_APP_LABEL,
    };

    httpRequestCounter.labels(commonLabels).inc();
    httpRequestDuration.labels(commonLabels).observe(duration);
    httpRequestSize.labels(commonLabels).observe(reqSize);
    httpResponseSize.labels(commonLabels).observe(responseBytes);

    // ✅ Success metric
    if (statusCode >= 200 && statusCode < 300) {
      httpRequestSuccessCounter
        .labels(method, route, HTTP_APP_LABEL)
        .inc();
    }
  });

  next();
});

/* ------------------------------------------------
 * 4. API endpoints
 * ------------------------------------------------ */

/**
 * @openapi
 * /:
 *   get:
 *     summary: Returns Hello World
 *     responses:
 *       200:
 *         description: Successful response
 */
app.get('/', (req, res) => {
  res.send('Hello World!');
});

/**
 * @openapi
 * /hello/{name}:
 *   get:
 *     summary: Returns a greeting
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Greeting message
 */
app.get('/hello/:name', (req, res) => {
  res.send(`Hello, ${req.params.name}!`);
});

/* ------------------------------------------------
 * 5. Metrics endpoint
 * ------------------------------------------------ */

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

/* ------------------------------------------------
 * 6. Start server
 * ------------------------------------------------ */

app.listen(port, () => {
  console.log(`Server running at http://127.0.0.1:${port}`);
  console.log(`Swagger docs: http://127.0.0.1:${port}/api-docs`);
  console.log(`Prometheus metrics: http://127.0.0.1:${port}/metrics`);
});

