/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../../platform/filesystem/common/fileTypes';
import { ILogService } from '../../../../platform/log/common/logService';
import { URI } from '../../../../util/vs/base/common/uri';

/**
 * Resolver function that returns URIs to track.
 * Called each time a snapshot is taken to get current paths.
 */
export type SettingsPathResolver = () => URI[];

/**
 * Directory resolver configuration.
 * Provides directories to enumerate and an optional file extension filter.
 */
interface DirectoryResolverConfig {
	/** Resolver that returns directory URIs to enumerate */
	resolver: () => URI[];
	/** File extension to filter by (e.g., '.md'). If not provided, all files are included. */
	extension?: string;
}

/**
 * Tracks modification times of settings files (CLAUDE.md, hooks, etc.)
 * to detect when a session should be restarted to pick up changes.
 *
 * This is designed to be easily expandable - just register additional
 * path resolvers for new file types to track.
 */
export class ClaudeSettingsChangeTracker {
	private readonly _pathResolvers: SettingsPathResolver[] = [];
	private readonly _directoryResolvers: DirectoryResolverConfig[] = [];
	private _snapshot: Map<string, number> = new Map();

	constructor(
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@ILogService private readonly logService: ILogService,
	) { }

	/**
	 * Registers a path resolver that provides URIs to track.
	 * Resolvers are called each time a snapshot is taken.
	 *
	 * @param resolver Function that returns URIs to track
	 */
	registerPathResolver(resolver: SettingsPathResolver): void {
		this._pathResolvers.push(resolver);
	}

	/**
	 * Registers directories to track. All files in these directories
	 * (optionally filtered by extension) will be tracked for changes.
	 *
	 * @param resolver Function that returns directory URIs to enumerate
	 * @param extension Optional file extension to filter by (e.g., '.md')
	 */
	registerDirectoryResolver(resolver: () => URI[], extension?: string): void {
		this._directoryResolvers.push({ resolver, extension });
	}

	/**
	 * Enumerates files in a directory, optionally filtering by extension.
	 */
	private async _enumerateDirectory(dir: URI, extension?: string): Promise<URI[]> {
		const files: URI[] = [];
		try {
			const entries = await this.fileSystemService.readDirectory(dir);
			for (const [name, type] of entries) {
				if (type & FileType.File) {
					if (!extension || name.endsWith(extension)) {
						files.push(URI.joinPath(dir, name));
					}
				}
			}
		} catch {
			// Directory doesn't exist or can't be read
		}
		return files;
	}

	/**
	 * Resolves all paths from path resolvers and directory resolvers.
	 */
	private async _getAllPaths(): Promise<URI[]> {
		const syncPaths = this._pathResolvers.flatMap(resolver => resolver());

		// Enumerate all directories
		const directoryFiles: URI[] = [];
		for (const config of this._directoryResolvers) {
			const dirs = config.resolver();
			for (const dir of dirs) {
				const files = await this._enumerateDirectory(dir, config.extension);
				directoryFiles.push(...files);
			}
		}

		return [...syncPaths, ...directoryFiles];
	}

	/**
	 * Takes a snapshot of modification times for all tracked files.
	 * Call this when starting or restarting a session.
	 */
	async takeSnapshot(): Promise<void> {
		this._snapshot.clear();

		const allPaths = await this._getAllPaths();

		for (const uri of allPaths) {
			try {
				const stat = await this.fileSystemService.stat(uri);
				this._snapshot.set(uri.toString(), stat.mtime);
				this.logService.trace(`[ClaudeSettingsChangeTracker] Snapshot: ${uri.fsPath} mtime=${stat.mtime}`);
			} catch {
				// File doesn't exist yet - record as 0 so we detect if it's created
				this._snapshot.set(uri.toString(), 0);
				this.logService.trace(`[ClaudeSettingsChangeTracker] Snapshot: ${uri.fsPath} (does not exist)`);
			}
		}
	}

	/**
	 * Checks a single URI for changes against the snapshot.
	 * Returns the URI if changed, undefined otherwise.
	 */
	private async _checkUri(uri: URI): Promise<URI | undefined> {
		const uriString = uri.toString();
		const snapshotMtime = this._snapshot.get(uriString);

		try {
			const stat = await this.fileSystemService.stat(uri);
			if (snapshotMtime === undefined) {
				// New file that wasn't in snapshot - treat as changed
				this.logService.trace(`[ClaudeSettingsChangeTracker] New file detected: ${uri.fsPath}`);
				return uri;
			} else if (stat.mtime > snapshotMtime) {
				this.logService.trace(`[ClaudeSettingsChangeTracker] Changed: ${uri.fsPath} (${snapshotMtime} -> ${stat.mtime})`);
				return uri;
			}
		} catch {
			// File doesn't exist now but was expected - treat as changed
			if (snapshotMtime !== undefined && snapshotMtime > 0) {
				this.logService.trace(`[ClaudeSettingsChangeTracker] Deleted: ${uri.fsPath}`);
				return uri;
			}
		}
		return undefined;
	}

	/**
	 * Async generator that lazily iterates through resolvers and yields changed files.
	 * Allows early termination without invoking remaining resolvers.
	 */
	private async *_changedFilesGenerator(): AsyncGenerator<URI> {
		const seenPaths = new Set<string>();

		// Lazily iterate through path resolvers
		for (const resolver of this._pathResolvers) {
			for (const uri of resolver()) {
				seenPaths.add(uri.toString());
				const changed = await this._checkUri(uri);
				if (changed) {
					yield changed;
				}
			}
		}

		// Lazily iterate through directory resolvers
		for (const config of this._directoryResolvers) {
			for (const dir of config.resolver()) {
				const files = await this._enumerateDirectory(dir, config.extension);
				for (const uri of files) {
					seenPaths.add(uri.toString());
					const changed = await this._checkUri(uri);
					if (changed) {
						yield changed;
					}
				}
			}
		}

		// Check snapshot for files that no longer exist (deleted)
		// This must happen after we've seen all current paths
		for (const [uriString, mtime] of this._snapshot) {
			if (!seenPaths.has(uriString) && mtime > 0) {
				// File was in snapshot but not in current paths - it was deleted
				const uri = URI.parse(uriString);
				this.logService.trace(`[ClaudeSettingsChangeTracker] Deleted (not in current paths): ${uri.fsPath}`);
				yield uri;
			}
		}
	}

	/**
	 * Checks if any files have changed. Returns early on first change found.
	 *
	 * @returns true if any tracked file has been modified since the last snapshot
	 */
	async hasChanges(): Promise<boolean> {
		for await (const _uri of this._changedFilesGenerator()) {
			return true;
		}
		return false;
	}
}
