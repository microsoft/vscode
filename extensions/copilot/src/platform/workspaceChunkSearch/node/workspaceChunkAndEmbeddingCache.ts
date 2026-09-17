/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from 'fs';
import { IDisposable } from 'monaco-editor';
import sql from 'node:sqlite';
import path from 'path';
import { CancelablePromise, createCancelablePromise, raceCancellationError } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { Schemas } from '../../../util/vs/base/common/network';
import { URI } from '../../../util/vs/base/common/uri';
import { Range } from '../../../util/vs/editor/common/core/range';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { FileChunkWithEmbedding } from '../../chunking/common/chunk';
import { EmbeddingType } from '../../embeddings/common/embeddingsComputer';
import { packEmbedding, unpackEmbedding } from '../../embeddings/common/embeddingsStorage';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { ILogService } from '../../log/common/logService';
import { FileRepresentation, IWorkspaceFileIndex } from './workspaceFileIndex';

type CacheEntry = {
	readonly contentVersionId: string | undefined;
	readonly fileHash: string | undefined;
	readonly state: 'pending';
	readonly value: CancelablePromise<readonly FileChunkWithEmbedding[] | undefined>;
} | {
	readonly contentVersionId: string | undefined;
	readonly fileHash: string | undefined;
	readonly state: 'resolved' | 'rejected';
	readonly value: readonly FileChunkWithEmbedding[] | undefined;
};


export interface IWorkspaceChunkAndEmbeddingCache extends IDisposable {
	/**
	 * Checks if {@linkcode file} is currently indexed. Does not wait for any current indexing operation to complete.
	 */
	isIndexed(file: FileRepresentation): Promise<boolean>;

	/**
	 * Returns the chunks and embeddings for the given file, or undefined if not available.
	 */
	get(file: FileRepresentation): Promise<readonly FileChunkWithEmbedding[] | undefined>;

	getCurrentChunksForUri(uri: URI): ReadonlyMap<string, FileChunkWithEmbedding> | undefined;

	/**
	 * Updates the cache for the given file by computing the chunks and embeddings.
	 * Returns the updated chunks and embeddings.
	 */
	update(file: FileRepresentation, compute: (token: CancellationToken) => Promise<readonly FileChunkWithEmbedding[] | undefined>): Promise<readonly FileChunkWithEmbedding[] | undefined>;
}

export async function createWorkspaceChunkAndEmbeddingCache(
	accessor: ServicesAccessor,
	embeddingType: EmbeddingType,
	cacheRoot: URI | undefined,
	workspaceIndex: IWorkspaceFileIndex,
	token: CancellationToken,
): Promise<IWorkspaceChunkAndEmbeddingCache> {
	const instantiationService = accessor.get(IInstantiationService);
	return instantiationService.invokeFunction(accessor => DbCache.create(accessor, embeddingType, cacheRoot ?? ':memory:', workspaceIndex, token));
}

class OldDiskCache {
	private static cacheFileName = 'workspace-chunks.json';


	static async deleteDiskCache(accessor: ServicesAccessor, cacheRoot: URI) {
		const fileSystem = accessor.get(IFileSystemService);
		const cachePath = URI.joinPath(cacheRoot, OldDiskCache.cacheFileName);
		try {
			await fileSystem.delete(cachePath);
		} catch {
			// noop
		}
	}

	private constructor() { }
}


class DbCache implements IWorkspaceChunkAndEmbeddingCache {

	public static readonly version = '1.0.0';

