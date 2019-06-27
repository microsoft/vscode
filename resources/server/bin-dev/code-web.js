/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const opn = require('opn');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const rimraf = require('rimraf');
const https = require('https');
const util = require('util');

const RUNTIMES = {
	'win32': {
		folder: 'vscode-server-win32-x64-web',
		node: 'node.exe',
		download: 'https://update.code.visualstudio.com/latest/server-win32-x64-web/insider',
		latest: 'https://update.code.visualstudio.com/api/update/win32-x64/insider/latest'
	},
	'darwin': {
		folder: 'vscode-server-darwin-web',
		node: 'node',
		download: 'https://update.code.visualstudio.com/latest/server-darwin-web/insider',
		latest: 'https://update.code.visualstudio.com/api/update/darwin/insider/latest'
	},
	'linux': {
		folder: 'vscode-server-linux-x64-web',
		node: 'node',
		download: 'https://update.code.visualstudio.com/latest/server-linux-x64-web/insider',
		latest: 'https://update.code.visualstudio.com/api/update/linux-x64/insider/latest'
	}
};

const SELFHOST = process.argv.indexOf('--selfhost') !== -1;
const HAS_PORT = process.argv.indexOf('--port') !== -1;
const INSIDERS = process.argv.indexOf('--insiders') !== -1;
const SKIP_UPDATE = process.argv.indexOf('--disable-update') !== -1;
const HAS_WORKSPACE = process.argv.indexOf('--folder') !== -1 || process.argv.indexOf('--workspace') !== -1;

// Workspace Config
if (!HAS_WORKSPACE && SELFHOST) {
	process.argv.push('--folder', process.cwd());
}

// Port Config
let PORT = SELFHOST ? 9777 : 9888;
process.argv.forEach((arg, idx) => {
	if (arg.indexOf('--port') !== -1 && process.argv.length >= idx + 1) {
		PORT = Number(process.argv[idx + 1]);
	}
});

if (!HAS_PORT) {
	process.argv.push('--port', String(PORT));
}

// Insiders Config
if (INSIDERS) {
	process.argv.push('--web-user-data-dir', getInsidersUserDataPath());
	process.argv.push('--extensions-dir', path.join(os.homedir(), '.vscode-insiders', 'extensions'));
}

// Browser Config
let BROWSER = undefined;
process.argv.forEach((arg, idx) => {
	if (arg.indexOf('--browser') !== -1 && process.argv.length >= idx + 1) {
		BROWSER = process.argv[idx + 1];
	}
});

let node;
let entryPoint;
let waitForUpdate = Promise.resolve();
if (SELFHOST) {
	const runtime = RUNTIMES[process.platform];

	const serverLocation = path.join(path.dirname(path.dirname(path.dirname(path.dirname(__dirname)))), runtime.folder);
	node = path.join(serverLocation, runtime.node);
	entryPoint = path.join(serverLocation, 'out', 'vs', 'server', 'main.js');

	const executableExists = fs.existsSync(node);
	if (!executableExists || !SKIP_UPDATE) {
		const targetServerZipDestination = process.platform === 'linux' ? `${serverLocation}.tgz` : `${serverLocation}.zip`;

		if (executableExists) {
			console.log(`Checking for update of server at ${serverLocation}...`);
		} else {
			console.log(`Installing latest released insider server into ${serverLocation}...`);
		}

		let waitForHandleExisting = Promise.resolve(true);
		if (executableExists) {
			const existingVersion = readCommit(serverLocation);

			waitForHandleExisting = jsonRequest(runtime.latest).then(result => {
				if (existingVersion === result.version) {
					return false; // no update needed
				}

				console.log(`Updating server at ${serverLocation} to latest released insider version...`);

				return util.promisify(rimraf)(serverLocation).then(() => true); // update needed
			});
		}

		waitForUpdate = waitForHandleExisting.then(updateNeeded => {
			if (updateNeeded) {
				return download(runtime.download, targetServerZipDestination).then(() => {
					unzip(targetServerZipDestination);
					fs.unlinkSync(targetServerZipDestination);
				});
			}
		});
	}
} else {
	node = process.execPath;
	entryPoint = path.join(__dirname, '..', '..', '..', 'out', 'vs', 'server', 'main.js');
}

