/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { globals, INodeProcess, IProcessEnvironment } from 'vs/base/common/platform';
import { ProcessMemoryInfo, CrashReporter, IpcRenderer, WebFrame } from 'vs/base/parts/sandbox/electron-sandbox/electronTypes';

export interface ISandboxNodeProcess extends INodeProcess {

	/**
	 * The process.platform property returns a string identifying the operating system platform
	 * on which the Node.js process is running.
	 */
	readonly platform: 'win32' | 'linux' | 'darwin';

	/**
	 * The type will always be Electron renderer.
	 */
	readonly type: 'renderer';

	/**
	 * A list of versions for the current node.js/electron configuration.
	 */
	readonly versions: { [key: string]: string | undefined };

	/**
	 * The process.env property returns an object containing the user environment.
	 */
	readonly env: IProcessEnvironment;

	/**
	 * The `execPath` will be the location of the executable of this application.
	 */
	readonly execPath: string;

	/**
	 * Allows to await resolving the full process environment by checking for the shell environment
	 * of the OS in certain cases (e.g. when the app is started from the Dock on macOS).
	 */
	whenEnvResolved(): Promise<void>;

	/**
	 * A listener on the process. Only a small subset of listener types are allowed.
	 */
	on: (type: string, callback: Function) => void;

	/**
	 * Resolves with a ProcessMemoryInfo
	 *
	 * Returns an object giving memory usage statistics about the current process. Note
	 * that all statistics are reported in Kilobytes. This api should be called after
	 * app ready.
	 *
	 * Chromium does not provide `residentSet` value for macOS. This is because macOS
	 * performs in-memory compression of pages that haven't been recently used. As a
	 * result the resident set size value is not what one would expect. `private`
	 * memory is more representative of the actual pre-compression memory usage of the
	 * process on macOS.
	 */
	getProcessMemoryInfo: () => Promise<ProcessMemoryInfo>;
}

export interface ISandboxContext {

	/**
	 * Wether the renderer runs with `sandbox` enabled or not.
	 */
	sandbox: boolean;
}

export const ipcRenderer: IpcRenderer = globals.vscode.ipcRenderer;
export const webFrame: WebFrame = globals.vscode.webFrame;
export const crashReporter: CrashReporter = globals.vscode.crashReporter;
export const process: ISandboxNodeProcess = globals.vscode.process;
export const context: ISandboxContext = globals.vscode.context;