	public static async create(
		accessor: ServicesAccessor,
		embeddingType: EmbeddingType,
		cacheRoot: URI | ':memory:',
		workspaceIndex: IWorkspaceFileIndex,
		token: CancellationToken,
	): Promise<DbCache> {
		const instantiationService = accessor.get(IInstantiationService);
		const logService = accessor.get(ILogService);

		const syncOptions: sql.DatabaseSyncOptions = {
			open: true,
			enableForeignKeyConstraints: true
		};

		let db: sql.DatabaseSync | undefined;
		if (cacheRoot !== ':memory:' && cacheRoot.scheme === Schemas.file) {
			const dbPath = URI.joinPath(cacheRoot, `workspace-chunks.db`);
			try {
				await raceCancellationError(fs.promises.mkdir(path.dirname(dbPath.fsPath), { recursive: true }), token);
				db = new sql.DatabaseSync(dbPath.fsPath, syncOptions);
				logService.trace(`DbWorkspaceChunkAndEmbeddingCache: Opened SQLite database on disk at ${dbPath.fsPath}`);
			} catch (e) {
				if (isCancellationError(e)) {
					throw e;
				}
				console.error('Failed to open SQLite database on disk', e);
			}
		}

		if (!db) {
			db = new sql.DatabaseSync(':memory:', syncOptions);
			logService.trace(`DbWorkspaceChunkAndEmbeddingCache: Using in memory database`);
		}

		try {
			db.exec(`
			PRAGMA journal_mode = OFF;
			PRAGMA synchronous = 0;
			PRAGMA cache_size = 10000;
			PRAGMA locking_mode = EXCLUSIVE;
			PRAGMA temp_store = MEMORY;
		`);

			db.exec(`
				CREATE TABLE IF NOT EXISTS CacheMeta (
					version TEXT NOT NULL,
					embeddingModel TEXT
				);

				CREATE TABLE IF NOT EXISTS Files (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					uri TEXT NOT NULL UNIQUE,
					contentVersionId TEXT
				);

				CREATE TABLE IF NOT EXISTS FileChunks (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					fileId INTEGER NOT NULL,
					text TEXT NOT NULL,
					range_startLineNumber INTEGER NOT NULL,
					range_startColumn INTEGER NOT NULL,
					range_endLineNumber INTEGER NOT NULL,
					range_endColumn INTEGER NOT NULL,
					embedding BINARY NOT NULL,
					chunkHash TEXT NOT NULL,
					FOREIGN KEY (fileId) REFERENCES Files(id) ON DELETE CASCADE
				);

				CREATE INDEX IF NOT EXISTS idx_files_uri ON Files(uri);
				CREATE INDEX IF NOT EXISTS idx_filechunks_fileId ON FileChunks(fileId);
			`);

			const versionResult = db.prepare('SELECT version, embeddingModel FROM CacheMeta LIMIT 1').get();
			if (!versionResult || versionResult.version !== this.version || versionResult.embeddingModel !== embeddingType.id) {
				// Clear everything
				db.exec('DELETE FROM CacheMeta; DELETE FROM Files; DELETE FROM FileChunks;');
			}

			// Update cache metadata
			db.exec('DELETE FROM CacheMeta;');
			db.prepare('INSERT INTO CacheMeta (version, embeddingModel) VALUES (?, ?)').run(this.version, embeddingType.id);

			// Clean up old disk db if it exists
			if (cacheRoot !== ':memory:') {
				void instantiationService.invokeFunction(accessor => OldDiskCache.deleteDiskCache(accessor, cacheRoot));
			}

			// Validate all files in the database against the workspace index and remove any that are no longer present
			await raceCancellationError(workspaceIndex.initialize(), token);

			const allFilesStmt = db.prepare('SELECT id, uri FROM Files');
			try {
				db.exec('BEGIN TRANSACTION');
				for (const row of allFilesStmt.all()) {
					try {
						const uri = URI.parse(row.uri as string);
						if (workspaceIndex.get(uri)) {
							continue;
						}
					} catch {
						// noop
					}

					db.prepare('DELETE FROM Files WHERE id = ?').run(row.id as number);
				}
			} finally {
				db.exec('COMMIT');
			}
		} catch (e) {
			db.close();
			throw e;
		}

		return new DbCache(embeddingType, db);
	}

	private readonly _inMemory = new ResourceMap<CacheEntry>();

	private constructor(
		private readonly embeddingType: EmbeddingType,
		private readonly db: sql.DatabaseSync
	) { }

	dispose(): void {
		this.db.close();
	}

	/**
	 * Checks if {@linkcode file} is currently indexed. Does not wait for any current indexing operation to complete.
	 */
	async isIndexed(file: FileRepresentation): Promise<boolean> {
		const entry = await this.getEntry(file);
		return entry?.state === 'resolved';
	}

	async get(file: FileRepresentation): Promise<readonly FileChunkWithEmbedding[] | undefined> {
		return (await this.getEntry(file))?.value;
	}

	getCurrentChunksForUri(uri: URI): ReadonlyMap<string, FileChunkWithEmbedding> | undefined {
		const entry = this._inMemory.get(uri);
		if (entry?.state === 'pending') {
			// Still being computed
			return undefined;
		}

		if (entry?.state === 'rejected') {
			return undefined;
		}

		// Should be written to the database
		const all = this.db.prepare(`SELECT fc.text, fc.range_startLineNumber, fc.range_startColumn, fc.range_endLineNumber, fc.range_endColumn, fc.embedding, fc.chunkHash FROM Files f JOIN FileChunks fc ON f.id = fc.fileId WHERE f.uri = ?`).all(uri.toString());
		if (all.length > 0) {
			const out = new Map<string, FileChunkWithEmbedding>();
			for (const row of all) {
				const embedding = unpackEmbedding(this.embeddingType, row.embedding as Uint8Array);

				const chunk: FileChunkWithEmbedding = {
					chunk: {
						file: uri,
						text: row.text as string,
						rawText: undefined,
						range: new Range(row.range_startLineNumber as number, row.range_startColumn as number, row.range_endLineNumber as number, row.range_endColumn as number),
					},
					embedding,
					chunkHash: row.chunkHash as string,
				};
				if (chunk.chunkHash) {
					out.set(chunk.chunkHash, chunk);
				}
			}
			return out;
		}

		return undefined;
	}

