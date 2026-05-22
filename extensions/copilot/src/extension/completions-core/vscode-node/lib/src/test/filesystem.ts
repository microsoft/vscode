/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, join, normalize } from 'path';
import { FileIdentifier, FileStat, FileType, ICompletionsFileSystemService } from '../fileSystem';
import { getFsPath } from '../util/uri';

interface Exception extends Error {
	errno?: unknown;
	code?: unknown;
	path?: unknown;
	syscall?: unknown;
	cause?: unknown;
	toString(): string;
}

abstract class FakeFileNode {
	abstract readonly stats: FileStat;
	abstract readonly isDir: boolean;
}

type FakeFileEntries = { [key: string]: FakeFileNode };

class FakeFile extends FakeFileNode {
	readonly isDir = false;
	constructor(
		readonly content: string,
		readonly stats: FileStat
	) {
		super();
	}
}

class FakeDir extends FakeFileNode {
	readonly isDir = true;
	readonly entries: FakeFileEntries = {};
	constructor(readonly stats: FileStat) {
		super();
	}
}

export type FakeFileSystemConfig = { [key: string]: string | FakeFileNode | FakeFileSystemConfig };

/**
 * A fake for FileSystem that returns content and stats for a set of files
 * and folders configured for testing purposes.
 *
 * Accepts a configuration like the following:
 *
 * ```js
 *   {
 *     "/path/to/file": "file content",
 *     "/path/to/folder": {
 *       "file1": "file1 content",
 *       "file2": "file2 content",
 *     }
 *   }
 * ```
 *
 * It is also possible to control the results of `stat` by using `.file` and
 * `.directory` to create fakes:
 *
 * ```js
 *   {
 *     "/bigFile.txt": FakeFileSystem.file({ctime: 0, mtime: 0, size: 1000000}),
 *     "/futureFolder": FakeFileSystem.directory({
 *       ctime: Date.now() + 3600000,
 *       mtime: Date.now() + 3600000,
 *       size: 64}),
 *   }
 * ```
 */
export class FakeFileSystem implements ICompletionsFileSystemService {
	declare _serviceBrand: undefined;

	private root: FakeDir;

	constructor(fileConfig: FakeFileSystemConfig) {
		this.root = new FakeDir({ ctime: 0, mtime: 0, size: 0, type: FileType.Directory });
		this.createFiles('', fileConfig);
	}

	private createFiles(parent: string, config: FakeFileSystemConfig): void {
		for (const [key, value] of Object.entries(config)) {
			const path = join(parent, key);
			if (value instanceof FakeFileNode) {
				this.mkdir(dirname(path));
				this.writeNode(path, value);
			} else if (typeof value === 'string') {
				this.mkdir(dirname(path));
				this.writeFile(path, value);
			} else {
				this.mkdir(path);
				this.createFiles(path, value);
			}
		}
	}

	/** Recursively creates directories in path */
	mkdir(path: string): void {
		if (!this.getNode(this.root, this.pathParts(path), true, 'mkdir').isDir) {
			throw this.noEntryError(`mkdir '${path}'`);
		}
	}

	writeFile(path: string, data: string): void {
		this.writeNode(path, new FakeFile(data, { ctime: 0, mtime: 0, size: data.length, type: FileType.File }));
	}

	private writeNode(path: string, node: FakeFileNode): void {
		const parts = this.pathParts(path);
		const filename = parts.pop() || '';
		const parent = this.getNode(this.root, parts, false, 'writeFile');
		if (!(parent instanceof FakeDir)) {
			throw this.noEntryError(`writeFile '${path}'`);
		} else if (parent.entries[filename]?.isDir) {
			throw this.isDirectoryError(`open '${path}'`);
		}
		parent.entries[filename] = node;
	}

	async readFileString(uri: FileIdentifier): Promise<string> {
		const fsPath = getFsPath(uri) ?? '<invalid file URI>';
		const file = this.getNode(this.root, this.pathParts(fsPath), false, 'open');
		if (file.isDir) {
			throw this.isDirectoryError(`open '${fsPath}'`);
		}
		return Promise.resolve((file as FakeFile).content);
	}

	stat(uri: FileIdentifier): Promise<FileStat> {
		return Promise.resolve(this.getNode(this.root, this.pathParts(getFsPath(uri)!), false, 'stat').stats);
	}

	async readDirectory(uri: FileIdentifier): Promise<[string, FileType][]> {
		const fsPath = getFsPath(uri) ?? '<invalid file URI>';
		const node = this.getNode(this.root, this.pathParts(fsPath), false, 'readDirectory');
		if (!(node instanceof FakeDir)) {
			throw this.noEntryError(`readDirectory '${fsPath}'`);
		}
		return Promise.resolve(
			Object.entries(node.entries).map(([name, entry]) => [
				name,
				entry.isDir ? FileType.Directory : FileType.File,
			])
		);
	}

	private getNode(parent: FakeDir, parts: string[], createPath: boolean, command: string): FakeFileNode {
		let current: FakeFileNode = parent;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (!(current instanceof FakeDir) || current.entries[part] === undefined) {
				if (createPath && current instanceof FakeDir) {
					current.entries[part] = new FakeDir({ ctime: 0, mtime: 0, size: 0, type: FileType.Directory });
				} else {
					throw this.noEntryError(`${command} '${parts.join('/')}'`);
				}
			}
			current = current.entries[part];
		}
		return current;
	}

	private pathParts(path: string): string[] {
		const parts = normalize(path).split(/[\\/]+/);
		if (parts[0] === '') {
			parts.shift();
		}
		if (parts[parts.length - 1] === '') {
			parts.pop();
		}
		return parts;
	}

	private noEntryError(description: string): Error {
		const err: Exception = new Error(`ENOENT: no such file or directory, ${description}`);
		err.errno = -2;
		err.code = 'ENOENT';
		return err;
	}

	private isDirectoryError(description: string): Error {
		const err: Exception = new Error(`EISDIR: illegal operation on a directory, ${description}`);
		err.errno = -21;
		err.code = 'EISDIR';
		return err;
	}

	static file(content = '', stats?: Partial<FileStat>) {
		return new FakeFile(
			content,
			Object.assign({ ctime: 0, mtime: 0, size: content.length, type: FileType.File }, stats)
		);
	}

	static directory(stats?: Partial<FileStat>) {
		return new FakeDir(Object.assign({ ctime: 0, mtime: 0, size: 0, type: FileType.Directory }, stats));
	}
}
