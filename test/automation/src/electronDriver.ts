/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as os from 'os';
import { tmpName } from 'tmp';
import { connect as connectElectronDriver, IDisposable, IDriver } from './driver';
import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import * as mkdirp from 'mkdirp';
import { promisify } from 'util';
import * as kill from 'tree-kill';
import { copyExtension } from './extensions';
import { URI } from 'vscode-uri';

const repoPath = path.join(__dirname, '../../..');

export async function launch(codePath: string | undefined, userDataDir: string, extensionsPath: string, workspacePath: string, verbose: boolean, remote: boolean, log: string | undefined, extraArgs: string[] | undefined): Promise<{ electronProcess: ChildProcess, client: IDisposable, driver: IDriver }> {
	const env = { ...process.env };
	const logsPath = path.join(repoPath, '.build', 'logs', remote ? 'smoke-tests-remote' : 'smoke-tests');
	const outPath = codePath ? getBuildOutPath(codePath) : getDevOutPath();

	const driverIPCHandle = await createDriverHandle();

	const args = [
		workspacePath,
		'--skip-release-notes',
		'--skip-welcome',
		'--disable-telemetry',
		'--no-cached-data',
		'--disable-updates',
		'--disable-keytar',
		'--disable-crash-reporter',
		'--disable-workspace-trust',
		`--extensions-dir=${extensionsPath}`,
		`--user-data-dir=${userDataDir}`,
		`--logsPath=${logsPath}`,
		'--driver', driverIPCHandle
	];

	if (process.platform === 'linux') {
		args.push('--disable-gpu'); // Linux has trouble in VMs to render properly with GPU enabled
	}

	if (remote) {
		// Replace workspace path with URI
		args[0] = `--${workspacePath.endsWith('.code-workspace') ? 'file' : 'folder'}-uri=vscode-remote://test+test/${URI.file(workspacePath).path}`;

		if (codePath) {
			// running against a build: copy the test resolver extension
			await copyExtension(repoPath, extensionsPath, 'vscode-test-resolver');
		}
		args.push('--enable-proposed-api=vscode.vscode-test-resolver');
		const remoteDataDir = `${userDataDir}-server`;
		mkdirp.sync(remoteDataDir);

		if (codePath) {
			// running against a build: copy the test resolver extension into remote extensions dir
			const remoteExtensionsDir = path.join(remoteDataDir, 'extensions');
			mkdirp.sync(remoteExtensionsDir);
			await copyExtension(repoPath, remoteExtensionsDir, 'vscode-notebook-tests');
		}

		env['TESTRESOLVER_DATA_FOLDER'] = remoteDataDir;
		env['TESTRESOLVER_LOGS_FOLDER'] = path.join(logsPath, 'server');
	}

	const spawnOptions: SpawnOptions = { env };

	args.push('--enable-proposed-api=vscode.vscode-notebook-tests');

	if (!codePath) {
		args.unshift(repoPath);
	}

	if (verbose) {
		args.push('--driver-verbose');
		spawnOptions.stdio = ['ignore', 'inherit', 'inherit'];
	}

	if (log) {
		args.push('--log', log);
	}

	if (extraArgs) {
		args.push(...extraArgs);
	}

	const electronPath = codePath ? getBuildElectronPath(codePath) : getDevElectronPath();
	const electronProcess = spawn(electronPath, args, spawnOptions);

	if (verbose) {
		console.info(`*** Started electron for desktop smoke tests on pid ${electronProcess.pid}`);
	}

	let electronProcessDidExit = false;
	electronProcess.once('exit', (code, signal) => {
		if (verbose) {
			console.info(`*** Electron for desktop smoke tests terminated (pid: ${electronProcess.pid}, code: ${code}, signal: ${signal})`);
		}
		electronProcessDidExit = true;
	});

	process.once('exit', () => {
		if (!electronProcessDidExit) {
			electronProcess.kill();
		}
	});

	let retries = 0;

	while (true) {
		try {
			const { client, driver } = await connectElectronDriver(outPath, driverIPCHandle);
			return { electronProcess, client, driver };
		} catch (err) {

			// give up
			if (++retries > 30) {
				console.error(`*** Error connecting driver: ${err}. Giving up...`);

				try {
					await promisify(kill)(electronProcess.pid!);
				} catch (error) {
					console.warn(`*** Error tearing down electron client (pid: ${electronProcess.pid}): ${error}`);
				}

				throw err;
			}

			// retry
			else {
				if ((err as NodeJS.ErrnoException).code !== 'ENOENT' /* ENOENT is expected for as long as the server has not started on the socket */) {
					console.error(`*** Error connecting driver: ${err}. Attempting to retry...`);
				}

				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
	}
}

function getDevElectronPath(): string {
	const buildPath = path.join(repoPath, '.build');
	const product = require(path.join(repoPath, 'product.json'));

	switch (process.platform) {
		case 'darwin':
			return path.join(buildPath, 'electron', `${product.nameLong}.app`, 'Contents', 'MacOS', 'Electron');
		case 'linux':
			return path.join(buildPath, 'electron', `${product.applicationName}`);
		case 'win32':
			return path.join(buildPath, 'electron', `${product.nameShort}.exe`);
		default:
			throw new Error('Unsupported platform.');
	}
}

function getBuildElectronPath(root: string): string {
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

function getDevOutPath(): string {
	return path.join(repoPath, 'out');
}

function getBuildOutPath(root: string): string {
	switch (process.platform) {
		case 'darwin':
			return path.join(root, 'Contents', 'Resources', 'app', 'out');
		default:
			return path.join(root, 'resources', 'app', 'out');
	}
}

async function createDriverHandle(): Promise<string> {

	// Windows
	if ('win32' === os.platform()) {
		const name = [...Array(15)].map(() => Math.random().toString(36)[3]).join('');
		return `\\\\.\\pipe\\${name}`;
	}

	// Posix
	return promisify(tmpName)();
}
