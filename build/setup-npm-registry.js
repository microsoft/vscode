/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import { promises as fs } from 'fs';
import path from 'path';

/**
 * @param {string} dir
 *
 * @returns {AsyncGenerator<string>}
 */
async function* getPackageLockFiles(dir) {
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
 * @param {string} url
 * @param {string} file
 */
async function setup(url, file) {
	let contents = await fs.readFile(file, 'utf8');
	contents = contents.replace(/https:\/\/registry\.[^.]+\.org\//g, url);
	await fs.writeFile(file, contents);
}

/**
 * @param {string} url
 * @param {string} dir
 */
async function main(url, dir) {
	const root = dir ?? process.cwd();

	for await (const file of getPackageLockFiles(root)) {
		console.log(`Enabling custom NPM registry: ${path.relative(root, file)}`);
		await setup(url, file);
	}
}

main(process.argv[2], process.argv[3]);
