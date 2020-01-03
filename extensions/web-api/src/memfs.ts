import * as vscode from 'vscode';

// @ts-ignore
import { StorageArea } from 'kv-storage-polyfill';
const fileStorage = new StorageArea('fs');
console.log('fileStorage', fileStorage);

// @ts-ignore
export class MemFS implements vscode.FileSystemProvider, vscode.FileSearchProvider, vscode.TextSearchProvider {
	root = new Directory(vscode.Uri.parse('memfs:/'), '');
	// --- manage file metadata
	stat(uri: vscode.Uri): vscode.FileStat {
		return this._lookup(uri, false);
	}
	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
		const entry = this._lookupAsDirectory(uri, false);
		let result: [string, vscode.FileType][] = [];
		for (const [name, child] of entry.entries) {
			result.push([name, child.type]);
		}
		return result;
	}
	// --- manage file contents
	readFile(uri: vscode.Uri): Uint8Array {
		const data = this._lookupAsFile(uri, false).data;
		if (data) {
			return data;
		}
		throw vscode.FileSystemError.FileNotFound();
	}
	writeFile(uri: vscode.Uri, content: Uint8Array, options: {
		create: boolean;
		overwrite: boolean;
	}): void {
		let basename = this._basename(uri.path);
		let parent = this._lookupParentDirectory(uri);
		let entry = parent.entries.get(basename);
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
			entry = new File(uri, basename);
			parent.entries.set(basename, entry);
			this._fireSoon({ type: vscode.FileChangeType.Created, uri });
		}
		entry.mtime = Date.now();
		entry.size = content.byteLength;
		entry.data = content;
		this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
	}
	// --- manage files/folders
	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: {
		overwrite: boolean;
	}): void {
		if (!options.overwrite && this._lookup(newUri, true)) {
			throw vscode.FileSystemError.FileExists(newUri);
		}
		let entry = this._lookup(oldUri, false);
		let oldParent = this._lookupParentDirectory(oldUri);
		let newParent = this._lookupParentDirectory(newUri);
		let newName = this._basename(newUri.path);
		oldParent.entries.delete(entry.name);
		entry.name = newName;
		newParent.entries.set(newName, entry);
		this._fireSoon({ type: vscode.FileChangeType.Deleted, uri: oldUri }, { type: vscode.FileChangeType.Created, uri: newUri });
	}
	delete(uri: vscode.Uri): void {
		let dirname = uri.with({ path: this._dirname(uri.path) });
		let basename = this._basename(uri.path);
		let parent = this._lookupAsDirectory(dirname, false);
		if (!parent.entries.has(basename)) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		parent.entries.delete(basename);
		parent.mtime = Date.now();
		parent.size -= 1;
		this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { uri, type: vscode.FileChangeType.Deleted });
	}
	createDirectory(uri: vscode.Uri): void {
		let basename = this._basename(uri.path);
		let dirname = uri.with({ path: this._dirname(uri.path) });
		let parent = this._lookupAsDirectory(dirname, false);
		let entry = new Directory(uri, basename);
		parent.entries.set(entry.name, entry);
		parent.mtime = Date.now();
		parent.size += 1;
		this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { type: vscode.FileChangeType.Created, uri });
	}
	// --- lookup
	private _lookup(uri: vscode.Uri, silent: false): Entry;
	private _lookup(uri: vscode.Uri, silent: boolean): Entry | undefined;
	private _lookup(uri: vscode.Uri, silent: boolean): Entry | undefined {
		let parts = uri.path.split('/');
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
				if (!silent) {
					throw vscode.FileSystemError.FileNotFound(uri);
				}
				else {
					return undefined;
				}
			}
			entry = child;
		}
		return entry;
	}
	private _lookupAsDirectory(uri: vscode.Uri, silent: boolean): Directory {
		let entry = this._lookup(uri, silent);
		if (entry instanceof Directory) {
			return entry;
		}
		throw vscode.FileSystemError.FileNotADirectory(uri);
	}
	private _lookupAsFile(uri: vscode.Uri, silent: boolean): File {
		let entry = this._lookup(uri, silent);
		if (entry instanceof File) {
			return entry;
		}
		throw vscode.FileSystemError.FileIsADirectory(uri);
	}
	private _lookupParentDirectory(uri: vscode.Uri): Directory {
		const dirname = uri.with({ path: this._dirname(uri.path) });
		return this._lookupAsDirectory(dirname, false);
	}
	// --- manage file events
	private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	private _bufferedEvents: vscode.FileChangeEvent[] = [];
	private _fireSoonHandle?: NodeJS.Timer;
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;
	watch(_resource: vscode.Uri): vscode.Disposable {
		// ignore, fires for all changes...
		return new vscode.Disposable(() => { });
	}
	private _fireSoon(...events: vscode.FileChangeEvent[]): void {
		this._bufferedEvents.push(...events);
		if (this._fireSoonHandle) {
			clearTimeout(this._fireSoonHandle);
		}
		this._fireSoonHandle = setTimeout(() => {
			this._emitter.fire(this._bufferedEvents);
			this._bufferedEvents.length = 0;
		}, 5);
	}
	// --- path utils
	private _basename(path: string): string {
		path = this._rtrim(path, '/');
		if (!path) {
			return '';
		}
		return path.substr(path.lastIndexOf('/') + 1);
	}
	private _dirname(path: string): string {
		path = this._rtrim(path, '/');
		if (!path) {
			return '/';
		}
		return path.substr(0, path.lastIndexOf('/'));
	}
	private _rtrim(haystack: string, needle: string): string {
		if (!haystack || !needle) {
			return haystack;
		}
		const needleLen = needle.length, haystackLen = haystack.length;
		if (needleLen === 0 || haystackLen === 0) {
			return haystack;
		}
		let offset = haystackLen, idx = -1;
		while (true) {
			idx = haystack.lastIndexOf(needle, offset - 1);
			if (idx === -1 || idx + needleLen !== offset) {
				break;
			}
			if (idx === 0) {
				return '';
			}
			offset = idx;
		}
		return haystack.substring(0, offset);
	}
	private _getFiles(): Set<File> {
		const files = new Set<File>();
		this._doGetFiles(this.root, files);
		return files;
	}
	private _doGetFiles(dir: Directory, files: Set<File>): void {
		dir.entries.forEach(entry => {
			if (entry instanceof File) {
				files.add(entry);
			}
			else {
				this._doGetFiles(entry, files);
			}
		});
	}
	private _convertSimple2RegExpPattern(pattern: string): string {
		return pattern.replace(/[\-\\\{\}\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&').replace(/[\*]/g, '.*');
	}
	// --- search provider
	// @ts-ignore
	provideFileSearchResults(query: vscode.FileSearchQuery, _options: vscode.FileSearchOptions, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Uri[]> {
		return this._findFiles(query.pattern);
	}
	private _findFiles(query: string | undefined): vscode.Uri[] {
		const files = this._getFiles();
		const result: vscode.Uri[] = [];
		const pattern = query ? new RegExp(this._convertSimple2RegExpPattern(query)) : null;
		for (const file of files) {
			if (!pattern || pattern.exec(file.name)) {
				result.push(file.uri);
			}
		}
		return result;
	}
	private _textDecoder = new TextDecoder();
	// @ts-ignore
	provideTextSearchResults(query: vscode.TextSearchQuery, options: vscode.TextSearchOptions, progress: vscode.Progress<vscode.TextSearchResult>, _token: vscode.CancellationToken) {
		// @ts-ignore
		const result: vscode.TextSearchComplete = { limitHit: false };
		const files = this._findFiles(options.includes[0]);
		if (files) {
			for (const file of files) {
				const content = this._textDecoder.decode(this.readFile(file));
				const lines = content.split('\n');
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					const index = line.indexOf(query.pattern);
					if (index !== -1) {
						progress.report({
							uri: file,
							ranges: new vscode.Range(new vscode.Position(i, index), new vscode.Position(i, index + query.pattern.length)),
							preview: {
								text: line,
								matches: new vscode.Range(new vscode.Position(0, index), new vscode.Position(0, index + query.pattern.length))
							}
						});
					}
				}
			}
		}
		return result;
	}
}

export class File implements vscode.FileStat {

	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	data?: Uint8Array;

	constructor(public uri: vscode.Uri, name: string) {
		this.type = vscode.FileType.File;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
	}
}

export class Directory implements vscode.FileStat {

	type: vscode.FileType;
	ctime: number;
	mtime: number;
	size: number;

	name: string;
	entries: Map<string, File | Directory>;

	constructor(public uri: vscode.Uri, name: string) {
		this.type = vscode.FileType.Directory;
		this.ctime = Date.now();
		this.mtime = Date.now();
		this.size = 0;
		this.name = name;
		this.entries = new Map();
	}
}

export type Entry = File | Directory;

