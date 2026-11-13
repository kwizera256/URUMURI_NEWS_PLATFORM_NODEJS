import mysql from 'mysql2/promise';
export const pool = mysql.createPool({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER ?? 'root', password: process.env.DB_PASS ?? '',
  database: process.env.DB_NAME ?? 'urumuri_news', charset: 'utf8mb4', dateStrings: true, connectionLimit: 8 });
export async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []): Promise<T[]> { const [r] = await pool.query(sql, args); return r as T[]; }
export async function run(sql: string, args: unknown[] = []): Promise<{ insertId: number; affectedRows: number }> { const [r] = await pool.query(sql, args); return r as { insertId: number; affectedRows: number }; }
