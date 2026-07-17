/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { dirs } from './dirs.ts';

interface PendingScript {
	package: string;
	scripts: string;
}

interface CheckResult {
	directory: string;
	pending: PendingScript[];
}

const root = path.resolve(import.meta.dirname, '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function parsePendingScripts(output: string): PendingScript[] {
	const pending: PendingScript[] = [];
	let inPendingList = false;
	for (const line of output.split(/\r?\n/)) {
		if (/^\d+ packages? (?:has|have) install scripts not yet covered by allowScripts:$/.test(line.trim())) {
			inPendingList = true;
			continue;
		}
		if (inPendingList && line.trim() === '') {
			break;
		}
		if (inPendingList) {
			const match = /^ {2}(.+) \((.+)\)$/.exec(line);
			if (match) {
				pending.push({ package: match[1], scripts: match[2] });
			}
		}
	}
	return pending;
}

function checkDirectory(directory: string): CheckResult {
	const result = spawnSync(npm, ['approve-scripts', '--allow-scripts-pending'], {
		cwd: directory,
		encoding: 'utf8',
		env: { ...process.env, npm_config_loglevel: 'error' }
	});
	if (result.error) {
		throw new Error(`Failed to run npm approve-scripts in ${path.relative(root, directory) || '.'}: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`npm approve-scripts failed in ${path.relative(root, directory) || '.'}:\n${result.stderr}`);
	}
	return {
		directory,
		pending: parsePendingScripts(result.stdout)
	};
}

function main(): void {
	const packageDirectories = dirs
		.map(dir => path.join(root, dir))
		.filter(directory => existsSync(path.join(directory, 'package.json')));
	const results: CheckResult[] = [];
	for (const directory of packageDirectories) {
		const result = checkDirectory(directory);
		if (result.pending.length > 0) {
			results.push(result);
		}
	}

	if (results.length === 0) {
		console.log(`Checked ${packageDirectories.length} package.json files: all install scripts are covered by allowScripts.`);
		return;
	}

	console.error(`Found unreviewed install scripts in ${results.length} package.json files:`);
	for (const result of results) {
		console.error(`\n${path.relative(root, result.directory) || '.'}/package.json`);
		for (const pending of result.pending) {
			console.error(`  - ${pending.package} (${pending.scripts})`);
		}
	}
	console.error('\nRun `npm approve-scripts <pkg>` in each directory to review the pending install scripts.');
	process.exitCode = 1;
}

main();
