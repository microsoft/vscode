/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';

/**
 * @param {string} location
 * @param {*} [opts]
 */
function yarnInstall(location, opts) {
	opts = opts || {};
	opts.cwd = location;
	opts.stdio = 'inherit';

	const raw = process.env['npm_config_argv'] || '{}';
	const argv = JSON.parse(raw);
	const original = argv.original || [];
	const args = original.filter(arg => arg === '--ignore-optional' || arg === '--frozen-lockfile');

	console.log(`Installing dependencies in ${location}...`);
	console.log(`$ yarn ${args.join(' ')}`);
	const result = cp.spawnSync(yarn, args, opts);

	if (result.error || result.status !== 0) {
		process.exit(1);
	}
}

yarnInstall('extensions'); // node modules shared by all extensions

yarnInstall('remote'); // node modules used by vscode server

yarnInstall('remote/web'); // node modules used by vscode web

const allExtensionFolders = fs.readdirSync('extensions');
const extensions = allExtensionFolders.filter(e => {
	try {
		let packageJSON = JSON.parse(fs.readFileSync(path.join('extensions', e, 'package.json')).toString());
		return packageJSON && (packageJSON.dependencies || packageJSON.devDependencies);
	} catch (e) {
		return false;
	}
});

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

// Remove the windows process tree typings as this causes duplicate identifier errors in tsc builds
const processTreeDts = path.join('node_modules', 'windows-process-tree', 'typings', 'windows-process-tree.d.ts');
if (fs.existsSync(processTreeDts)) {
	console.log('Removing windows-process-tree.d.ts');
	fs.unlinkSync(processTreeDts);
}

function getInstalledVersion(packageName, cwd) {
	const opts = {};
	if (cwd) {
		opts.cwd = cwd;
	}

	const result = cp.spawnSync(yarn, ['list', '--pattern', packageName], opts);
	const stdout = result.stdout.toString();
	const match = stdout.match(new RegExp(packageName + '@(\\S+)'));
	if (!match || !match[1]) {
		throw new Error('Unexpected output from yarn list: ' + stdout);
	}

	return match[1];
}

function assertSameVersionsBetweenFolders(packageName, otherFolder) {
	const baseVersion = getInstalledVersion(packageName);
	const otherVersion = getInstalledVersion(packageName, otherFolder);

	if (baseVersion !== otherVersion) {
		throw new Error(`Mismatched versions installed for ${packageName}: root has ${baseVersion}, ./${otherFolder} has ${otherVersion}. These should be the same!`);
	}
}

// Check that modules in both the base package.json and remote/ have the same version installed
const requireSameVersionsInRemote = [
	'xterm',
	'xterm-addon-search',
	'xterm-addon-web-links',
	'node-pty',
	'vscode-ripgrep'
];

requireSameVersionsInRemote.forEach(packageName => {
	assertSameVersionsBetweenFolders(packageName, 'remote');
});
