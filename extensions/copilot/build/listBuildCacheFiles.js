/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const fs = require('fs');
const path = require('path');

if (process.argv.length !== 3) {
	console.error('Usage: node listBuildCacheFiles.js OUTPUT_FILE');
	process.exit(-1);
}

const ROOT = path.join(__dirname, '../');

/**
 * @param {string} location
 * @param {string[]} result
 */
function listAllFiles(location, result) {
	const entries = fs.readdirSync(path.join(ROOT, location));
	for (const entry of entries) {
		const entryPath = `${location}/${entry}`;

		/** @type {import('fs').Stats} */
		let stat;
		try {
			stat = fs.statSync(path.join(ROOT, entryPath));
		} catch (err) {
			continue;
		}

		if (stat.isDirectory()) {
			listAllFiles(entryPath, result);
		} else {
			result.push(entryPath);
		}
	}
}

/** @type {string[]} */
const result = [];
listAllFiles('node_modules', result); // node modules
listAllFiles('dist', result); // contains wasm files
fs.writeFileSync(process.argv[2], result.join('\n') + '\n');
