/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows, isMacintosh, setImmediate, globals, INodeProcess } from 'vs/base/common/platform';

let safeProcess: INodeProcess & { nextTick: (callback: (...args: any[]) => void) => void; };

// Native node.js environment
declare const process: INodeProcess;
if (typeof process !== 'undefined') {
	safeProcess = {
		get platform() { return process.platform; },
		get env() { return process.env; },
		cwd() { return process.env['VSCODE_CWD'] || process.cwd(); },
		nextTick(callback: (...args: any[]) => void): void { return process.nextTick!(callback); }
	};
}

// Native sandbox environment
else if (typeof globals.vscode !== 'undefined') {
	const sandboxProcess: INodeProcess = globals.vscode.process;
	safeProcess = {
		get platform() { return sandboxProcess.platform; },
		get env() { return sandboxProcess.env; },
		cwd() { return sandboxProcess.cwd(); },
		nextTick(callback: (...args: any[]) => void): void { return setImmediate(callback); }
	};
}

// Web environment
else {
	safeProcess = {

		// Supported
		get platform() { return isWindows ? 'win32' : isMacintosh ? 'darwin' : 'linux'; },
		nextTick(callback: (...args: any[]) => void): void { return setImmediate(callback); },

		// Unsupported
		get env() { return Object.create(null); },
		cwd() { return '/'; }
	};
}

export const cwd = safeProcess.cwd;
export const env = safeProcess.env;
export const platform = safeProcess.platform;
export const nextTick = safeProcess.nextTick;
