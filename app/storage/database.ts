import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { generateId } from '../shared/utils.js';
import { DEFAULT_SETTINGS } from '../shared/types.js';
import type { AppSettings, Project, UsageRecord } from '../shared/types.js';
import { RECENT_PROJECTS_LIMIT } from '../shared/constants.js';

let db: Database.Database;

function getDbPath(): string {
  try {
    return path.join(app.getPath('userData'), 'ai-studio.db');
  } catch {
    return path.join(process.env.HOME || '.', '.ai-studio', 'ai-studio.db');
  }
}

export function initDatabase(): void {
  const dbPath = getDbPath();

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  const fs = require('fs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
}

function createTables(): void {
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS usage (
      id TEXT PRIMARY KEY,
      user_id TEXT DEFAULT 'local',
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects(last_opened DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage(timestamp DESC);
  `);

  // Seed default settings if none exist
  const count = db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number };
  if (count.count === 0) {
    const insert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const entries = Object.entries(DEFAULT_SETTINGS);
    const transaction = db.transaction(() => {
      for (const [key, value] of entries) {
        insert.run(key, JSON.stringify(value));
      }
    });
    transaction();
  }
}

export function getSettings(): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings as AppSettings;
}

export function setSettings(updates: Record<string, unknown>): void {
  const insert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      insert.run(key, JSON.stringify(value));
    }
  });
  transaction();
}

export function resetSettings(): void {
  db.prepare('DELETE FROM settings').run();
  const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insert.run(key, JSON.stringify(value));
    }
  });
  transaction();
}

export function listProjects(): Project[] {
  return db
    .prepare('SELECT id, name, path, last_opened as lastOpened, created FROM projects ORDER BY last_opened DESC')
    .all() as Project[];
}

export function addProject(name: string, projectPath: string): Project {
  const existing = db
    .prepare('SELECT id, name, path, last_opened as lastOpened, created FROM projects WHERE path = ?')
    .get(projectPath) as Project | undefined;

  if (existing) {
    db.prepare('UPDATE projects SET last_opened = ? WHERE id = ?').run(Date.now(), existing.id);
    return { ...existing, lastOpened: Date.now() };
  }

  const project: Project = {
    id: generateId(),
    name,
    path: projectPath,
    lastOpened: Date.now(),
    created: Date.now(),
  };

  db.prepare(
    'INSERT INTO projects (id, name, path, last_opened, created) VALUES (?, ?, ?, ?, ?)'
  ).run(project.id, project.name, project.path, project.lastOpened, project.created);

  return project;
}

export function deleteProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function getRecentProjects(): Project[] {
  return db
    .prepare(
      `SELECT id, name, path, last_opened as lastOpened, created 
       FROM projects ORDER BY last_opened DESC LIMIT ?`
    )
    .all(RECENT_PROJECTS_LIMIT) as Project[];
}

export function trackUsage(action: string, details: string = ''): void {
  db.prepare(
    'INSERT INTO usage (id, action, details, timestamp) VALUES (?, ?, ?, ?)'
  ).run(generateId(), action, details, Date.now());
}

export function getUsageStats(days: number = 30): UsageRecord[] {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db
    .prepare(
      'SELECT id, user_id as userId, action, details, timestamp FROM usage WHERE timestamp > ? ORDER BY timestamp DESC'
    )
    .all(since) as UsageRecord[];
}
