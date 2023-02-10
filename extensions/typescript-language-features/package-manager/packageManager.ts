/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename, dirname, isAbsolute, join } from 'path';
import { resolveManifest, initSync, Nassun, NodeMaintainer, Package } from './node-maintainer';
import nmWasm from './node-maintainer/node_maintainer_bg.wasm';

initSync(dataURItoUint8Array(nmWasm as unknown as string));

const decoder = new TextDecoder();

export interface InstallProjectOpts {
	addPackages?: string[];
	removePackages?: string[];
	packageType?: PackageType;
	pkgJson?: string;
	npmLock?: string;
	kdlLock?: string;
}

export enum PackageType {
	Dependency = 'dependencies',
	DevDependency = 'devDependencies',
	OptionalDependency = 'optionalDependencies',
	PeerDependency = 'peerDependencies',
}

// This is the subset of ts.server.System that we actually need.
export interface FileSystem {
	readDirectory(path: string, extensions?: readonly string[], exclude?: readonly string[], include?: readonly string[], depth?: number): string[];
	deleteFile?(path: string): void;
	createDirectory(path: string): void;
	writeFile(path: string, data: string, writeByteOrderMark?: boolean): void;
	directoryExists(path: string): boolean;
	readFile(path: string, encoding?: string): string | undefined;
}

// The meta file is placed in `node_modules/.meta.json` and records what
// packages have actually been installed.
interface MetaFile {
	packages?: Record<string, { name: string; resolved: string }>;
}

export class PackageManager {
	private readonly nassun: Nassun = new Nassun({});

	constructor(private readonly fs: FileSystem) { }

	async resolveProject(root: string, opts: InstallProjectOpts = {}) {
		if (opts.addPackages || opts.removePackages) {
			await this.updateJson(join(root, 'package.json'), opts);
		}
		console.time(`dependency resolution: ${root}`);
		const maintainer = await this.resolveMaintainer(root, opts);
		console.timeEnd(`dependency resolution: ${root}`);
		return new ResolvedProject(this.fs, maintainer, root);
	}

	private async updateJson(packageJsonPath: string, opts: InstallProjectOpts = {}) {
		const packageType = opts.packageType ?? PackageType.Dependency;
		const corgis = await Promise.all((opts.addPackages ?? []).map(async pkg => this.nassun.corgiMetadata(pkg)));
		let pkgJson;
		try {
			pkgJson = this.readJson(packageJsonPath);
		} catch (e) {
			console.error('failed to read package.json', e);
			pkgJson = {};
		}

		for (const packageName of opts.removePackages ?? []) {
			delete pkgJson.dependencies?.[packageName];
			delete pkgJson.devDependencies?.[packageName];
			delete pkgJson.optionalDependencies?.[packageName];
			delete pkgJson.peerDependencies?.[packageName];
		}

		for (const corgi of corgis) {
			if (!pkgJson[packageType]) {
				pkgJson[packageType] = {};
			}
			pkgJson[packageType][corgi.name] = `^${corgi.version}`;
		}

		const stringified = JSON.stringify(pkgJson, undefined, 2);
		this.fs.writeFile(packageJsonPath, stringified);
	}

	private async resolveMaintainer(root: string, opts: InstallProjectOpts): Promise<NodeMaintainer> {
		const pkgJson = opts.pkgJson || this.fs.readFile(join(root, 'package.json')) || '{}';
		const kdlPkgLock = opts.kdlLock || this.fs.readFile(join(root, 'package-lock.kdl'));
		const npmPkgLock = opts.npmLock || this.fs.readFile(join(root, 'package-lock.json'));
		return resolveManifest(JSON.parse(pkgJson.trim()), { kdlLock: kdlPkgLock, npmLock: npmPkgLock });
	}

	/**
	 * What it says on the tin. Reads a JSON file from the given path. Throws
	 * if the file doesn't exist (as opposed to returning `undefined`, like
	 * fs.readFile does).
	 */
	private readJson(path: string): any {
		const data = this.fs.readFile(path);
		if (!data) {
			throw new Error('Failed to read file: ' + path);
		}
		return JSON.parse(data.trim());
	}
}

/**
 * An entry extracted from a package tarball.
 */
interface Entry {
	type: number;
	mtime: number;
	size: number;
	path: string;
	contents: ReadableStream<Uint8Array>;
}

export class ResolvedProject {
	private readonly prefix: string;
	private readonly metaPath: string;

