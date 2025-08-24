/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import { LOGGER } from './extension';
import { exec } from 'child_process';
import { RBinary } from './provider.js';
import { ReasonDiscovered } from './r-installation.js';

const execPromise = util.promisify(exec);

export async function isCondaAvailable(): Promise<boolean> {
	try {
		await execPromise('conda --version');
		return true;
	} catch {
		return false;
	}
}

export async function getCondaEnvironments(): Promise<string[]> {
	try {
		const { stdout } = await execPromise('conda env list --json');
		const envs = JSON.parse(stdout).envs as string[];
		return envs;
	} catch (error) {
		LOGGER.error('Failed to retrieve Conda environments:', error);
		return [];
	}
}

export function getCondaRPaths(envPath: string): string[] {
	const paths: string[] = [];
	if (process.platform !== 'win32') {
		paths.push(path.join(envPath, 'bin', 'R'));
	} else {
		paths.push(path.join(envPath, 'Lib', 'R', 'bin', 'x64', 'R.exe'));
		paths.push(path.join(envPath, 'Lib', 'R', 'bin', 'R.exe'));
	}
	return paths;
}

export async function discoverCondaBinaries(): Promise<RBinary[]> {
	const rBinaries: RBinary[] = [];

	const enabled = vscode.workspace.getConfiguration('erdos.r').get<boolean>('interpreters.condaDiscovery');
	if (enabled) {
		if (!(await isCondaAvailable())) {
			LOGGER.info('Conda is not installed or not in PATH.');
			return [];
		}

		const condaEnvs = await getCondaEnvironments();

		for (const envPath of condaEnvs) {
			const rPaths = getCondaRPaths(envPath);

			if (rPaths.length === 0) {
				continue;
			}

			for (const rPath of rPaths) {
				if (fs.existsSync(rPath)) {
					LOGGER.info(`Detected R in Conda environment: ${rPath}`);
					rBinaries.push({ path: rPath, reasons: [ReasonDiscovered.CONDA] });
					break;
				}
			}
		}
	}

	return rBinaries;
}
