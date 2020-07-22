/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as temp from './temp';
import path = require('path');
import fs = require('fs');
import process = require('process');


const getRootTempDir = (() => {
	let dir: string | undefined;
	return () => {
		if (!dir) {
			dir = temp.getTempFile(`vscode-typescript${process.platform !== 'win32' && process.getuid ? process.getuid() : ''}`);
		}
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
		return dir;
	};
})();

export const getInstanceDir = (() => {
	let dir: string | undefined;
	return () => {
		if (!dir) {
			dir = path.join(getRootTempDir(), temp.makeRandomHexString(20));
		}
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
		return dir;
	};
})();

export function getTempFile(prefix: string): string {
	return path.join(getInstanceDir(), `${prefix}-${temp.makeRandomHexString(20)}.tmp`);
}