	constructor(private readonly fs: FileSystem, private readonly maintainer: NodeMaintainer, private readonly root: string) {
		this.prefix = join(root, 'node_modules');
		this.metaPath = join(this.prefix, '.meta.json');
	}

	/**
	 * Synchronizes the project's node_modules directory with the current resolved dependencies, pruning any extraneous ones.
	 */
	async restore() {
		console.time(`project restore: ${this.root}`);
		this.pruneExtraneous();
		await this.extractMissing();
		this.writeLockfile();
		console.timeEnd(`project restore: ${this.root}`);
	}

	/**
	 * Extracts a package at the given path. If a package has already been
	 * extracted to that location, it will be replaced.
	 *
	 * @param path to a package
	 * @returns The number of files extracted, or undefined if the path
	 */
	async restorePackageAt(path: string): Promise<number | undefined> {
		console.time(`restore package at: ${path}`);
		this.checkPath(path);
		const meta: MetaFile = JSON.parse(this.fs.readFile(this.metaPath) || '{}');
		if (!meta.packages) {
			meta.packages = {};
		}
		const projRoot = this.getProjectRoot(path);

		if (!projRoot) {
			console.error('root not found for ', path);
			console.timeEnd(`restore package at: ${path}`);
			return;
		}

		const pkgPath = packagePath(path);
		const pkg = this.packageAtPath(path.slice(projRoot.length));
		if (!pkg) {
			console.error('no package at path', path, pkgPath);
			console.timeEnd(`restore package at: ${path}`);
			return;
		}

		if (pkg && pkgPath && meta.packages?.[pkgPath.slice(this.prefix.length)]?.resolved === pkg.resolved) {
			// Already installed and synced. No need to do anything else!
			console.timeEnd(`restore package at: ${path}`);
			return;
		} else {
			rimraf(this.fs, pkgPath);
		}

		let count;
		try {
			// NB(zkat): load-bearing `await`. We need to await here because
			// otherwise we'll have a use-after-free error when extracting the
			// package entries.
			count = await this.extractPackageTo(pkg, pkgPath);
			meta.packages[pkgPath.slice(this.prefix.length)] = {
				name: pkg.name,
				resolved: pkg.resolved
			};
		} catch (e) {
			console.error('error extracting: ', e);
			console.timeEnd(`restore package at: ${path}`);
			throw e;
		} finally {
			pkg.free();
		}
		rimraf(this.fs, this.metaPath);
		this.fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2));
		this.writeLockfile();
		console.timeEnd(`restore package at: ${path}`);
		return count;
	}

	/**
	 * Deletes/prunes files and directories that aren't expected to be there
	 * by the currently-calculated tree. Extraneous calculation happens based on the contents of `.meta.json`
	 * @returns
	 */
	pruneExtraneous(): number {
		const meta = JSON.parse(this.fs.readFile(this.metaPath) || '{}');
		let count = 0;

		if (!this.fs.directoryExists(this.prefix)) {
			return count;
		}

		for (const entryPath of walkDir(this.fs, this.prefix)) {
			if (entryPath === this.metaPath) {
				// Leave the meta path alone.
				continue;
			}
			const pkgPath = packagePath(entryPath);
			// Only look at toplevel package paths.
			if (pkgPath === entryPath) {
				const subPath = pkgPath.slice(this.prefix.length);
				const pkg = this.packageAtPath(subPath);
				try {
					if (pkg && meta.packages?.[pkgPath.slice(this.prefix.length)]?.resolved === pkg.resolved) {
						// There's a valid package here. Move along.
					} else {
						// Extraneous!
						count++;
						rimraf(this.fs, entryPath);
					}
				} finally {
					pkg?.free();
				}
			}
		}

		return count;
	}

	private packageAtPath(path: string): Package | undefined {
		return this.maintainer.packageAtPath(path);
	}

	private getProjectRoot(path: string): string | undefined {
		const pkgPath = path.match(/(^.*\/)node_modules/);
		return pkgPath?.[1];
	}

	private checkPath(path: string) {
		if (!path.startsWith(this.root)) {
			throw new Error(`Path ${path} is not in project root ${this.root}`);
		}
		if (!isAbsolute(path)) {
			throw new Error(`Path ${path} is not absolute`);
		}
	}

	private async extractPackageTo(pkg: Package, pkgPath: string): Promise<number | undefined> {
		const mkdirCache = new Set<string>();
		mkdirp(mkdirCache, this.fs, pkgPath);
		// Clean up the directory, in case it already exists, but leave
		// node_modules alone to avoid clobbering other packages.
		for (const file of this.fs.readDirectory(pkgPath)) {
			if (basename(file) === 'node_modules') {
				continue;
			}
			rimraf(this.fs, file);
		}
		const entries = <ReadableStream<Entry>>await pkg.entries();
		const reader = entries.getReader();
		let fileCount = 0;
		while (true) {
			const { done, value: entry } = await reader.read();
			if (done) {
				break;
			}

			// Strip the first level of a package, just like NPM does.
			const entryPath = join(pkgPath, entry.path.replace(/^([^/]*\/)?/, ''));

			// We simulate directories based on files we find.
			mkdirp(mkdirCache, this.fs, dirname(entryPath));
			// Types are registered here:
			// https://www.gnu.org/software/tar/manual/html_node/Standard.html.
			// You can get these numbers by just doing `'5'.codePointAt(0)`,
			// but we may as well hard-code the three values we actually care
			// about here.
			if (entry.type === 53) {
				// '5' == 53 == directory
				mkdirp(mkdirCache, this.fs, entryPath);
				await drainStream(entry.contents);
			} else if (entry.type === 0 || entry.type === 48) {
				// '0' == 48 or '\x00' == 0 == regular file
				const data = await streamToArrayBuffer(entry.contents, entry.size);
				this.fs.writeFile(entryPath, decoder.decode(data));
				fileCount++;
			} else {
				// Anything else, we throw away, but we have to make sure to
				// drain any contents before we can continue reading the
				// tarball.
				await drainStream(entry.contents);
			}
		}

		return fileCount;
	}

	private async extractMissing() {
		const meta: MetaFile = { packages: {} };
		await this.maintainer.forEachPackage(async (pkg: Package, path: string) => {
			const fullPath = join(this.prefix, path);
			meta.packages![path] = {
				name: pkg.name,
				resolved: pkg.resolved
			};
			try {
				if (!this.fs.directoryExists(fullPath)) {
					await this.extractPackageTo(pkg, fullPath);
				}
			} finally {
				pkg.free();
			}
		});
		rimraf(this.fs, this.metaPath);
		this.fs.writeFile(this.metaPath, JSON.stringify(meta, null, 2));
	}

	private writeLockfile() {
		this.fs.writeFile(join(this.root, 'package-lock.kdl'), this.maintainer.toKdl());
	}

}

