/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Recursively find all `.npmrc` files in a directory (skipping `node_modules`).
 */
async function* getNpmrcFiles(dir: string): AsyncGenerator<string> {
	const entries = await fs.readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.name === 'node_modules' || entry.name === '.git') {
			continue;
		}

		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			yield* getNpmrcFiles(fullPath);
		} else if (entry.name === '.npmrc') {
			yield fullPath;
		}
	}
}

/**
 * Point an `.npmrc` at a custom registry by setting/replacing its `registry=` line.
 * pnpm (like npm) reads the `registry` setting from `.npmrc`, so unlike the old
 * npm flow we no longer need to rewrite resolved URLs inside lockfiles.
 */
async function setup(url: string, file: string): Promise<void> {
	const registryLine = `registry=${url}`;
	let contents = await fs.readFile(file, 'utf8');

	if (/^registry=.*$/m.test(contents)) {
		contents = contents.replace(/^registry=.*$/m, registryLine);
	} else {
		contents = contents.replace(/\s*$/, '') + `\n${registryLine}\n`;
	}

	await fs.writeFile(file, contents);
}

/**
 * Main function to set up a custom npm/pnpm registry across all `.npmrc` files.
 */
async function main(url: string, dir?: string): Promise<void> {
	const root = dir ?? process.cwd();

	// Ensure the root has an `.npmrc` so the registry is always applied.
	const rootNpmrc = path.join(root, '.npmrc');
	try {
		await fs.access(rootNpmrc);
	} catch {
		await fs.writeFile(rootNpmrc, '');
	}

	for await (const file of getNpmrcFiles(root)) {
		console.log(`Enabling custom registry: ${path.relative(root, file)}`);
		await setup(url, file);
	}
}

main(process.argv[2], process.argv[3]);
