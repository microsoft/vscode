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