//---- Utils

/**
 * Given a full path to a particular file, presumably inside a package,
 * this returns the path of the package containing that file.
 * @param path the full file path to the file.
 * @returns the subpath of the package itself
 */
export function packagePath(path: string): string {
	return path.replace(/(^.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\/?(?!node_modules\/).*/, '$1');
}

// via https://stackoverflow.com/questions/12168909/blob-from-dataurl
function dataURItoUint8Array(dataURI: string) {
	const byteString = atob(dataURI.split(',')[1]);
	const ab = new ArrayBuffer(byteString.length);
	const ia = new Uint8Array(ab);
	for (let i = 0; i < byteString.length; i++) {
		ia[i] = byteString.charCodeAt(i);
	}
	return ia;
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<void> {
	const reader = stream.getReader();
	while (true) { // eslint-disable-line no-constant-condition
		const { done } = await reader.read();
		if (done) {
			break;
		}
	}
	return reader.closed;
}

async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>, length: number): Promise<Uint8Array> {
	const result = new Uint8Array(length);
	const reader = stream.getReader();
	let idx = 0;
	while (true) { // eslint-disable-line no-constant-condition
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		result.set(value, idx);
		idx += value.length;
	}
	return result;
}

function* walkDir(fs: FileSystem, path: string) {
	let contents = fs.readDirectory(path);
	while (contents.length) {
		const entry = contents.shift()!;
		const entryPath = join(path, entry);
		if (fs.directoryExists(entryPath)) {
			contents = fs.readDirectory(entryPath).map(e => join(entry, e)).concat(contents);
		}
		yield entryPath;
	}
}

function mkdirp(cache: Set<string>, fs: FileSystem, path: string) {
	path.split('/').reduce((dir: string, next: string) => {
		const joined = join(dir, next);
		if (!cache.has(joined) && !fs.directoryExists(joined)) {
			fs.createDirectory(joined);
			cache.add(joined);
		}
		return joined;
	}, '');
}

function rimraf(fs: FileSystem, path: string) {
	if (fs.directoryExists(path)) {
		for (const subPath of fs.readDirectory(path).map(e => join(path, e))) {
			rimraf(fs, subPath);
		}
	}
	try {
		fs.deleteFile?.(path);
	} catch (e) {
		// shou ga nai
	}
}
