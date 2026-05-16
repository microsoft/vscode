import { ipcMain, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { getLanguageFromPath, generateId } from '../shared/utils.js';
import { IGNORED_DIRECTORIES, IGNORED_FILES, MAX_FILE_SIZE } from '../shared/constants.js';
import { initDatabase, getSettings, setSettings, resetSettings, listProjects, addProject, deleteProject, getRecentProjects, trackUsage } from '../storage/database.js';
import { chatWithAI, completeWithAI, streamChatWithAI } from '../ai/openai.js';
import type { FileEntry, SearchOptions, SearchResult, AIChatRequest, AICompletionRequest } from '../shared/types.js';

const terminals = new Map<string, ChildProcess>();

export function registerFileHandlers(mainWindow: BrowserWindow): void {
  initDatabase();

  // ─── File Operations ───
  ipcMain.handle('file:read', async (_event, filePath: string): Promise<string> => {
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE})`);
    }
    return fs.readFile(filePath, 'utf-8');
  });

  ipcMain.handle('file:write', async (_event, filePath: string, content: string): Promise<void> => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle('file:delete', async (_event, filePath: string): Promise<void> => {
    await fs.unlink(filePath);
  });

  ipcMain.handle('file:rename', async (_event, oldPath: string, newPath: string): Promise<void> => {
    await fs.rename(oldPath, newPath);
  });

  ipcMain.handle('file:list', async (_event, dirPath: string): Promise<FileEntry[]> => {
    return listDirectory(dirPath);
  });

  ipcMain.handle('file:create', async (_event, filePath: string, content?: string): Promise<void> => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content || '', 'utf-8');
  });

  ipcMain.handle('file:search', async (_event, rootPath: string, query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    return searchInFiles(rootPath, query, options);
  });

  // ─── Directory Operations ───
  ipcMain.handle('dir:create', async (_event, dirPath: string): Promise<void> => {
    await fs.mkdir(dirPath, { recursive: true });
  });

  ipcMain.handle('dir:delete', async (_event, dirPath: string): Promise<void> => {
    await fs.rm(dirPath, { recursive: true, force: true });
  });

  // ─── Terminal Operations ───
  ipcMain.handle('terminal:create', (_event, id: string, cwd?: string): void => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
    const proc = spawn(shell, [], {
      cwd: cwd || process.env.HOME || '/',
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data: Buffer) => {
      mainWindow.webContents.send('terminal:data', id, data.toString());
    });

    proc.stderr?.on('data', (data: Buffer) => {
      mainWindow.webContents.send('terminal:data', id, data.toString());
    });

    proc.on('exit', () => {
      terminals.delete(id);
      mainWindow.webContents.send('terminal:data', id, '\r\n[Process exited]\r\n');
    });

    terminals.set(id, proc);
  });

  ipcMain.handle('terminal:write', (_event, id: string, data: string): void => {
    const proc = terminals.get(id);
    if (proc?.stdin?.writable) {
      proc.stdin.write(data);
    }
  });

  ipcMain.handle('terminal:resize', (_event, _id: string, _cols: number, _rows: number): void => {
    // resize handled by xterm-addon-fit on frontend
  });

  ipcMain.handle('terminal:kill', (_event, id: string): void => {
    const proc = terminals.get(id);
    if (proc) {
      proc.kill();
      terminals.delete(id);
    }
  });

  // ─── AI Operations ───
  ipcMain.handle('ai:chat', async (_event, request: AIChatRequest) => {
    const settings = getSettings();
    return chatWithAI(request, {
      apiKey: settings.aiApiKey,
      baseUrl: settings.aiBaseUrl,
      model: settings.aiModel,
    });
  });

  ipcMain.handle('ai:complete', async (_event, request: AICompletionRequest) => {
    const settings = getSettings();
    return completeWithAI(request, {
      apiKey: settings.aiApiKey,
      baseUrl: settings.aiBaseUrl,
      model: settings.aiModel,
    });
  });

  ipcMain.handle('ai:stream', async (_event, request: AIChatRequest) => {
    const settings = getSettings();
    const streamId = generateId();

    streamChatWithAI(
      request,
      {
        apiKey: settings.aiApiKey,
        baseUrl: settings.aiBaseUrl,
        model: settings.aiModel,
      },
      (chunk: string) => {
        mainWindow.webContents.send('ai:stream-data', streamId, chunk);
      },
      () => {
        mainWindow.webContents.send('ai:stream-end', streamId);
      },
      (error: string) => {
        mainWindow.webContents.send('ai:stream-error', streamId, error);
      }
    );

    return streamId;
  });

  // ─── Settings Operations ───
  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', (_event, settings: Record<string, unknown>) => {
    setSettings(settings);
  });

  ipcMain.handle('settings:reset', () => {
    resetSettings();
  });

  // ─── Project Operations ───
  ipcMain.handle('project:list', () => {
    return listProjects();
  });

  ipcMain.handle('project:open', async (_event, projectPath: string) => {
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) {
      throw new Error('Path is not a directory');
    }
    const name = path.basename(projectPath);
    const project = addProject(name, projectPath);
    trackUsage('project:open', projectPath);
    return project;
  });

  ipcMain.handle('project:create', (_event, name: string, projectPath: string) => {
    return addProject(name, projectPath);
  });

  ipcMain.handle('project:delete', (_event, id: string) => {
    deleteProject(id);
  });

  ipcMain.handle('project:recent', () => {
    return getRecentProjects();
  });
}

async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: FileEntry[] = [];

  const sortedEntries = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sortedEntries) {
    if (IGNORED_DIRECTORIES.has(entry.name) || IGNORED_FILES.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    const fileEntry: FileEntry = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory(),
    };

    if (entry.isDirectory()) {
      try {
        fileEntry.children = await listDirectory(fullPath);
      } catch {
        fileEntry.children = [];
      }
    } else {
      try {
        const stat = await fs.stat(fullPath);
        fileEntry.size = stat.size;
        fileEntry.modified = stat.mtimeMs;
      } catch {
        // skip stat errors
      }
    }

    result.push(fileEntry);
  }

  return result;
}

async function searchInFiles(
  rootPath: string,
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const searchQuery = options?.caseSensitive ? query : query.toLowerCase();

  async function walkDir(dirPath: string): Promise<void> {
    if (results.length >= 100) return;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= 100) break;
      if (IGNORED_DIRECTORIES.has(entry.name) || IGNORED_FILES.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else {
        try {
          const stat = await fs.stat(fullPath);
          if (stat.size > MAX_FILE_SIZE) continue;

          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const searchLine = options?.caseSensitive ? line : line.toLowerCase();
            const idx = searchLine.indexOf(searchQuery);

            if (idx !== -1) {
              results.push({
                filePath: fullPath,
                line: i + 1,
                column: idx + 1,
                match: line.substring(idx, idx + query.length),
                context: line.trim(),
              });
              if (results.length >= 100) break;
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  await walkDir(rootPath);
  return results;
}
