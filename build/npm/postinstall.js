/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const { dirs } = require('./dirs');
const { setupBuildYarnrc } = require('./setupBuildYarnrc');
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';

/**
 * @param {string} location
 * @param {*} [opts]
 */
function yarnInstall(location, opts) {
	opts = opts || { env: process.env };
	opts.cwd = location;
	opts.stdio = 'inherit';

	const raw = process.env['npm_config_argv'] || '{}';
	const argv = JSON.parse(raw);
	const original = argv.original || [];
	const args = original.filter(arg => arg === '--ignore-optional' || arg === '--frozen-lockfile' || arg === '--check-files');
	if (opts.ignoreEngines) {
		args.push('--ignore-engines');
		delete opts.ignoreEngines;
	}

	console.log(`Installing dependencies in ${location}...`);
	console.log(`$ yarn ${args.join(' ')}`);
	const result = cp.spawnSync(yarn, args, opts);

	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

for (let dir of dirs) {

	if (dir === '') {
		// `yarn` already executed in root
		continue;
	}

	if (/^remote/.test(dir) && process.platform === 'win32' && (process.arch === 'arm64' || process.env['npm_config_arch'] === 'arm64')) {
		// windows arm: do not execute `yarn` on remote folder
		continue;
	}

	if (dir === 'build') {
		setupBuildYarnrc();
		yarnInstall('build');
		continue;
	}

	let opts;

	if (dir === 'remote') {
		// node modules used by vscode server
		const env = { ...process.env };
		if (process.env['VSCODE_REMOTE_CC']) { env['CC'] = process.env['VSCODE_REMOTE_CC']; }
		if (process.env['VSCODE_REMOTE_CXX']) { env['CXX'] = process.env['VSCODE_REMOTE_CXX']; }
		if (process.env['CXXFLAGS']) { delete env['CXXFLAGS']; }
		if (process.env['CFLAGS']) { delete env['CFLAGS']; }
		if (process.env['LDFLAGS']) { delete env['LDFLAGS']; }
		if (process.env['VSCODE_REMOTE_NODE_GYP']) { env['npm_config_node_gyp'] = process.env['VSCODE_REMOTE_NODE_GYP']; }

		opts = { env };
	} else if (/^extensions\//.test(dir)) {
		opts = { ignoreEngines: true };
	}

	yarnInstall(dir, opts);
}

cp.execSync('git config pull.rebase merges');
cp.execSync('git config blame.ignoreRevsFile .git-blame-ignore');
