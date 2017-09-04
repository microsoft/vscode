/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as https from 'https';
import * as cp from 'child_process';
import * as path from 'path';
import * as mkdirp from 'mkdirp';

const testDataPath = path.join(__dirname, '..', 'test_data');
const workspacePath = path.join(testDataPath, 'smoketest.code-workspace');
const testRepoUrl = 'https://github.com/Microsoft/vscode-smoketest-express';
const testRepoLocalDir = path.join(testDataPath, 'vscode-smoketest-express');
mkdirp.sync(testDataPath);

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
			return path.join(buildPath, `${product.nameLong}.app`, 'Contents', 'MacOS', 'Electron');
		case 'linux':
			return path.join(buildPath, 'electron', `${product.applicationName}`);
		case 'win32':
			return path.join(buildPath, 'electron', `${product.nameShort}.exe`);
		default:
			throw new Error('Unsupported platform.');
	}
}

let [, , testCodePath, stableCodePath] = process.argv;

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

process.env.SMOKETEST_REPO = testRepoLocalDir;
process.env.VSCODE_WORKSPACE_PATH = workspacePath;

if ((testCodePath.indexOf('Code - Insiders') /* macOS/Windows */ || testCodePath.indexOf('code-insiders') /* Linux */) >= 0) {
	process.env.VSCODE_EDITION = 'insiders';
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
	const keybindingsUrl = `https://raw.githubusercontent.com/Microsoft/vscode-docs/master/scripts/keybindings/doc.keybindings.${getKeybindingPlatform()}.json`;
	console.log(`Fetching keybindings from ${keybindingsUrl}...`);

	await new Promise((c, e) => {
		https.get(keybindingsUrl, res => {
			const output = fs.createWriteStream(path.join(testDataPath, 'keybindings.json'));
			res.on('error', e);
			output.on('error', e);
			output.on('close', c);
			res.pipe(output);
		}).on('error', e);
	});

	if (!fs.existsSync(workspacePath)) {
		console.log('Creating workspace file...');
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
		console.log('Cloning test project repository...');
		cp.spawnSync('git', ['clone', testRepoUrl, testRepoLocalDir]);
	} else {
		console.log('Cleaning test project repository...');
		cp.spawnSync('git', ['fetch'], { cwd: testRepoLocalDir });
		cp.spawnSync('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: testRepoLocalDir });
		cp.spawnSync('git', ['clean', '-xdf'], { cwd: testRepoLocalDir });
	}

	console.log('Running npm install...');
	cp.execSync('npm install', { cwd: testRepoLocalDir, stdio: 'inherit' });

	console.log('Running tests...');
	const mocha = cp.spawnSync(process.execPath, ['out/mocha-runner.js'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
	process.exit(mocha.status);
}

main().catch(fail);