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
import { Logger, measureAndLog } from './logger';
import type { LaunchOptions } from './code';

const repoPath = path.join(__dirname, '../../..');

export async function launch(options: LaunchOptions): Promise<{ electronProcess: ChildProcess, client: IDisposable, driver: IDriver, kill: () => Promise<void> }> {
	const { codePath, workspacePath, extensionsPath, userDataDir, remote, logger, verbose, extraArgs } = options;
	const env = { ...process.env };
	const logsPath = path.join(repoPath, '.build', 'logs', remote ? 'smoke-tests-remote' : 'smoke-tests');
	const outPath = codePath ? getBuildOutPath(codePath) : getDevOutPath();

	const driverIPCHandle = await measureAndLog(createDriverHandle(), 'createDriverHandle', logger);

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
			await measureAndLog(copyExtension(repoPath, extensionsPath, 'vscode-test-resolver'), 'copyExtension(vscode-test-resolver)', logger);
		}
		args.push('--enable-proposed-api=vscode.vscode-test-resolver');
		const remoteDataDir = `${userDataDir}-server`;
		mkdirp.sync(remoteDataDir);

		if (codePath) {
			// running against a build: copy the test resolver extension into remote extensions dir
			const remoteExtensionsDir = path.join(remoteDataDir, 'extensions');
			mkdirp.sync(remoteExtensionsDir);
			await measureAndLog(copyExtension(repoPath, remoteExtensionsDir, 'vscode-notebook-tests'), 'copyExtension(vscode-notebook-tests)', logger);
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

	if (extraArgs) {
		args.push(...extraArgs);
	}

	const electronPath = codePath ? getBuildElectronPath(codePath) : getDevElectronPath();
	const electronProcess = spawn(electronPath, args, spawnOptions);

	logger.log(`Started electron for desktop smoke tests on pid ${electronProcess.pid}`);

	let retries = 0;

	while (true) {
		try {
			const { client, driver } = await measureAndLog(connectElectronDriver(outPath, driverIPCHandle), 'connectElectronDriver()', logger);
			return {
				electronProcess,
				client,
				driver,
				kill: () => teardown(electronProcess, options.logger)
			};
		} catch (err) {

			// give up
			if (++retries > 30) {
				logger.log(`Error connecting driver: ${err}. Giving up...`);

				await measureAndLog(teardown(electronProcess, logger), 'Kill Electron after failing to connect', logger);

				throw err;
			}

			// retry
			else {
				if ((err as NodeJS.ErrnoException).code !== 'ENOENT' /* ENOENT is expected for as long as the server has not started on the socket */) {
					logger.log(`Error connecting driver: ${err}. Attempting to retry...`);
				}

				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
	}
}

async function teardown(electronProcess: ChildProcess, logger: Logger): Promise<void> {
	const electronPid = electronProcess.pid;
	if (typeof electronPid !== 'number') {
		return;
	}

	let retries = 0;
	while (retries < 3) {
		retries++;

		try {
			return await promisify(kill)(electronPid);
		} catch (error) {
			try {
				process.kill(electronPid, 0); // throws an exception if the process doesn't exist anymore
				logger.log(`Error tearing down electron client (pid: ${electronPid}, attempt: ${retries}): ${error}`);
			} catch (error) {
				return; // Expected when process is gone
			}
		}
	}

	logger.log(`Gave up tearing down electron client after ${retries} attempts...`);
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
