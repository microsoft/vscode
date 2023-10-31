/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { basename, dirname } from 'path';

export class MemFs implements vscode.FileSystemProvider {

	private readonly root = new FsEntry(
		new Map(),
		0,
		0,
	);

	stat(uri: vscode.Uri): vscode.FileStat {
		// console.log('stat', uri.toString());
		const entry = this.getEntry(uri);
		if (!entry) {
			throw vscode.FileSystemError.FileNotFound();
		}

		return entry;
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
		// console.log('readDirectory', uri.toString());

		const entry = this.getEntry(uri);
		if (!entry) {
			throw vscode.FileSystemError.FileNotFound();
		}

		return [...entry.contents.entries()].map(([name, entry]) => [name, entry.type]);
	}

	readFile(uri: vscode.Uri): Uint8Array {
		// console.log('readFile', uri.toString());

		const entry = this.getEntry(uri);
		if (!entry) {
			throw vscode.FileSystemError.FileNotFound();
		}

		return entry.data;
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, { create, overwrite }: { create: boolean; overwrite: boolean }): void {
		// console.log('writeFile', uri.toString());

		const dir = this.getParent(uri);

		const fileName = basename(uri.path);
		const dirContents = dir.contents;

		const time = Date.now() / 1000;
		const entry = dirContents.get(basename(uri.path));
		if (!entry) {
			if (create) {
				dirContents.set(fileName, new FsEntry(content, time, time));
				this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
			} else {
				throw vscode.FileSystemError.FileNotFound();
			}
		} else {
			if (overwrite) {
				entry.mtime = time;
				entry.data = content;
				this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
			} else {
				throw vscode.FileSystemError.NoPermissions('overwrite option was not passed in');
			}
		}
	}

	rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void {
		throw new Error('not implemented');
	}

	delete(uri: vscode.Uri): void {
		try {
			const dir = this.getParent(uri);
			dir.contents.delete(basename(uri.path));
			this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
		} catch (e) { }
	}

	createDirectory(uri: vscode.Uri): void {
		// console.log('createDirectory', uri.toString());
		const dir = this.getParent(uri);
		const now = Date.now() / 1000;
		dir.contents.set(basename(uri.path), new FsEntry(new Map(), now, now));
	}

	private getEntry(uri: vscode.Uri): FsEntry | void {
		// TODO: have this throw FileNotFound itself?
		// TODO: support configuring case sensitivity
		let node: FsEntry = this.root;
		for (const component of uri.path.split('/')) {
			if (!component) {
				// Skip empty components (root, stuff between double slashes,
				// trailing slashes)
				continue;
			}

			if (node.type !== vscode.FileType.Directory) {
				// We're looking at a File or such, so bail.
				return;
			}

			const next = node.contents.get(component);

			if (!next) {
				// not found!
				return;
			}

			node = next;
		}
		return node;
	}

	private getParent(uri: vscode.Uri) {
		const dir = this.getEntry(uri.with({ path: dirname(uri.path) }));
		if (!dir) {
			throw vscode.FileSystemError.FileNotFound();
		}
		return dir;
	}

	// --- manage file events

	private readonly _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;
	private readonly watchers = new Map<string, Set<Symbol>>;

	watch(resource: vscode.Uri): vscode.Disposable {
		if (!this.watchers.has(resource.path)) {
			this.watchers.set(resource.path, new Set());
		}
		const sy = Symbol(resource.path);
		return new vscode.Disposable(() => {
			const watcher = this.watchers.get(resource.path);
			if (watcher) {
				watcher.delete(sy);
				if (!watcher.size) {
					this.watchers.delete(resource.path);
				}
			}
		});
	}
}

class FsEntry {
	get type(): vscode.FileType {
		if (this._data instanceof Uint8Array) {
			return vscode.FileType.File;
		} else {
			return vscode.FileType.Directory;
		}
	}

	get size(): number {
		if (this.type === vscode.FileType.Directory) {
			return [...this.contents.values()].reduce((acc: number, entry: FsEntry) => acc + entry.size, 0);
		} else {
			return this.data.length;
		}
	}

	constructor(
		private _data: Uint8Array | Map<string, FsEntry>,
		public ctime: number,
		public mtime: number,
	) { }

	get data() {
		if (this.type === vscode.FileType.Directory) {
			throw vscode.FileSystemError.FileIsADirectory;
		}
		return <Uint8Array>this._data;
	}
	set data(val: Uint8Array) {
		if (this.type === vscode.FileType.Directory) {
			throw vscode.FileSystemError.FileIsADirectory;
		}
		this._data = val;
	}

	get contents() {
		if (this.type !== vscode.FileType.Directory) {
			throw vscode.FileSystemError.FileNotADirectory;
		}
		return <Map<string, FsEntry>>this._data;
	}
}
