/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Lazy } from './lazy';

function makeRandomHexString(length: number): string {
	const chars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
	let result = '';
	for (let i = 0; i < length; i++) {
		const idx = Math.floor(chars.length * Math.random());
		result += chars[idx];
	}
	return result;
}

const rootTempDir = new Lazy(() => {
	const filename = `vscode-typescript${process.platform !== 'win32' && process.getuid ? process.getuid() : ''}`;
	return path.join(os.tmpdir(), filename);
});

export const instanceTempDir = new Lazy(() => {
	const dir = path.join(rootTempDir.value, makeRandomHexString(20));
	fs.mkdirSync(dir, { recursive: true });
	return dir;
});

export function getTempFile(prefix: string): string {
	return path.join(instanceTempDir.value, `${prefix}-${makeRandomHexString(20)}.tmp`);
}
