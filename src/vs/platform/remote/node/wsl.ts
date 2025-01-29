/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import * as path from 'path';

let hasWSLFeaturePromise: Promise<boolean> | undefined;

export async function hasWSLFeatureInstalled(refresh = false): Promise<boolean> {
	if (hasWSLFeaturePromise === undefined || refresh) {
		hasWSLFeaturePromise = testWSLFeatureInstalled();
	}
	return hasWSLFeaturePromise;
}

async function testWSLFeatureInstalled(): Promise<boolean> {
	const windowsBuildNumber = getWindowsBuildNumber();
	if (windowsBuildNumber === undefined) {
		return false;
	}
	if (windowsBuildNumber >= 22000) {
		const wslExePath = getWSLExecutablePath();
		if (wslExePath) {
			return new Promise<boolean>(s => {
				try {
					cp.execFile(wslExePath, ['--status'], err => s(!err));
				} catch (e) {
					s(false);
				}
			});
		}
	} else {
		const dllPath = getLxssManagerDllPath();
		if (dllPath) {
			try {
				if ((await fs.promises.stat(dllPath)).isFile()) {
					return true;
				}
			} catch (e) {
			}
		}
	}
	return false;
}

function getWindowsBuildNumber(): number | undefined {
	const osVersion = (/(\d+)\.(\d+)\.(\d+)/g).exec(os.release());
	if (osVersion) {
		return parseInt(osVersion[3]);
	}
	return undefined;
}

function getSystem32Path(subPath: string): string | undefined {
	const systemRoot = process.env['SystemRoot'];
	if (systemRoot) {
		const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
		return path.join(systemRoot, is32ProcessOn64Windows ? 'Sysnative' : 'System32', subPath);
	}
	return undefined;
}

function getWSLExecutablePath(): string | undefined {
	return getSystem32Path('wsl.exe');
}

/**
 * In builds < 22000 this dll inidcates that WSL is installed
 */
function getLxssManagerDllPath(): string | undefined {
	return getSystem32Path('lxss\\LxssManager.dll');
}
