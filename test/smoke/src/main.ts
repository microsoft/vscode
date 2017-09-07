/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as https from 'https';
import * as cp from 'child_process';
import * as path from 'path';
import * as minimist from 'minimist';
import * as tmp from 'tmp';
import * as rimraf from 'rimraf';
import * as mkdirp from 'mkdirp';

const [, , ...args] = process.argv;
const opts = minimist(args, { string: ['build', 'stable-build', 'screenshot'] });

const tmpDir = tmp.dirSync() as { name: string; removeCallback: Function; };
const testDataPath = tmpDir.name;
process.once('exit', code => code === 0 && rimraf.sync(testDataPath));

const workspacePath = path.join(testDataPath, 'smoketest.code-workspace');
const testRepoUrl = 'https://github.com/Microsoft/vscode-smoketest-express';
const testRepoLocalDir = path.join(testDataPath, 'vscode-smoketest-express');
const keybindingsPath = path.join(testDataPath, 'keybindings.json');
const extensionsPath = path.join(testDataPath, 'extensions-dir');
mkdirp.sync(extensionsPath);

function fail(errorMessage): void {
	console.error(errorMessage);
	process.exit(1);
}

if (parseInt(process.version.substr(1)) < 6) {
	fail('Please update your Node version to greater than 6 to run the smoke test.');
}

const repoPath = path.join(__dirname, '..', '..', '..');

function getDevElectronPath(): string {
	const buildPath = path.join(repoPath, '.build');
	const product = require(path.join(repoPath, 'product.json'));

	switch (process.platform) {
		case 'darwin':
			return path.join(buildPath, 'electron', `${product.nameLong}.app`, 'Contents', 'MacOS', 'Electron');
		case 'linux':
			return path.join(buildPath, 'electron', `${product.applicationName}`);
		case 'win32':
			return path.join(buildPath, 'electron', `${product.nameShort}.exe`);
		default:
			throw new Error('Unsupported platform.');
	}
}

let testCodePath = opts.build;
let stableCodePath = opts['stable-build'];

if (testCodePath) {
	process.env.VSCODE_PATH = testCodePath;

	if (stableCodePath) {
		process.env.VSCODE_STABLE_PATH = stableCodePath;
	}
} else {
	testCodePath = getDevElectronPath();
	process.env.VSCODE_PATH = testCodePath;
	process.env.VSCODE_REPOSITORY = repoPath;
	process.env.VSCODE_DEV = '1';
	process.env.VSCODE_CLI = '1';
}

if (!fs.existsSync(testCodePath)) {
	fail(`Can't find Code at ${testCodePath}.`);
}

process.env.VSCODE_USER_DIR = path.join(testDataPath, 'user-dir');
process.env.VSCODE_EXTENSIONS_DIR = extensionsPath;
process.env.SCREENSHOTS_DIR = path.join(testDataPath, 'screenshots-dir');
process.env.SMOKETEST_REPO = testRepoLocalDir;
process.env.VSCODE_WORKSPACE_PATH = workspacePath;
process.env.VSCODE_KEYBINDINGS_PATH = keybindingsPath;
process.env.CAPTURE_SCREENSHOT = Object.keys(opts).indexOf('screenshot') !== -1 ? 'screenshot' : '';

if (process.env.VSCODE_DEV === '1') {
	process.env.VSCODE_EDITION = 'dev';
} else if ((testCodePath.indexOf('Code - Insiders') /* macOS/Windows */ || testCodePath.indexOf('code-insiders') /* Linux */) >= 0) {
	process.env.VSCODE_EDITION = 'insiders';
} else {
	process.env.VSCODE_EDITION = 'stable';
}

function getKeybindingPlatform(): string {
	switch (process.platform) {
		case 'darwin': return 'osx';
		case 'win32': return 'win';
		default: return process.platform;
	}
}

function toUri(path: string): string {
	if (process.platform === 'win32') {
		return `file:///${path.replace(/\\/g, '/')}`;
	}

	return `file://${path}`;
}

async function main(): Promise<void> {
	console.log('*** Test data:', testDataPath);
	console.log('*** Preparing smoketest setup...');

	const keybindingsUrl = `https://raw.githubusercontent.com/Microsoft/vscode-docs/master/scripts/keybindings/doc.keybindings.${getKeybindingPlatform()}.json`;
	console.log('*** Fetching keybindings...');

	await new Promise((c, e) => {
		https.get(keybindingsUrl, res => {
			const output = fs.createWriteStream(keybindingsPath);
			res.on('error', e);
			output.on('error', e);
			output.on('close', c);
			res.pipe(output);
		}).on('error', e);
	});

	if (!fs.existsSync(workspacePath)) {
		console.log('*** Creating workspace file...');
		const workspace = {
			id: (Date.now() + Math.round(Math.random() * 1000)).toString(),
			folders: [
				toUri(path.join(testRepoLocalDir, 'public')),
				toUri(path.join(testRepoLocalDir, 'routes')),
				toUri(path.join(testRepoLocalDir, 'views'))
			]
		};

		fs.writeFileSync(workspacePath, JSON.stringify(workspace, null, '\t'));
	}

	if (!fs.existsSync(testRepoLocalDir)) {
		console.log('*** Cloning test project repository...');
		cp.spawnSync('git', ['clone', testRepoUrl, testRepoLocalDir]);
	} else {
		console.log('*** Cleaning test project repository...');
		cp.spawnSync('git', ['fetch'], { cwd: testRepoLocalDir });
		cp.spawnSync('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: testRepoLocalDir });
		cp.spawnSync('git', ['clean', '-xdf'], { cwd: testRepoLocalDir });
	}

	console.log('*** Running npm install...');
	cp.execSync('npm install', { cwd: testRepoLocalDir, stdio: 'inherit' });

	console.log('*** Smoketest setup done!\n');
}

/**
 * WebDriverIO 4.8.0 outputs all kinds of "deprecation" warnings
 * for common commands like `keys` and `moveToObject`.
 * According to https://github.com/Codeception/CodeceptJS/issues/531,
 * these deprecation warnings are for Firefox, and have no alternative replacements.
 * Since we can't downgrade WDIO as suggested (it's Spectron's dep, not ours),
 * we must suppress the warning with a classic monkey-patch.
 *
 * @see webdriverio/lib/helpers/depcrecationWarning.js
 * @see https://github.com/webdriverio/webdriverio/issues/2076
 */
// Filter out the following messages:
const wdioDeprecationWarning = /^WARNING: the "\w+" command will be depcrecated soon./; // [sic]
// Monkey patch:
const warn = console.warn;
console.warn = function suppressWebdriverWarnings(message) {
	if (wdioDeprecationWarning.test(message)) { return; }
	warn.apply(console, arguments);
};

before(async function () {
	// allow two minutes for setup
	this.timeout(2 * 60 * 1000);
	await main();
});

import './areas/css/css.test';
import './areas/explorer/explorer.test';
import './areas/preferences/preferences.test';
import './areas/editor/editor.test';
import './areas/multiroot/multiroot.test';
import './areas/extensions/extensions.test';
import './areas/search/search.test';
import './areas/workbench/data-loss.test';
import './areas/git/git.test';
import './areas/statusbar/statusbar.test';
import './areas/workbench/localization.test';
import './areas/terminal/terminal.test';
import './areas/debug/debug.test';
// import './areas/workbench/data-migration.test';