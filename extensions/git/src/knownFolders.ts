/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Memento } from 'vscode';
import { LRUCache } from './cache';

export class KnownFolders {

	private static readonly STORAGE_KEY = 'git.knownFolders';
	private static readonly MAX_REPO_ENTRIES = 30; // Max repositories tracked
	private static readonly MAX_FOLDER_ENTRIES = 10; // Max folders per repository
	private static readonly EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days in ms

	// Outer LRU: repoUrl -> inner LRU (folderPath -> timestamp ms). Only keys matter externally, timestamp tracks last seen.
	private readonly lru = new LRUCache<string, LRUCache<string, number>>(KnownFolders.MAX_REPO_ENTRIES);

	constructor(public readonly _globalState: Memento) {
		this.load();
	}

	/**
	 * Associate a repository remote URL with a local folder.
	 * Re-associating bumps recency and persists the updated LRU state.
	 * @param repoUrl Remote repository URL (e.g. https://github.com/owner/repo.git)
	 * @param folderPath Workspace folder URI string using that remote (stringified Uri).
	 */
	set(repoUrl: string, folderPath: string): void {
		let foldersLru = this.lru.get(repoUrl);
		if (!foldersLru) {
			foldersLru = new LRUCache<string, number>(KnownFolders.MAX_FOLDER_ENTRIES);
		}
		foldersLru.set(folderPath, Date.now()); // touch/update timestamp
		this.lru.set(repoUrl, foldersLru);
		this.save();
	}

	/**
	 * We should possibly support converting between ssh remotes and http remotes.
	 */
	get(repoUrl: string): string[] | undefined {
		const inner = this.lru.get(repoUrl);
		return inner ? Array.from(inner.keys()) : undefined;
	}

	delete(repoUrl: string, folderPath: string) {
		const inner = this.lru.get(repoUrl);
		if (!inner) {
			return;
		}
		const removed = inner.remove(folderPath) !== undefined;
		if (!removed) {
			return;
		}
		if (inner.size === 0) {
			this.lru.remove(repoUrl);
		} else {
			// Re-set to bump outer LRU recency after modification
			this.lru.set(repoUrl, inner);
		}
		this.save();
	}

	private load(): void {
		const now = Date.now();
		try {
			const raw = this._globalState.get<[string, [string, number][]][]>(KnownFolders.STORAGE_KEY);
			if (Array.isArray(raw)) {
				for (const [repo, storedFolders] of raw) {
					if (typeof repo !== 'string' || !Array.isArray(storedFolders)) {
						continue;
					}
					const inner = new LRUCache<string, number>(KnownFolders.MAX_FOLDER_ENTRIES);
					for (const entry of storedFolders) {
						let folderPath: string | undefined;
						let ts: number | undefined;
						if (Array.isArray(entry) && entry.length === 2) {
							const [p, t] = entry;
							if (typeof p === 'string' && typeof t === 'number') {
								folderPath = p;
								ts = t;
							}
						}
						if (!folderPath || ts === undefined) {
							continue;
						}
						if (now - ts > KnownFolders.EXPIRY_MS) {
							// Expired (> 90 days old) skip
							continue;
						}
						inner.set(folderPath, ts);
					}
					if (inner.size) {
						this.lru.set(repo, inner);
					}
				}
			}
		} catch {
			// Ignore corrupt state; start fresh.
		}
	}

	private save(): void {
		// Serialize as [repoUrl, [folderPath, timestamp][]] preserving outer LRU order.
		const serialized: [string, [string, number][]][] = [];
		for (const [repo, inner] of this.lru) {
			const folders: [string, number][] = [];
			for (const [folder, ts] of inner) {
				folders.push([folder, ts]);
			}
			serialized.push([repo, folders]);
		}
		void this._globalState.update(KnownFolders.STORAGE_KEY, serialized);
	}
}
