/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { spawnSync } from 'child_process';
import { calculatePackageDeps, mergePackageDeps } from './linux-installer/rpm/rpmDependencyScripts';
import { resolve } from 'path';
import { readFileSync } from 'fs';

export function getRpmDependencies(): string[] {
	// Get the files for which we want to find dependencies.
	const findResult = spawnSync('find', ['.', '-name', '*.node']);
	if (findResult.status) {
		console.error('Error finding files:');
		console.error(findResult.stderr.toString());
		return [];
	}

	// Filter the files and add on the Code binary.
	const files: string[] = findResult.stdout.toString().split('\n').filter((file) => {
		return !file.includes('obj.target') && file.includes('build/Release');
	});
	files.push('.build/electron/code-oss');

	// Generate the dependencies.
	const dependencies: Set<string>[] = files.map((file) => calculatePackageDeps(file));

	// Fetch additional dependencies file.
	const additionalDeps = readFileSync(resolve(__dirname, 'linux-installer/rpm/additional_deps'));
	const additionalDepsSet = new Set(additionalDeps.toString('utf-8').trim().split('\n'));
	dependencies.push(additionalDepsSet);

	// Merge all the dependencies.
	const mergedDependencies = mergePackageDeps(dependencies);
	const sortedDependencies: string[] = [];
	for (const dependency of mergedDependencies) {
		sortedDependencies.push(dependency);
	}
	sortedDependencies.sort();
	return sortedDependencies;
}
