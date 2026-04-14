import 'dotenv/config';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import client from 'prom-client';
import onFinished from 'on-finished';
import { createMySqlService } from './db.mjs';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const startedAt = new Date().toISOString();
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

export function createApp({ db } = {}) {
  const app = express();
  const resolvedDb = db ?? createMySqlService();

  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Node.js API with Metrics',
        version: '1.0.0',
        description: 'API with Swagger docs, Prometheus metrics, and MySQL connectivity',
      },
    },
    apis: ['./server.mjs'],
  };

  app.locals.db = resolvedDb;

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerJsdoc(swaggerOptions)));
  app.use(express.json());
  app.use((req, res, next) => {
    if (req.path === '/metrics') return next();

    const method = req.method;
    const start = process.hrtime();
    const reqSize = req.headers['content-length'] ? Number.parseInt(req.headers['content-length'], 10) : 0;

    let responseBytes = 0;
    const originalWrite = res.write;
    const originalEnd = res.end;

    res.write = function write(chunk, ...args) {
      if (chunk) responseBytes += Buffer.byteLength(chunk);
      return originalWrite.apply(res, [chunk, ...args]);
    };

    res.end = function end(chunk, ...args) {
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

  app.get('/', (req, res) => {
    res.json({
      message: 'Hello World MZM and Yousif!',
      mysqlDatabase: resolvedDb.config.database,
      exampleTable: resolvedDb.config.table,
    });
  });

  app.get('/hello/:name', (req, res) => res.send(`Hello, ${req.params.name}!`));

  app.get('/livez', (req, res) =>
    res.status(200).json({
      status: 'alive',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  );

  app.get('/readyz', async (req, res) => {
    const ready = await resolvedDb.checkReadiness();

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      startedAt,
      timestamp: new Date().toISOString(),
      mysqlDatabase: resolvedDb.config.database,
    });
  });

  app.get('/example-record', async (req, res, next) => {
    try {
      const id = req.query.id === undefined ? undefined : Number.parseInt(req.query.id, 10);

      if (req.query.id !== undefined && Number.isNaN(id)) {
        return res.status(400).json({ message: 'Query parameter "id" must be an integer.' });
      }

      const record = await resolvedDb.queryExampleRecord(id);

      if (!record) {
        return res.status(404).json({ message: `No record found in table "${resolvedDb.config.table}".` });
      }

      return res.status(200).json({
        table: resolvedDb.config.table,
        record,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      message: 'Database query failed.',
      error: error.message,
    });
  });

  return app;
}

const app = process.env.NODE_ENV === 'test' ? express() : createApp();

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(port, () => {
    console.log(`Server running at http://127.0.0.1:${port}`);
    console.log(`Swagger docs: http://127.0.0.1:${port}/api-docs`);
    console.log(`Prometheus metrics: http://127.0.0.1:${port}/metrics`);
    console.log(`Readiness probe: http://127.0.0.1:${port}/readyz`);
    console.log(`Liveness probe: http://127.0.0.1:${port}/livez`);
  });

  const shutdown = async () => {
    await app.locals.db.close();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default app;
