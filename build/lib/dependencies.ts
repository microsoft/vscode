/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import fs from 'fs';
import path from 'path';
import VinylFile from 'vinyl';
import { layoutRoots } from '../npm/dirs.ts';
import { getHoistedLocations } from './pnpmHoist.ts';
import { getImporterId, getLockfileFolder, getSnapshotKey, readPnpmLockfile, type PnpmLockfile } from './pnpmLock.ts';
const root = fs.realpathSync(path.dirname(path.dirname(import.meta.dirname)));

/**
 * Returns the folder that holds the `pnpm-lock.yaml` and `node_modules` of `folder`: the main
 * workspace for its members, otherwise the folder itself (a separate install root, such as
 * `remote`).
 */
function getInstallRoot(folder: string): string {
	const lockfileFolder = getLockfileFolder(path.relative(root, folder));
	return lockfileFolder !== undefined ? path.join(root, lockfileFolder) : folder;
}

/**
 * Returns the folder whose projects the `node_modules` layout of `folder` is computed from: the
 * deepest of the `layoutRoots` (see `build/npm/dirs.ts`) that contains it, otherwise its install
 * root.
 */
function getLayoutRoot(installRoot: string, folder: string): string {
	const relative = path.relative(root, folder).split(path.sep).join('/');
	const layoutRoot = layoutRoots
		.filter(candidate => relative === candidate || relative.startsWith(`${candidate}/`))
		.sort((a, b) => b.length - a.length)[0];
	return layoutRoot !== undefined ? path.join(root, layoutRoot) : installRoot;
}

/**
 * Returns the lockfile of a separate install of `layoutRoot`: `lockfile` with only the importers of
 * `installRoot` whose layout root is `layoutRoot`, relative to it.
 */
export function getLayoutLockfile(lockfile: PnpmLockfile, installRoot: string, layoutRoot: string): PnpmLockfile {
	const importers: PnpmLockfile['importers'] = {};
	for (const [importerId, importer] of Object.entries(lockfile.importers)) {
		const folder = path.join(installRoot, importerId);
		if (getLayoutRoot(installRoot, folder) === layoutRoot) {
			importers[path.relative(layoutRoot, folder).split(path.sep).join('/') || '.'] = importer;
		}
	}
	return { ...lockfile, importers };
}

/**
 * A production dependency: the folder where the product ships it, and the folder that holds its
 * files.
 */
export interface IProductionDependency {
	/**
	 * The folder of the package in the layout of pnpm's hoisted linker (`nodeLinker: hoisted`),
	 * where the product ships it.
	 */
	readonly folder: string;
	/**
	 * The folder that holds the files of the package: `folder` when pnpm installed it with the
	 * hoisted linker, its folder in pnpm's virtual store (`node_modules/.pnpm`) with the isolated
	 * linker.
	 */
	readonly source: string;
}

interface ILayout {
	/** The lockfile of the install root. */
	readonly lockfile: PnpmLockfile;
	/** Whether pnpm installed the root with the hoisted linker, so that each package is in its `folder`. */
	readonly isHoisted: boolean;
	/** The folders of each package in the hoisted layout of the layout root, by snapshot key. */
	readonly locations: ReadonlyMap<string, ReadonlySet<string>>;
	/** The folders where pnpm's hoisted linker installed each package, by snapshot key (only when `isHoisted`). */
	readonly installedLocations: ReadonlyMap<string, ReadonlySet<string>>;
}

const layouts = new Map<string, ILayout>();

/**
 * Returns the hoisted layout of the packages of the projects of a layout root (see
 * {@link getLayoutRoot}), computed from the lockfile of their install root, so that it is the same
 * with either linker (see `build/lib/pnpmHoist.ts`).
 */
