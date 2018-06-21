/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Uri } from 'vscode';
import { memoize } from '../utils/memoize';
import { getTempFile } from '../utils/temp';

/**
 * Maps of file resources
 *
 * Attempts to handle correct mapping on both case sensitive and case in-sensitive
 * file systems.
 */
export class ResourceMap<T> {
	private readonly _map = new Map<string, T>();

	constructor(
		private readonly _normalizePath?: (resource: Uri) => string | null
	) { }

	public has(resource: Uri): boolean {
		const file = this.toKey(resource);
		return !!file && this._map.has(file);
	}

	public get(resource: Uri): T | undefined {
		const file = this.toKey(resource);
		return file ? this._map.get(file) : undefined;
	}

	public set(resource: Uri, value: T) {
		const file = this.toKey(resource);
		if (file) {
			this._map.set(file, value);
		}
	}

	public delete(resource: Uri): void {
		const file = this.toKey(resource);
		if (file) {
			this._map.delete(file);
		}
	}

	public get values(): Iterable<T> {
		return this._map.values();
	}

	public get keys(): Iterable<string> {
		return this._map.keys();
	}

	private toKey(resource: Uri): string | null {
		const key = this._normalizePath ? this._normalizePath(resource) : resource.fsPath;
		if (!key) {
			return key;
		}
		return this.isCaseInsensitivePath(key) ? key.toLowerCase() : key;
	}

	private isCaseInsensitivePath(path: string) {
		if (isWindowsPath(path)) {
			return true;
		}
		return path[0] === '/' && this.onIsCaseInsenitiveFileSystem;
	}

	@memoize
	private get onIsCaseInsenitiveFileSystem() {
		if (process.platform === 'win32') {
			return true;
		}
		if (process.platform !== 'darwin') {
			return false;
		}
		const temp = getTempFile('typescript-case-check');
		fs.writeFileSync(temp, '');
		return fs.existsSync(temp.toUpperCase());
	}
}

export function isWindowsPath(path: string): boolean {
	return /^[a-zA-Z]:\\/.test(path);
}
