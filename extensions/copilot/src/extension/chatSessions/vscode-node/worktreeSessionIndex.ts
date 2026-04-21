/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri } from 'vscode';
import { createDirectoryIfNotExists, IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { ILogService } from '../../../platform/log/common/logService';
import { Sequencer } from '../../../util/vs/base/common/async';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { dirname } from '../../../util/vs/base/common/resources';
import { WorktreeSessionEntry } from '../common/chatSessionMetadataStore';

/**
 * In-memory index that maps session ids to {@link WorktreeSessionEntry} and
 * worktree folder URIs to session ids, with JSONL file persistence.
 *
 * When multiple sessions share the same folder, the first-registered session
 * keeps the folder → session-id mapping.
 *
 * All file writes are serialized through an internal {@link Sequencer} so
 * concurrent appends and rewrites cannot race.
 */
export class WorktreeSessionIndex {
	/** Session id → entry. */
	private readonly _byId = new Map<string, WorktreeSessionEntry>();
	/** Worktree folder URI → session id. Uses URI-aware comparison so path casing is handled correctly. */
	private readonly _byFolder = new ResourceMap<string>();
	/** Serializes all JSONL file writes to prevent read-modify-write races. */
	private readonly _writeSequencer = new Sequencer();
	/** Timestamp of the last {@link loadFromDisk} call; used by {@link reloadIfStale}. */
	private _lastLoadAt = 0;

	constructor(
		private readonly _fileSystemService: IFileSystemService,
		private readonly _logService: ILogService,
		private readonly _jsonlPath: string,
	) { }

	getSessionEntry(sessionId: string): WorktreeSessionEntry | undefined {
		return this._byId.get(sessionId);
	}

	getSessionIdForFolder(folder: Uri): string | undefined {
		return this._byFolder.get(folder);
	}

	has(sessionId: string): boolean {
		return this._byId.has(sessionId);
	}

	get size(): number {
		return this._byId.size;
	}

	getAllSessionIds(): string[] {
		return Array.from(this._byId.keys());
	}

	/**
	 * Adds or updates an entry. When the same folder path is already mapped to
	 * a different session, the existing mapping is preserved.
	 */
	addEntry(entry: WorktreeSessionEntry): void {
		const folderUri = Uri.file(entry.path);

		// If this session already has an entry with a different path, clean up
		// the old folder → session-id mapping before recording the new one.
		const previousEntry = this._byId.get(entry.id);
		if (previousEntry && previousEntry.path !== entry.path) {
			const prevUri = Uri.file(previousEntry.path);
			if (this._byFolder.get(prevUri) === entry.id) {
				this._byFolder.delete(prevUri);
			}
		}

		this._byId.set(entry.id, entry);

		const existingIdForFolder = this._byFolder.get(folderUri);
		if (!existingIdForFolder) {
			this._byFolder.set(folderUri, entry.id);
			return;
		}
		if (existingIdForFolder === entry.id) {
			return;
		}
		const existingEntry = this._byId.get(existingIdForFolder);
		if (existingEntry) {
			return;
		}
		this._byFolder.set(folderUri, entry.id);
	}

	deleteEntry(sessionId: string): void {
		const entry = this._byId.get(sessionId);
		if (!entry) {
			return;
		}
		this._byId.delete(sessionId);
		const folderUri = Uri.file(entry.path);
		if (this._byFolder.get(folderUri) === sessionId) {
			this._byFolder.delete(folderUri);
			for (const candidate of this._byId.values()) {
				if (candidate.path === entry.path) {
					this._byFolder.set(folderUri, candidate.id);
					break;
				}
			}
		}
	}

	clear(): void {
		this._byId.clear();
		this._byFolder.clear();
	}

	getEntries(): WorktreeSessionEntry[] {
		return Array.from(this._byId.values());
	}

	/**
	 * Loads the JSONL worktree index from disk into the in-memory maps.
	 * Returns `rewriteNeeded` if the file contained malformed lines or
	 * duplicates that should be compacted via {@link writeToDisk}.
	 */
	async loadFromDisk(): Promise<{ rewriteNeeded: boolean }> {
		let rewriteNeeded = false;
		let raw: string;
		try {
			const bytes = await this._fileSystemService.readFile(Uri.file(this._jsonlPath));
			raw = new TextDecoder().decode(bytes);
		} catch {
			this._lastLoadAt = Date.now();
			return { rewriteNeeded: false };
		}
		this.clear();
		for (const line of raw.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			try {
				const entry = JSON.parse(trimmed) as WorktreeSessionEntry;
				if (!entry?.id || !entry.path) {
					rewriteNeeded = true;
					continue;
				}
				if (this._byId.has(entry.id)) {
					rewriteNeeded = true;
				}
				this.addEntry(entry);
			} catch {
				rewriteNeeded = true;
			}
		}
		this._lastLoadAt = Date.now();
		return { rewriteNeeded };
	}

	/** Reloads from disk only if more than 1 second has passed since the last load. */
	async reloadIfStale(): Promise<void> {
		if (Date.now() - this._lastLoadAt < 1000) {
			return;
		}
		await this.loadFromDisk();
	}

	/** Writes the entire in-memory index to the JSONL file, replacing its contents. */
	async writeToDisk(): Promise<void> {
		return this._writeSequencer.queue(async () => {
			try {
				const jsonlUri = Uri.file(this._jsonlPath);
				await createDirectoryIfNotExists(this._fileSystemService, dirname(jsonlUri));
				const lines = this._byId.size > 0
					? Array.from(this._byId.values()).map(e => JSON.stringify(e)).join('\n') + '\n'
					: '';
				await this._fileSystemService.writeFile(jsonlUri, new TextEncoder().encode(lines));
			} catch (err) {
				this._logService.error('[WorktreeSessionIndex] Failed to write JSONL: ', err);
			}
		});
	}

	/** Appends entries to the JSONL file and adds them to the in-memory index. */
	async appendBatchToDisk(entries: WorktreeSessionEntry[]): Promise<void> {
		if (entries.length === 0) {
			return;
		}
		return this._writeSequencer.queue(async () => {
			try {
				const jsonlUri = Uri.file(this._jsonlPath);
				await createDirectoryIfNotExists(this._fileSystemService, dirname(jsonlUri));
				let existing = '';
				try {
					existing = new TextDecoder().decode(await this._fileSystemService.readFile(jsonlUri));
				} catch {
					// File doesn't exist yet.
				}
				const suffix = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
				await this._fileSystemService.writeFile(
					jsonlUri,
					new TextEncoder().encode(existing + suffix),
				);
				for (const entry of entries) {
					this.addEntry(entry);
				}
			} catch (err) {
				this._logService.error('[WorktreeSessionIndex] Failed to bulk-append entries: ', err);
			}
		});
	}

	/** Removes an entry from the in-memory index and rewrites the JSONL file. */
	async removeAndWriteToDisk(sessionId: string): Promise<void> {
		if (!this._byId.has(sessionId)) {
			return;
		}
		this.deleteEntry(sessionId);
		await this.writeToDisk();
	}
}
