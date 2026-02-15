/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Recursively find all package-lock.json files in a directory
 */
async function* getPackageLockFiles(dir: string): AsyncGenerator<string> {
	const files = await fs.readdir(dir);

	for (const file of files) {
		const fullPath = path.join(dir, file);
		const stat = await fs.stat(fullPath);

		if (stat.isDirectory()) {
			yield* getPackageLockFiles(fullPath);
		} else if (file === 'package-lock.json') {
			yield fullPath;
		}
	}
}

/**
 * Replace the registry URL in a package-lock.json file
 */
async function setup(url: string, file: string): Promise<void> {
	let contents = await fs.readFile(file, 'utf8');
	contents = contents.replace(/https:\/\/registry\.[^.]+\.org\//g, url);
	await fs.writeFile(file, contents);
}

/**
 * Main function to set up custom NPM registry
 */
async function main(url: string, dir?: string): Promise<void> {
	const root = dir ?? process.cwd();

	for await (const file of getPackageLockFiles(root)) {
		console.log(`Enabling custom NPM registry: ${path.relative(root, file)}`);
		await setup(url, file);
	}
}

main(process.argv[2], process.argv[3]);
