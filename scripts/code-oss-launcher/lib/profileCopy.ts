/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Copies profile trees for the launcher. Copy time is dominated by per-file overhead, so files are
// copied concurrently. Reused run directories are synced: only files whose source changed, or
// whose copy Code changed, are copied again, and files removed from the source are removed.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { writeStderr } from './output.ts';

/**
 * What a slim profile copy leaves out: transient, regenerable, or known-unneeded state.
 * Patterns starting with `/` match top-level entries; patterns containing `/` match consecutive
 * path segments at any depth; other patterns match entry names. `*` is the only wildcard.
 */
const profileExcludePatterns: readonly string[] = [
	'/extensions', // copied separately
	'/workspaceStorage', 'User/workspaceStorage', // per-workspace state, including chat sessions
	'User/History', // local file edit history
	'/CachedExtensionVSIXs',
	'/logs',
	'/Cache', '/Code Cache', '/CachedData', '/component_crx_cache',
	'/GPUCache', '/ShaderCache', '/Dawn*Cache',
	'Partitions/vscode-browser/Cache', 'Partitions/vscode-browser/Code Cache',
	'Partitions/vscode-browser/GPUCache', 'Partitions/vscode-browser/Dawn*Cache',
	'/Backups', '/blob_storage', '/BrowserMetrics', '/Crashpad',
	'/Session Storage',
	'/Singleton*',
	'*.lock', '*.sock',
];

type CompiledPattern =
	| { readonly kind: 'topLevel' | 'name'; readonly regExp: RegExp }
	| { readonly kind: 'segments'; readonly regExps: readonly RegExp[] };

// Matches the case sensitivity of the platform's default file system
const globFlags = process.platform === 'linux' ? '' : 'i';

function compileGlob(glob: string): RegExp {
	const source = glob.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
	return new RegExp(`^${source}$`, globFlags);
}

const compiledProfileExcludePatterns: readonly CompiledPattern[] = profileExcludePatterns.map((pattern): CompiledPattern => {
	if (pattern.startsWith('/')) {
		return { kind: 'topLevel', regExp: compileGlob(pattern.slice(1)) };
	}
	if (pattern.includes('/')) {
		return { kind: 'segments', regExps: pattern.split('/').map(compileGlob) };
	}
	return { kind: 'name', regExp: compileGlob(pattern) };
});

/**
 * Whether a slim profile copy leaves out the entry at the given path segments, relative to the profile root.
 */
export function isExcludedFromProfileCopy(segments: readonly string[]): boolean {
	const name = segments[segments.length - 1];
	for (const pattern of compiledProfileExcludePatterns) {
		switch (pattern.kind) {
			case 'topLevel':
				if (segments.length === 1 && pattern.regExp.test(name)) {
					return true;
				}
				break;
			case 'name':
				if (pattern.regExp.test(name)) {
					return true;
				}
				break;
			case 'segments':
				for (let start = 0; start + pattern.regExps.length <= segments.length; start++) {
					if (pattern.regExps.every((regExp, index) => regExp.test(segments[start + index]))) {
						return true;
					}
				}
				break;
		}
	}
	return false;
}

/**
 * The files and directories of a copied tree, used to sync a reused copy.
 * Files map relative paths to `[size, mtimeMs]` of the source at copy time.
 */
export interface ITreeManifest {
	readonly files: Readonly<Record<string, readonly [number, number]>>;
	readonly directories: readonly string[];
}

interface ITreeScan {
	readonly files: Map<string, readonly [number, number]>;
	readonly directories: string[];
}

export interface ISyncResult {
	readonly manifest: ITreeManifest;
	readonly copiedFiles: number;
	readonly deletedFiles: number;
}

/**
 * Makes `destination` match `source`. Without a previous manifest, everything is copied. With one,
 * only files that changed in the source or in the destination are copied, and files removed from
 * the source are deleted. Files that only exist in the destination, such as caches Code created,
 * are kept.
 */
