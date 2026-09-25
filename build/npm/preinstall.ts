/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as os from 'os';
import { isUpToDate, forceInstallMessage } from './installStateHash.ts';

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

if (process.env.npm_execpath?.includes('yarn')) {
	console.error('\x1b[1;31m*** Seems like you are using `yarn` which is not supported in this repo any more, please use `npm i` instead. ***\x1b[0;0m');
	throw new Error();
}

const npmUserAgent = process.env.npm_config_user_agent;
const npmVersionMatch = npmUserAgent?.match(/npm\/(\d+)\.(\d+)\.(\d+)/);
if (npmVersionMatch) {
	const npmMajor = parseInt(npmVersionMatch[1]);
	if (npmMajor >= 13) {
		console.error(`\x1b[1;31m*** Please use npm version < 13.0.0. Currently using v${npmUserAgent}.\x1b[0;0m`);
		throw new Error();
	}
}

// Fast path: if nothing changed since last successful install, skip everything.
// This makes `npm i` near-instant when dependencies haven't changed.
if (!process.env['VSCODE_FORCE_INSTALL'] && isUpToDate()) {
	console.log(`\x1b[32mAll dependencies up to date.\x1b[0m ${forceInstallMessage}`);
	process.exit(0);
}

if (process.platform === 'win32') {
	if (!hasSupportedVisualStudioVersion()) {
		console.error('\x1b[1;31m*** Invalid C/C++ Compiler Toolchain. Please check https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites.\x1b[0;0m');
		throw new Error();
	}
}

installHeaders();

if (process.arch !== os.arch()) {
	console.error(`\x1b[1;31m*** ARCHITECTURE MISMATCH: The node.js process is ${process.arch}, but your OS architecture is ${os.arch()}. ***\x1b[0;0m`);
	console.error(`\x1b[1;31m*** This can greatly increase the build time of vs code. ***\x1b[0;0m`);
}

function hasSupportedVisualStudioVersion() {
	const vswherePath = [process.env['ProgramFiles(x86)'], process.env['ProgramFiles']]
		.filter(programFilesPath => programFilesPath !== undefined)
		.map(programFilesPath => path.join(programFilesPath, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe'))
		.find(candidate => fs.existsSync(candidate));
	if (vswherePath === undefined) {
		return false;
	}

	const targetArch = process.env['npm_config_arch'] ?? process.arch;
	const architectureComponents = targetArch === 'arm64'
		? [
			'Microsoft.VisualStudio.Component.VC.Runtimes.ARM64.Spectre',
			'Microsoft.VisualStudio.Component.VC.ATL.ARM64.Spectre',
			'Microsoft.VisualStudio.Component.VC.MFC.ARM64.Spectre',
		]
		: [
			'Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre',
			'Microsoft.VisualStudio.Component.VC.ATL.Spectre',
			'Microsoft.VisualStudio.Component.VC.ATLMFC.Spectre',
		];

	const baseComponents = [
		'Microsoft.VisualStudio.Workload.VCTools',
		'Microsoft.VisualStudio.Component.Windows1?SDK.?????',
	];

	const findLatestInstallation = (requiredComponents: string[]) => {
		const result = child_process.spawnSync(vswherePath, [
			'-latest',
			'-products', '*',
			'-prerelease',
			'-version', '[16.0,19.0)',
			'-requires', ...requiredComponents,
			'-property', 'installationPath',
		], { encoding: 'utf8' });

		if (result.error) {
			console.error(`\x1b[1;31m*** Failed to query Visual Studio installations: ${result.error.message}\x1b[0;0m`);
			return undefined;
		}
		if (result.status !== 0) {
			console.error(`\x1b[1;31m*** Failed to query Visual Studio installations: ${result.stderr.trim()}\x1b[0;0m`);
			return undefined;
		}

		return result.stdout.trim() || undefined;
	};

	// Validate the newest base toolchain because that is the installation node-gyp will prefer.
	const selectedInstallation = findLatestInstallation(baseComponents);
	if (selectedInstallation === undefined) {
		return false;
	}

	const validInstallation = findLatestInstallation([...baseComponents, ...architectureComponents]);
	if (validInstallation === undefined
		|| path.resolve(validInstallation).toLowerCase() !== path.resolve(selectedInstallation).toLowerCase()) {
		console.error(`\x1b[1;31m*** Visual Studio installation is missing required components: ${selectedInstallation}\x1b[0;0m`);
		return false;
	}

	return true;
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

	// Overlay any custom headers shipped in build/npm/gyp/custom-headers on top of
	// the downloaded Electron headers. This is used to work around upstream issues:
	//   - v8-source-location.h: remove dependency on std::source_location (GCC 11+ requirement)
	//     Refs https://chromium-review.googlesource.com/c/v8/v8/+/6879784
	//   - v8config.h: use compatible deprecation attribute syntax with GCC < 13
	//     Refs https://gcc.gnu.org/bugzilla/show_bug.cgi?id=69585
	if (local !== undefined) {
		const localHeaderPath = getLocalHeaderPath(local.target);
		if (localHeaderPath && fs.existsSync(localHeaderPath)) {
			copyCustomHeaders(path.join(import.meta.dirname, 'gyp', 'custom-headers'), localHeaderPath);
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

function getLocalHeaderPath(target: string): string | undefined {
	if (process.platform === 'win32') {
		const localAppData = process.env.LOCALAPPDATA;
		if (!localAppData) {
			return undefined;
		}
		return path.join(localAppData, 'node-gyp', 'Cache', target, 'include', 'node');
	}
	if (process.platform === 'darwin') {
		return path.join(os.homedir(), 'Library', 'Caches', 'node-gyp', target, 'include', 'node');
	}
	const homedir = os.homedir();
	const cachePath = process.env.XDG_CACHE_HOME || path.join(homedir, '.cache');
	return path.join(cachePath, 'node-gyp', target, 'include', 'node');
}

function getHeaderInfo(rcFile: string): { disturl: string; target: string } | undefined {
	const lines = fs.readFileSync(rcFile, 'utf8').split(/\r\n|\n/g);
	let disturl: string | undefined;
	let target: string | undefined;
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
