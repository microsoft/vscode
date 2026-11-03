/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IGitFileSystem } from '../../node/gitProcess.js';

/**
 * `directory` and `file` entries are plain; `executable` files also pass an
 * `X_OK` access check; `unreadable` entries fail `stat` with `EACCES` but
 * exist for `lstat`, like Windows app execution aliases.
 */
export type FakeGitFileSystemEntry = 'directory' | 'file' | 'executable' | 'unreadable';

export function fakeFsError(code: string, fsPath: string): NodeJS.ErrnoException {
	return Object.assign(new Error(`${code}: ${fsPath}`), { code });
}

/** An in-memory {@link IGitFileSystem} that records every path it is asked about. */
export class FakeGitFileSystem implements IGitFileSystem {
	readonly probes: string[] = [];
	readonly entries: Map<string, FakeGitFileSystemEntry>;

	constructor(entries: Iterable<readonly [string, FakeGitFileSystemEntry]>, private readonly _realPaths: ReadonlyMap<string, string> = new Map()) {
		this.entries = new Map(entries);
	}

	async stat(fsPath: string): Promise<{ isFile(): boolean; isDirectory(): boolean }> {
		const entry = this._get(fsPath);
		if (entry === 'unreadable') {
			throw fakeFsError('EACCES', fsPath);
		}
		return { isFile: () => entry !== 'directory', isDirectory: () => entry === 'directory' };
	}

	async lstat(fsPath: string): Promise<unknown> {
		return this._get(fsPath);
	}

	async realpath(fsPath: string): Promise<string> {
		this._get(fsPath);
		return this._realPaths.get(fsPath) ?? fsPath;
	}

	async access(fsPath: string): Promise<void> {
		if (this._get(fsPath) !== 'executable') {
			throw fakeFsError('EACCES', fsPath);
		}
	}

	private _get(fsPath: string): FakeGitFileSystemEntry {
		this.probes.push(fsPath);
		const entry = this.entries.get(fsPath);
		if (!entry) {
			throw fakeFsError('ENOENT', fsPath);
		}
		return entry;
	}
}
