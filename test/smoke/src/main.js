/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var fs = require('fs');
var https = require('https');
var program = require('commander');
var git = require('simple-git')();
var child_process = require('child_process');
var path = require('path');

var tempFolder = 'test_data';
var testRepoUrl = 'https://github.com/Microsoft/vscode-smoketest-express';
var testRepoLocalDir = path.join(process.cwd(), `${tempFolder}/vscode-smoketest-express`);
var keybindingsUrl = 'https://raw.githubusercontent.com/Microsoft/vscode-docs/master/scripts/keybindings';

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
if (program.stable) process.env.VSCODE_STABLE_PATH = program.stable;
process.env.SMOKETEST_REPO = testRepoLocalDir;
if (program.stable && program.stable.toLowerCase().startsWith('insiders')) process.env.VSCODE_EDITION = 'insiders';

// Setting up 'vscode-smoketest-express' project
var os = process.platform;
if (os === 'darwin') os = 'osx';
else if (os === 'win32') os = 'win';
var promises = [];

try {
	promises.push(getKeybindings(`${keybindingsUrl}/doc.keybindings.${os}.json`, `${tempFolder}/keybindings.json`));
	promises.push(cleanOrClone(testRepoUrl, testRepoLocalDir));

	Promise.all(promises).then(() => { execute('npm install', testRepoLocalDir).then(() => runTests()); });
} catch (e) {
	throw new Error('Error caught running the smoke test: ' + e);
}

function fail(errorMessage) {
	console.error(errorMessage);
	process.exit(1);
}

function runTests() {
	console.log('Running tests...')
	const spawn = require('child_process').spawn;
	var proc = spawn(process.execPath, [
		'out/mocha-runner.js'
	]);
	proc.stdout.on('data', data => {
		console.log(data.toString());
	});
	proc.stderr.on('data', data => {
		var date = new Date().toLocaleString();
		fs.appendFile(`${tempFolder}/errors.log`, `${date}: ${data.toString()}`, (err) => {
			if (err) throw new Error(`Could not write stderr to errors.log with the following error: ${err}`);
		});
	});
	proc.on('exit', (code) => {
		process.exit(code);
	});
}

function cleanOrClone(repo, dir) {
	console.log('Cleaning or cloning test project repository...');
	return new Promise((res, rej) => {
		if (!folderExists(dir)) {
			git.clone(repo, dir, () => {
				console.log('Test repository successfully cloned.');
				res();
			});
		} else {
			git.cwd(dir);
			git.fetch((err) => {
				if (err) rej(err);
				resetAndClean();
			});
		}

		var resetAndClean = () => {
			git.reset(['FETCH_HEAD', '--hard'], (err) => {
				if (err) rej(err);

				git.clean('f', ['-d'], (err) => {
					if (err) rej(err);
					console.log('Test project was successfully reset to initial state.');
					res();
				});
			});
		}
	});
}

function execute(cmd, dir) {
	return new Promise((res, rej) => {
		console.log(`Running ${cmd}...`);
		child_process.exec(cmd, { cwd: dir, stdio: [0, 1, 2] }, (error, stdout, stderr) => {
			if (error) rej(error);
			if (stderr) console.error(stderr);
			console.log(stdout);
			res();
		});
	});
}

function getKeybindings(url, location) {
	console.log(`Fetching keybindings from ${url}...`);
	return new Promise((resolve, reject) => {
		https.get(url, (res) => {
			if (res.statusCode != 200) {
				reject(`Failed to obtain key bindings with response code: ${res.statusCode}`);
			}

			var buffer = [];
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

function folderExists(folder) {
	try {
		fs.accessSync(folder, 'rw');
		return true;
	} catch (e) {
		return false;
	}
}

function binaryExists(filePath) {
	try {
		fs.accessSync(filePath, 'x');
		return true;
	} catch (e) {
		return false;
	}
}