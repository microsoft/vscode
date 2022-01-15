/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as tsAta from '@typescript/ata';
import * as path from 'path';
import * as ts from 'typescript/lib/typescript';
import * as vscode from 'vscode';
import TypeScriptServiceClientHost from './typeScriptServiceClientHost';
import { Disposable } from './utils/dispose';
import { Lazy } from './utils/lazy';

declare const TextEncoder: typeof import('util').TextEncoder;

class File implements vscode.FileStat {

	readonly type = vscode.FileType.File;
	ctime: number;
	mtime: number;
	size: number;

	readonly name: string;
	data?: Uint8Array;

	constructor(name: string) {
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
	}
}

class Directory implements vscode.FileStat {

	readonly type = vscode.FileType.Directory;
	ctime: number;
	mtime: number;
	size: number;

	readonly name: string;
	readonly entries: Map<string, File | Directory>;

	constructor(name: string) {
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.entries = new Map();
	}
}

export type Entry = File | Directory;

export class BrowserAtaManager extends Disposable implements vscode.FileSystemProvider {

	private readonly scheme = 'ts-typings';

	private readonly root = new Directory('');

	private readonly ata: (initialSourceFile: string) => void;

	constructor(
		lazyClientHost: Lazy<TypeScriptServiceClientHost>,
	) {
		super();

		this._register(vscode.workspace.registerFileSystemProvider(this.scheme, this, { isReadonly: true }));

		this._register(lazyClientHost.value.serviceClient.onInstallTypings((e) => this.addTypingsFile(e.unresolvedImports)));

		this.ata = tsAta.setupTypeAcquisition({
			projectName: 'My ATA Project',
			typescript: ts,
			logger: console,
			delegate: {
				receivedFile: (code: string, path: string) => {
					const ataResource = vscode.Uri.parse(this.scheme + '://' + path);

					const data = new TextEncoder().encode(code);
					this.writeFile(ataResource, data, { create: true, overwrite: true });

					vscode.workspace.openTextDocument(ataResource);
				},
				started: () => {
					console.log('ATA start');
				},
				progress: (downloaded: number, total: number) => {
					console.log(`Got ${downloaded} out of ${total}`);
				},
				finished: _vfs => {

				},
			},
		});
	}

	public addTypingsFile(unresolvedImports: string[]): void {
		this.ata?.(unresolvedImports.map(imp => `import '${imp}';`).join('\n'));
	}

	public readonly _onDidChangeFile = this._register(new vscode.EventEmitter<vscode.FileChangeEvent[]>());
	public readonly onDidChangeFile = this._onDidChangeFile.event;

	stat(uri: vscode.Uri): vscode.FileStat {
		const entry = this.lookup(uri,);
		if (!entry) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}

		return entry;
	}

	readFile(uri: vscode.Uri): Uint8Array {
		const file = this.lookupAsFile(uri);
		if (!file || !file.data) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		return file.data;
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
		const entry = this.lookupAsDirectory(uri);
		if (!entry) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		const result: [string, vscode.FileType][] = [];
		for (const [name, child] of entry.entries) {
			result.push([name, child.type]);
		}
		return result;
	}

	//#region FS write methods
	watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		throw new Error('Method not implemented.');
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		const basename = path.posix.basename(uri.path);
		const dirname = uri.with({ path: path.posix.dirname(uri.path) });
		const parent = this.lookupAsDirectory(dirname);
		if (!parent) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}

		const entry = new Directory(basename);
		parent.entries.set(entry.name, entry);
		parent.mtime = Date.now();
		parent.size += 1;
		this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri: dirname }, { type: vscode.FileChangeType.Created, uri }]);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
		// Ensure parent folders
		const basename = path.posix.basename(uri.path);
		const dirname = path.posix.dirname(uri.path);

		const parts = dirname.split('/');
		let parent: Entry = this.root;
		for (const part of parts.slice(1)) {
			if (parent.type !== vscode.FileType.Directory) {
				throw vscode.FileSystemError.FileIsADirectory(uri);
			}
			let newEntry = parent.entries.get(part);
			if (!newEntry) {
				newEntry = new Directory(part);
				parent.entries.set(newEntry.name, newEntry);
				parent.mtime = Date.now();
				parent.size += 1;
			}
			parent = newEntry;
		}

		if (!parent || parent.type !== vscode.FileType.Directory) {
			return;
		}

		let entry = parent.entries.get(dirname);
		if (entry instanceof Directory) {
			throw vscode.FileSystemError.FileIsADirectory(uri);
		}

		if (!entry && !options.create) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}

		if (entry && options.create && !options.overwrite) {
			throw vscode.FileSystemError.FileExists(uri);
		}

		if (!entry) {
			entry = new File(basename);
			parent.entries.set(basename, entry);
			this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Created, uri }]);
		}

		entry.mtime = Date.now();
		entry.size = content.byteLength;
		entry.data = content;

		this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }]);
	}

	delete(_uri: vscode.Uri, _options: { recursive: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}

	rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean; }): void | Thenable<void> {
		throw new Error('Method not implemented.');
	}
	//#endregion

	private lookupAsDirectory(uri: vscode.Uri): Directory | undefined {
		const entry = this.lookup(uri);
		if (!entry) {
			return undefined;
		}
		if (entry instanceof Directory) {
			return entry;
		}
		throw vscode.FileSystemError.FileNotADirectory(uri);
	}

	private lookupAsFile(uri: vscode.Uri): File | undefined {
		const entry = this.lookup(uri);
		if (!entry) {
			return undefined;
		}
		if (entry instanceof File) {
			return entry;
		}
		throw vscode.FileSystemError.FileIsADirectory(uri);
	}

	private lookup(uri: vscode.Uri): Entry | undefined {
		const parts = uri.path.split('/');
		let entry: Entry = this.root;
		for (const part of parts) {
			if (!part) {
				continue;
			}

			let child: Entry | undefined;
			if (entry instanceof Directory) {
				child = entry.entries.get(part);
			}
			if (!child) {
				return undefined;
			}
			entry = child;
		}
		return entry;
	}
}
