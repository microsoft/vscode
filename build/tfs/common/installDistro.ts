/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function npmInstall(package: string, args: string[]): void {
	const result = cp.spawnSync(npm, ['install', package, ...args], {
		stdio: 'inherit'
	});

	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

const product = require('../../../product.json');
const dependencies = product.dependencies || {} as { [name: string]: string; };
const [, , ...args] = process.argv;

Object.keys(dependencies).forEach(name => {
	const url = dependencies[name];
	npmInstall(url, args);
});