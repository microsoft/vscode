/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const cp = require('child_process');

if (process.env['npm_config_disturl'] !== 'https://atom.io/download/electron') {
	console.error("You can't use plain npm to install Code's dependencies.");
	console.error(
		/^win/.test(process.platform)
		? "Please run '.\\scripts\\npm.bat install' instead."
		: "Please run './scripts/npm.sh install' instead."
	);

	process.exit(1);
}

// make sure we install gulp watch for the system installed
// node, since that is the driver of gulp
if (process.platform !== 'win32') {
	const env = Object.assign({}, process.env);

	delete env['npm_config_disturl'];
	delete env['npm_config_target'];
	delete env['npm_config_runtime'];

	cp.spawnSync('npm', ['install'], {
		cwd: path.join(path.dirname(__dirname), 'lib', 'watch'),
		stdio: 'inherit',
		env
	});
}