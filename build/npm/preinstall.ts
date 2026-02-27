/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as os from 'os';

if (!process.env['VSCODE_SKIP_NODE_VERSION_CHECK']) {
	// Get the running Node.js version
	const nodeVersion = /^(\d+)\.(\d+)\.(\d+)/.exec(process.versions.node);
	const majorNodeVersion = parseInt(nodeVersion![1]);
	const minorNodeVersion = parseInt(nodeVersion![2]);
	const patchNodeVersion = parseInt(nodeVersion![3]);

	// Get the required Node.js version from .nvmrc
	const nvmrcPath = path.join(import.meta.dirname, '..', '..', '.nvmrc');
	const requiredVersion = fs.readFileSync(nvmrcPath, 'utf8').trim();
	const requiredVersionMatch = /^(\d+)\.(\d+)\.(\d+)/.exec(requiredVersion);

	if (!requiredVersionMatch) {
		console.error('\x1b[1;31m*** Unable to parse required Node.js version from .nvmrc\x1b[0;0m');
		throw new Error();
	}

	const requiredMajor = parseInt(requiredVersionMatch[1]);
	const requiredMinor = parseInt(requiredVersionMatch[2]);
	const requiredPatch = parseInt(requiredVersionMatch[3]);

	if (majorNodeVersion < requiredMajor ||
		(majorNodeVersion === requiredMajor && minorNodeVersion < requiredMinor) ||
		(majorNodeVersion === requiredMajor && minorNodeVersion === requiredMinor && patchNodeVersion < requiredPatch)) {
		console.error(`\x1b[1;31m*** Please use Node.js v${requiredVersion} or later for development. Currently using v${process.versions.node}.\x1b[0;0m`);
		throw new Error();
	}
}

if (process.env.npm_execpath?.includes('yarn')) {
	console.error('\x1b[1;31m*** Seems like you are using `yarn` which is not supported in this repo, please use `pnpm install` instead. ***\x1b[0;0m');
	throw new Error();
}

// Allow pnpm (it sets npm_execpath to pnpm's path)
// Reject plain npm — we use pnpm workspaces
if (!process.env.npm_execpath?.includes('pnpm') && !process.env['PNPM_SCRIPT_SRC_DIR']) {
	// Check if we're actually running under pnpm by checking for pnpm-specific env vars
	if (!process.env['npm_config_user_agent']?.includes('pnpm')) {
		console.error('\x1b[1;31m*** This repo uses pnpm. Please use `pnpm install` instead of `npm install`. ***\x1b[0;0m');
		throw new Error();
	}
}

if (process.platform === 'win32') {
	if (!hasSupportedVisualStudioVersion()) {
		console.error('\x1b[1;31m*** Invalid C/C++ Compiler Toolchain. Please check https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites.\x1b[0;0m');
		console.error('\x1b[1;31m*** If you have Visual Studio installed in a custom location, you can specify it via the environment variable:\x1b[0;0m');
		console.error('\x1b[1;31m*** set vs2022_install=<path> (or vs2019_install for older versions)\x1b[0;0m');
		throw new Error();
	}
}

// With pnpm workspaces, native module headers are installed via a separate
// rebuild script (scripts/rebuild-native.ts) rather than at preinstall time.
// All native modules use N-API which is ABI-stable, so prebuilds work for dev.

if (process.arch !== os.arch()) {
	console.error(`\x1b[1;31m*** ARCHITECTURE MISMATCH: The node.js process is ${process.arch}, but your OS architecture is ${os.arch()}. ***\x1b[0;0m`);
	console.error(`\x1b[1;31m*** This can greatly increase the build time of vs code. ***\x1b[0;0m`);
}

function hasSupportedVisualStudioVersion() {
	// Translated over from
	// https://source.chromium.org/chromium/chromium/src/+/master:build/vs_toolchain.py;l=140-175
	const supportedVersions = ['2022', '2019'];

	const availableVersions = [];
	for (const version of supportedVersions) {
		// Check environment variable first (explicit override)
		let vsPath = process.env[`vs${version}_install`];
		if (vsPath && fs.existsSync(vsPath)) {
			availableVersions.push(version);
			break;
		}

		// Check default installation paths
		const programFiles86Path = process.env['ProgramFiles(x86)'];
		const programFiles64Path = process.env['ProgramFiles'];

		const vsTypes = ['Enterprise', 'Professional', 'Community', 'Preview', 'BuildTools', 'IntPreview'];
		if (programFiles64Path) {
			vsPath = `${programFiles64Path}/Microsoft Visual Studio/${version}`;
			if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath!, vsType)))) {
				availableVersions.push(version);
				break;
			}
		}

		if (programFiles86Path) {
			vsPath = `${programFiles86Path}/Microsoft Visual Studio/${version}`;
			if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath!, vsType)))) {
				availableVersions.push(version);
				break;
			}
		}
	}

	return availableVersions.length;
}
