/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import path from 'path';

/**
 * The registry itself is set in the user `.npmrc` (`npm config set registry`), which both npm and
 * pnpm read. This script only rewrites registry URLs recorded in lockfiles: npm records a
 * `resolved` URL for every package in `package-lock.json` (still used by the folders that install
 * with npm, such as `build/agent-sdk/agents/*`). pnpm records no URL for registry packages in
 * `pnpm-lock.yaml`, only for a `tarball:` that doesn't follow the registry's URL layout.
 */
const lockfileNames = new Set(['package-lock.json', 'pnpm-lock.yaml']);

/**
 * Recursively find all lockfiles in a directory, skipping installed packages.
 */
async function* getLockfiles(dir: string): AsyncGenerator<string> {
	const files = await fs.readdir(dir, { withFileTypes: true });

	for (const file of files) {
		const fullPath = path.join(dir, file.name);

		if (file.isDirectory()) {
			if (file.name !== 'node_modules' && file.name !== '.git') {
				yield* getLockfiles(fullPath);
			}
		} else if (lockfileNames.has(file.name)) {
			yield fullPath;
		}
	}
}

/**
 * Replace the registry URL in a lockfile. Returns whether the file changed.
 */
async function setup(url: string, file: string): Promise<boolean> {
	const contents = await fs.readFile(file, 'utf8');
	const updated = contents.replace(/https:\/\/registry\.[^.]+\.org\//g, url);
	if (updated === contents) {
		return false;
	}
	await fs.writeFile(file, updated);
	return true;
}

/**
 * Main function to set up custom NPM registry
 */
async function main(url: string, dir?: string): Promise<void> {
	if (!url) {
		throw new Error('Usage: node setup-npm-registry.ts <registry-url> [dir]. A registry URL is required.');
	}

	const root = dir ?? process.cwd();

	for await (const file of getLockfiles(root)) {
		if (await setup(url, file)) {
			console.log(`Enabling custom NPM registry: ${path.relative(root, file)}`);
		}
	}
}

main(process.argv[2], process.argv[3]).catch(err => {
	console.error(err.message);
	process.exit(1);
});
