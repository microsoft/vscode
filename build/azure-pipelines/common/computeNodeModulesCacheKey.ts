/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { dirs } from '../../npm/dirs.ts';

const ROOT = path.join(import.meta.dirname, '../../../');

const shasum = crypto.createHash('sha256');

shasum.update(fs.readFileSync(path.join(ROOT, 'build/.cachesalt')));
shasum.update(fs.readFileSync(path.join(ROOT, 'extensions/copilot/build/.cachesalt'))); // TODO: remove this one when all build scripts are cleaned up
shasum.update(fs.readFileSync(path.join(ROOT, '.npmrc')));
shasum.update(fs.readFileSync(path.join(ROOT, 'build', '.npmrc')));
shasum.update(fs.readFileSync(path.join(ROOT, 'remote', '.npmrc')));

// Add the pnpm workspace definition and lockfiles (root workspace + standalone
// projects). These replace the per-directory package-lock.json files.
shasum.update(fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml')));
for (const lock of [
	'pnpm-lock.yaml',
	'build/pnpm-lock.yaml',
	'build/npm/gyp/pnpm-lock.yaml',
	'remote/pnpm-lock.yaml',
	'remote/web/pnpm-lock.yaml',
]) {
	const lockPath = path.join(ROOT, lock);
	if (fs.existsSync(lockPath)) {
		shasum.update(fs.readFileSync(lockPath));
	}
}

// Add `package.json` manifests (dependency-relevant sections only)
for (const dir of dirs) {
	const packageJsonPath = path.join(ROOT, dir, 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
	const relevantPackageJsonSections = {
		dependencies: packageJson.dependencies,
		devDependencies: packageJson.devDependencies,
		optionalDependencies: packageJson.optionalDependencies,
		resolutions: packageJson.resolutions,
		pnpm: packageJson.pnpm,
		distro: packageJson.distro
	};
	shasum.update(JSON.stringify(relevantPackageJsonSections));
}

// Add any other command line arguments
for (let i = 2; i < process.argv.length; i++) {
	shasum.update(process.argv[i]);
}

process.stdout.write(shasum.digest('hex'));
