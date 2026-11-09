/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { dirs, separateRoots, distroRoots } from '../../npm/dirs.ts';
import { getCurrentExtensionTarget } from '../../lib/extensionTarget.ts';

const ROOT = path.join(import.meta.dirname, '../../../');

/**
 * Reads a file given its `/`-separated path relative to the repository root.
 */
export type ReadRepositoryFile = (relativePath: string) => Buffer;

function readRepositoryFile(relativePath: string): Buffer {
	return fs.readFileSync(path.join(ROOT, relativePath));
}

/**
 * The files that configure how the native modules build, besides the `nativeBuild` field of the
 * install roots' `package.json` (see {@link getNativeBuildTargets}). A cached node_modules folder
 * only works with the configuration that built it.
 */
const nativeBuildConfigFiles = ['.pnpmfile.mjs', 'build/.pnpmfile.mjs', 'remote/.pnpmfile.mjs', 'extensions/.pnpmfile.mjs', 'build/npm/pnpm/nativeBuildEnv.ts'];

/**
 * Returns the `nativeBuild` field of the root and `remote` `package.json`: the runtime and version
 * that their native modules are built for. `build` builds for the Node.js that runs the install,
 * whose version is in `.nvmrc`.
 */
function getNativeBuildTargets(readFile: ReadRepositoryFile): string {
	return JSON.stringify(['package.json', 'remote/package.json'].map(file => JSON.parse(readFile(file).toString()).nativeBuild ?? null));
}

/**
 * Computes the node_modules cache key from the native module build configuration (the pnpmfiles
 * and the `nativeBuild` field of the install roots' `package.json`), the dependency sections of
 * every `package.json`, the `pnpm-lock.yaml` and `pnpm-workspace.yaml` of every install root, and
 * the given arguments.
 */
export function computeNodeModulesCacheKey(args: readonly string[], readFile: ReadRepositoryFile = readRepositoryFile): string {
	const shasum = crypto.createHash('sha256');

	shasum.update(readFile('build/.cachesalt'));
	for (const file of nativeBuildConfigFiles) {
		shasum.update(readFile(file));
	}

	// Add `package.json` files
	for (const dir of dirs) {
		const packageJson = JSON.parse(readFile(path.posix.join(dir, 'package.json')).toString());
		const relevantPackageJsonSections = {
			dependencies: packageJson.dependencies,
			devDependencies: packageJson.devDependencies,
			optionalDependencies: packageJson.optionalDependencies,
			resolutions: packageJson.resolutions,
			distro: packageJson.distro,
			packageManager: packageJson.packageManager,
			nativeBuild: packageJson.nativeBuild
		};
		shasum.update(JSON.stringify(relevantPackageJsonSections));
	}

	// Add the lockfile and settings of every install root
	for (const dir of ['', ...separateRoots, ...distroRoots]) {
		shasum.update(readFile(path.posix.join(dir, 'pnpm-lock.yaml')));
		shasum.update(readFile(path.posix.join(dir, 'pnpm-workspace.yaml')));
	}

	for (const arg of args) {
		shasum.update(arg);
	}

	return shasum.digest('hex');
}

/**
 * Computes the key of the configuration that a node_modules folder needs so that `pnpm install` can
 * update it to other dependencies: the inputs of {@link computeNodeModulesCacheKey} without the
 * dependencies and lockfiles, plus the Node.js and pnpm versions and the pnpm settings of every install
 * root, which can change the layout of the folder.
 */
export function computeNodeModulesBaseCacheKey(args: readonly string[], readFile: ReadRepositoryFile = readRepositoryFile): string {
	const shasum = crypto.createHash('sha256');

	shasum.update(readFile('build/.cachesalt'));
	for (const file of [...nativeBuildConfigFiles, '.nvmrc', 'extensions/copilot/.nvmrc']) {
		shasum.update(readFile(file));
	}
	shasum.update(getNativeBuildTargets(readFile));
	shasum.update(JSON.stringify(JSON.parse(readFile('package.json').toString()).packageManager));
	for (const dir of ['', ...separateRoots, ...distroRoots]) {
		shasum.update(readFile(path.posix.join(dir, 'pnpm-workspace.yaml')));
	}

	for (const arg of args) {
		shasum.update(arg);
	}

	return shasum.digest('hex');
}

/**
 * Computes the key of the pnpm stores that a job can start from: the cache salt, the pnpm version,
 * which decides the layout of the store, and the given arguments (the platform of the job). A store
 * holds the files of every package that it ever installed, so a job can start from the store of
 * other dependencies and download only the packages that it is missing.
 */
export function computePnpmStoreBaseCacheKey(args: readonly string[], readFile: ReadRepositoryFile = readRepositoryFile): string {
	const shasum = crypto.createHash('sha256');

	shasum.update(readFile('build/.cachesalt'));
	shasum.update(JSON.stringify(JSON.parse(readFile('package.json').toString()).packageManager));

	for (const arg of args) {
		shasum.update(arg);
	}

	return shasum.digest('hex');
}

/**
 * Computes the pnpm store cache key from the `pnpm-lock.yaml` of every install root: the packages
 * that the store holds after installing them. Use it after {@link computePnpmStoreBaseCacheKey}.
 */
export function computePnpmStoreCacheKey(readFile: ReadRepositoryFile = readRepositoryFile): string {
	const shasum = crypto.createHash('sha256');

	for (const dir of ['', ...separateRoots, ...distroRoots]) {
		shasum.update(readFile(path.posix.join(dir, 'pnpm-lock.yaml')));
	}

	return shasum.digest('hex');
}

/**
 * Computes the built-in extensions cache key from the built-in extensions in `product.json`.
 *
 * @param getTarget Returns the marketplace target platform of the build.
 */
export function computeBuiltInDepsCacheKey(getTarget: () => string | undefined = getCurrentExtensionTarget, readFile: ReadRepositoryFile = readRepositoryFile): string {
	const productjson = JSON.parse(readFile('product.json').toString());
	const shasum = crypto.createHash('sha256');

	// Only fold the build target into the key when at least one built-in extension is platform-specific.
	// Otherwise the cache stays shared across platforms (as before), so a single platform populates it
	// and the rest reuse it instead of each re-downloading.
	const hasPlatformSpecific = (productjson.builtInExtensions as { platformSpecific?: unknown }[]).some(ext => ext.platformSpecific);
	const target = hasPlatformSpecific ? getTarget() : undefined;
	if (target) {
		shasum.update(`target:${target}`);
	}

	for (const ext of productjson.builtInExtensions) {
		shasum.update(`${ext.name}@${ext.version}`);
		if (ext.platformSpecific && target && ext.platformSpecific[target]) {
			shasum.update(`:${ext.platformSpecific[target]}`);
		}
	}

	return shasum.digest('hex');
}
