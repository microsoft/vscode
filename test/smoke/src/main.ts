/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const https = require('https');
const program = require('commander');
const git = require('simple-git')();
const child_process = require('child_process');
const path = require('path');
const mkdirp = require('mkdirp');

const testDataPath = path.join(process.cwd(), 'test_data');
const codeWorkspacePath = path.join(testDataPath, 'smoketest.code-workspace');
const testRepoUrl = 'https://github.com/Microsoft/vscode-smoketest-express';
const testRepoLocalDir = path.join(testDataPath, 'vscode-smoketest-express');
const keybindingsUrl = 'https://raw.githubusercontent.com/Microsoft/vscode-docs/master/scripts/keybindings';

mkdirp.sync(testDataPath);

program
	.option('-l, --latest <file path>', 'path to the latest VS Code to test')
	.option('-s, --stable [file path]', 'path to the stable VS Code to be used in data migration tests');

program.on('--help', () => {
	console.log('  Examples:');
	console.log('');
	console.log('    $ npm test -- --latest path/to/binary');
	console.log('    $ npm test -- -l path/to/binary');
	console.log('');
	console.log('    $ npm test -- --latest path/to/latest/binary --stable path/to/stable/binary');
	console.log('    $ npm test -- -l path/to/latest/binary -s path/to/stable/binary');
	console.log('');
});
program.parse(process.argv);

if (!program.latest) {
	fail('You must specify the binary to run the smoke test against');
}
if (!binaryExists(program.latest) || (program.stable && !binaryExists(program.stable))) {
	fail('The file path to electron binary does not exist or permissions do not allow to execute it. Please check the path provided.');
}
if (parseInt(process.version.substr(1)) < 6) {
	fail('Please update your Node version to greater than 6 to run the smoke test.');
}

// Setting up environment variables
process.env.VSCODE_LATEST_PATH = program.latest;
if (program.stable) {
	process.env.VSCODE_STABLE_PATH = program.stable;
}
process.env.SMOKETEST_REPO = testRepoLocalDir;
if (program.latest && (program.latest.indexOf('Code - Insiders') /* macOS/Windows */ || program.latest.indexOf('code-insiders') /* Linux */) >= 0) {
	process.env.VSCODE_EDITION = 'insiders';
}
process.env.VSCODE_WORKSPACE_PATH = codeWorkspacePath;

// Setting up 'vscode-smoketest-express' project
let os = process.platform.toString();
if (os === 'darwin') {
	os = 'osx';
}
else if (os === 'win32') {
	os = 'win';
}

main().catch(err => console.error(err));

async function main(): Promise<void> {
	await getKeybindings(`${keybindingsUrl}/doc.keybindings.${os}.json`, path.join(testDataPath, 'keybindings.json'));

	const workspace = {
		id: (Date.now() + Math.round(Math.random() * 1000)).toString(),
		folders: [
			toUri(path.join(testRepoLocalDir, 'public')),
			toUri(path.join(testRepoLocalDir, 'routes')),
			toUri(path.join(testRepoLocalDir, 'views'))
		]
	};

	await createWorkspaceFile(codeWorkspacePath, workspace);
	await cleanOrClone(testRepoUrl, testRepoLocalDir);
	await execute('npm install', testRepoLocalDir);
	await runTests();
}

function fail(errorMessage): void {
	console.error(errorMessage);
	process.exit(1);
}

function toUri(path: string): string {
	if (os === 'win') {
		return `file:///${path.replace(/\\/g, '/')}`;
	}

	return `file://${path}`;
}

function runTests(): void {
	console.log('Running tests...');
	var proc = child_process.spawn(process.execPath, [
		'out/mocha-runner.js'
	]);
	proc.stdout.on('data', data => {
		console.log(data.toString());
	});
	proc.stderr.on('data', data => {
		var date = new Date().toLocaleString();
		fs.appendFile(path.join(testDataPath, 'errors.log'), `${date}: ${data.toString()}`, (err) => {
			if (err) {
				throw new Error(`Could not write stderr to errors.log with the following error: ${err}`);
			};
		});
	});
	proc.on('exit', (code) => {
		process.exit(code);
	});
}

async function cleanOrClone(repo: string, dir: string): Promise<any> {
	console.log('Cleaning or cloning test project repository...');

	if (!folderExists(dir)) {
		await gitClone(repo, dir);
	} else {
		git.cwd(dir);
		await new Promise((c, e) => git.fetch(err => err ? e(err) : c()));
		await gitResetAndClean();
	}
}

function gitClone(repo: string, dir: string): Promise<any> {
	return new Promise((res, rej) => {
		git.clone(repo, dir, () => {
			console.log('Test repository successfully cloned.');
			res();
		});
	});
}

async function gitResetAndClean(): Promise<any> {
	await new Promise((c, e) => git.reset(['FETCH_HEAD', '--hard'], err => err ? e(err) : c()));
	await new Promise((c, e) => git.clean('f', ['-d'], err => err ? e(err) : c()));
	console.log('Test project was successfully reset to initial state.');
}

function execute(cmd: string, dir: string): Promise<any> {
	return new Promise((res, rej) => {
		console.log(`Running ${cmd}...`);
		child_process.exec(cmd, { cwd: dir, stdio: [0, 1, 2] }, (error, stdout, stderr) => {
			if (error) {
				rej(error);
			}
			if (stderr) {
				console.error(stderr);
			}
			console.log(stdout);
			res();
		});
	});
}

function getKeybindings(url: string, location: string): Promise<any> {
	console.log(`Fetching keybindings from ${url}...`);
	return new Promise((resolve, reject) => {
		https.get(url, (res) => {
			if (res.statusCode !== 200) {
				reject(`Failed to obtain key bindings with response code: ${res.statusCode}`);
			}

			var buffer: Buffer[] = [];
			res.on('data', (chunk) => buffer.push(chunk));
			res.on('end', () => {
				fs.writeFile(location, Buffer.concat(buffer), 'utf8', () => {
					console.log('Keybindings were successfully fetched.');
					resolve();
				});
			});
		}).on('error', (e) => {
			reject(`Failed to obtain key bindings with an error: ${e}`);
		});
	});
}

function createWorkspaceFile(path: string, workspace: any): Promise<any> {
	console.log(`Creating workspace file at ${path}...`);
	return new Promise((resolve, reject) => {
		fs.exists(path, exists => {
			if (exists) {
				return resolve();
			}

			fs.writeFile(path, JSON.stringify(workspace, null, '\t'), error => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	});
}

function folderExists(folder: string): boolean {
	try {
		fs.accessSync(folder, 'rw');
		return true;
	} catch (e) {
		return false;
	}
}

function binaryExists(filePath: string): boolean {
	try {
		fs.accessSync(filePath, 'x');
		return true;
	} catch (e) {
		return false;
	}
}