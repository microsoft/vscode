/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const tmp = require('tmp');

/*
 * Cleans up the dependencies that keytar brings in
 * Ref: https://github.com/microsoft/vscode/issues/143395
 */

tmp.setGracefulCleanup();
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';

/**
 * @param {string} location
 * @param {string} package
 */
function yarnAdd(location, package) {
	const opts = { env: process.env };
	opts.cwd = location;
	opts.stdio = 'inherit';


	const args = ['add', package];
	console.log(`Adding dependency: ${package}`);
	console.log(`$ yarn ${args.join(' ')}`);
	const result = cp.spawnSync(yarn, args, opts);

	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

/**
 * @param {string} location
 * @param {string} package
 */
function yarnRemove(location, package) {
	const opts = { env: process.env };
	opts.cwd = location;
	opts.stdio = 'inherit';


	const args = ['remove', package];
	console.log(`Removing dependency: ${package}`);
	console.log(`$ yarn ${args.join(' ')}`);
	const result = cp.spawnSync(yarn, args, opts);

	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

const root = path.join(__dirname, '../../remote');

// get version of keytar
const version = require(path.join(root, 'package.json')).dependencies.keytar;

// remove keytar from dependencies
yarnRemove(root, 'keytar');

// install keytar in a tmp location
const dir = tmp.dirSync({ unsafeCleanup: true });
yarnAdd(dir.name, `keytar@${version}`);

// copy keytar package over
fs.renameSync(path.join(dir.name, 'node_modules/keytar'), path.join(root, 'node_modules/keytar'));