waitForUpdate.then(() => startServer(), console.error);


// ---------------
// --- Helpers ---
// ---------------

/**
 * @param {string | import("https").RequestOptions | import("url").URL} downloadUrl
 * @param {import("fs").PathLike} destination
 */
function download(downloadUrl, destination) {
	return new Promise((resolve, reject) => {
		https.get(downloadUrl, res => {
			if (res.statusCode !== 302 || !res.headers.location) {
				reject(`Failed to get VS Web Code Server archive location, expected a 302 redirect but got ${res.statusCode}`);
				return;
			}

			https.get(res.headers.location, res => {
				const outStream = fs.createWriteStream(destination);
				outStream.on('close', () => resolve(destination));
				outStream.on('error', reject);

				res.on('error', reject);
				res.pipe(outStream);
			});
		});
	});
}

/**
 * @param {string} url
 */
function jsonRequest(url) {
	return new Promise((resolve, reject) => {
		https.get(url, res => {
			if (res.statusCode !== 200) {
				reject('Failed to get JSON');
				return;
			}

			let data = '';

			res.on('data', chunk => data += chunk);
			res.on('end', () => resolve(JSON.parse(data)));
			res.on('error', err => reject(err));
		});
	});
}

/**
 * @param {string} folder
 */
function readCommit(folder) {
	try {
		const rawProduct = fs.readFileSync(path.join(folder, 'product.json'));

		return JSON.parse(rawProduct.toString()).commit;
	} catch (error) {
		console.error(error);

		return '';
	}
}

/**
 * @param {string} source
 */
function unzip(source) {
	const destination = path.dirname(source);

	if (source.endsWith('.zip')) {
		if (process.platform === 'win32') {
			cp.spawnSync('powershell.exe', [
				'-NoProfile',
				'-ExecutionPolicy', 'Bypass',
				'-NonInteractive',
				'-NoLogo',
				'-Command',
				`Microsoft.PowerShell.Archive\\Expand-Archive -Path "${source}" -DestinationPath "${destination}"`
			]);
		} else {
			cp.spawnSync('unzip', [source, '-d', destination]);
		}
	} else {
		// tar does not create extractDir by default
		if (!fs.existsSync(destination)) {
			fs.mkdirSync(destination);
		}

		cp.spawnSync('tar', ['-xzf', source, '-C', destination]);
	}
}

/**
 * @param {{ toLowerCase: () => void; }} requestedBrowser
 */
function getApp(requestedBrowser) {
	if (typeof requestedBrowser !== 'string') {
		return undefined;
	}

	switch (requestedBrowser.toLowerCase()) {
		case 'chrome':
			return ({
				'win32': 'chrome',
				'darwin': '/Applications/Google Chrome.app',
				'linux': 'google-chrome'
			})[process.platform];

		case 'safari':
			return ({
				'darwin': '/Applications/Safari.app',
			})[process.platform];
	}
}

function getInsidersUserDataPath() {
	const name = 'Code - Insiders';
	switch (process.platform) {
		case 'win32': return `${path.join(process.env['USERPROFILE'], 'AppData', 'Roaming', name)}`;
		case 'darwin': return path.join(os.homedir(), 'Library', 'Application Support', name);
		case 'linux': return path.join(os.homedir(), '.config', name);
		default: throw new Error('Platform not supported');
	}
}

function startServer() {
	const serverArgs = process.argv.slice(2);
	const proc = cp.spawn(node, [entryPoint, ...serverArgs]);

	let launched = false;
	proc.stdout.on("data", data => {

		// Log everything
		console.log(data.toString());

		// Bring up web URL when we detect the server is ready
		if (!launched && data.toString().indexOf(`Extension host agent listening on ${PORT}`) >= 0) {
			launched = true;

			setTimeout(() => {
				const url = `http://127.0.0.1:${PORT}`;

				console.log(`Opening ${url} in your browser...`);

				opn(url, { app: getApp(BROWSER) }).catch(() => { console.error(`Failed to open ${url} in your browser. Please do so manually.`); });
			}, 100);
		}
	});

	// Log errors
	proc.stderr.on("data", data => {
		console.error(data.toString());
	});
}