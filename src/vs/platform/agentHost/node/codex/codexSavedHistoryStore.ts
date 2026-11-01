/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Database } from '@vscode/sqlite3';
import { execFile } from 'child_process';
import { createReadStream, promises as fs } from 'fs';
import { homedir } from 'os';
import { createZstdDecompress } from 'zlib';
import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { basename, join, resolve } from '../../../../base/common/path.js';
import { localize } from '../../../../nls.js';
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentCodexHomeEnvVar } from '../../common/agentService.js';
import type { Thread } from './protocol/generated/v2/Thread.js';

// Native storage versions used by the bundled Codex protocol (0.157).
const STATE_DATABASE = 'state_5.sqlite';
const HISTORY_DATABASE = 'thread_history_1.sqlite';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ROLLOUT_NAME = new RegExp(`-(?<thread>${UUID})(?:_(?<rollout>${UUID}))?\\.jsonl(?:\\.zst)?$`, 'i');

interface IHistoryBase {
	readonly threadId: string;
	readonly endByteOffset: number;
	readonly endOrdinal: number;
}

interface IRolloutHeader {
	readonly id: string;
	readonly historyBase?: IHistoryBase;
}

interface ICodexSavedStorage {
	readonly codexHome: string;
	readonly sqliteHome: string;
}

/** A disposable copy of native indexes, with source rollout paths kept intact for native lineage reads. */
export class CodexSavedHistoryStore {
	private readonly _sourceFiles = new Map<string, { readonly size: number; readonly mtimeMs: number }>();
	private _rolloutFiles: readonly string[] | undefined;

	private constructor(
		private readonly _scratch: string,
		private readonly _codexHome: string,
		private readonly _sqliteHome: string,
		private readonly _databases: ReadonlySet<string>,
	) { }

	static async snapshot(scratch: string, { codexHome, sqliteHome }: ICodexSavedStorage, token: CancellationToken): Promise<CodexSavedHistoryStore> {
		throwIfCancelled(token);
		const files = await fs.readdir(sqliteHome);
		const databases = new Set(files.filter(file => /^(?:state|thread_history)_\d+\.sqlite$/.test(file)));
		for (const database of databases) {
			throwIfCancelled(token);
			await withReadonlyDatabase(join(sqliteHome, database), async db => {
				const cancellation = token.onCancellationRequested(() => db.interrupt());
				try {
					await new Promise<void>((done, reject) => db.run('VACUUM INTO ?', [join(scratch, database)], error => error ? reject(error) : done()));
				} finally {
					cancellation.dispose();
				}
			});
		}
		for (const directory of ['sessions', 'archived_sessions']) {
			throwIfCancelled(token);
			const source = join(codexHome, directory);
			try {
				await fs.stat(source);
			} catch (error) {
				if (isNotFound(error)) {
					continue;
				}
				throw error;
			}
			// Cold native history methods only read these trees. The app-server
			// writes exclusively to its own home/index copies; no source config
			// or credentials enter that home.
			await fs.symlink(source, join(scratch, directory), process.platform === 'win32' ? 'junction' : 'dir');
		}
		return new CodexSavedHistoryStore(scratch, codexHome, sqliteHome, databases);
	}

	async validate(thread: Thread, token: CancellationToken): Promise<void> {
		const threadPath = thread.path;
		if (!threadPath) {
			throw incompleteHistory();
		}
		if (thread.historyMode === 'legacy') {
			const path = await fs.realpath(threadPath);
			const stat = await fs.stat(path);
			this._sourceFiles.set(path, { size: stat.size, mtimeMs: stat.mtimeMs });
			return;
		}
		if (!this._databases.has(STATE_DATABASE) || !this._databases.has(HISTORY_DATABASE)) {
			throw incompleteHistory();
		}
		await withReadonlyDatabase(join(this._scratch, HISTORY_DATABASE), async db => {
			const seen = new Set<string>();
			let path = await fs.realpath(threadPath);
			let cutoff: IHistoryBase | undefined;
			for (; ;) {
				throwIfCancelled(token);
				const groups = ROLLOUT_NAME.exec(basename(path))?.groups;
				const rolloutId = groups?.rollout ?? groups?.thread;
				if (!rolloutId || seen.has(rolloutId)) {
					throw incompleteHistory();
				}
				seen.add(rolloutId);
				const { header, bytes } = await this._readRolloutHeader(path, token);
				if ((!cutoff && header.id !== thread.id) || (cutoff && rolloutId !== cutoff.threadId)) {
					throw incompleteHistory();
				}
				const row = await getRow(db, 'SELECT next_rollout_byte_offset, next_rollout_ordinal FROM thread_history_projection_state WHERE thread_id = ?', [rolloutId]);
				const nextByte = row?.next_rollout_byte_offset;
				const nextOrdinal = row?.next_rollout_ordinal;
				if (!isOffset(nextByte) || !isOffset(nextOrdinal)
					|| (cutoff ? nextByte < cutoff.endByteOffset || nextOrdinal < cutoff.endOrdinal || bytes < cutoff.endByteOffset : nextByte !== bytes)) {
					throw incompleteHistory();
				}
				if (!header.historyBase) {
					return;
				}
				cutoff = header.historyBase;
				path = await this._findRollout(cutoff.threadId, token);
			}
		});
	}

