/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Memento, workspace } from 'vscode';
import * as path from 'path';
import { LRUCache } from './cache';

export interface KnownFolderInfo {
	timestamp: number; // last seen timestamp (ms)
	repoRootPath: string; // root path of the local repo clone associated with this workspace folder/workspace file
	workspacePath: string; // path of the workspace folder or workspace file
	isWorkspace: boolean; // whether the user opened this as a workspace/folder, or as a file, with no workspace open
}

function isKnownFolderInfo(obj: unknown): obj is KnownFolderInfo {
	if (!obj || typeof obj !== 'object') {
		return false;
	}
	const rec = obj as Record<string, unknown>;
	return typeof rec.timestamp === 'number' && typeof rec.repoRootPath === 'string' && typeof rec.workspacePath === 'string';
}

export class KnownFolders {

	private static readonly STORAGE_KEY = 'git.knownFolders';
	private static readonly MAX_REPO_ENTRIES = 30; // Max repositories tracked
	private static readonly MAX_FOLDER_ENTRIES = 10; // Max folders per repository
	private static readonly EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days in ms

	// Outer LRU: repoUrl -> inner LRU (folderPathOrWorkspaceFile -> KnownFolderInfo). Only keys matter externally.
	private readonly lru = new LRUCache<string, LRUCache<string, KnownFolderInfo>>(KnownFolders.MAX_REPO_ENTRIES);

	constructor(public readonly _globalState: Memento) {
		this.load();
	}

	/**
	 * Associate a repository remote URL with a local workspace folder or workspace file.
	 * Re-associating bumps recency and persists the updated LRU state.
	 * @param repoUrl Remote repository URL (e.g. https://github.com/owner/repo.git)
	 * @param rootPath Root path of the local repo clone.
	 */
	set(repoUrl: string, rootPath: string): void {
		let foldersLru = this.lru.get(repoUrl);
		if (!foldersLru) {
			foldersLru = new LRUCache<string, KnownFolderInfo>(KnownFolders.MAX_FOLDER_ENTRIES);
		}
		// If the current workspace is a workspace file, use that. Otherwise, find the workspace folder that contains the rootUri
		let folderPathOrWorkspaceFile: string | undefined;
		let isWorkspace = true;
		try {

			if (workspace.workspaceFile) {
				folderPathOrWorkspaceFile = workspace.workspaceFile.fsPath;
			} else if (workspace.workspaceFolders && workspace.workspaceFolders.length) {
				const sorted = [...workspace.workspaceFolders].sort((a, b) => b.uri.fsPath.length - a.uri.fsPath.length);
				for (const folder of sorted) {
					const folderPath = folder.uri.fsPath;
					const relToFolder = path.relative(folderPath, rootPath);
					if (relToFolder === '' || (!relToFolder.startsWith('..') && !path.isAbsolute(relToFolder))) {
						folderPathOrWorkspaceFile = folderPath;
						break;
					}
					const relFromFolder = path.relative(rootPath, folderPath);
					if (relFromFolder === '' || (!relFromFolder.startsWith('..') && !path.isAbsolute(relFromFolder))) {
						folderPathOrWorkspaceFile = folderPath;
						break;
					}
				}
			}

			if (!folderPathOrWorkspaceFile) {
				folderPathOrWorkspaceFile = rootPath;
				isWorkspace = false;
			}
		} catch {
			return;
		}

		foldersLru.set(folderPathOrWorkspaceFile, { timestamp: Date.now(), repoRootPath: rootPath, workspacePath: folderPathOrWorkspaceFile, isWorkspace }); // touch/update timestamp
		this.lru.set(repoUrl, foldersLru);
		this.save();
	}

	/**
	 * We should possibly support converting between ssh remotes and http remotes.
	 */
	get(repoUrl: string): KnownFolderInfo[] | undefined {
		const inner = this.lru.get(repoUrl);
		return inner ? Array.from(inner.values()) : undefined;
	}

	delete(repoUrl: string, folderPathOrWorkspaceFile: string) {
		const inner = this.lru.get(repoUrl);
		if (!inner) {
			return;
		}
		const removed = inner.remove(folderPathOrWorkspaceFile) !== undefined;
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
			const raw = this._globalState.get<[string, [string, KnownFolderInfo][]][]>(KnownFolders.STORAGE_KEY);
			if (!Array.isArray(raw)) {
				return;
			}
			for (const [repo, storedFolders] of raw) {
				if (typeof repo !== 'string' || !Array.isArray(storedFolders)) {
					continue;
				}
				const inner = new LRUCache<string, KnownFolderInfo>(KnownFolders.MAX_FOLDER_ENTRIES);
				for (const entry of storedFolders) {
					if (!Array.isArray(entry) || entry.length !== 2) {
						continue;
					}
					const [folderPath, info] = entry;
					if (typeof folderPath !== 'string' || !isKnownFolderInfo(info)) {
						continue;
					}
					if (now - info.timestamp > KnownFolders.EXPIRY_MS) {
						continue; // Expired (> 90 days old)
					}
					inner.set(folderPath, info);
				}
				if (inner.size) {
					this.lru.set(repo, inner);
				}
			}
		} catch {
			// Ignore corrupt state; start fresh.
		}
	}

	private save(): void {
		// Serialize as [repoUrl, [folderPathOrWorkspaceFile, { timestamp, repoRootPath }][]] preserving outer LRU order.
		const serialized: [string, [string, KnownFolderInfo][]][] = [];
		for (const [repo, inner] of this.lru) {
			const folders: [string, KnownFolderInfo][] = [];
			for (const [folder, info] of inner) {
				folders.push([folder, info]);
			}
			serialized.push([repo, folders]);
		}
		void this._globalState.update(KnownFolders.STORAGE_KEY, serialized);
	}
}