function getLayout(installRoot: string, layoutRoot: string): ILayout {
	let layout = layouts.get(layoutRoot);
	if (!layout) {
		const modulesFile = path.join(installRoot, 'node_modules', '.modules.yaml');
		if (!fs.existsSync(modulesFile)) {
			throw new Error(`${modulesFile} is missing. Run pnpm install in ${installRoot}.`);
		}
		const modules = JSON.parse(fs.readFileSync(modulesFile, 'utf8')) as { nodeLinker?: string; hoistedLocations?: Record<string, string[]>; skipped?: string[] };
		const toFolders = (base: string, locations: Iterable<[string, string[]]>) => new Map([...locations].map(([key, folders]) => [key, new Set(folders.map(f => path.join(base, f)))]));
		const lockfile = readPnpmLockfile(path.join(installRoot, 'pnpm-lock.yaml'));
		const layoutLockfile = getLayoutLockfile(lockfile, installRoot, layoutRoot);
		const isHoisted = modules.nodeLinker === 'hoisted';
		if (isHoisted && !modules.hoistedLocations) {
			throw new Error(`${modulesFile} has no hoistedLocations. Run pnpm install in ${installRoot}.`);
		}
		if (isHoisted && Object.keys(layoutLockfile.importers).length !== Object.keys(lockfile.importers).length) {
			throw new Error(`pnpm installed ${installRoot} with the hoisted linker, which doesn't lay out the dependencies of ${layoutRoot} the way the product ships them. Install it with the isolated linker.`);
		}
		layout = {
			lockfile,
			isHoisted,
			locations: toFolders(layoutRoot, getHoistedLocations(layoutLockfile, new Set(modules.skipped ?? []))),
			installedLocations: toFolders(installRoot, Object.entries(modules.hoistedLocations ?? {})),
		};
		layouts.set(layoutRoot, layout);
	}
	return layout;
}

/**
 * Returns the folder of the dependency `name` of the package or project whose files are in
 * `dependentSource`, in pnpm's isolated layout: a link next to the package in the virtual store
 * (`.pnpm/<id>/node_modules/<name>`), or in the project's `node_modules`.
 */
function getIsolatedSource(dependentSource: string, name: string, isProject: boolean): string | undefined {
	let nodeModules = path.join(dependentSource, 'node_modules');
	if (!isProject) {
		nodeModules = dependentSource;
		while (path.basename(nodeModules) !== 'node_modules') {
			nodeModules = path.dirname(nodeModules);
		}
	}
	const folder = path.join(nodeModules, name);
	return fs.existsSync(path.join(folder, 'package.json')) ? fs.realpathSync(folder) : undefined;
}

/**
 * Returns the installed production dependencies of the project in `folder`.
 *
 * `pnpm list --json` prints the dependencies of a package only at its first occurrence, which can
 * be outside the production tree, and `--parseable` also lists the packages that workspace members
 * hoisted into the same `node_modules`. So this walks the production dependencies in the lockfile
 * from the project, and places each one the way Node.js resolves it in the hoisted layout: in the
 * nearest `node_modules` folder that has the locked version. Optional packages for other platforms
 * are not installed and are skipped.
 *
 * With the hoisted linker, this checks that pnpm installed each package where the computed layout
 * puts it, so that the product ships the same layout after a switch to the isolated linker.
 */