	async validateUnchanged(thread: Thread, token: CancellationToken): Promise<void> {
		for (const [path, before] of this._sourceFiles) {
			throwIfCancelled(token);
			const after = await fs.stat(path);
			if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
				throw incompleteHistory();
			}
		}
		if (this._databases.has(STATE_DATABASE)) {
			await withReadonlyDatabase(join(this._sqliteHome, STATE_DATABASE), async db => {
				const row = await getRow(db, 'SELECT rollout_path FROM threads WHERE id = ?', [thread.id]);
				if (!row && thread.historyMode === 'legacy') {
					return;
				}
				if (typeof row?.rollout_path !== 'string' || !thread.path || await fs.realpath(row.rollout_path) !== await fs.realpath(thread.path)) {
					throw incompleteHistory();
				}
			});
		}
		if (thread.turns.length === 0 && thread.preview) {
			throw incompleteHistory();
		}
	}

	private async _readRolloutHeader(path: string, token: CancellationToken): Promise<{ readonly header: IRolloutHeader; readonly bytes: number }> {
		const before = await fs.stat(path);
		this._sourceFiles.set(path, { size: before.size, mtimeMs: before.mtimeMs });
		const input = createReadStream(path);
		const stream = path.endsWith('.zst') ? input.pipe(createZstdDecompress()) : input;
		input.on('error', error => stream.destroy(error));
		const cancellation = token.onCancellationRequested(() => { input.destroy(new CancellationError()); stream.destroy(new CancellationError()); });
		let bytes = 0;
		let prefix = Buffer.alloc(0);
		let header: IRolloutHeader | undefined;
		try {
			throwIfCancelled(token);
			for await (const chunk of stream) {
				if (!Buffer.isBuffer(chunk)) {
					throw incompleteHistory();
				}
				bytes += chunk.length;
				if (header) {
					continue;
				}
				prefix = Buffer.concat([prefix, chunk]);
				const newline = prefix.indexOf(10);
				if (newline >= 0) {
					header = parseRolloutHeader(prefix.subarray(0, newline).toString('utf8'));
					prefix = Buffer.alloc(0);
				} else if (prefix.length > 1024 * 1024) {
					throw incompleteHistory();
				}
			}
			if (!header) {
				throw incompleteHistory();
			}
			return { header, bytes };
		} finally {
			cancellation.dispose();
			input.destroy();
			stream.destroy();
		}
	}

	private async _findRollout(id: string, token: CancellationToken): Promise<string> {
		if (!this._rolloutFiles) {
			const files: string[] = [];
			const directories = ['sessions', 'archived_sessions'].map(directory => join(this._codexHome, directory));
			for (const directory of directories) {
				throwIfCancelled(token);
				let entries;
				try {
					entries = await fs.readdir(directory, { withFileTypes: true });
				} catch (error) {
					if (isNotFound(error)) {
						continue;
					}
					throw error;
				}
				for (const entry of entries) {
					const path = join(directory, entry.name);
					if (entry.isDirectory()) {
						directories.push(path);
					} else if (entry.isFile() && ROLLOUT_NAME.test(entry.name)) {
						files.push(path);
					}
				}
			}
			this._rolloutFiles = files;
		}
		const matches = this._rolloutFiles.filter(file => {
			const groups = ROLLOUT_NAME.exec(basename(file))?.groups;
			return (groups?.rollout ?? groups?.thread) === id;
		});
		if (matches.length !== 1) {
			throw incompleteHistory();
		}
		return matches[0];
	}
}

