/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { tmpName } from 'tmp';
import { IDriver, connect as connectDriver, IDisposable } from './driver';

const repoPath = path.join(__dirname, '../../..');

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

export class Code {

	constructor(
		private process: cp.ChildProcess,
		private client: IDisposable,
		readonly driver: IDriver
	) {

	}

	dispose(): void {
		this.client.dispose();
		this.process.kill();
	}
}

export interface SpawnOptions {
	codePath?: string;
	userDataDir: string;
	extensionsPath: string;
}

export async function connect(child: cp.ChildProcess, outPath: string, handlePath: string): Promise<Code> {
	let errCount = 0;

	while (true) {
		try {
			const { client, driver } = await connectDriver(outPath, handlePath);
			return new Code(child, client, driver);
		} catch (err) {
			if (++errCount > 50) {
				child.kill();
				throw err;
			}

			// retry
			await new Promise(c => setTimeout(c, 100));
		}
	}
}

export async function spawn(options: SpawnOptions): Promise<Code> {
	const codePath = options.codePath;
	const electronPath = codePath ? getBuildElectronPath(codePath) : getDevElectronPath();
	const outPath = codePath ? getBuildOutPath(codePath) : getDevOutPath();
	const handlePath = await new Promise<string>((c, e) => tmpName((err, handlePath) => err ? e(err) : c(handlePath)));

	const args = [
		'--skip-getting-started',
		'--skip-release-notes',
		'--sticky-quickopen',
		'--disable-telemetry',
		'--disable-updates',
		'--disable-crash-reporter',
		`--extensions-dir=${options.extensionsPath}`,
		`--user-data-dir=${options.userDataDir}`,
		'--driver', handlePath
	];

	if (!codePath) {
		args.unshift(repoPath);
	}

	const child = cp.spawn(electronPath, args);
	return connect(child, outPath, handlePath);
}