/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as https from 'https';
// import * as program from 'commander';
import * as cp from 'child_process';
import * as path from 'path';
import * as mkdirp from 'mkdirp';

const testDataPath = path.join(__dirname, '..', 'test_data');
const codeWorkspacePath = path.join(testDataPath, 'smoketest.code-workspace');
const testRepoUrl = 'https://github.com/Microsoft/vscode-smoketest-express';
const testRepoLocalDir = path.join(testDataPath, 'vscode-smoketest-express');

mkdirp.sync(testDataPath);

// program
// 	.option('-l, --latest <file path>', 'path to the latest VS Code to test')
// 	.option('-s, --stable [file path]', 'path to the stable VS Code to be used in data migration tests');

// program.on('--help', () => {
// 	console.log('  Examples:');
// 	console.log('');
// 	console.log('    $ npm test -- --latest path/to/binary');
// 	console.log('    $ npm test -- -l path/to/binary');
// 	console.log('');
// 	console.log('    $ npm test -- --latest path/to/latest/binary --stable path/to/stable/binary');
// 	console.log('    $ npm test -- -l path/to/latest/binary -s path/to/stable/binary');
// 	console.log('');
// });

// program.parse(process.argv);

function fail(errorMessage): void {
	console.error(errorMessage);
	process.exit(1);
}

// if (!program.latest) {
// 	fail('You must specify the binary to run the smoke test against');
// }
// if (!fs.existsSync(program.latest) || (program.stable && !fs.existsSync(program.stable))) {
// 	fail('The file path to electron binary does not exist or permissions do not allow to execute it. Please check the path provided.');
// }
// if (parseInt(process.version.substr(1)) < 6) {
// 	fail('Please update your Node version to greater than 6 to run the smoke test.');
// }

// Setting up environment variables


const repoPath = path.join(__dirname, '..', '..', '..');

function getDevElectronPath() {
	const buildPath = path.join(repoPath, '.build');
	const product = require(path.join(repoPath, 'product.json'));

	switch (process.platform) {
		case 'darwin':
			return path.join(buildPath, `${product.nameLong}.app`, 'Contents', 'MacOS', 'Electron');
		case 'linux':
			return path.join(buildPath, 'electron', `${product.applicationName}`);
		case 'win32':
			return path.join(buildPath, 'electron', `${product.nameShort}.exe`);
	}
}

// TODO@joao: make this change
process.env.VSCODE_PATH = getDevElectronPath();
process.env.VSCODE_REPOSITORY = repoPath;
process.env.VSCODE_DEV = '1';
process.env.VSCODE_CLI = '1';

// if (program.stable) {
// 	process.env.VSCODE_STABLE_PATH = program.stable;
// }
process.env.SMOKETEST_REPO = testRepoLocalDir;
// if (program.latest && (program.latest.indexOf('Code - Insiders') /* macOS/Windows */ || program.latest.indexOf('code-insiders') /* Linux */) >= 0) {
// 	process.env.VSCODE_EDITION = 'insiders';
// }
process.env.VSCODE_WORKSPACE_PATH = codeWorkspacePath;

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

	if (!fs.existsSync(codeWorkspacePath)) {
		console.log('Creating workspace file...');
		const workspace = {
			id: (Date.now() + Math.round(Math.random() * 1000)).toString(),
			folders: [
				toUri(path.join(testRepoLocalDir, 'public')),
				toUri(path.join(testRepoLocalDir, 'routes')),
				toUri(path.join(testRepoLocalDir, 'views'))
			]
		};

		fs.writeFileSync(codeWorkspacePath, JSON.stringify(workspace, null, '\t'));
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