export async function syncTree(source: string, destination: string, previous: ITreeManifest | undefined, isExcluded?: (segments: readonly string[]) => boolean): Promise<ISyncResult> {
	const scan = await scanTree(source, isExcluded);
	const previousDirectories = new Set(previous?.directories);
	await createDirectories(destination, scan.directories.filter(directory => !previousDirectories.has(directory)));

	const toCopy: string[] = [];
	await forEachConcurrent([...scan.files], 64, async ([relative, record]) => {
		const previousRecord = previous?.files[relative];
		if (!previousRecord || !isSameRecord(previousRecord, record) || !isSameRecord(await statRecord(path.join(destination, relative)), record)) {
			toCopy.push(relative);
		}
	});
	await copyFiles(source, destination, toCopy);

	const deleted = previous ? Object.keys(previous.files).filter(relative => !scan.files.has(relative)) : [];
	await forEachConcurrent(deleted, 64, relative => fs.rm(path.join(destination, relative), { force: true }));

	return {
		manifest: { files: Object.fromEntries(scan.files), directories: scan.directories },
		copiedFiles: toCopy.length,
		deletedFiles: deleted.length,
	};
}

/**
 * Which extensions to copy: all of them, or only those with the given IDs.
 */
export type ExtensionSelection = { readonly kind: 'all' } | { readonly kind: 'ids'; readonly ids: readonly string[] };

interface IExtensionEntry {
	readonly identifier: { readonly id: string };
	readonly relativeLocation?: string;
}

export class UnknownExtensionsError extends Error {
	readonly unknownIds: readonly string[];
	readonly installedIds: readonly string[];

	constructor(unknownIds: readonly string[], installedIds: readonly string[]) {
		super(`Extensions not installed: ${unknownIds.join(', ')}. Installed: ${installedIds.join(', ')}`);
		this.unknownIds = unknownIds;
		this.installedIds = installedIds;
	}
}

/**
 * Throws {@link UnknownExtensionsError} unless all IDs are installed in the `source` extensions folder.
 */
export async function validateExtensionSelection(source: string, ids: readonly string[]): Promise<void> {
	await selectExtensionEntries(source, ids);
}

async function selectExtensionEntries(source: string, ids: readonly string[]): Promise<IExtensionEntry[]> {
	const manifestText = await fs.readFile(path.join(source, 'extensions.json'), 'utf8').catch(() => '[]');
	const entries: IExtensionEntry[] = JSON.parse(manifestText);
	const requestedIds = new Set(ids.map(id => id.toLowerCase()));
	const selectedEntries = entries.filter(entry => requestedIds.has(entry.identifier.id.toLowerCase()));
	const unknownIds = [...requestedIds].filter(id => !selectedEntries.some(entry => entry.identifier.id.toLowerCase() === id));
	if (unknownIds.length > 0) {
		throw new UnknownExtensionsError(unknownIds, entries.map(entry => entry.identifier.id).sort());
	}
	return selectedEntries;
}

/**
 * Makes the `destination` extensions folder contain the selected extensions. Extension folders are
 * versioned and immutable, so a folder copied before is not compared file by file again.
 * Returns the extension folders now in the destination.
 */
export async function syncExtensions(source: string, destination: string, selection: ExtensionSelection, previousFolders: readonly string[] | undefined): Promise<string[]> {
	await fs.mkdir(destination, { recursive: true });
	const sourceEntries = await fs.readdir(source, { withFileTypes: true }).catch(() => []);
	const sourceFolders = sourceEntries.filter(entry => entry.isDirectory()).map(entry => entry.name);
	const topLevelFiles = sourceEntries.filter(entry => entry.isFile() && (selection.kind === 'all' || entry.name !== 'extensions.json')).map(entry => entry.name);

	let wantedFolders = sourceFolders;
	const ownFiles = new Set(topLevelFiles);
	if (selection.kind === 'ids') {
		const selectedEntries = await selectExtensionEntries(source, selection.ids);
		// Extensions installed outside the folder, for example linked for development, have no folder to copy
		const selectedFolders = new Set(selectedEntries.map(entry => entry.relativeLocation).filter(location => location !== undefined));
		wantedFolders = sourceFolders.filter(folder => selectedFolders.has(folder));
		await fs.writeFile(path.join(destination, 'extensions.json'), JSON.stringify(selectedEntries));
		ownFiles.add('extensions.json');
	}

	// Folders copied completely before are kept; anything else is replaced
	const wanted = new Set(wantedFolders);
	const previous = new Set(previousFolders);
	const destinationEntries = await fs.readdir(destination, { withFileTypes: true });
	const stale = destinationEntries.filter(entry => entry.isDirectory() ? !wanted.has(entry.name) || !previous.has(entry.name) : !ownFiles.has(entry.name));
	await forEachConcurrent(stale, 8, entry => fs.rm(path.join(destination, entry.name), { recursive: true, force: true, maxRetries: 3 }));

	const kept = new Set(destinationEntries.filter(entry => entry.isDirectory() && !stale.includes(entry)).map(entry => entry.name));
	const scans = await Promise.all(wantedFolders.filter(folder => !kept.has(folder)).map(async folder => ({ folder, scan: await scanTree(path.join(source, folder)) })));
	await createDirectories(destination, scans.flatMap(({ folder, scan }) => [folder, ...scan.directories.map(directory => path.join(folder, directory))]));
	await copyFiles(source, destination, [...topLevelFiles, ...scans.flatMap(({ folder, scan }) => [...scan.files.keys()].map(file => path.join(folder, file)))]);
	return wantedFolders;
}

