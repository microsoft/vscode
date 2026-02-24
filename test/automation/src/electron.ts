/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'path';
import * as fs from 'fs';
import { copyExtension } from './extensions';
import { URI } from 'vscode-uri';
import { measureAndLog } from './logger';
import type { LaunchOptions } from './code';

const root = join(__dirname, '..', '..', '..');

export interface IElectronConfiguration {
	readonly electronPath: string;
	readonly args: string[];
	readonly env?: NodeJS.ProcessEnv;
}

export async function resolveElectronConfiguration(options: LaunchOptions): Promise<IElectronConfiguration> {
	const { codePath, workspacePath, extensionsPath, userDataDir, remote, logger, logsPath, crashesPath, extraArgs } = options;
	const env = { ...process.env };

	const args: string[] = [
		'--skip-release-notes',
		'--skip-welcome',
		'--disable-telemetry',
		'--disable-experiments',
		'--no-cached-data',
		'--disable-updates',
		'--disable-extension=vscode.vscode-api-tests',
		`--crash-reporter-directory=${crashesPath}`,
		'--disable-workspace-trust',
		`--logsPath=${logsPath}`
	];

	// Only add workspace path if provided
	if (workspacePath) {
		args.unshift(workspacePath);
	}

	if (options.useInMemorySecretStorage) {
		args.push('--use-inmemory-secretstorage');
	}
	if (userDataDir) {
		args.push(`--user-data-dir=${userDataDir}`);
	}
	if (extensionsPath) {
		args.push(`--extensions-dir=${extensionsPath}`);
	}
	if (options.verbose) {
		args.push('--verbose');
	}
	if (options.extensionDevelopmentPath) {
		args.push(`--extensionDevelopmentPath=${options.extensionDevelopmentPath}`);
	}

	if (remote) {
		if (!workspacePath) {
			throw new Error('Workspace path is required when running remote');
		}
		// Replace workspace path with URI
		args[0] = `--${workspacePath.endsWith('.code-workspace') ? 'file' : 'folder'}-uri=vscode-remote://test+test/${URI.file(workspacePath).path}`;

		if (codePath) {
			if (!extensionsPath) {
				throw new Error('Extensions path is required when running against a build at the moment.');
			}
			// running against a build: copy the test resolver extension
			await measureAndLog(() => copyExtension(root, extensionsPath, 'vscode-test-resolver'), 'copyExtension(vscode-test-resolver)', logger);
		}
		args.push('--enable-proposed-api=vscode.vscode-test-resolver');
		if (userDataDir) {
			const remoteDataDir = `${userDataDir}-server`;
			fs.mkdirSync(remoteDataDir, { recursive: true });
			env['TESTRESOLVER_DATA_FOLDER'] = remoteDataDir;
		}
		env['TESTRESOLVER_LOGS_FOLDER'] = join(logsPath, 'server');
		if (options.verbose) {
			env['TESTRESOLVER_LOG_LEVEL'] = 'trace';
		}
	}

	if (!codePath) {
		args.unshift(root);
	}

	if (extraArgs) {
		args.push(...extraArgs);
	}

	const electronPath = codePath ? getBuildElectronPath(codePath) : getDevElectronPath();

	return {
		env,
		args,
		electronPath
	};
}

function findFilePath(root: string, path: string): string {
	// First check if the path exists directly in the root
	const directPath = join(root, path);
	if (fs.existsSync(directPath)) {
		return directPath;
	}

	// If not found directly, search through subdirectories
	const entries = fs.readdirSync(root, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory()) {
			const found = join(root, entry.name, path);
			if (fs.existsSync(found)) {
				return found;
			}
		}
	}

	throw new Error(`Could not find ${path} in any subdirectory`);
}

function parseVersion(version: string) {
	const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
	if (!match) {
		throw new Error(`Invalid version string: ${version}`);
	}
	const [, major, minor, patch] = match;
	return { major: parseInt(major), minor: parseInt(minor), patch: parseInt(patch) };
}

export function getDevElectronPath(): string {
	const buildPath = join(root, '.build');
	const product = require(join(root, 'product.json'));

	switch (process.platform) {
		case 'darwin':
			return join(buildPath, 'electron', `${product.nameLong}.app`, 'Contents', 'MacOS', `${product.nameShort}`);
		case 'linux':
			return join(buildPath, 'electron', `${product.applicationName}`);
		case 'win32':
			return join(buildPath, 'electron', `${product.nameShort}.exe`);
		default:
			throw new Error('Unsupported platform.');
	}
}

export function getBuildElectronPath(root: string): string {
	switch (process.platform) {
		case 'darwin': {
			const packageJson = require(join(root, 'Contents', 'Resources', 'app', 'package.json'));
			const product = require(join(root, 'Contents', 'Resources', 'app', 'product.json'));
			const { major, minor } = parseVersion(packageJson.version);
			// For macOS builds using the legacy Electron binary name, versions up to and including
			// 1.109.x ship the executable as "Electron". From later versions onward, the executable
			// is renamed to match product.nameShort. This check preserves compatibility with older
			// builds; update the cutoff here only if the binary naming scheme changes again.
			if (major === 1 && minor <= 109) {
				return join(root, 'Contents', 'MacOS', 'Electron');
			} else {
				return join(root, 'Contents', 'MacOS', product.nameShort);
			}
		}
		case 'linux': {
			const product = require(join(root, 'resources', 'app', 'product.json'));
			return join(root, product.applicationName);
		}
		case 'win32': {
			const productPath = findFilePath(root, join('resources', 'app', 'product.json'));
			const product = require(productPath);
			return join(root, `${product.nameShort}.exe`);
		}
		default:
			throw new Error('Unsupported platform.');
	}
}

export function getBuildVersion(root: string): string {
	switch (process.platform) {
		case 'darwin':
			return require(join(root, 'Contents', 'Resources', 'app', 'package.json')).version;
		case 'win32': {
			const packagePath = findFilePath(root, join('resources', 'app', 'package.json'));
			return require(packagePath).version;
		}
		default:
			return require(join(root, 'resources', 'app', 'package.json')).version;
	}
}
