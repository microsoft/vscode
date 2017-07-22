/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const path = require('path');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function npmInstall(location, opts) {
	opts = opts || {};
	opts.cwd = location;
	opts.stdio = 'inherit';

	const result = cp.spawnSync(npm, ['install'], opts);

	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

npmInstall('extensions'); // node modules shared by all extensions

const extensions = [
	'vscode-api-tests',
	'vscode-colorize-tests',
	'json',
	'configuration-editing',
	'extension-editing',
	'markdown',
	'typescript',
	'php',
	'javascript',
	'css',
	'html',
	'git',
	'gulp',
	'grunt',
	'jake',
	'merge-conflict',
	'emmet',
	'npm',
	'jake'
];

extensions.forEach(extension => npmInstall(`extensions/${extension}`));

function npmInstallBuildDependencies() {
	// make sure we install gulp watch for the system installed
	// node, since that is the driver of gulp
	const env = Object.assign({}, process.env);

	delete env['npm_config_disturl'];
	delete env['npm_config_target'];
	delete env['npm_config_runtime'];

	npmInstall(path.join(path.dirname(__dirname), 'lib', 'watch'), { env });
}

npmInstall(`build`); // node modules required for build
npmInstallBuildDependencies(); // node modules for watching, specific to host node version, not electron