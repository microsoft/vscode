/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { dirs } from '../../npm/dirs.ts';

const ROOT = path.join(import.meta.dirname, '../../../');

const args = process.argv.slice(2);

// `--restore-scope` hashes only the inputs that make a cached `node_modules`
// unusable as the base of an incremental install (e.g. a Node.js or Electron
// version change requires rebuilding native modules), so it can be used as a
// cache restore key prefix that survives `package.json` and lockfile changes.
const restoreScope = args[0] === '--restore-scope';
if (restoreScope) {
	args.shift();
}

const shasum = crypto.createHash('sha256');

shasum.update(fs.readFileSync(path.join(ROOT, 'build/.cachesalt')));
shasum.update(fs.readFileSync(path.join(ROOT, '.npmrc')));
shasum.update(fs.readFileSync(path.join(ROOT, 'build', '.npmrc')));
shasum.update(fs.readFileSync(path.join(ROOT, 'remote', '.npmrc')));

if (restoreScope) {
	shasum.update(fs.readFileSync(path.join(ROOT, '.nvmrc')));

	for (const dir of dirs) {
		const npmrcPath = path.join(ROOT, dir, '.npmrc');
		if (fs.existsSync(npmrcPath)) {
			shasum.update(dir);
			shasum.update(fs.readFileSync(npmrcPath));
		}
	}
} else {
	// Add `package.json` and `package-lock.json` files
	for (const dir of dirs) {
		const packageJsonPath = path.join(ROOT, dir, 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
		const relevantPackageJsonSections = {
			dependencies: packageJson.dependencies,
			devDependencies: packageJson.devDependencies,
			optionalDependencies: packageJson.optionalDependencies,
			resolutions: packageJson.resolutions,
			distro: packageJson.distro
		};
		shasum.update(JSON.stringify(relevantPackageJsonSections));

		const packageLockPath = path.join(ROOT, dir, 'package-lock.json');
		shasum.update(fs.readFileSync(packageLockPath));
	}
}

// Add any other command line arguments
for (const arg of args) {
	shasum.update(arg);
}

process.stdout.write(shasum.digest('hex'));
