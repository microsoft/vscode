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
	const majorNodeVersion = parseInt(nodeVersion[1]);
	const minorNodeVersion = parseInt(nodeVersion[2]);
	const patchNodeVersion = parseInt(nodeVersion[3]);

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
	console.error('\x1b[1;31m*** Seems like you are using `yarn` which is not supported in this repo any more, please use `npm i` instead. ***\x1b[0;0m');
	throw new Error();
}

if (process.platform === 'win32') {
	if (!hasSupportedVisualStudioVersion()) {
		console.error('\x1b[1;31m*** Invalid C/C++ Compiler Toolchain. Please check https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites.\x1b[0;0m');
		console.error('\x1b[1;31m*** If you have Visual Studio installed in a custom location, you can specify it via the environment variable:\x1b[0;0m');
		console.error('\x1b[1;31m*** set vs2022_install=<path> (or vs2019_install for older versions)\x1b[0;0m');
		throw new Error();
	}
}

installHeaders();

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
			if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath, vsType)))) {
				availableVersions.push(version);
				break;
			}
		}

		if (programFiles86Path) {
			vsPath = `${programFiles86Path}/Microsoft Visual Studio/${version}`;
			if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath, vsType)))) {
				availableVersions.push(version);
				break;
			}
		}
	}

	return availableVersions.length;
}

function installHeaders() {
	const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	child_process.execSync(`${npm} ${process.env.npm_command || 'ci'}`, {
		env: process.env,
		cwd: path.join(import.meta.dirname, 'gyp'),
		stdio: 'inherit'
	});

	// The node gyp package got installed using the above npm command using the gyp/package.json
	// file checked into our repository. So from that point it is safe to construct the path
	// to that executable
	const node_gyp = process.platform === 'win32'
		? path.join(import.meta.dirname, 'gyp', 'node_modules', '.bin', 'node-gyp.cmd')
		: path.join(import.meta.dirname, 'gyp', 'node_modules', '.bin', 'node-gyp');

	const local = getHeaderInfo(path.join(import.meta.dirname, '..', '..', '.npmrc'));
	const remote = getHeaderInfo(path.join(import.meta.dirname, '..', '..', 'remote', '.npmrc'));

	if (local !== undefined) {
		// Both disturl and target come from a file checked into our repository
		child_process.execFileSync(node_gyp, ['install', '--dist-url', local.disturl, local.target], { shell: true });
	}

	if (remote !== undefined) {
		// Both disturl and target come from a file checked into our repository
		child_process.execFileSync(node_gyp, ['install', '--dist-url', remote.disturl, remote.target], { shell: true });
	}

	// On Linux, apply a patch to the downloaded headers
	// Remove dependency on std::source_location to avoid bumping the required GCC version to 11+
	// Refs https://chromium-review.googlesource.com/c/v8/v8/+/6879784
	if (process.platform === 'linux') {
		const homedir = os.homedir();
		const cachePath = process.env.XDG_CACHE_HOME || path.join(homedir, '.cache');
		const nodeGypCache = path.join(cachePath, 'node-gyp');
		const localHeaderPath = path.join(nodeGypCache, local.target, 'include', 'node');
		if (fs.existsSync(localHeaderPath)) {
			console.log('Applying v8-source-location.patch to', localHeaderPath);
			try {
				child_process.execFileSync('patch', ['-p0', '-i', path.join(import.meta.dirname, 'gyp', 'custom-headers', 'v8-source-location.patch')], {
					cwd: localHeaderPath
				});
			} catch (error) {
				throw new Error(`Error applying v8-source-location.patch: ${error.message}`);
			};
		}
	}
}

/**
 * @param {string} rcFile
 * @returns {{ disturl: string; target: string } | undefined}
 */
function getHeaderInfo(rcFile) {
	const lines = fs.readFileSync(rcFile, 'utf8').split(/\r\n|\n/g);
	let disturl, target;
	for (const line of lines) {
		let match = line.match(/\s*disturl=*\"(.*)\"\s*$/);
		if (match !== null && match.length >= 1) {
			disturl = match[1];
		}
		match = line.match(/\s*target=*\"(.*)\"\s*$/);
		if (match !== null && match.length >= 1) {
			target = match[1];
		}
	}
	return disturl !== undefined && target !== undefined
		? { disturl, target }
		: undefined;
}
