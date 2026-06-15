/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:stream';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';
import { LockMap } from '../../src/util/common/lock';
import { generateUuid } from '../../src/util/vs/base/common/uuid';
import { CurrentTestRunInfo } from './simulationContext';

const compress = promisify(zlib.brotliCompress);
const decompress = promisify(zlib.brotliDecompress);

/**
 * Yield to the libuv event loop.
 *
 * The previous `@keyv/sqlite` store was backed by the asynchronous `sqlite3`
 * driver, so every individual store operation resolved on a later loop tick.
 * Some consumers rely on that boundary: e.g. the panel multi-file edit flow
 * applies one code block's edits while the next code block's code-mapper request
 * is awaiting its cached response, so the next request is built against the
 * already-edited document. `node:sqlite`'s `DatabaseSync` is synchronous, so we
 * reintroduce the async boundary on every store operation to preserve that
 * interleaving (and thus compatibility with the recorded cache).
 */
function yieldEventLoop(): Promise<void> {
	return new Promise<void>(resolve => setImmediate(resolve));
}

const DefaultCachePath = process.env.VITEST ? path.resolve(__dirname, '..', 'simulation', 'cache') : path.resolve(__dirname, '..', 'test', 'simulation', 'cache');

async function getGitRoot(cwd: string): Promise<string> {
	const execAsync = promisify(exec);
	const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd });
	return stdout.trim();
}

/**
 * Minimal key/value store backed by Node's built-in `node:sqlite` module.
 *
 * It is wire-compatible with the on-disk format previously produced by
 * `keyv` + `@keyv/sqlite` so that the committed simulation cache databases
 * keep working: rows live in a `keyv` table, keys are namespaced as
 * `keyv:<key>` and values are stored as `{"value":<string>}` JSON.
 */
class SqliteKeyValueStore {
	private static readonly NAMESPACE = 'keyv';

	private readonly db: DatabaseSync;

	constructor(filePath: string) {
		this.db = new DatabaseSync(filePath);
		this.db.exec('PRAGMA busy_timeout = 5000');
		this.db.exec('CREATE TABLE IF NOT EXISTS keyv(key VARCHAR(255) PRIMARY KEY, value TEXT )');
	}

	private _namespacedKey(key: string): string {
		return `${SqliteKeyValueStore.NAMESPACE}:${key}`;
	}

	private static _decodeJsonBufferValue(value: string): string {
		if (value.startsWith(':base64:')) {
			return value.slice(':base64:'.length);
		}
		if (value.startsWith(':')) {
			return value.slice(1);
		}
		return value;
	}

	async get(key: string): Promise<string | undefined> {
		await yieldEventLoop();
		const row = this.db.prepare('SELECT value FROM keyv WHERE key = ?').get(this._namespacedKey(key)) as { value: string } | undefined;
		if (!row) {
			return undefined;
		}
		return SqliteKeyValueStore._decodeJsonBufferValue(JSON.parse(row.value).value as string);
	}

	async set(key: string, value: string): Promise<void> {
		await yieldEventLoop();
		this.db.prepare('INSERT OR REPLACE INTO keyv (key, value) VALUES (?, ?)').run(this._namespacedKey(key), JSON.stringify({ value }));
	}

	async has(key: string): Promise<boolean> {
		await yieldEventLoop();
		const row = this.db.prepare('SELECT 1 FROM keyv WHERE key = ?').get(this._namespacedKey(key));
		return row !== undefined;
	}

	*keys(): IterableIterator<string> {
		const prefix = `${SqliteKeyValueStore.NAMESPACE}:`;
		const rows = this.db.prepare('SELECT key FROM keyv').all() as { key: string }[];
		for (const row of rows) {
			yield row.key.startsWith(prefix) ? row.key.slice(prefix.length) : row.key;
		}
	}

	async disconnect(): Promise<void> {
		this.db.close();
	}
}

export class Cache extends EventEmitter {
	private static _Instance: Cache | undefined;
	static get Instance() {
		return this._Instance ?? (this._Instance = new Cache());
	}

	private readonly cachePath: string;
	private readonly layersPath: string;
	private readonly externalLayersPath?: string;

	private readonly base: SqliteKeyValueStore;
	private readonly layers: Map<string, SqliteKeyValueStore>;
	private activeLayer: Promise<SqliteKeyValueStore> | undefined;

	private gcBase: SqliteKeyValueStore | undefined;
	private gcBaseKeys: Set<string> | undefined;

