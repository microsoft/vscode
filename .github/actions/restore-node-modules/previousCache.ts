/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Lets a pull request whose dependencies have no node_modules cache yet start from the cache of other
// dependencies, which `pnpm install` then updates, instead of installing every dependency again.
//
// A node_modules folder only works with the native module build configuration, Node.js and pnpm
// versions, pnpm settings and pnpm store location that created it: pnpm fails when the store moved.
// The jobs that save a cache store a description of these next to the archive, and a job only uses
// the cache of other dependencies when the description matches its own.
//
// Usage, from the repository root:
//   node previousCache.ts describe <key args>  Writes the description of this job. When the cache of other
//                                              dependencies was restored (NODE_MODULES_PREVIOUS_CACHE_KEY),
//                                              sets the `usable` step output, and deletes that cache when it
//                                              is not usable.
//   node previousCache.ts save                 Stores the description of this job next to the archive.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { computeNodeModulesBaseCacheKey } from '../../../build/azure-pipelines/common/cacheKeys.ts';

const description = path.join('.build', 'nodemodulesbase.json');
const cacheFolder = path.join('.build', 'node_modules_cache');
const cachedDescription = path.join(cacheFolder, 'base.json');

/**
 * Returns the store that `pnpm install` links node_modules from, or undefined when pnpm can't tell.
 */
function getStorePath(): string | undefined {
	const result = spawnSync('pnpm store path', { encoding: 'utf8', shell: true });
	return result.status === 0 ? result.stdout.trim() || undefined : undefined;
}

function describe(args: readonly string[]): void {
	const storePath = getStorePath();
	fs.mkdirSync(path.dirname(description), { recursive: true });
	// Without a store path, the description never matches: pnpm can't update a folder of another store.
	fs.writeFileSync(description, JSON.stringify({ key: computeNodeModulesBaseCacheKey(args), storePath: storePath ?? null }));

	const previousKey = process.env.NODE_MODULES_PREVIOUS_CACHE_KEY;
	if (!previousKey) {
		return;
	}
	const current = fs.readFileSync(description, 'utf8');
	const cached = fs.existsSync(cachedDescription) ? fs.readFileSync(cachedDescription, 'utf8') : undefined;
	const usable = !!storePath && cached === current;
	if (usable) {
		console.log(`Restored the node_modules cache ${previousKey} of other dependencies. Installing the dependencies updates it.`);
	} else {
		console.log(`Not using the node_modules cache ${previousKey} of other dependencies: ${cached === undefined ? 'it has no description' : `it was created for ${cached}, and this job needs ${current}`}.`);
		fs.rmSync(cacheFolder, { recursive: true, force: true });
	}
	if (process.env.GITHUB_OUTPUT) {
		fs.appendFileSync(process.env.GITHUB_OUTPUT, `usable=${usable}\n`);
	}
}

function save(): void {
	if (fs.existsSync(description) && fs.existsSync(cacheFolder)) {
		fs.copyFileSync(description, cachedDescription);
	}
}

const [command, ...args] = process.argv.slice(2);
if (command === 'describe') {
	describe(args);
} else if (command === 'save') {
	save();
} else {
	console.error('Usage: node previousCache.ts describe <key args> | save');
	process.exit(1);
}