async function scanTree(root: string, isExcluded?: (segments: readonly string[]) => boolean): Promise<ITreeScan> {
	const files = new Map<string, readonly [number, number]>();
	const directories: string[] = [];

	async function visit(relativeDirectory: string, segments: readonly string[]): Promise<void> {
		const entries = await fs.readdir(path.join(root, relativeDirectory), { withFileTypes: true });
		await Promise.all(entries.map(async entry => {
			const entrySegments = [...segments, entry.name];
			if (isExcluded?.(entrySegments)) {
				return;
			}
			const relative = path.join(relativeDirectory, entry.name);
			if (entry.isDirectory()) {
				directories.push(relative);
				await visit(relative, entrySegments);
			} else {
				const record = await statRecord(path.join(root, relative));
				if (record) {
					files.set(relative, record);
				}
			}
		}));
	}

	await visit('', []);
	return { files, directories };
}

async function statRecord(file: string): Promise<readonly [number, number] | undefined> {
	try {
		const stat = await fs.stat(file);
		return stat.isFile() ? [stat.size, Math.trunc(stat.mtimeMs)] : undefined;
	} catch {
		return undefined;
	}
}

function isSameRecord(a: readonly [number, number] | undefined, b: readonly [number, number]): boolean {
	return a !== undefined && a[0] === b[0] && a[1] === b[1];
}

async function createDirectories(root: string, relatives: readonly string[]): Promise<void> {
	await forEachConcurrent(relatives, 32, relative => fs.mkdir(path.join(root, relative), { recursive: true }));
}

async function copyFiles(sourceRoot: string, destinationRoot: string, relatives: readonly string[]): Promise<void> {
	await forEachConcurrent(relatives, 64, relative => copyFile(path.join(sourceRoot, relative), path.join(destinationRoot, relative)));
}

async function copyFile(source: string, destination: string): Promise<void> {
	try {
		await fs.copyFile(source, destination);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		try {
			if (code === 'ENOENT') {
				await fs.mkdir(path.dirname(destination), { recursive: true });
			} else if (code === 'EPERM' || code === 'EACCES') {
				// A read-only copy from an earlier launch
				await fs.chmod(destination, 0o666);
			} else {
				throw error;
			}
			await fs.copyFile(source, destination);
		} catch (retryError) {
			// For example a file that a running Code instance keeps locked, or that was just deleted
			writeStderr(`[launch] skipped ${source}: ${(retryError as NodeJS.ErrnoException).code ?? retryError}\n`);
			return;
		}
	}
	// Windows copies keep the modification time; elsewhere it is set so that copies can be compared later
	if (process.platform !== 'win32') {
		const stat = await fs.stat(source);
		await fs.utimes(destination, stat.atime, stat.mtime);
	}
}

/**
 * Runs `callback` for all items, at most `concurrency` at a time.
 */
export async function forEachConcurrent<T>(items: Iterable<T>, concurrency: number, callback: (item: T) => Promise<unknown>): Promise<void> {
	const iterator = items[Symbol.iterator]();
	await Promise.all(Array.from({ length: concurrency }, async () => {
		for (let next = iterator.next(); !next.done; next = iterator.next()) {
			await callback(next.value);
		}
	}));
}
