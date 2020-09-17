/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows, isMacintosh, setImmediate, globals, INodeProcess } from 'vs/base/common/platform';

declare const process: INodeProcess;

let safeProcess: INodeProcess;

// Native node.js environment
if (typeof process !== 'undefined') {
	safeProcess = process;
}

// Native sandbox environment
else if (typeof globals.vscode !== 'undefined') {
	safeProcess = globals.vscode.process;
}

// Web environment
else {
	safeProcess = {

		// Supported
		get platform(): 'win32' | 'linux' | 'darwin' { return isWindows ? 'win32' : isMacintosh ? 'darwin' : 'linux'; },
		nextTick(callback: (...args: any[]) => void): void { return setImmediate(callback); },

		// Unsupported
		get env() { return Object.create(null); },
		cwd(): string { return '/'; },
		getuid(): number { return -1; }
	};
}

export const cwd = safeProcess.cwd;
export const env = safeProcess.env;
export const platform = safeProcess.platform;
export const nextTick = safeProcess.nextTick;
