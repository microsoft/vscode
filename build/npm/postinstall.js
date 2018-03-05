/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';

function yarnInstall(location, opts) {
	opts = opts || {};
	opts.cwd = location;
	opts.stdio = 'inherit';

	const result = cp.spawnSync(yarn, ['install'], opts);

	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

yarnInstall('extensions'); // node modules shared by all extensions

const extensions = [
	'vscode-api-tests',
	'vscode-colorize-tests',
	'json',
	'configuration-editing',
	'extension-editing',
	'markdown',
	'markdown-basics',
	'typescript',
	'typescript-basics',
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

extensions.forEach(extension => yarnInstall(`extensions/${extension}`));

function yarnInstallBuildDependencies() {
	// make sure we install the deps of build/lib/watch for the system installed
	// node, since that is the driver of gulp
	//@ts-ignore
	const env = Object.assign({}, process.env);
	const watchPath = path.join(path.dirname(__dirname), 'lib', 'watch');
	const yarnrcPath = path.join(watchPath, '.yarnrc');

	const disturl = 'https://nodejs.org/download/release';
	const target = process.versions.node;
	const runtime = 'node';

	const yarnrc = `disturl "${disturl}"
target "${target}"
runtime "${runtime}"`;

	fs.writeFileSync(yarnrcPath, yarnrc, 'utf8');
	yarnInstall(watchPath, { env });
}

yarnInstall(`build`); // node modules required for build
yarnInstall('test/smoke'); // node modules required for smoketest
yarnInstallBuildDependencies(); // node modules for watching, specific to host node version, not electron