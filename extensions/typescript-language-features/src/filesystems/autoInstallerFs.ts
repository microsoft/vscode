/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MemFs } from './memFs';
import { URI } from 'vscode-uri';
import { PackageManager, FileSystem, packagePath } from '@vscode/ts-package-manager';
import { join, basename, dirname } from 'path';

const TEXT_DECODER = new TextDecoder('utf-8');
const TEXT_ENCODER = new TextEncoder();

export class AutoInstallerFs implements vscode.FileSystemProvider {

	private readonly memfs = new MemFs();
	private readonly fs: FileSystem;
	private readonly projectCache = new Map<string, Set<string>>();
	private readonly watcher: vscode.FileSystemWatcher;
	private readonly _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

	constructor() {
		this.watcher = vscode.workspace.createFileSystemWatcher('**/{package.json,package-lock.json,package-lock.kdl}');
		const handler = (uri: URI) => {
			const root = dirname(uri.path);
			if (this.projectCache.delete(root)) {
				(async () => {
					const pm = new PackageManager(this.fs);
					const opts = await this.getInstallOpts(uri, root);
					const proj = await pm.resolveProject(root, opts);
					proj.pruneExtraneous();
					// TODO: should this fire on vscode-node-modules instead?
					// NB(kmarchan): This should tell TSServer that there's
					// been changes inside node_modules and it needs to
					// re-evaluate things.
					this._emitter.fire([{
						type: vscode.FileChangeType.Changed,
						uri: uri.with({ path: join(root, 'node_modules') })
					}]);
				})();
			}
		};
		this.watcher.onDidChange(handler);
		this.watcher.onDidCreate(handler);
		this.watcher.onDidDelete(handler);
		const memfs = this.memfs;
		memfs.onDidChangeFile((e) => {
			this._emitter.fire(e.map(ev => ({
				type: ev.type,
				// TODO: we're gonna need a MappedUri dance...
				uri: ev.uri.with({ scheme: 'memfs' })
			})));
		});
		this.fs = {
			readDirectory(path: string, _extensions?: readonly string[], _exclude?: readonly string[], _include?: readonly string[], _depth?: number): string[] {
				return memfs.readDirectory(URI.file(path)).map(([name, _]) => name);
			},

			deleteFile(path: string): void {
				memfs.delete(URI.file(path));
			},

			createDirectory(path: string): void {
				memfs.createDirectory(URI.file(path));
			},

			writeFile(path: string, data: string, _writeByteOrderMark?: boolean): void {
				memfs.writeFile(URI.file(path), TEXT_ENCODER.encode(data), { overwrite: true, create: true });
			},

			directoryExists(path: string): boolean {
				try {
					const stat = memfs.stat(URI.file(path));
					return stat.type === vscode.FileType.Directory;
				} catch (e) {
					return false;
				}
			},

			readFile(path: string, _encoding?: string): string | undefined {
				try {
					return TEXT_DECODER.decode(memfs.readFile(URI.file(path)));
				} catch (e) {
					return undefined;
				}
			}
		};
	}

	watch(resource: vscode.Uri): vscode.Disposable {
		const mapped = URI.file(new MappedUri(resource).path);
		console.log('watching', mapped);
		return this.memfs.watch(mapped);
	}

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		// console.log('stat', uri.toString());
		const mapped = new MappedUri(uri);

		// TODO: case sensitivity configuration

		// We pretend every single node_modules or @types directory ever actually
		// exists.
		if (basename(mapped.path) === 'node_modules' || basename(mapped.path) === '@types') {
			return {
				mtime: 0,
				ctime: 0,
				type: vscode.FileType.Directory,
				size: 0
			};
		}

		await this.ensurePackageContents(mapped);

		return this.memfs.stat(URI.file(mapped.path));
	}

	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		// console.log('readDirectory', uri.toString());
		const mapped = new MappedUri(uri);
		await this.ensurePackageContents(mapped);

		return this.memfs.readDirectory(URI.file(mapped.path));
	}

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		// console.log('readFile', uri.toString());
		const mapped = new MappedUri(uri);
		await this.ensurePackageContents(mapped);

		return this.memfs.readFile(URI.file(mapped.path));
	}

	writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean }): void {
		throw new Error('not implemented');
	}

	rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void {
		throw new Error('not implemented');
	}

	delete(_uri: vscode.Uri): void {
		throw new Error('not implemented');
	}

	createDirectory(_uri: vscode.Uri): void {
		throw new Error('not implemented');
	}

	private async ensurePackageContents(incomingUri: MappedUri): Promise<void> {
		// console.log('ensurePackageContents', incomingUri.path);

		// If we're not looking for something inside node_modules, bail early.
		if (!incomingUri.path.includes('node_modules')) {
			throw vscode.FileSystemError.FileNotFound();
		}

		// standard lib files aren't handled through here
		if (incomingUri.path.includes('node_modules/@typescript') || incomingUri.path.includes('node_modules/@types/typescript__')) {
			throw vscode.FileSystemError.FileNotFound();
		}

		const root = this.getProjectRoot(incomingUri.path);

		const pkgPath = packagePath(incomingUri.path);
		if (!root || this.projectCache.get(root)?.has(pkgPath)) {
			return;
		}

		const proj = await (new PackageManager(this.fs)).resolveProject(root, await this.getInstallOpts(incomingUri.original, root));

		const restore = proj.restorePackageAt(incomingUri.path);
		try {
			await restore;
		} catch (e) {
			console.error(`failed to restore package at ${incomingUri.path}: `, e);
			throw e;
		}
		if (!this.projectCache.has(root)) {
			this.projectCache.set(root, new Set());
		}
		this.projectCache.get(root)!.add(pkgPath);
	}

	private async getInstallOpts(originalUri: URI, root: string) {
		const vsfs = vscode.workspace.fs;
		let pkgJson;
		try {
			pkgJson = TEXT_DECODER.decode(await vsfs.readFile(originalUri.with({ path: join(root, 'package.json') })));
		} catch (e) { }

		let kdlLock;
		try {
			kdlLock = TEXT_DECODER.decode(await vsfs.readFile(originalUri.with({ path: join(root, 'package-lock.kdl') })));
		} catch (e) { }

		let npmLock;
		try {
			npmLock = TEXT_DECODER.decode(await vsfs.readFile(originalUri.with({ path: join(root, 'package-lock.json') })));
		} catch (e) { }

		return {
			pkgJson,
			kdlLock,
			npmLock
		};
	}

	private getProjectRoot(path: string): string | undefined {
		const pkgPath = path.match(/(^.*)\/node_modules/);
		return pkgPath?.[1];
	}

	// --- manage file events

}

class MappedUri {
	readonly raw: vscode.Uri;
	readonly original: vscode.Uri;
	readonly mapped: vscode.Uri;
	constructor(uri: vscode.Uri) {
		this.raw = uri;

		const parts = uri.path.match(/^\/([^\/]+)\/([^\/]*)(?:\/(.+))?$/);
		if (!parts) {
			throw new Error(`Invalid path: ${uri.path}`);
		}

		const scheme = parts[1];
		const authority = parts[2] === 'ts-nul-authority' ? '' : parts[2];
		const path = parts[3];
		this.original = URI.from({ scheme, authority, path: (path ? '/' + path : path) });
		this.mapped = this.original.with({ scheme: this.raw.scheme, authority: this.raw.authority });
	}

	get path() {
		return this.mapped.path;
	}
	get scheme() {
		return this.mapped.scheme;
	}
	get authority() {
		return this.mapped.authority;
	}
	get flatPath() {
		return join('/', this.scheme, this.authority, this.path);
	}
}
