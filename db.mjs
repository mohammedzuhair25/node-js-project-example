import mysql from 'mysql2/promise';

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readConfig() {
  return {
    host: requireEnv('MYSQL_HOST'),
    port: Number.parseInt(process.env.MYSQL_PORT ?? '3306', 10),
    user: requireEnv('MYSQL_USER'),
    password: requireEnv('MYSQL_PASSWORD'),
    database: requireEnv('MYSQL_DATABASE'),
    table: process.env.MYSQL_EXAMPLE_TABLE ?? 'example',
    connectionLimit: Number.parseInt(process.env.MYSQL_CONNECTION_LIMIT ?? '10', 10),
  };
}

function assertSafeIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier "${identifier}" provided.`);
  }
}

export function createMySqlService(config = readConfig()) {
  assertSafeIdentifier(config.table);

  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: config.connectionLimit,
    queueLimit: 0,
  });

  return {
    config,
    async checkReadiness() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    async queryExampleRecord(id) {
      const sql =
        id === undefined
          ? `SELECT * FROM \`${config.table}\` ORDER BY id ASC LIMIT 1`
          : `SELECT * FROM \`${config.table}\` WHERE id = ? LIMIT 1`;
      const params = id === undefined ? [] : [id];
      const [rows] = await pool.query(sql, params);
      return rows[0] ?? null;
    },
    async close() {
      await pool.end();
    },
  };
}
