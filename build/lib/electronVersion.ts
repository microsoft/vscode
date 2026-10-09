/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

const root = path.dirname(path.dirname(import.meta.dirname));

export function getElectronVersion(rootDir: string = root): Record<string, string> {
	const npmrc = fs.readFileSync(path.join(rootDir, '.npmrc'), 'utf8');
	const electronVersion = /^target="(.*)"$/m.exec(npmrc)![1];
	const msBuildId = /^ms_build_id="(.*)"$/m.exec(npmrc)![1];
	return { electronVersion, msBuildId };
}

export function shouldDownloadElectron(repoRoot = root, environment: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): boolean {
	if (environment.VSCODE_SKIP_PRELAUNCH === '1') {
		return false;
	}
	if (environment.VSCODE_FORCE_PRELAUNCH) {
		return true;
	}

	const { electronVersion } = getElectronVersion(repoRoot);
	const product: { nameLong: string; nameShort: string; applicationName: string } = JSON.parse(fs.readFileSync(path.join(repoRoot, 'product.json'), 'utf8'));
	const electronDir = path.join(repoRoot, '.build', 'electron');
	const executable = platform === 'darwin'
		? path.join(electronDir, `${product.nameLong}.app`, 'Contents', 'MacOS', product.nameShort)
		: path.join(electronDir, platform === 'win32' ? `${product.nameShort}.exe` : product.applicationName);

	try {
		const installedVersion = fs.readFileSync(path.join(electronDir, 'version'), 'utf8').trim().replace(/^v/, '');
		if (installedVersion !== electronVersion || !fs.statSync(executable).isFile()) {
			return true;
		}
		fs.accessSync(executable, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
		return false;
	} catch {
		return true;
	}
}

/**
 * Check the cached Electron version without launching it or requiring installed dependencies.
 */
export function isExpectedElectronInstalled(rootDir: string = root): boolean {
	const { electronVersion } = getElectronVersion(rootDir);
	try {
		const installedVersion = fs.readFileSync(path.join(rootDir, '.build', 'electron', 'version'), 'utf8').trim().replace(/^v/, '');
		return installedVersion === electronVersion;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}
