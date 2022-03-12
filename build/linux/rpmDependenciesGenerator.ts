/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { spawnSync } from 'child_process';
import { calculatePackageDeps, mergePackageDeps } from './linux-installer/rpm/rpmDependencyScripts';
import { additionalDeps } from './linux-installer/rpm/additionalDeps';

export function getRpmDependencies(buildDir: string, applicationName: string): string[] {
	// Get the files for which we want to find dependencies.
	const findResult = spawnSync('find', [buildDir, '-name', '*.node']);
	if (findResult.status) {
		console.error('Error finding files:');
		console.error(findResult.stderr.toString());
		return [];
	}

	const files = findResult.stdout.toString().trimEnd().split('\n');

	const appPath = `${buildDir}/${applicationName}`;
	files.push(appPath);

	// Generate the dependencies.
	const dependencies: Set<string>[] = files.map((file) => calculatePackageDeps(file));

	// Add additional dependencies.
	const additionalDepsSet = new Set(additionalDeps);
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
