/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows, isMacintosh, setImmediate, globals, INodeProcess } from 'vs/base/common/platform';

declare const process: INodeProcess;

let safeProcess: INodeProcess;

// Native node.js environment
if (typeof process !== 'undefined') {
	safeProcess = {
		get platform(): 'win32' | 'linux' | 'darwin' { return process.platform; },
		get env() { return process.env; },
		cwd(): string { return process.env['VSCODE_CWD'] || process.cwd(); },
		nextTick(callback: (...args: any[]) => void): void { return process.nextTick(callback); }
	};
}

// Native sandbox environment
else if (typeof globals.vscode !== 'undefined') {
	safeProcess = {
		get platform(): 'win32' | 'linux' | 'darwin' { return globals.vscode.process.platform; },
		get env() { return globals.vscode.process.env; },
		cwd(): string { return globals.vscode.process.env['VSCODE_CWD'] || globals.vscode.process.execPath.substr(0, globals.vscode.process.execPath.lastIndexOf(globals.vscode.process.platform === 'win32' ? '\\' : '/')); },
		nextTick(callback: (...args: any[]) => void): void { return setImmediate(callback); }
	};
}

// Web environment
else {
	safeProcess = {

		// Supported
		get platform(): 'win32' | 'linux' | 'darwin' { return isWindows ? 'win32' : isMacintosh ? 'darwin' : 'linux'; },
		nextTick(callback: (...args: any[]) => void): void { return setImmediate(callback); },

		// Unsupported
		get env() { return Object.create(null); },
		cwd(): string { return '/'; }
	};
}

export const cwd = safeProcess.cwd;
export const env = safeProcess.env;
export const platform = safeProcess.platform;
export const nextTick = safeProcess.nextTick;