	constructor(cachePath = DefaultCachePath) {
		super();

		this.cachePath = cachePath;
		this.layersPath = path.join(this.cachePath, 'layers');
		this.externalLayersPath = process.env.EXTERNAL_CACHE_LAYERS_PATH;

		if (!fs.existsSync(path.join(this.cachePath, 'base.sqlite'))) {
			throw new Error(`Base cache file does not exist as ${path.join(this.cachePath, 'base.sqlite')}.`);
		}

		if (this.externalLayersPath && !fs.existsSync(this.externalLayersPath)) {
			throw new Error(`External layers cache directory provided but it does not exist at ${this.externalLayersPath}.`);
		}

		fs.mkdirSync(this.layersPath, { recursive: true });
		this.base = new SqliteKeyValueStore(path.join(this.cachePath, 'base.sqlite'));

		this.layers = new Map();
		let layerFiles = fs.readdirSync(this.layersPath)
			.filter(file => file.endsWith('.sqlite'))
			.map(file => path.join(this.layersPath, file));

		if (this.externalLayersPath !== undefined) {
			const externalLayerFiles = fs.readdirSync(this.externalLayersPath)
				.filter(file => file.endsWith('.sqlite'))
				.map(file => path.join(this.externalLayersPath!, file));
			layerFiles = layerFiles.concat(externalLayerFiles);
		}

		for (const layerFile of layerFiles) {
			const name = path.basename(layerFile, path.extname(layerFile));
			this.layers.set(name, new SqliteKeyValueStore(layerFile));
		}
	}

	async get(key: string): Promise<string | undefined> {
		let data: string | undefined;

		// First check base database
		data = await this.base.get(key) as string;

		if (!data) {
			// Check layer databases
			for (const [, layer] of this.layers) {
				data = await layer.get(key) as string;

				if (data) {
					break;
				}
			}
		}

		if (!data) {
			return undefined;
		}

		// GC mode in progress
		if (this.gcBase && this.gcBaseKeys) {
			if (!this.gcBaseKeys.has(key)) {
				await this.gcBase.set(key, data);
				this.gcBaseKeys.add(key);
			}
		}

		return this._decompress(data);
	}

	async set(key: string, value: string, layer?: 'base' | string): Promise<void> {
		if (await this.has(key)) {
			throw new Error(`Key already exists in cache: ${key}`);
		}

		const data = await this._compress(value);

		switch (layer) {
			case undefined: {
				const layerDatabase = await this._getActiveLayerDatabase();
				await layerDatabase.set(key, data);
				break;
			}
			case 'base': {
				await this.base.set(key, data);
				break;
			}
			default: {
				const layerDatabase = this.layers.get(layer);
				if (!layerDatabase) {
					throw new Error(`Layer with UUID not found: ${layer}`);
				}
				await layerDatabase.set(key, data);
				break;
			}
		}

	}

	async has(key: string): Promise<boolean> {
		// Check primary first
		if (await this.base.has(key)) {
			return true;
		}

		// Check layers
		for (const layer of this.layers.values()) {
			if (await layer.has(key)) {
				return true;
			}
		}
		return false;
	}

	async checkDatabase(): Promise<Map<string, string[]>> {
		const keys = new Map<string, string>();
		const result = new Map<string, string[]>();

		const checkDatabase = async (name: string, database: SqliteKeyValueStore) => {
			for (const key of database.keys()) {
				if (result.has(key)) {
					result.get(key)!.push(name);
				} else if (keys.has(key)) {
					result.set(key, [keys.get(key)!, name]);
					keys.delete(key);
				} else {
					keys.set(key, name);
				}
			}
		};

		// Base database
		await checkDatabase('base', this.base);

		// Layer databases
		for (const [uuid, database] of this.layers.entries()) {
			await checkDatabase(uuid, database);
		}

		return result;
	}

	async gcStart(): Promise<void> {
		if (this.gcBase || this.gcBaseKeys) {
			throw new Error('GC is currently in progress');
		}

		this.gcBaseKeys = new Set<string>();
		this.gcBase = new SqliteKeyValueStore(path.join(this.cachePath, '_base.sqlite'));
	}

	async gcEnd(): Promise<void> {
		if (!this.gcBase || !this.gcBaseKeys) {
			throw new Error('GC is not in progress');
		}

		// Close the connections
		await this.base.disconnect();
		await this.gcBase.disconnect();

		// Delete base.sqlite
		fs.unlinkSync(path.join(this.cachePath, 'base.sqlite'));

		// Rename _base.sqlite to base.sqlite
		fs.renameSync(
			path.join(this.cachePath, '_base.sqlite'),
			path.join(this.cachePath, 'base.sqlite'));

		// Delete the layer databases
		for (const [uuid, layer] of this.layers.entries()) {
			try {
				// Close the connection
				await layer.disconnect();
			} catch (error) { }

			try {
				// Delete the layer database
				fs.unlinkSync(path.join(this.layersPath, `${uuid}.sqlite`));
			} catch (error) { }
		}

		this.activeLayer = undefined;
		this.layers.clear();

		this.gcBase = undefined;
		this.gcBaseKeys.clear();
		this.gcBaseKeys = undefined;
	}

