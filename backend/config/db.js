import mysql from "mysql2/promise";

let pool = null;

export async function getDbPool() {
  if (pool) return pool;

  const {
    DB_HOST,
    DB_PORT = 3306,
    DB_USER,
    DB_PASSWORD,
    DB_NAME
  } = process.env;

  if (!DB_HOST || !DB_USER || !DB_NAME) {
    return null;
  }

  try {
    pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT),
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      connectionLimit: 10,
      charset: "utf8mb4"
    });

    await pool.query("SELECT 1");
    return pool;
  } catch (error) {
    console.warn("[db] Falha ao conectar no MySQL, usando memoria local.", error.message);
    pool = null;
    return null;
  }
}
