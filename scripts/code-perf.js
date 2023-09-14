/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const path = require('path');
const perf = require('@vscode/vscode-perf');

const VSCODE_FOLDER = path.join(__dirname, '..');

async function main() {

	const args = process.argv;
	/** @type {string | undefined} */
	let build = undefined;

	if (args.indexOf('--help') === -1 && args.indexOf('-h') === -1) {
		// get build arg from args
		let buildArgIndex = args.indexOf('--build');
		buildArgIndex = buildArgIndex === -1 ? args.indexOf('-b') : buildArgIndex;
		if (buildArgIndex === -1) {
			let runtimeArgIndex = args.indexOf('--runtime');
			runtimeArgIndex = runtimeArgIndex === -1 ? args.indexOf('-r') : runtimeArgIndex;
			if (runtimeArgIndex !== -1 && args[runtimeArgIndex + 1] !== 'desktop') {
				console.error('Please provide the --build argument. It is an executable file for desktop or a URL for web');
				process.exit(1);
			}
			build = getLocalCLIPath();
		} else {
			build = args[buildArgIndex + 1];
			if (build !== 'insider' && build !== 'stable' && build !== 'exploration') {
				build = getExePath(args[buildArgIndex + 1]);
			}
			args.splice(buildArgIndex + 1, 1);
		}

		args.push('--folder');
		args.push(VSCODE_FOLDER);
		args.push('--file');
		args.push(path.join(VSCODE_FOLDER, 'package.json'));
	}

	if (build) {
		args.push('--build');
		args.push(build);
	}

	await perf.run();
	process.exit(0);
}

/**
 * @param {string} buildPath
 * @returns {string}
 */
function getExePath(buildPath) {
	buildPath = path.normalize(path.resolve(buildPath));
	if (buildPath === path.normalize(getLocalCLIPath())) {
		return buildPath;
	}
	let relativeExePath;
	switch (process.platform) {
		case 'darwin':
			relativeExePath = path.join('Contents', 'MacOS', 'Electron');
			break;
		case 'linux': {
			const product = require(path.join(buildPath, 'resources', 'app', 'product.json'));
			relativeExePath = product.applicationName;
			break;
		}
		case 'win32': {
			const product = require(path.join(buildPath, 'resources', 'app', 'product.json'));
			relativeExePath = `${product.nameShort}.exe`;
			break;
		}
		default:
			throw new Error('Unsupported platform.');
	}
	return buildPath.endsWith(relativeExePath) ? buildPath : path.join(buildPath, relativeExePath);
}

/**
 * @returns {string}
 */
function getLocalCLIPath() {
	return process.platform === 'win32' ? path.join(VSCODE_FOLDER, 'scripts', 'code.bat') : path.join(VSCODE_FOLDER, 'scripts', 'code.sh');
}

main();
