/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows, isMacintosh, setImmediate, IProcessEnvironment, globals } from 'vs/base/common/platform';

export interface IProcess {
	platform: 'win32' | 'linux' | 'darwin';
	env: IProcessEnvironment;

	cwd(): string;
	nextTick(callback: (...args: any[]) => void): void;
}

declare const process: IProcess;

let safeProcess: IProcess;

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
		cwd(): string { return '/'; },
		env: Object.create(null),
		get platform(): 'win32' | 'linux' | 'darwin' { return isWindows ? 'win32' : isMacintosh ? 'darwin' : 'linux'; },
		nextTick(callback: (...args: any[]) => void): void { return setImmediate(callback); }
	};
}

export const cwd = safeProcess.cwd;
export const env = safeProcess.env;
export const platform = safeProcess.platform;
export const nextTick = safeProcess.nextTick;
