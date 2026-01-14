/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as os from 'os';

const homeDir = os.homedir();

export async function exists(path: string) {
	try {
		await fs.promises.access(path);
		return true;
	} catch {
		return false;
	}
}

export function untildify(path: string) {
	return path.replace(/^~(?=$|\/|\\)/, homeDir);
}

export function normalizeToSlash(path: string) {
	return path.replace(/\\/g, '/');
}
