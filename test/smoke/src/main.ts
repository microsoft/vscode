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

const tempFolder = 'test_data';
const testRepoUrl = 'https://github.com/Microsoft/vscode-smoketest-express';
const testRepoLocalDir = path.join(process.cwd(), `${tempFolder}/vscode-smoketest-express`);
const keybindingsUrl = 'https://raw.githubusercontent.com/Microsoft/vscode-docs/master/scripts/keybindings';

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
if (program.stable && program.stable.toLowerCase().startsWith('insiders')) {
	process.env.VSCODE_EDITION = 'insiders';
}

// Setting up 'vscode-smoketest-express' project
let os = process.platform.toString();
if (os === 'darwin') {
	os = 'osx';
}
else if (os === 'win32') {
	os = 'win';
}

var promises: Promise<any>[] = [];

promises.push(getKeybindings(`${keybindingsUrl}/doc.keybindings.${os}.json`, `${tempFolder}/keybindings.json`));
promises.push(cleanOrClone(testRepoUrl, testRepoLocalDir));

Promise.all(promises)
	.then(() => execute('npm install', testRepoLocalDir))
	.then(() => runTests())
	.catch(reason => {
		throw new Error('Error caught running the smoke test: ' + reason);
	});

function fail(errorMessage): void {
	console.error(errorMessage);
	process.exit(1);
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
		fs.appendFile(`${tempFolder}/errors.log`, `${date}: ${data.toString()}`, (err) => {
			if (err) {
				throw new Error(`Could not write stderr to errors.log with the following error: ${err}`);
			};
		});
	});
	proc.on('exit', (code) => {
		process.exit(code);
	});
}

function cleanOrClone(repo: string, dir: string): Promise<any> {
	console.log('Cleaning or cloning test project repository...');

	return new Promise(async (res, rej) => {
		if (!folderExists(dir)) {
			await gitClone(repo, dir);
			res();
		} else {
			git.cwd(dir);
			git.fetch(async err => {
				if (err) {
					rej(err);
				}
				await gitResetAndClean();
				res();
			});
		}
	});
}

function gitClone(repo: string, dir: string): Promise<any> {
	return new Promise((res, rej) => {
		git.clone(repo, dir, () => {
			console.log('Test repository successfully cloned.');
			res();
		});
	});
}

function gitResetAndClean(): Promise<any> {
	return new Promise((res, rej) => {
		git.reset(['FETCH_HEAD', '--hard'], err => {
			if (err) {
				rej(err);
			}

			git.clean('f', ['-d'], err => {
				if (err) {
					rej(err);
				}
				console.log('Test project was successfully reset to initial state.');
				res();
			});
		});
	});
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