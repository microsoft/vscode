/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import { constants, statSync } from 'fs';
import { tmpdir } from 'os';
import path = require('path');
import * as manifests from '../../../cgmanifest.json';
import { additionalDeps } from './dep-lists';
import { DebianArchString } from './types';

export function generatePackageDeps(files: string[], arch: DebianArchString, sysroot: string): Set<string>[] {
	const dependencies: Set<string>[] = files.map(file => calculatePackageDeps(file, arch, sysroot));
	const additionalDepsSet = new Set(additionalDeps);
	dependencies.push(additionalDepsSet);
	return dependencies;
}

// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/calculate_package_deps.py.
function calculatePackageDeps(binaryPath: string, arch: DebianArchString, sysroot: string): Set<string> {
	try {
		if (!(statSync(binaryPath).mode & constants.S_IXUSR)) {
			throw new Error(`Binary ${binaryPath} needs to have an executable bit set.`);
		}
	} catch (e) {
		// The package might not exist. Don't re-throw the error here.
		console.error('Tried to stat ' + binaryPath + ' but failed.');
	}

	// Get the Chromium dpkg-shlibdeps file.
	const chromiumManifest = manifests.registrations.filter(registration => {
		return registration.component.type === 'git' && registration.component.git!.name === 'chromium';
	});
	const dpkgShlibdepsUrl = `https://raw.githubusercontent.com/chromium/chromium/${chromiumManifest[0].version}/third_party/dpkg-shlibdeps/dpkg-shlibdeps.pl`;
	const dpkgShlibdepsScriptLocation = `${tmpdir()}/dpkg-shlibdeps.pl`;
	const result = spawnSync('curl', [dpkgShlibdepsUrl, '-o', dpkgShlibdepsScriptLocation]);
	if (result.status !== 0) {
		throw new Error('Cannot retrieve dpkg-shlibdeps. Stderr:\n' + result.stderr);
	}
	const cmd = [dpkgShlibdepsScriptLocation, '--ignore-weak-undefined'];
	switch (arch) {
		case 'amd64':
			cmd.push(`-l${sysroot}/usr/lib/x86_64-linux-gnu`,
				`-l${sysroot}/lib/x86_64-linux-gnu`);
			break;
		case 'armhf':
			cmd.push(`-l${sysroot}/usr/lib/arm-linux-gnueabihf`,
				`-l${sysroot}/lib/arm-linux-gnueabihf`);
			break;
		case 'arm64':
			cmd.push(`-l${sysroot}/usr/lib/aarch64-linux-gnu`,
				`-l${sysroot}/lib/aarch64-linux-gnu`);
			break;
	}
	cmd.push(`-l${sysroot}/usr/lib`);
	cmd.push('-O', '-e', path.resolve(binaryPath));

	const dpkgShlibdepsResult = spawnSync('perl', cmd, { cwd: sysroot });
	if (dpkgShlibdepsResult.status !== 0) {
		throw new Error(`dpkg-shlibdeps failed with exit code ${dpkgShlibdepsResult.status}. stderr:\n${dpkgShlibdepsResult.stderr} `);
	}

	const shlibsDependsPrefix = 'shlibs:Depends=';
	const requiresList = dpkgShlibdepsResult.stdout.toString('utf-8').trimEnd().split('\n');
	let depsStr = '';
	for (const line of requiresList) {
		if (line.startsWith(shlibsDependsPrefix)) {
			depsStr = line.substring(shlibsDependsPrefix.length);
		}
	}
	// Refs https://chromium-review.googlesource.com/c/chromium/src/+/3572926
	// Chromium depends on libgcc_s, is from the package libgcc1.  However, in
	// Bullseye, the package was renamed to libgcc-s1.  To avoid adding a dep
	// on the newer package, this hack skips the dep.  This is safe because
	// libgcc-s1 is a dependency of libc6.  This hack can be removed once
	// support for Debian Buster and Ubuntu Bionic are dropped.
	//
	// Remove kerberos native module related dependencies as the versions
	// computed from sysroot will not satisfy the minimum supported distros
	// Refs https://github.com/microsoft/vscode/issues/188881.
	// TODO(deepak1556): remove this workaround in favor of computing the
	// versions from build container for native modules.
	const filteredDeps = depsStr.split(', ').filter(dependency => {
		return !dependency.startsWith('libgcc-s1') &&
			!dependency.startsWith('libgssapi-krb5-2') &&
			!dependency.startsWith('libkrb5-3');
	}).sort();
	const requires = new Set(filteredDeps);
	return requires;
}
