/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { spawnSync } from 'child_process';
import path = require('path');
import { getChromiumSysroot, getVSCodeSysroot } from './debian/install-sysroot';
import { generatePackageDeps as generatePackageDepsDebian } from './debian/calculate-deps';
import { generatePackageDeps as generatePackageDepsRpm } from './rpm/calculate-deps';
import { referenceGeneratedDepsByArch as debianGeneratedDeps } from './debian/dep-lists';
import { referenceGeneratedDepsByArch as rpmGeneratedDeps } from './rpm/dep-lists';
import { DebianArchString, isDebianArchString } from './debian/types';
import { isRpmArchString, RpmArchString } from './rpm/types';
import product = require('../../product.json');

// A flag that can easily be toggled.
// Make sure to compile the build directory after toggling the value.
// If false, we warn about new dependencies if they show up
// while running the prepare package tasks for a release.
// If true, we fail the build if there are new dependencies found during that task.
// The reference dependencies, which one has to update when the new dependencies
// are valid, are in dep-lists.ts
const FAIL_BUILD_FOR_NEW_DEPENDENCIES: boolean = true;

// Based on https://source.chromium.org/chromium/chromium/src/+/refs/tags/124.0.6367.243:chrome/installer/linux/BUILD.gn;l=64-80
// and the Linux Archive build
// Shared library dependencies that we already bundle.
const bundledDeps = [
	'libEGL.so',
	'libGLESv2.so',
	'libvulkan.so.1',
	'libvk_swiftshader.so',
	'libffmpeg.so'
];

export async function getDependencies(packageType: 'deb' | 'rpm', buildDir: string, applicationName: string, arch: string): Promise<string[]> {
	if (packageType === 'deb') {
		if (!isDebianArchString(arch)) {
			throw new Error('Invalid Debian arch string ' + arch);
		}
	}
	if (packageType === 'rpm' && !isRpmArchString(arch)) {
		throw new Error('Invalid RPM arch string ' + arch);
	}

	// Get the files for which we want to find dependencies.
	const nativeModulesPath = path.join(buildDir, 'resources', 'app', 'node_modules.asar.unpacked');
	const findResult = spawnSync('find', [nativeModulesPath, '-name', '*.node']);
	if (findResult.status) {
		console.error('Error finding files:');
		console.error(findResult.stderr.toString());
		return [];
	}

	const appPath = path.join(buildDir, applicationName);
	// Add the native modules
	const files = findResult.stdout.toString().trimEnd().split('\n');
	// Add the tunnel binary.
	files.push(path.join(buildDir, 'bin', product.tunnelApplicationName));
	// Add the main executable.
	files.push(appPath);
	// Add chrome sandbox and crashpad handler.
	files.push(path.join(buildDir, 'chrome-sandbox'));
	files.push(path.join(buildDir, 'chrome_crashpad_handler'));

	// Generate the dependencies.
	let dependencies: Set<string>[];
	if (packageType === 'deb') {
		const chromiumSysroot = await getChromiumSysroot(arch as DebianArchString);
		const vscodeSysroot = await getVSCodeSysroot(arch as DebianArchString);
		dependencies = generatePackageDepsDebian(files, arch as DebianArchString, chromiumSysroot, vscodeSysroot);
	} else {
		dependencies = generatePackageDepsRpm(files);
	}

	// Merge all the dependencies.
	const mergedDependencies = mergePackageDeps(dependencies);

	// Exclude bundled dependencies and sort
	const sortedDependencies: string[] = Array.from(mergedDependencies).filter(dependency => {
		return !bundledDeps.some(bundledDep => dependency.startsWith(bundledDep));
	}).sort();

	const referenceGeneratedDeps = packageType === 'deb' ?
		debianGeneratedDeps[arch as DebianArchString] :
		rpmGeneratedDeps[arch as RpmArchString];
	if (JSON.stringify(sortedDependencies) !== JSON.stringify(referenceGeneratedDeps)) {
		const failMessage = 'The dependencies list has changed.'
			+ '\nOld:\n' + referenceGeneratedDeps.join('\n')
			+ '\nNew:\n' + sortedDependencies.join('\n');
		if (FAIL_BUILD_FOR_NEW_DEPENDENCIES) {
			throw new Error(failMessage);
		} else {
			console.warn(failMessage);
		}
	}

	return sortedDependencies;
}


// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/merge_package_deps.py.
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
