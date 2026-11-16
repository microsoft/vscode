/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { isCloudSandbox } from './cloudSandbox.ts';
import { checkPackageManager, getPinnedPnpmVersion } from '../lib/pnpm.ts';
import { getNodeGypHeadersDirectory, installNodeGypHeaders } from './nodeGypHeaders.ts';
import { readNativeBuildConfig } from './pnpm/nativeBuildEnv.ts';

if (!process.env.npm_config_node_gyp) {
	// pnpm passes the node-gyp that it builds native modules with to the scripts it runs.
	console.error('\x1b[1;31m*** Run this script with `pnpm run preinstall`: it installs the headers with the node-gyp that pnpm passes in npm_config_node_gyp ***\x1b[0;0m');
	throw new Error();
}

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

	if (majorNodeVersion !== requiredMajor ||
		minorNodeVersion < requiredMinor ||
		(minorNodeVersion === requiredMinor && patchNodeVersion < requiredPatch)) {
		console.error(`\x1b[1;31m*** Please use Node.js v${requiredVersion} or newer with the same major version (${requiredMajor}) as specified in .nvmrc. Currently using v${process.versions.node}.\x1b[0;0m`);
		throw new Error();
	}
}

const packageManagerError = checkPackageManager(process.env.npm_config_user_agent, getPinnedPnpmVersion(path.join(import.meta.dirname, '..', '..')), process.env.pnpm_config_pm_on_fail);
if (packageManagerError) {
	for (const line of packageManagerError.split('\n')) {
		console.error(`\x1b[1;31m*** ${line}\x1b[0;0m`);
	}
	throw new Error();
}

if (process.platform === 'win32') {
	if (!hasSupportedVisualStudioVersion()) {
		console.error('\x1b[1;31m*** Invalid C/C++ Compiler Toolchain. Please check https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites.\x1b[0;0m');
		console.error('\x1b[1;31m*** If you have Visual Studio installed in a custom location, you can specify it via the environment variable:\x1b[0;0m');
		console.error('\x1b[1;31m*** set vs2026_install=<path> (or vs2022_install / vs2019_install for older versions)\x1b[0;0m');
		throw new Error();
	}
}

await installHeaders();

if (process.arch !== os.arch()) {
	console.error(`\x1b[1;31m*** ARCHITECTURE MISMATCH: The node.js process is ${process.arch}, but your OS architecture is ${os.arch()}. ***\x1b[0;0m`);
	console.error(`\x1b[1;31m*** This can greatly increase the build time of vs code. ***\x1b[0;0m`);
}

function hasSupportedVisualStudioVersion() {
	// Translated over from
	// https://source.chromium.org/chromium/chromium/src/+/master:build/vs_toolchain.py;l=140-175
	// Visual Studio 2026 installs into a folder named after its major version instead of its year.
	const supportedVersions = [
		{ year: '2026', folder: '18' },
		{ year: '2022', folder: '2022' },
		{ year: '2019', folder: '2019' },
	];

	const availableVersions = [];
	for (const { year, folder } of supportedVersions) {
		// Check environment variable first (explicit override)
		let vsPath = process.env[`vs${year}_install`];
		if (vsPath && fs.existsSync(vsPath)) {
			availableVersions.push(year);
			break;
		}

		// Check default installation paths
		const programFiles86Path = process.env['ProgramFiles(x86)'];
		const programFiles64Path = process.env['ProgramFiles'];

		const vsTypes = ['Enterprise', 'Professional', 'Community', 'Preview', 'BuildTools', 'IntPreview'];
		if (programFiles64Path) {
			vsPath = `${programFiles64Path}/Microsoft Visual Studio/${folder}`;
			if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath!, vsType)))) {
				availableVersions.push(year);
				break;
			}
		}

		if (programFiles86Path) {
			vsPath = `${programFiles86Path}/Microsoft Visual Studio/${folder}`;
			if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath!, vsType)))) {
				availableVersions.push(year);
				break;
			}
		}
	}

	return availableVersions.length;
}

async function installHeaders() {
	// The headers are installed by the node-gyp that pnpm builds native modules with: the one
	// bundled with pnpm, unless npm_config_node_gyp was already set when pnpm started.
	const nodeGypScript = process.env.npm_config_node_gyp!;

	const local = getHeaderInfo(path.join(import.meta.dirname, '..', '..'));
	const remote = getHeaderInfo(path.join(import.meta.dirname, '..', '..', 'remote'));

	if (local !== undefined) {
		// Both disturl and target come from a file checked into our repository
		await installNodeGypHeaders(nodeGypScript, local.disturl, local.target);
	}

	if (remote !== undefined) {
		// Both disturl and target come from a file checked into our repository
		await installNodeGypHeaders(nodeGypScript, remote.disturl, remote.target);
	}

	// Overlay the custom headers in build/npm/headers on top of
	// the downloaded Electron headers. This is used to work around upstream issues:
	//   - v8-source-location.h: remove dependency on std::source_location (GCC 11+ requirement)
	//     Refs https://chromium-review.googlesource.com/c/v8/v8/+/6879784
	//   - v8config.h: use compatible deprecation attribute syntax with GCC < 13
	//     Refs https://gcc.gnu.org/bugzilla/show_bug.cgi?id=69585
	if (local !== undefined) {
		const localHeaderPath = getNodeGypHeadersDirectory(local.target);
		if (localHeaderPath && fs.existsSync(localHeaderPath)) {
			copyCustomHeaders(path.join(import.meta.dirname, 'headers'), localHeaderPath);
		}
	}
}

function copyCustomHeaders(sourceDir: string, targetDir: string): void {
	for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
		const sourcePath = path.join(sourceDir, entry.name);
		const targetPath = path.join(targetDir, entry.name);
		if (entry.isDirectory()) {
			fs.mkdirSync(targetPath, { recursive: true });
			copyCustomHeaders(sourcePath, targetPath);
		} else if (entry.isFile()) {
			console.log('Overlaying custom header', targetPath);
			fs.copyFileSync(sourcePath, targetPath);
		}
	}
}

/**
 * Returns where to download the headers of the runtime that the install root `rootDir` builds
 * native modules for, from the `nativeBuild` field of its `package.json`.
 */
function getHeaderInfo(rootDir: string): { disturl: string; target: string } | undefined {
	const config = readNativeBuildConfig(rootDir);
	if (config?.target === undefined) {
		return undefined;
	}
	const disturl = isCloudSandbox() && config.disturl === 'https://electronjs.org/headers'
		? 'https://artifacts.electronjs.org/headers/dist'
		: config.disturl;
	return { disturl, target: config.target };
}
