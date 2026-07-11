/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import type { SessionFsFileInfo, SessionFsProvider } from '@github/copilot-sdk';
import { dirname, join } from '../../../../base/common/path.js';

/**
 * Directory entry shape returned by {@link SessionFsProvider.readdirWithTypes}.
 * Mirrors the SDK's `SessionFsReaddirWithTypesEntry`, which is not re-exported
 * from the package root.
 */
type SessionFsReaddirWithTypesEntry = { name: string; type: 'file' | 'directory' };

/**
 * A {@link SessionFsProvider} that transparently maps the Copilot runtime's
 * session-filesystem operations onto a real directory on disk (the
 * {@link _baseDir}). Every path the SDK supplies is sandboxed under the base
 * directory so the runtime's session-scoped state (chiefly `events.jsonl`,
 * plus workspace metadata, checkpoints, etc.) lives in one place we control.
 *
 * This is the seam used to *import* a translated conversation: the caller
 * pre-writes a synthesized `events.jsonl` under the base directory at the
 * runtime's `sessionStatePath`, then resumes the session — the SDK reads that
 * log through this provider and reconstitutes editable turns.
 *
 * Paths from the runtime may be absolute (per the configured path conventions);
 * they are treated as relative to {@link _baseDir} so nothing escapes it.
 */
export class DiskSessionFsProvider implements SessionFsProvider {

	constructor(private readonly _baseDir: string) { }

	/** Maps a runtime-supplied SessionFs path onto a real path under the base dir. */
	private _resolve(sessionFsPath: string): string {
		// Normalize separators and strip any leading root (`/`, `\`, or a drive
		// like `C:`) so the path is always resolved *within* the base directory.
		const normalized = sessionFsPath.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, '').replace(/^\/+/, '');
		// Defensively reject parent-traversal segments so a runtime-supplied path
		// can never resolve outside the base directory.
		if (normalized.split('/').some(segment => segment === '..')) {
			throw new Error(`Invalid SessionFs path '${sessionFsPath}'`);
		}
		return join(this._baseDir, normalized);
	}

	async readFile(path: string): Promise<string> {
		return fs.readFile(this._resolve(path), 'utf8');
	}

	async writeFile(path: string, content: string, mode?: number): Promise<void> {
		const target = this._resolve(path);
		await fs.mkdir(dirname(target), { recursive: true });
		await fs.writeFile(target, content, mode !== undefined ? { mode } : undefined);
	}

	async appendFile(path: string, content: string, mode?: number): Promise<void> {
		const target = this._resolve(path);
		await fs.mkdir(dirname(target), { recursive: true });
		await fs.appendFile(target, content, mode !== undefined ? { mode } : undefined);
	}

	async exists(path: string): Promise<boolean> {
		try {
			await fs.stat(this._resolve(path));
			return true;
		} catch {
			return false;
		}
	}

	async stat(path: string): Promise<SessionFsFileInfo> {
		const stats = await fs.stat(this._resolve(path));
		return {
			isFile: stats.isFile(),
			isDirectory: stats.isDirectory(),
			size: stats.size,
			mtime: stats.mtime.toISOString(),
			birthtime: stats.birthtime.toISOString(),
		};
	}

	async mkdir(path: string, recursive: boolean, mode?: number): Promise<void> {
		await fs.mkdir(this._resolve(path), { recursive, ...(mode !== undefined ? { mode } : {}) });
	}

	async readdir(path: string): Promise<string[]> {
		return fs.readdir(this._resolve(path));
	}

	async readdirWithTypes(path: string): Promise<SessionFsReaddirWithTypesEntry[]> {
		const entries = await fs.readdir(this._resolve(path), { withFileTypes: true });
		return entries.map(entry => ({
			name: entry.name,
			type: entry.isDirectory() ? 'directory' : 'file',
		} satisfies SessionFsReaddirWithTypesEntry));
	}

	async rm(path: string, recursive: boolean, force: boolean): Promise<void> {
		await fs.rm(this._resolve(path), { recursive, force });
	}

	async rename(src: string, dest: string): Promise<void> {
		const target = this._resolve(dest);
		await fs.mkdir(dirname(target), { recursive: true });
		await fs.rename(this._resolve(src), target);
	}
}
