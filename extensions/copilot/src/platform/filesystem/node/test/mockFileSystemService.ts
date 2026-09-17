/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FileStat, FileSystemWatcher } from 'vscode';
import { basename, dirname } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { IFileSystemService } from '../../common/fileSystemService';
import { FileType } from '../../common/fileTypes';

export class MockFileSystemService implements IFileSystemService {
	_serviceBrand: undefined;

	private mockDirs = new Map<string, [string, FileType][]>();
	private mockFiles = new Map<string, string>();
	private mockErrors = new Map<string, Error>();
	private mockMtimes = new Map<string, number>();
	private statCalls = 0;

	mockDirectory(uri: URI | string, entries: [string, FileType][]) {
		const uriString = typeof uri === 'string' ? uri : uri.toString();
		this.mockDirs.set(uriString, entries);
	}

	mockFile(uri: URI | string, contents: string, mtime?: number) {
		const uriString = typeof uri === 'string' ? uri : uri.toString();
		this.mockFiles.set(uriString, contents);
		if (mtime !== undefined) {
			this.mockMtimes.set(uriString, mtime);
		}
	}

	mockError(uri: URI | string, error: Error) {
		const uriString = typeof uri === 'string' ? uri : uri.toString();
		this.mockErrors.set(uriString, error);
	}

	getStatCallCount(): number {
		return this.statCalls;
	}

	resetStatCallCount(): void {
		this.statCalls = 0;
	}

	async readDirectory(uri: URI): Promise<[string, FileType][]> {
		const uriString = uri.toString();
		if (this.mockErrors.has(uriString)) {
			throw this.mockErrors.get(uriString);
		}
		return this.mockDirs.get(uriString) || [];
	}

	async readFile(uri: URI, disableLimit?: boolean): Promise<Uint8Array> {
		const uriString = uri.toString();
		if (this.mockErrors.has(uriString)) {
			throw this.mockErrors.get(uriString);
		}
		const contents = this.mockFiles.get(uriString);
		if (contents === undefined) {
			throw new Error('ENOENT');
		}
		return new TextEncoder().encode(contents);
	}

	async stat(uri: URI): Promise<FileStat> {
		this.statCalls++; // Track stat calls to verify caching
		const uriString = uri.toString();
		if (this.mockErrors.has(uriString)) {
			throw this.mockErrors.get(uriString);
		}
		if (this.mockFiles.has(uriString)) {
			const contents = this.mockFiles.get(uriString)!;
			const mtime = this.mockMtimes.get(uriString) ?? Date.now();
			return { type: FileType.File as unknown as FileType, ctime: Date.now() - 1000, mtime, size: contents.length };
		}
		if (this.mockDirs.has(uriString)) {
			const mtime = this.mockMtimes.get(uriString) ?? Date.now();
			return { type: FileType.Directory as unknown as FileType, ctime: Date.now() - 1000, mtime, size: 0 };
		}
		throw new Error('ENOENT');
	}

	// Required interface methods
	isWritableFileSystem(): boolean | undefined { return true; }
	createFileSystemWatcher(): FileSystemWatcher { throw new Error('not implemented'); }

	async createDirectory(uri: URI): Promise<void> {
		const uriString = uri.toString();

		// Recursively ensure parent directories exist first
		const parentUri = dirname(uri);
		if (parentUri && parentUri.toString() !== uriString) {
			if (!this.mockDirs.has(parentUri.toString())) {
				await this.createDirectory(parentUri);
			}

			const entries = this.mockDirs.get(parentUri.toString())!;
			const bname = basename(uri);
			if (!entries.find(e => e[0] === bname)) {
				entries.push([bname, FileType.Directory]);
			}
		}

		// Mark as directory by adding empty entry list
		if (!this.mockDirs.has(uriString)) {
			this.mockDirs.set(uriString, []);
			// Store creation time for stat() calls
			this.mockMtimes.set(uriString, Date.now());
		}
	}

	async writeFile(uri: URI, content: Uint8Array): Promise<void> {
		const uriString = uri.toString();
		const text = new TextDecoder().decode(content);
		this.mockFiles.set(uriString, text);
		// Store write time for stat() calls
		this.mockMtimes.set(uriString, Date.now());

		// add the file to the mock directory listing of its parent directory
		const parentUri = uriString.substring(0, uriString.lastIndexOf('/'));
		if (this.mockDirs.has(parentUri)) {
			const entries = this.mockDirs.get(parentUri)!;
			const fileName = uriString.substring(uriString.lastIndexOf('/') + 1);
			if (!entries.find(e => e[0] === fileName)) {
				entries.push([fileName, FileType.File]);
			}
		} else {
			this.mockDirs.set(parentUri, [[uriString.substring(uriString.lastIndexOf('/') + 1), FileType.File]]);
		}
	}

	async delete(uri: URI, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
		const uriString = uri.toString();
		this.mockFiles.delete(uriString);
		this.mockDirs.delete(uriString);
		this.mockErrors.delete(uriString);
		this.mockMtimes.delete(uriString);

		const parentUri = dirname(uri);
		if (parentUri && this.mockDirs.has(parentUri.toString())) {
			const entries = this.mockDirs.get(parentUri.toString())!;
			const bname = basename(uri);
			this.mockDirs.set(parentUri.toString(), entries.filter(e => e[0] !== bname));
		}
	}

	async rename(oldURI: URI, newURI: URI, options?: { overwrite?: boolean }): Promise<void> {
		const oldUriString = oldURI.toString();
		const newUriString = newURI.toString();

		// Check if target exists and overwrite is not allowed
		if (!options?.overwrite && (this.mockFiles.has(newUriString) || this.mockDirs.has(newUriString))) {
			throw new Error('EEXIST: File exists');
		}

		// Move file or directory
		if (this.mockFiles.has(oldUriString)) {
			const content = this.mockFiles.get(oldUriString)!;
			this.mockFiles.set(newUriString, content);
			this.mockFiles.delete(oldUriString);

			if (this.mockMtimes.has(oldUriString)) {
				const mtime = this.mockMtimes.get(oldUriString)!;
				this.mockMtimes.set(newUriString, mtime);
				this.mockMtimes.delete(oldUriString);
			}
		} else if (this.mockDirs.has(oldUriString)) {
			const entries = this.mockDirs.get(oldUriString)!;
			this.mockDirs.set(newUriString, entries);
			this.mockDirs.delete(oldUriString);
		} else {
			throw new Error('ENOENT: File not found');
		}
	}
	copy(source: URI, destination: URI, options?: { overwrite?: boolean }): Promise<void> {
		throw new Error('Method not implemented.');
	}
}