export async function resolveCodexSavedHistoryStorage(userHome: string, token: CancellationToken): Promise<ICodexSavedStorage> {
	await ensureUnmanagedNativeReader(token);
	const codexHome = resolve(process.env[AgentHostCodexAgentCodexHomeEnvVar] || join(userHome, '.codex'));
	const config = await readOptionalFile(join(codexHome, 'config.toml'));
	const systemConfig = await readOptionalFile(join(systemCodexDirectory(), 'config.toml'));
	const binaryArgs = process.env[AgentHostCodexAgentBinaryArgsEnvVar];
	if (binaryArgs && /sqlite_home|\bprofile\b/.test(binaryArgs)) {
		throw unsupportedStorage();
	}
	const configuredRoot = readCodexSqliteHome(config ?? '', codexHome, userHome)
		?? readCodexSqliteHome(systemConfig ?? '', systemCodexDirectory(), userHome);
	const environmentRoot = process.env.CODEX_SQLITE_HOME?.trim();
	const sqliteHome = configuredRoot ?? (environmentRoot ? resolveSqlitePath(environmentRoot, process.cwd(), userHome) : codexHome);
	return { codexHome, sqliteHome };
}

/** Only the unambiguous single-line root path is supported; this is not a general TOML decoder. */
export function readCodexSqliteHome(config: string, base: string, userHome = homedir()): string | undefined {
	const skippedValue = { quote: '', depth: 0 };
	let result: string | undefined;
	for (const line of config.split(/\r?\n/)) {
		const text = line.trim();
		if (skippedValue.quote || skippedValue.depth) {
			skipCodexConfigValue(text, skippedValue);
			continue;
		}
		if (text.startsWith('[')) {
			break;
		}
		if (!text || text.startsWith('#')) {
			continue;
		}
		const match = /^(?<key>[\w.-]+|"(?:[^"\\]|\\.)*"|'[^']*')\s*=\s*(?<value>.*)$/.exec(text);
		if (!match?.groups) {
			throw unsupportedStorage();
		}
		const rawKey = match.groups.key;
		let key: string;
		try {
			key = rawKey.startsWith('"') ? JSON.parse(rawKey) : rawKey.startsWith('\'') ? rawKey.slice(1, -1) : rawKey;
		} catch {
			throw unsupportedStorage();
		}
		const value = match.groups.value;
		if (key === 'profile') {
			throw unsupportedStorage();
		}
		if (key !== 'sqlite_home') {
			skipCodexConfigValue(value, skippedValue);
			continue;
		}
		if (result !== undefined || value.startsWith('"""') || value.startsWith('\'\'\'')) {
			throw unsupportedStorage();
		}
		const quoted = /^(?<path>"(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/.exec(value)?.groups?.path;
		if (!quoted) {
			throw unsupportedStorage();
		}
		try {
			const path: unknown = quoted.startsWith('"') ? JSON.parse(quoted) : quoted.slice(1, -1);
			if (typeof path !== 'string' || !path || path.includes('\0')) {
				throw unsupportedStorage();
			}
			result = resolveSqlitePath(path, base, userHome);
		} catch {
			throw unsupportedStorage();
		}
	}
	if (skippedValue.quote || skippedValue.depth) {
		throw unsupportedStorage();
	}
	return result;
}

function resolveSqlitePath(path: string, base: string, userHome: string): string {
	if (path === '~') {
		return userHome;
	}
	if (path.startsWith('~/')) {
		return resolve(userHome, path.slice(2).replace(/^\/+/, ''));
	}
	if (process.platform === 'win32' && path.startsWith('~\\')) {
		return resolve(userHome, path.slice(2).replace(/^\\+/, ''));
	}
	return resolve(base, path);
}