function getPnpmProductionDependencies(folder: string): IProductionDependency[] {
	const installRoot = getInstallRoot(folder);
	const layoutRoot = getLayoutRoot(installRoot, folder);
	const layout = getLayout(installRoot, layoutRoot);
	const importer = layout.lockfile.importers[getImporterId(installRoot, folder)];
	if (!importer) {
		throw new Error(`${folder} is not a project of ${path.join(installRoot, 'pnpm-lock.yaml')}.`);
	}

	const resolve = (fromFolder: string, name: string, key: string): string | undefined => {
		const candidates = layout.locations.get(key);
		if (!candidates) {
			return undefined;
		}
		for (let current = fromFolder; ; current = path.dirname(current)) {
			const candidate = path.join(current, 'node_modules', name);
			if (candidates.has(candidate)) {
				return candidate;
			}
			if (current === layoutRoot || path.dirname(current) === current) {
				return undefined;
			}
		}
	};

	const result = new Map<string, IProductionDependency>();
	const checkedKeys = new Set<string>();
	const queue: { from: string; fromSource: string; fromProject: boolean; name: string; key: string }[] = [];
	const enqueue = (from: string, fromSource: string, fromProject: boolean, dependencies: Record<string, string> | undefined) => {
		for (const [name, version] of Object.entries(dependencies ?? {})) {
			const key = getSnapshotKey(name, version);
			if (key) {
				queue.push({ from, fromSource, fromProject, name, key });
			}
		}
	};
	for (const kind of ['dependencies', 'optionalDependencies'] as const) {
		enqueue(folder, folder, true, Object.fromEntries(Object.entries(importer[kind] ?? {}).map(([name, { version }]) => [name, version])));
	}
	while (queue.length > 0) {
		const { from, fromSource, fromProject, name, key } = queue.shift()!;
		// Check every production package before resolving it, so that a package that the computed
		// layout misses or misplaces fails the build instead of being left out of the product.
		if (layout.isHoisted && !checkedKeys.has(key)) {
			checkedKeys.add(key);
			const computed = [...layout.locations.get(key) ?? []].sort();
			const installed = [...layout.installedLocations.get(key) ?? []].sort();
			if (JSON.stringify(computed) !== JSON.stringify(installed)) {
				throw new Error(`pnpm installed ${key} at ${installed.map(f => path.relative(root, f)).join(', ') || 'no location'}, but the layout computed from ${path.relative(root, path.join(installRoot, 'pnpm-lock.yaml'))} has it at ${computed.map(f => path.relative(root, f)).join(', ') || 'no location'}. Update build/lib/pnpmHoist.ts to match pnpm's hoisting.`);
			}
		}
		const location = resolve(from, name, key);
		if (!location || result.has(location)) {
			continue;
		}
		let source: string | undefined;
		if (layout.isHoisted) {
			source = fs.existsSync(location) ? location : undefined;
		} else {
			source = getIsolatedSource(fromSource, name, fromProject);
		}
		if (!source) {
			continue;
		}
		result.set(location, { folder: location, source });
		const snapshot = layout.lockfile.snapshots?.[key];
		enqueue(location, source, false, snapshot?.dependencies);
		enqueue(location, source, false, snapshot?.optionalDependencies);
	}
	return [...result.values()].sort((a, b) => a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0);
}

/**
 * Returns the folders of the distro's npm dependencies that `build/azure-pipelines/distro/mixin-npm.ts`
 * copied into `folder`: each dependency of the distro folder's `package.json`, at
 * `folder/node_modules/<name>`, where the product loads it from. Only the copies that exist are
 * returned. The distro folder's own `node_modules` is not needed: CI's node_modules caches don't
 * contain `.build`, so after a cache hit only the copies are there.
 */
export function getMixedInDistroDependencies(folder: string, distroFolder: string): string[] {
	const packageJsonPath = path.join(distroFolder, 'package.json');
	if (!fs.existsSync(packageJsonPath)) {
		return [];
	}
	const dependencies: Record<string, string> = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).dependencies ?? {};
	return Object.keys(dependencies)
		.map(name => path.join(folder, 'node_modules', name))
		.filter(dependency => fs.existsSync(dependency));
}

/**
 * Returns the production dependencies of the project in `folderPath`: each package with the folder
 * where the product ships it and the folder that holds its files (see {@link IProductionDependency}).
 * Read the files from `source` and move them to `folder` with {@link toPackagedLayout}.
 */
export function getProductionDependencies(folderPath: string): IProductionDependency[] {
	const realFolderPath = fs.realpathSync(folderPath);
	const result = getPnpmProductionDependencies(realFolderPath);
	// Account for distro npm dependencies. The lockfile doesn't know them, so they are taken from
	// where the mixin put them (npm listed them there as extraneous packages).
	const relativeFolderPath = path.relative(root, realFolderPath);
	const distroFolderPath = `${root}/.build/distro/npm/${relativeFolderPath}`;
	for (const folder of getMixedInDistroDependencies(realFolderPath, distroFolderPath)) {
		if (!result.some(dependency => dependency.folder === folder)) {
			result.push({ folder, source: folder });
		}
	}
	return result;
}

