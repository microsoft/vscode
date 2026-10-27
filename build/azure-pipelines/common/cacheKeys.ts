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
 * Computes the node_modules cache key from the native module build configuration (`.npmrc` and
 * pnpmfiles), the dependency sections of every `package.json`, the `pnpm-lock.yaml` and
 * `pnpm-workspace.yaml` of every install root, and the given arguments.
 */
export function computeNodeModulesCacheKey(args: readonly string[], readFile: ReadRepositoryFile = readRepositoryFile): string {
	const shasum = crypto.createHash('sha256');

	shasum.update(readFile('build/.cachesalt'));
	for (const file of ['.npmrc', 'build/.npmrc', 'remote/.npmrc', '.pnpmfile.mjs', 'build/.pnpmfile.mjs', 'remote/.pnpmfile.mjs', 'build/npm/pnpm/nativeBuildEnv.ts']) {
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
			packageManager: packageJson.packageManager
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
