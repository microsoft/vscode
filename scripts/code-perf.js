/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const cp = require('child_process');
const path = require('path');
const { tmpdir } = require('os');
const fs = require('fs');

const ROOT = path.join(tmpdir(), 'vscode-perf');
const USER_DATA_FOLDER = path.join(ROOT, 'user-data-dir');
const EXTENSIONS_FOLDER = path.join(ROOT, 'extensions-dir');
const PERFORMANCE_FILE = path.join(ROOT, 'startup-perf.txt');
const PERFORMANCE_RUNS = 10;
const VSCODE_FOLDER = path.join(__dirname, '..');

/**
 * @returns {{help?: boolean, build?: string, markers?: string | string[], runs?: string, 'perf-file'?: string}}
 */
function getArgs() {
	const args = {};
	for (let i = 2; i < process.argv.length; i++) {
		const arg = process.argv[i];
		if (arg.startsWith('--')) {
			const key = arg.substring(2);
			if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) {
				if (args[key] === undefined) {
					args[key] = process.argv[i + 1];
				} else {
					if (Array.isArray(args[key])) {
						args[key].push(process.argv[i + 1]);
					} else {
						args[key] = [args[key], process.argv[i + 1]];
					}
				}
				i++;
			} else {
				args[key] = true;
			}
		}
	}
	return args;
}

const smallestDurations = new Map();
const totalDurations = new Map();
const averageDurations = new Map();

async function main() {

	const args = getArgs();
	if (args.help) {
		return;
	}

	// Recreate user data & extension folder
	try {
		fs.rmSync(ROOT, { recursive: true });
	} catch (error) { }
	fs.mkdirSync(ROOT, { recursive: true });

	const perfFile = args['perf-file'] || PERFORMANCE_FILE;

	const codeArgs = [
		'--accept-server-license-terms',
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-updates',
		'--user-data-dir',
		USER_DATA_FOLDER,
		'--extensions-dir',
		EXTENSIONS_FOLDER,
		'--disable-extensions',
		'--disable-workspace-trust',
		'--disable-features=CalculateNativeWinOcclusion',
		'--wait',
		'--prof-append-timers',
		perfFile,
		VSCODE_FOLDER,
		path.join(VSCODE_FOLDER, 'package.json')
	];

	const markers = args['markers'] ? Array.isArray(args['markers']) ? args['markers'] : [args['markers']] : [];
	for (const marker of markers) {
		codeArgs.push('--prof-timer-markers');
		codeArgs.push(marker);
	}

	const runs = args.runs ? parseInt(args.runs) : PERFORMANCE_RUNS;
	markers.splice(0, 0, 'ellapsed');

	for (let i = 0; i < runs; i++) {

		console.log(`${gray('[perf]')} running session ${green(`${i + 1}`)} of ${green(`${runs}`)}...`);

		await launch(args.build, codeArgs);

		const lines = fs.readFileSync(perfFile, 'utf8').split('\n');
		let content = '';
		for (let j = lines.length - 1; j >= 0 && !content; j--) {
			content = lines[j];
		}
		for (const marker of markers) {
			logMarker(content, marker, i);
		}
	}

	const bestDurations = [];
	for (const marker of markers) {
		const smallestDuration = smallestDurations.get(marker);
		if (smallestDuration) {
			bestDurations.push(`best (${marker}): ${green(`${smallestDuration}ms`)}`);
		}
	}
	if (bestDurations.length) {
		console.log(`${gray('[perf]')} Summary: ${bestDurations.join(', ')}`);
	}

}

/**
 * @param {string} content
 * @param {string} marker
 * @param {number} run
 */
function logMarker(content, marker, run) {

	const index = marker === 'ellapsed' ? 0 : content.indexOf(marker);
	if (index === -1) {
		return;
	}
	const matches = /(\d+)/.exec(content.substring(index));

	if (!matches?.length) {
		return;
	}

	const duration = parseInt(matches[1]);
	let smallestDuration = smallestDurations.get(marker);

	if (smallestDuration === undefined || smallestDuration > duration) {
		smallestDuration = duration;
		smallestDurations.set(marker, smallestDuration);
	}

	if (run > 0) {
		let totalDuration = totalDurations.get(marker) ?? 0;
		totalDuration += duration;
		averageDurations.set(marker, Math.round(totalDuration / run));
	}

	const averageEllapsed = averageDurations.get(marker);
	console.log(`${gray('[perf]')} ${marker}: ${green(`${duration}ms`)}, best: ${green(`${smallestDuration}ms`)}${averageEllapsed ? `, avg: ${green(`${averageEllapsed}ms`)}` : ''}`);
}

/**
 * @param {string | undefined} build
 * @param {string[]} args
 * @returns {Promise<void>}
 */
async function launch(build, args) {
	const execPath = build ? getBuildElectronPath(build) : getLocalCLIPath();
	const childProcess = cp.spawn(execPath, args);
	await /** @type {Promise<void>} */(new Promise(resolve => childProcess.on('exit', () => resolve())));
}

/**
 * @param {fs.PathLike} path
 * @returns {Promise<boolean>}
 */
async function exists(path) {
	try {
		await fs.promises.stat(path);
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * @param {string} root
 * @returns {string}
 */
function getBuildElectronPath(root) {
	switch (process.platform) {
		case 'darwin':
			return path.join(root, 'Contents', 'MacOS', 'Electron');
		case 'linux': {
			const product = require(path.join(root, 'resources', 'app', 'product.json'));
			return path.join(root, product.applicationName);
		}
		case 'win32': {
			const product = require(path.join(root, 'resources', 'app', 'product.json'));
			return path.join(root, `${product.nameShort}.exe`);
		}
		default:
			throw new Error('Unsupported platform.');
	}
}

/**
 * @returns {string}
 */
function getLocalCLIPath() {
	return process.platform === 'win32' ? path.join(VSCODE_FOLDER, 'scripts', 'code-cli.bat') : path.join(VSCODE_FOLDER, 'scripts', 'code-cli.sh');
}

/**
 * @param {string} msg
 * @returns {string}
 */
function green(msg) {
	return `\x1b[32m${msg}\x1b[39m`;
}

/**
 * @param {string} msg
 * @returns {string}
 */
function red(msg) {
	return `\x1b[31m${msg}\x1b[39m`;
}

/**
 * @param {string} msg
 * @returns {string}
 */
function blue(msg) {
	return `\x1b[94m${msg}\x1b[39m`;
}

/**
 * @param {string} msg
 * @returns {string}
 */
function gray(msg) {
	return `\x1b[90m${msg}\x1b[39m`;
}

main();

