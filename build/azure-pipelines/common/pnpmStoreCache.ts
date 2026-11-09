/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { computePnpmStoreBaseCacheKey, computePnpmStoreCacheKey } from './cacheKeys.ts';

// Commands of the pnpm store cache (see restore-pnpm-store.yml), from the repository root:
//   node pnpmStoreCache.ts key <args>  Writes the files of the cache key: `.build/pnpmstorebase`, for the
//                                      platform of the job (the arguments, and the platform and architecture
//                                      that pnpm installs the optional dependencies of), and
//                                      `.build/pnpmstorelockfiles`, for the lockfiles.
//   node pnpmStoreCache.ts prune       Removes the packages that the installed projects don't use from the
//                                      store, before the cache saves it.

const root = path.join(import.meta.dirname, '../../../');
const isWindows = process.platform === 'win32';

/**
 * Runs pnpm with the given arguments. On Windows `pnpm` is a `.cmd` shim, which Node only spawns
 * with a shell.
 */
function pnpm(args: string[], options: { capture?: boolean } = {}): string {
	const result = spawnSync('pnpm', args, { cwd: root, encoding: 'utf8', shell: isWindows, stdio: options.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit' });
	if (result.status !== 0) {
		throw new Error(`pnpm ${args.join(' ')} failed with exit code ${result.status}.`);
	}
	return options.capture ? result.stdout.trim() : '';
}

function key(args: readonly string[]): void {
	fs.mkdirSync(path.join(root, '.build'), { recursive: true });
	fs.writeFileSync(path.join(root, '.build', 'pnpmstorebase'), computePnpmStoreBaseCacheKey([...args, process.platform, process.arch]));
	fs.writeFileSync(path.join(root, '.build', 'pnpmstorelockfiles'), computePnpmStoreCacheKey());
}

function prune(): void {
	pnpm(['store', 'prune']);
	// pnpm finds the projects that use the store through links to them in its `projects` folder. On
	// Windows the cache follows links when it archives a folder, so it would save the projects with
	// the store. The install of the next job adds its own projects.
	fs.rmSync(path.join(pnpm(['store', 'path'], { capture: true }), 'projects'), { recursive: true, force: true });
}

const [command, ...args] = process.argv.slice(2);
if (command === 'key') {
	key(args);
} else if (command === 'prune') {
	prune();
} else {
	console.error('Usage: node pnpmStoreCache.ts key <args> | prune');
	process.exit(1);
}