/**
 * Returns a stream that moves the files of production dependencies, read from their `source`
 * folders, to their `folder` (see {@link getProductionDependencies}). Files outside of these
 * folders pass unchanged. With pnpm's hoisted linker the folders are the same, and the stream
 * changes nothing.
 *
 * With the isolated linker, it drops the commands that pnpm links for the dependencies of each
 * package in the store (`node_modules/.bin`), which point into the store. The product doesn't ship
 * the commands of nested packages with either linker: the packaging filters drop dot folders.
 */
export function toPackagedLayout(dependencies: readonly IProductionDependency[]): NodeJS.ReadWriteStream {
	// The hoisted layout can have a package in several folders, which share its folder in the store.
	const moved = new Map<string, IProductionDependency[]>();
	for (const dependency of dependencies) {
		if (dependency.source !== dependency.folder) {
			moved.set(dependency.source, [...moved.get(dependency.source) ?? [], dependency]);
		}
	}
	if (moved.size === 0) {
		return es.through();
	}
	return es.through(function (file: VinylFile) {
		for (let current = file.path; path.dirname(current) !== current; current = path.dirname(current)) {
			const destinations = moved.get(current);
			if (destinations) {
				const relative = path.relative(current, file.path);
				const [first, second] = relative.split(path.sep);
				if (first === 'node_modules' && second === '.bin') {
					return;
				}
				// Create every copy before emitting any: the streams downstream can change a file
				// synchronously when it is emitted (for example its source map URL).
				const copies = destinations.map((dependency, index) => {
					const copy = index === 0 ? file : new VinylFile({
						cwd: file.cwd,
						base: file.base,
						path: file.path,
						stat: file.stat ? Object.assign(Object.create(Object.getPrototypeOf(file.stat)), file.stat) : undefined,
						contents: Buffer.isBuffer(file.contents) ? Buffer.from(file.contents) : file.contents,
					});
					copy.path = path.join(dependency.folder, relative);
					return copy;
				});
				for (const copy of copies) {
					this.emit('data', copy);
				}
				return;
			}
		}
		this.emit('data', file);
	});
}

/**
 * A production dependency to package at `node_modules/<name>`, where `<name>` is the name that it is
 * installed under: its `folder` relative to `base`.
 */
export interface IFlatProductionDependency extends IProductionDependency {
	/** The folder whose `node_modules` holds the package in the hoisted layout. */
	readonly base: string;
}

/**
 * Maps production dependencies to a flat layout: each one at `node_modules/<name>`, wherever the
 * install put it (in the project's `node_modules`, a parent's, or nested in another package). Throws
 * when two packages have the same name, which a flat layout can't hold.
 */
export function toFlatProductionDependencies(dependencies: readonly IProductionDependency[]): IFlatProductionDependency[] {
	const nodeModules = `${path.sep}node_modules${path.sep}`;
	const result = new Map<string, IFlatProductionDependency>();
	for (const dependency of dependencies) {
		const index = dependency.folder.lastIndexOf(nodeModules);
		if (index === -1) {
			throw new Error(`${dependency.folder} is not in a node_modules folder.`);
		}
		const name = dependency.folder.slice(index + nodeModules.length).split(path.sep).join('/');
		const existing = result.get(name);
		if (existing) {
			throw new Error(`Production dependencies ${existing.folder} and ${dependency.folder} are both named ${name}, so they can't both be packaged at node_modules/${name}.`);
		}
		result.set(name, { ...dependency, base: dependency.folder.slice(0, index) });
	}
	return [...result.values()];
}

/**
 * Returns the production dependencies of the project in `folderPath` (see
 * {@link getProductionDependencies}), to package in a flat layout: the layout of an install of the
 * project on its own, whatever its workspace hoisted next to it.
 */
export function getFlatProductionDependencies(folderPath: string): IFlatProductionDependency[] {
	return toFlatProductionDependencies(getProductionDependencies(folderPath));
}

if (import.meta.main) {
	console.log(JSON.stringify(getProductionDependencies(root).map(dependency => dependency.folder), null, '  '));
}
