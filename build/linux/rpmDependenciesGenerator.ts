/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { spawnSync, SpawnSyncReturns } from 'child_process';
import { readFileSync } from 'fs';
import { basename } from 'path';

export function getRpmDependencies(scriptsDir: string, binaryDir: string): string[] {
	// Run the update package provides script.
	let result: SpawnSyncReturns<Buffer>;
	result = spawnSync('python2', [`${scriptsDir}/rpm/update_package_provides.py`]);
	if (result.status) {
		console.error('Error updating package provides:');
		console.error(result.stderr.toString('utf-8'));
		return [];
	}

	// No sysroot step.
	// Get the files for which we want to find dependencies.
	result = spawnSync('find', ['-wholename', `${binaryDir}/resources/app/node_modules.asar.unpacked/**/*.node`]);
	if (result.status) {
		console.error('Error finding files:');
		console.error(result.stderr.toString('utf-8'));
		return [];
	}

	// Generate the dependencies.
	const files: string[] = result.stdout.toString('utf-8').split('\n');
	files.push(`${binaryDir}/code-insiders`);
	const dependencyFiles: string[] = [];
	for (const file of files) {
		const dependencyFileName = `${basename(file)}.deps`;
		result = spawnSync('python2', [`${scriptsDir}/rpm/calculate_package_deps.py`, file, dependencyFileName]);
		if (result.status) {
			console.error(`Error generating dependencies for ${file}:`);
			console.error(result.stderr.toString('utf-8'));
			return [];
		}
	}

	// Merge the dependencies.
	result = spawnSync('python2', [`${scriptsDir}/rpm/merge_package_deps.py`, 'merged.deps', `${scriptsDir}/rpm/additional_deps`, ...dependencyFiles]);
	if (result.status) {
		console.error('Error merging dependencies:');
		console.error(result.stderr.toString('utf-8'));
		return [];
	}

	// Read the merged dependencies.
	try {
		const buf = readFileSync('merged.deps');
		return buf.toString('utf-8').split('\n');
	} catch (e) {
		console.error('Error reading merged dependencies:');
		console.error(e);
		return [];
	}
}