	private async getEntry(file: FileRepresentation): Promise<CacheEntry | undefined> {
		const entry = this._inMemory.get(file.uri);
		const inContentVersionId = await file.getFastContentVersionId();
		if (entry?.contentVersionId === inContentVersionId) {
			return entry;
		}

		const fileIdResult = this.db.prepare('SELECT id, contentVersionId FROM Files WHERE uri = ?').get(file.uri.toString());
		if (!fileIdResult || fileIdResult.contentVersionId !== inContentVersionId) {
			return undefined;
		}

		const chunks = this.db.prepare(`SELECT text, range_startLineNumber, range_startColumn, range_endLineNumber, range_endColumn, embedding, chunkHash FROM FileChunks WHERE fileId = ?`).all(fileIdResult.id as number);
		return {
			state: 'resolved',
			contentVersionId: fileIdResult.contentVersionId as string | undefined,
			fileHash: undefined,
			value: chunks.map((row): FileChunkWithEmbedding => {
				return {
					chunk: {
						file: file.uri,
						text: row.text as string,
						rawText: undefined,
						range: new Range(row.range_startLineNumber as number, row.range_startColumn as number, row.range_endLineNumber as number, row.range_endColumn as number),
					},
					embedding: unpackEmbedding(this.embeddingType, row.embedding as Uint8Array),
					chunkHash: row.chunkHash as string | undefined,
				};
			}),
		};
	}

	async update(file: FileRepresentation, compute: (token: CancellationToken) => Promise<readonly FileChunkWithEmbedding[] | undefined>): Promise<readonly FileChunkWithEmbedding[] | undefined> {
		const existingInMemory = this._inMemory.get(file.uri);
		const inContentVersionId = await file.getFastContentVersionId();
		if (existingInMemory?.contentVersionId === inContentVersionId) {
			// Already up to date
			return existingInMemory.value;
		}

		const written = await this.getEntry(file);
		if (written?.contentVersionId === inContentVersionId) {
			return written.value;
		}

		// Overwrite
		if (existingInMemory?.state === 'pending') {
			existingInMemory.value.cancel();
		}

		const chunks = createCancelablePromise(compute);
		const entry: CacheEntry = {
			contentVersionId: inContentVersionId,
			fileHash: undefined,
			state: 'pending',
			value: chunks
		};
		this._inMemory.set(file.uri, entry);

		chunks
			.then((result) => {
				return { contentVersionId: inContentVersionId, fileHash: undefined, state: Array.isArray(result) ? 'resolved' : 'rejected', value: result } as const;
			}, () => {
				return { contentVersionId: inContentVersionId, fileHash: undefined, state: 'rejected', value: undefined } as const;
			})
			.then(newEntry => {
				const current = this._inMemory.get(file.uri);
				if (entry === current) {
					if (newEntry.state === 'rejected') {
						this._inMemory.set(file.uri, newEntry);
						this.db.prepare('DELETE FROM Files WHERE uri = ?').run(file.uri.toString());
					} else {
						this._inMemory.delete(file.uri);
						const fileResult = this.db.prepare('INSERT OR REPLACE INTO Files (uri, contentVersionId) VALUES (?, ?)')
							.run(file.uri.toString(), inContentVersionId);

						try {
							const insertStatement = this.db.prepare(`INSERT INTO FileChunks (fileId, text, range_startLineNumber, range_startColumn, range_endLineNumber, range_endColumn, embedding, chunkHash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

							this.db.exec('BEGIN TRANSACTION');
							for (const chunk of newEntry.value ?? []) {
								insertStatement.run(
									fileResult.lastInsertRowid as number,
									chunk.chunk.text,
									chunk.chunk.range.startLineNumber,
									chunk.chunk.range.startColumn,
									chunk.chunk.range.endLineNumber,
									chunk.chunk.range.endColumn,
									packEmbedding(chunk.embedding),
									chunk.chunkHash ?? '',
								);
							}
						} finally {
							this.db.exec('COMMIT');
						}
					}
				}
			});

		return chunks;
	}
}