	private async _getActiveLayerDatabase(): Promise<SqliteKeyValueStore> {
		if (!this.activeLayer) {
			this.activeLayer = (async () => {
				const execAsync = promisify(exec);

				const activeLayerPath = this.externalLayersPath ?? this.layersPath;
				const gitStatusPath = this.externalLayersPath
					? `${path.relative(await getGitRoot(activeLayerPath), activeLayerPath)}/*`
					: 'test/simulation/cache/layers/*';

				// Check git for an uncommitted layer database file
				try {
					const gitRoot = await getGitRoot(activeLayerPath);
					const { stdout: statusStdout } = await execAsync(`git status -z ${gitStatusPath}`, { cwd: gitRoot });
					if (statusStdout !== '') {
						const layerDatabaseEntries = statusStdout.split('\0').filter(entry => entry.endsWith('.sqlite'));
						if (layerDatabaseEntries.length > 0) {
							const regex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.sqlite$/;
							const match = layerDatabaseEntries[0].match(regex);
							if (match && this.layers.has(match[1])) {
								return this.layers.get(match[1])!;
							}
						}
					}
				} catch (error) {
					// If git operations fail, continue to create new layer
				}

				// Create a new layer database
				const uuid = generateUuid();
				const activeLayer = new SqliteKeyValueStore(path.join(activeLayerPath, `${uuid}.sqlite`));
				this.layers.set(uuid, activeLayer);
				return activeLayer;
			})();
		}

		return this.activeLayer;
	}

	private async _compress(value: string): Promise<string> {
		const buffer = await compress(value, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6, } });
		return buffer.toString('base64');
	}

	private async _decompress(data: string): Promise<string> {
		const buffer = await decompress(Buffer.from(data, 'base64'));
		return buffer.toString('utf8');
	}
}

export type CacheableRequest = {
	readonly hash: string;
	toJSON?(): unknown;
};

export interface ICache<TRequest, TResponse> {
	get(req: TRequest): Promise<TResponse | undefined>;
	set(req: TRequest, cachedResponse: TResponse): Promise<void>;
}

export class SQLiteCache<TRequest extends CacheableRequest, TResponse> implements ICache<TRequest, TResponse> {

	private readonly namespace: string;
	private readonly locks = new LockMap();

	constructor(name: string, salt?: string, info?: CurrentTestRunInfo) {
		this.namespace = `${name}${salt ? `|${salt}` : ''}`;
	}

	async hasRequest(hash: string): Promise<boolean> {
		return Cache.Instance.has(`${this.namespace}:request:${hash}`);
	}

	async getRequest(hash: string): Promise<TRequest | undefined> {
		const result = await Cache.Instance.get(`${this.namespace}:request:${hash}`);
		return result ? JSON.parse(result) : undefined;
	}

	async setRequest(hash: string, value: TRequest): Promise<void> {
		await Cache.Instance.set(`${this.namespace}:request:${hash}`, JSON.stringify(value));
	}

	async has(req: TRequest): Promise<boolean> {
		return Cache.Instance.has(`${this.namespace}:response:${req.hash}`);
	}

	async get(req: TRequest): Promise<TResponse | undefined> {
		const result = await Cache.Instance.get(`${this.namespace}:response:${req.hash}`);
		return result ? JSON.parse(result) : undefined;
	}

	async set(req: TRequest, value: TResponse): Promise<void> {
		await this.locks.withLock(req.hash, async () => {
			if (!!req.toJSON && !await this.hasRequest(req.hash)) {
				await this.setRequest(req.hash, req);
			}
		});

		await Cache.Instance.set(`${this.namespace}:response:${req.hash}`, JSON.stringify(value));
	}
}

export interface ISlottedCache<TRequest, TResponse> {
	get(req: TRequest, cacheSlot: number): Promise<TResponse | undefined>;
	set(req: TRequest, cacheSlot: number, cachedResponse: TResponse): Promise<void>;
}

export class SQLiteSlottedCache<TRequest extends CacheableRequest, TResponse> implements ISlottedCache<TRequest, TResponse> {

	private readonly namespace: string;
	private readonly locks = new LockMap();

	constructor(name: string, salt: string, info?: CurrentTestRunInfo) {
		this.namespace = `${name}|${salt}`;
	}

	async hasRequest(hash: string): Promise<boolean> {
		return Cache.Instance.has(`${this.namespace}:request:${hash}`);
	}

	async getRequest(hash: string): Promise<TRequest | undefined> {
		const result = await Cache.Instance.get(`${this.namespace}:request:${hash}`);
		return result ? JSON.parse(result) : undefined;
	}

	async setRequest(hash: string, value: TRequest): Promise<void> {
		await Cache.Instance.set(`${this.namespace}:request:${hash}`, JSON.stringify(value));
	}

	async has(req: TRequest, cacheSlot: number): Promise<boolean> {
		return Cache.Instance.has(`${this.namespace}:response:${req.hash}:${cacheSlot}`);
	}

	async get(req: TRequest, cacheSlot: number): Promise<TResponse | undefined> {
		const result = await Cache.Instance.get(`${this.namespace}:response:${req.hash}:${cacheSlot}`);
		return result ? JSON.parse(result) : undefined;
	}

	async set(req: TRequest, cacheSlot: number, value: TResponse): Promise<void> {
		await this.locks.withLock(req.hash, async () => {
			if (!await this.hasRequest(req.hash)) {
				await this.setRequest(req.hash, req);
			}
		});

		await Cache.Instance.set(`${this.namespace}:response:${req.hash}:${cacheSlot}`, JSON.stringify(value));
	}
}
