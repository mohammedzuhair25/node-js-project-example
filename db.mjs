import mysql from 'mysql2/promise';
import { requireSecret, getSecret } from './secrets.mjs';

function readConfig() {
  return {
    host: requireSecret('MYSQL_HOST', 'mysql-host'),
    port: Number.parseInt(getSecret('MYSQL_PORT', 'mysql-port', '3306'), 10),
    user: requireSecret('MYSQL_USER', 'mysql-user'),
    password: requireSecret('MYSQL_PASSWORD', 'mysql-password'),
    database: requireSecret('MYSQL_DATABASE', 'mysql-database'),
    table: getSecret('MYSQL_EXAMPLE_TABLE', 'mysql-table', 'example'),
    connectionLimit: Number.parseInt(getSecret('MYSQL_CONNECTION_LIMIT', 'mysql-connection-limit', '10'), 10),
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
