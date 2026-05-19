/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { dirs } from '../../npm/dirs.ts';
import { paths } from '../../folders.ts';

const ROOT = path.join(import.meta.dirname, '../../../');

const shasum = crypto.createHash('sha256');

shasum.update(fs.readFileSync(paths.build.cachesalt.absPath));
shasum.update(fs.readFileSync(paths.npmrc.absPath));
shasum.update(fs.readFileSync(paths.build.npmrc.absPath));
shasum.update(fs.readFileSync(paths.remote.npmrc.absPath));

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

// Add any other command line arguments
for (let i = 2; i < process.argv.length; i++) {
	shasum.update(process.argv[i]);
}

process.stdout.write(shasum.digest('hex'));
