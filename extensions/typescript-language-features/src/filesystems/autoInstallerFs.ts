/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PackageManager, ResolvedProject } from '@vscode/ts-package-manager';
import { basename, join } from 'path';
import * as vscode from 'vscode';
import { URI } from 'vscode-uri';
import { Disposable } from '../utils/dispose';
import { MemFs } from './memFs';
import { Logger } from '../logging/logger';

const TEXT_DECODER = new TextDecoder('utf-8');
const TEXT_ENCODER = new TextEncoder();

export class AutoInstallerFs extends Disposable implements vscode.FileSystemProvider {

	private readonly memfs: MemFs;
	private readonly packageManager: PackageManager;
	private readonly _projectCache = new Map</* root */ string, Promise<void> | undefined>();

	private readonly _emitter = this._register(new vscode.EventEmitter<vscode.FileChangeEvent[]>());
	readonly onDidChangeFile = this._emitter.event;

	constructor(
		private readonly logger: Logger
	) {
		super();

		const memfs = new MemFs('auto-installer', logger);
		this.memfs = memfs;
		memfs.onDidChangeFile((e) => {
			this._emitter.fire(e.map(ev => ({
				type: ev.type,
				// TODO: we're gonna need a MappedUri dance...
				uri: ev.uri.with({ scheme: 'memfs' })
			})));
		});

		this.packageManager = new PackageManager({
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
		});
	}

	watch(resource: vscode.Uri): vscode.Disposable {
		this.logger.trace(`AutoInstallerFs.watch. Resource: ${resource.toString()}}`);
		return this.memfs.watch(resource);
	}

	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		this.logger.trace(`AutoInstallerFs.stat: ${uri}`);

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
		this.logger.trace(`AutoInstallerFs.readDirectory: ${uri}`);

		const mapped = new MappedUri(uri);
		await this.ensurePackageContents(mapped);

		return this.memfs.readDirectory(URI.file(mapped.path));
	}

	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		this.logger.trace(`AutoInstallerFs.readFile: ${uri}`);

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
		// If we're not looking for something inside node_modules, bail early.
		if (!incomingUri.path.includes('node_modules')) {
			throw vscode.FileSystemError.FileNotFound();
		}

		// standard lib files aren't handled through here
		if (incomingUri.path.includes('node_modules/@typescript') || incomingUri.path.includes('node_modules/@types/typescript__')) {
			throw vscode.FileSystemError.FileNotFound();
		}

		const root = await this.getProjectRoot(incomingUri.original);
		if (!root) {
			return;
		}

		this.logger.trace(`AutoInstallerFs.ensurePackageContents. Path: ${incomingUri.path}, Root: ${root}`);

		const existingInstall = this._projectCache.get(root);
		if (existingInstall) {
			this.logger.trace(`AutoInstallerFs.ensurePackageContents. Found ongoing install for: ${root}/node_modules`);
			return existingInstall;
		}

		const installing = (async () => {
			let proj: ResolvedProject;
			try {
				proj = await this.packageManager.resolveProject(root, await this.getInstallOpts(incomingUri.original, root));
			} catch (e) {
				console.error(`failed to resolve project at ${incomingUri.path}: `, e);
				return;
			}

			try {
				await proj.restore();
			} catch (e) {
				console.error(`failed to restore package at ${incomingUri.path}: `, e);
			}
		})();
		this._projectCache.set(root, installing);
		await installing;
	}

	private async getInstallOpts(originalUri: URI, root: string) {
		const vsfs = vscode.workspace.fs;

		// We definitely need a package.json to be there.
		const pkgJson = TEXT_DECODER.decode(await vsfs.readFile(originalUri.with({ path: join(root, 'package.json') })));

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

	private async getProjectRoot(incomingUri: URI): Promise<string | undefined> {
		const vsfs = vscode.workspace.fs;
		const pkgPath = incomingUri.path.match(/^(.*?)\/node_modules/);
		const ret = pkgPath?.[1];
		if (!ret) {
			return;
		}
		try {
			await vsfs.stat(incomingUri.with({ path: join(ret, 'package.json') }));
			return ret;
		} catch (e) {
			return;
		}
	}
}

class MappedUri {
	readonly raw: vscode.Uri;
	readonly original: vscode.Uri;
	readonly mapped: vscode.Uri;
	constructor(uri: vscode.Uri) {
		this.raw = uri;

		const parts = uri.path.match(/^\/([^\/]+)\/([^\/]*)(?:\/(.+))?$/);
		if (!parts) {
			throw new Error(`Invalid uri: ${uri.toString()}, ${uri.path}`);
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