/** Skips unrelated TOML values without interpreting their contents or treating strings as root keys. */
function skipCodexConfigValue(line: string, state: { quote: string; depth: number }): void {
	for (let index = 0; index < line.length; index++) {
		const character = line[index];
		if (state.quote) {
			if (character === '\\' && state.quote.startsWith('"')) {
				index++;
			} else if (line.startsWith(state.quote, index)) {
				index += state.quote.length - 1;
				state.quote = '';
			}
		} else if (character === '#') {
			return;
		} else if (character === '"' || character === '\'') {
			state.quote = line.startsWith(character.repeat(3), index) ? character.repeat(3) : character;
			index += state.quote.length - 1;
		} else if (character === '[' || character === '{') {
			state.depth++;
		} else if (character === ']' || character === '}') {
			state.depth--;
			if (state.depth < 0) {
				throw unsupportedStorage();
			}
		}
	}
	if (state.quote.length === 1) {
		throw unsupportedStorage();
	}
}

async function ensureUnmanagedNativeReader(token: CancellationToken): Promise<void> {
	for (const name of ['requirements.toml', 'managed_config.toml']) {
		if ((await readOptionalFile(join(systemCodexDirectory(), name)))?.trim()) {
			throw unsupportedNativeRequirements();
		}
	}
	if (process.platform === 'darwin') {
		for (const key of ['config_toml_base64', 'requirements_toml_base64']) {
			throwIfCancelled(token);
			const exists = await new Promise<boolean>((done, reject) => execFile('/usr/bin/defaults', ['read', 'com.openai.codex', key], { timeout: 5_000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
				if (!error) {
					done(stdout.trim().length > 0);
				} else if (error.code === 1) {
					done(false);
				} else {
					reject(unsupportedNativeRequirements());
				}
			}));
			if (exists) {
				throw unsupportedNativeRequirements();
			}
		}
	}
	throwIfCancelled(token);
}

function systemCodexDirectory(): string {
	return process.platform === 'win32' ? join(process.env.ProgramData || 'C:\\ProgramData', 'OpenAI', 'Codex') : '/etc/codex';
}

function parseRolloutHeader(line: string): IRolloutHeader {
	const record: unknown = JSON.parse(line);
	if (!isObject(record) || record.type !== 'session_meta' || !isObject(record.payload)
		|| typeof record.payload.id !== 'string' || record.payload.history_mode !== 'paginated') {
		throw incompleteHistory();
	}
	const base = record.payload.history_base;
	if (base === undefined || base === null) {
		return { id: record.payload.id };
	}
	if (!isObject(base) || typeof base.thread_id !== 'string' || !isOffset(base.end_byte_offset) || !isOffset(base.end_ordinal_exclusive)) {
		throw incompleteHistory();
	}
	return { id: record.payload.id, historyBase: { threadId: base.thread_id, endByteOffset: base.end_byte_offset, endOrdinal: base.end_ordinal_exclusive } };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOffset(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNotFound(error: unknown): boolean {
	return isObject(error) && error.code === 'ENOENT';
}

async function readOptionalFile(path: string): Promise<string | undefined> {
	try {
		return await fs.readFile(path, 'utf8');
	} catch (error) {
		if (isNotFound(error)) {
			return undefined;
		}
		throw error;
	}
}

async function withReadonlyDatabase<T>(path: string, read: (db: Database) => Promise<T>): Promise<T> {
	const sqlite = await import('@vscode/sqlite3');
	const db = await new Promise<Database>((done, reject) => {
		const database = new sqlite.default.Database(path, sqlite.default.OPEN_READONLY, error => error ? reject(error) : done(database));
	});
	try {
		return await read(db);
	} finally {
		await new Promise<void>((done, reject) => db.close(error => error ? reject(error) : done()));
	}
}

function getRow(db: Database, sql: string, parameters: readonly string[]): Promise<Record<string, unknown> | undefined> {
	return new Promise((done, reject) => db.get(sql, parameters, (error: Error | null, row: Record<string, unknown> | undefined) => error ? reject(error) : done(row)));
}

function unsupportedStorage(): Error {
	return new Error(localize('codex.savedChat.storageConfiguration', "The saved Codex storage location could not be resolved from its configuration."));
}

function unsupportedNativeRequirements(): Error {
	return new Error(localize('codex.savedChat.nativeRequirements', "The saved Codex transcript cannot be read without starting its managed native runtime."));
}

function incompleteHistory(): Error {
	return new Error(localize('codex.savedChat.incompleteHistory', "The saved Codex transcript is incomplete and could not be read."));
}

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}
