import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

let db: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'ai-studio.db');

  // Ensure directory exists
  const dir = path.dirname(resolvedPath);
  const fs = require('fs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initTables(db);
  return db;
}

function initTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      last_opened INTEGER NOT NULL,
      created INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      timestamp INTEGER NOT NULL
    );
  `);
}

export function logUsage(action: string, details: string = ''): void {
  const database = getDatabase();
  database.prepare(
    'INSERT INTO usage_logs (id, action, details, timestamp) VALUES (?, ?, ?, ?)'
  ).run(uuidv4(), action, details, Date.now());
}

export function getUsageStats(days: number = 30): Array<{ action: string; count: number }> {
  const database = getDatabase();
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return database.prepare(
    'SELECT action, COUNT(*) as count FROM usage_logs WHERE timestamp > ? GROUP BY action ORDER BY count DESC'
  ).all(since) as Array<{ action: string; count: number }>;
}
