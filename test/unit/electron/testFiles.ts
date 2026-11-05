/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs: typeof import('fs') = require('fs');
const glob: typeof import('glob') = require('glob');
const util: typeof import('util') = require('util');

const globAsync = util.promisify(glob);

/**
 * Finds the test files that a run of the Electron unit tests without `--run` loads, in the order in
 * which it loads them: the files that match `--runGlob`, or all test files, except those that match
 * `--excludeRunGlob`, and only those listed in `--runList`. The renderer loads them, and the main
 * process starts as many workers as they need (see parallel.ts).
 * @param out the output folder with the compiled test files
 * @returns the files, relative to `out`, and how many files `--runList` lists
 */
async function findTestFiles(opts: { runGlob?: string; excludeRunGlob?: string; runList?: string }, out: string): Promise<{ files: string[]; listed: number | undefined }> {
	const pattern = opts.runGlob || '**/test/**/*.test.js';
	let files = await globAsync(pattern, { cwd: out });
	if (opts.excludeRunGlob) {
		const excludedFiles = new Set(await globAsync(opts.excludeRunGlob, { cwd: out }));
		files = files.filter(file => !excludedFiles.has(file));
	}
	if (!opts.runList) {
		return { files, listed: undefined };
	}
	// --runList: the listed test files as compiled modules relative to the output folder (src/vs/a.test.ts is vs/a.test.js)
	const runList = new Set(fs.readFileSync(opts.runList, 'utf8').split(/\r?\n/).map(line => line.trim().replace(/\\/g, '/')).filter(line => line.length > 0).map(line => line.replace(/^src\//, '').replace(/\.ts$/, '.js')));
	return { files: files.filter(file => runList.has(file)), listed: runList.size };
}

module.exports = { findTestFiles };
