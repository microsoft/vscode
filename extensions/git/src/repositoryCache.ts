/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LogOutputChannel, Memento, workspace } from 'vscode';
import * as path from 'path';
import { LRUCache } from './cache';
import { Remote } from './api/git';

export class RepositoryCache {

	private static readonly STORAGE_KEY = 'git.repositoryCache';
	private static readonly MAX_REPO_ENTRIES = 30; // Max repositories tracked
	private static readonly MAX_FOLDER_ENTRIES = 10; // Max folders per repository

	// Outer LRU: repoUrl -> inner LRU (folderPathOrWorkspaceFile -> true). Only keys matter.
	private readonly lru = new LRUCache<string, LRUCache<string, true>>(RepositoryCache.MAX_REPO_ENTRIES);

	constructor(public readonly _globalState: Memento, private readonly _logger: LogOutputChannel) {
		this.load();
	}

	// Exposed for testing
	protected get _workspaceFile() {
		return workspace.workspaceFile;
	}

	// Exposed for testing
	protected get _workspaceFolders() {
		return workspace.workspaceFolders;
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
			foldersLru = new LRUCache<string, true>(RepositoryCache.MAX_FOLDER_ENTRIES);
		}
		const folderPathOrWorkspaceFile: string | undefined = this._findWorkspaceForRepo(rootPath);
		if (!folderPathOrWorkspaceFile) {
			return;
		}

		foldersLru.set(folderPathOrWorkspaceFile, true); // touch entry
		this.lru.set(repoUrl, foldersLru);
		this.save();
	}

	private _findWorkspaceForRepo(rootPath: string): string | undefined {
		// If the current workspace is a workspace file, use that. Otherwise, find the workspace folder that contains the rootUri
		let folderPathOrWorkspaceFile: string | undefined;
		try {
			if (this._workspaceFile) {
				folderPathOrWorkspaceFile = this._workspaceFile.fsPath;
			} else if (this._workspaceFolders && this._workspaceFolders.length) {
				const sorted = [...this._workspaceFolders].sort((a, b) => b.uri.fsPath.length - a.uri.fsPath.length);
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
			return folderPathOrWorkspaceFile;
		} catch {
			return;
		}

	}

	update(addedRemotes: Remote[], removedRemotes: Remote[], rootPath: string): void {
		for (const remote of removedRemotes) {
			const url = remote.fetchUrl;
			if (!url) {
				continue;
			}
			const relatedWorkspace = this._findWorkspaceForRepo(rootPath);
			if (relatedWorkspace) {
				this.delete(url, relatedWorkspace);
			}
		}

		for (const remote of addedRemotes) {
			const url = remote.fetchUrl;
			if (!url) {
				continue;
			}
			this.set(url, rootPath);
		}
	}

	/**
	 * We should possibly support converting between ssh remotes and http remotes.
	 */
	get(repoUrl: string): string[] | undefined {
		const inner = this.lru.get(repoUrl);
		return inner ? Array.from(inner.keys()) : undefined;
	}

	delete(repoUrl: string, folderPathOrWorkspaceFile: string) {
		const inner = this.lru.get(repoUrl);
		if (!inner) {
			return;
		}
		if (!inner.remove(folderPathOrWorkspaceFile)) {
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
		try {
			const raw = this._globalState.get<[string, [string, true][]][]>(RepositoryCache.STORAGE_KEY);
			if (Array.isArray(raw)) {
				for (const [repo, storedFolders] of raw) {
					if (typeof repo !== 'string' || !Array.isArray(storedFolders)) {
						continue;
					}
					const inner = new LRUCache<string, true>(RepositoryCache.MAX_FOLDER_ENTRIES);
					for (const entry of storedFolders) {
						let folderPath: string | undefined;
						if (Array.isArray(entry) && entry.length === 2) {
							const [workspaceFolder, _] = entry;
							if (typeof workspaceFolder === 'string') {
								folderPath = workspaceFolder;
							}
						}
						if (folderPath) {
							inner.set(folderPath, true);
						}
					}
					if (inner.size) {
						this.lru.set(repo, inner);
					}
				}
			}
		} catch {
			this._logger.warn('[CachedRepositories][load] Failed to load cached repositories from global state.');
		}
	}

	private save(): void {
		// Serialize as [repoUrl, [folderPathOrWorkspaceFile, true][]] preserving outer LRU order.
		const serialized: [string, [string, true][]][] = [];
		for (const [repo, inner] of this.lru) {
			const folders: [string, true][] = [];
			for (const [folder, _] of inner) {
				folders.push([folder, true]);
			}
			serialized.push([repo, folders]);
		}
		void this._globalState.update(RepositoryCache.STORAGE_KEY, serialized);
	}
}
