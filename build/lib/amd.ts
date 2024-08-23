/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

// TODO@esm remove this

const outDirectory = path.join(__dirname, '..', '..', 'out-build');
const amdMarkerFile = path.join(outDirectory, 'amd');

export function setAMD(enabled: boolean) {
	const result = () => new Promise<void>((resolve, _) => {
		if (enabled) {
			fs.mkdirSync(outDirectory, { recursive: true });
			fs.writeFileSync(amdMarkerFile, 'true', 'utf8');
			console.warn(`Setting build to AMD: true`);
		} else {
			console.warn(`Setting build to AMD: false`);
		}

		resolve();
	});
	result.taskName = 'set-amd';
	return result;
}

export function isAMD(logWarning?: string): boolean {
	try {
		const res = (typeof process.env.VSCODE_BUILD_AMD === 'string' && process.env.VSCODE_BUILD_AMD.toLowerCase() === 'true') || (fs.readFileSync(amdMarkerFile, 'utf8') === 'true');
		if (res && logWarning) {
			console.warn(`[amd] ${logWarning}`);
		}
		return res;
	} catch (error) {
		return false;
	}
}
