/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { getImporterId, getLockfileFolder, getSnapshotKey, readPnpmLockfile } from './pnpmLock.ts';
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
 * Returns the folders of the installed production dependencies of the project in `folder`.
 *
 * `pnpm list --json` prints the dependencies of a package only at its first occurrence, which can
 * be outside the production tree, and `--parseable` also lists the packages that workspace members
 * hoisted into the same `node_modules`. So this walks the production dependencies in the lockfile
 * from the project, and finds each one the way Node.js resolves it: in the nearest `node_modules`
 * folder that has the locked version, according to the locations that pnpm's hoisted linker
 * recorded in `node_modules/.modules.yaml`. Optional packages for other platforms are not
 * installed and are skipped.
 */
function getPnpmProductionDependencies(folder: string): string[] {
	const installRoot = getInstallRoot(folder);
	const lockfile = readPnpmLockfile(path.join(installRoot, 'pnpm-lock.yaml'));
	const importer = lockfile.importers[getImporterId(installRoot, folder)];
	if (!importer) {
		throw new Error(`${folder} is not a project of ${path.join(installRoot, 'pnpm-lock.yaml')}.`);
	}
	const modulesFile = path.join(installRoot, 'node_modules', '.modules.yaml');
	if (!fs.existsSync(modulesFile)) {
		throw new Error(`${modulesFile} is missing. Run pnpm install in ${installRoot}.`);
	}
	const modules = JSON.parse(fs.readFileSync(modulesFile, 'utf8')) as { nodeLinker?: string; hoistedLocations?: Record<string, string[]> };
	if (modules.nodeLinker !== 'hoisted' || !modules.hoistedLocations) {
		throw new Error(`${installRoot} must be installed with nodeLinker: hoisted.`);
	}
	const locations = new Map(Object.entries(modules.hoistedLocations).map(([key, folders]) => [key, new Set(folders.map(f => path.join(installRoot, f)))]));

	const resolve = (fromFolder: string, name: string, key: string): string | undefined => {
		const candidates = locations.get(key);
		if (!candidates) {
			return undefined;
		}
		for (let current = fromFolder; ; current = path.dirname(current)) {
			const candidate = path.join(current, 'node_modules', name);
			if (candidates.has(candidate)) {
				return candidate;
			}
			if (current === installRoot || path.dirname(current) === current) {
				return undefined;
			}
		}
	};

	const result = new Set<string>();
	const queue: { from: string; name: string; key: string }[] = [];
	const enqueue = (from: string, dependencies: Record<string, string> | undefined) => {
		for (const [name, version] of Object.entries(dependencies ?? {})) {
			const key = getSnapshotKey(name, version);
			if (key) {
				queue.push({ from, name, key });
			}
		}
	};
	for (const kind of ['dependencies', 'optionalDependencies'] as const) {
		enqueue(folder, Object.fromEntries(Object.entries(importer[kind] ?? {}).map(([name, { version }]) => [name, version])));
	}
	while (queue.length > 0) {
		const { from, name, key } = queue.shift()!;
		const location = resolve(from, name, key);
		if (!location || result.has(location) || !fs.existsSync(location)) {
			continue;
		}
		result.add(location);
		const snapshot = lockfile.snapshots?.[key];
		enqueue(location, snapshot?.dependencies);
		enqueue(location, snapshot?.optionalDependencies);
	}
	return [...result].sort();
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

export function getProductionDependencies(folderPath: string): string[] {
	const realFolderPath = fs.realpathSync(folderPath);
	const result = getPnpmProductionDependencies(realFolderPath);
	// Account for distro npm dependencies. The lockfile doesn't know them, so they are taken from
	// where the mixin put them (npm listed them there as extraneous packages).
	const relativeFolderPath = path.relative(root, realFolderPath);
	const distroFolderPath = `${root}/.build/distro/npm/${relativeFolderPath}`;
	result.push(...getMixedInDistroDependencies(realFolderPath, distroFolderPath));

	return [...new Set(result)];
}

if (import.meta.main) {
	console.log(JSON.stringify(getProductionDependencies(root), null, '  '));
}
