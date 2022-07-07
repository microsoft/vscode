/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import { constants, statSync } from 'fs';
import path = require('path');
import { additionalDeps, bundledDeps, referenceGeneratedDepsByArch } from './dep-lists';
import { ArchString } from './types';

// A flag that can easily be toggled.
// Make sure to compile the build directory after toggling the value.
// If false, we warn about new dependencies if they show up
// while running the rpm prepare package task for a release.
// If true, we fail the build if there are new dependencies found during that task.
// The reference dependencies, which one has to update when the new dependencies
// are valid, are in dep-lists.ts
const FAIL_BUILD_FOR_NEW_DEPENDENCIES: boolean = true;

export function getDependencies(buildDir: string, applicationName: string, arch: ArchString): string[] {
	// Get the files for which we want to find dependencies.
	const nativeModulesPath = path.join(buildDir, 'resources', 'app', 'node_modules.asar.unpacked');
	const findResult = spawnSync('find', [nativeModulesPath, '-name', '*.node']);
	if (findResult.status) {
		console.error('Error finding files:');
		console.error(findResult.stderr.toString());
		return [];
	}

	const files = findResult.stdout.toString().trimEnd().split('\n');

	const appPath = path.join(buildDir, applicationName);
	files.push(appPath);

	// Add chrome sandbox and crashpad handler.
	files.push(path.join(buildDir, 'chrome-sandbox'));
	files.push(path.join(buildDir, 'chrome_crashpad_handler'));

	// Generate the dependencies.
	const dependencies: Set<string>[] = files.map((file) => calculatePackageDeps(file));

	// Add additional dependencies.
	const additionalDepsSet = new Set(additionalDeps);
	dependencies.push(additionalDepsSet);

	// Merge all the dependencies.
	const mergedDependencies = mergePackageDeps(dependencies);
	let sortedDependencies: string[] = [];
	for (const dependency of mergedDependencies) {
		sortedDependencies.push(dependency);
	}
	sortedDependencies.sort();

	// Exclude bundled dependencies
	sortedDependencies = sortedDependencies.filter(dependency => {
		return !bundledDeps.some(bundledDep => dependency.startsWith(bundledDep));
	});

	const referenceGeneratedDeps = referenceGeneratedDepsByArch[arch];
	if (JSON.stringify(sortedDependencies) !== JSON.stringify(referenceGeneratedDeps)) {
		const failMessage = 'The dependencies list has changed. '
			+ 'Printing newer dependencies list that one can use to compare against referenceGeneratedDeps:\n'
			+ sortedDependencies.join('\n');
		if (FAIL_BUILD_FOR_NEW_DEPENDENCIES) {
			throw new Error(failMessage);
		} else {
			console.warn(failMessage);
		}
	}

	return sortedDependencies;
}

// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/calculate_package_deps.py.
function calculatePackageDeps(binaryPath: string): Set<string> {
	try {
		if (!(statSync(binaryPath).mode & constants.S_IXUSR)) {
			throw new Error(`Binary ${binaryPath} needs to have an executable bit set.`);
		}
	} catch (e) {
		// The package might not exist. Don't re-throw the error here.
		console.error('Tried to stat ' + binaryPath + ' but failed.');
	}

	const findRequiresResult = spawnSync('/usr/lib/rpm/find-requires', { input: binaryPath + '\n' });
	if (findRequiresResult.status !== 0) {
		throw new Error(`find-requires failed with exit code ${findRequiresResult.status}.\nstderr: ${findRequiresResult.stderr}`);
	}

	const requires = new Set(findRequiresResult.stdout.toString('utf-8').trimEnd().split('\n'));
	return requires;
}

// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/merge_package_deps.py
function mergePackageDeps(inputDeps: Set<string>[]): Set<string> {
	const requires = new Set<string>();
	for (const depSet of inputDeps) {
		for (const dep of depSet) {
			const trimmedDependency = dep.trim();
			if (trimmedDependency.length && !trimmedDependency.startsWith('#')) {
				requires.add(trimmedDependency);
			}
		}
	}
	return requires;
}
