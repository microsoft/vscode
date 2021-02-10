/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { globals, IProcessEnvironment } from 'vs/base/common/platform';
import { ProcessMemoryInfo, CrashReporter, IpcRenderer, WebFrame } from 'vs/base/parts/sandbox/electron-sandbox/electronTypes';

/**
 * In sandboxed renderers we cannot expose all of the `process` global of node.js
 */
export interface IPartialNodeProcess {

	/**
	 * The process.platform property returns a string identifying the operating system platform
	 * on which the Node.js process is running.
	 */
	readonly platform: 'win32' | 'linux' | 'darwin';

	/**
	 * The process.arch property returns a string identifying the CPU architecture
	 * on which the Node.js process is running.
	 */
	readonly arch: string;

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

export interface ISandboxNodeProcess extends IPartialNodeProcess {

	/**
	 * A custom method we add to `process`: Resolve the true process environment to use and
	 * apply it to `process.env`.
	 *
	 * There are different layers of environment that will apply:
	 * - `process.env`: this is the actual environment of the process before this method
	 * - `shellEnv`   : if the program was not started from a terminal, we resolve all shell
	 *                  variables to get the same experience as if the program was started from
	 *                  a terminal (Linux, macOS)
	 * - `userEnv`    : this is instance specific environment, e.g. if the user started the program
	 *                  from a terminal and changed certain variables
	 *
	 * The order of overwrites is `process.env` < `shellEnv` < `userEnv`.
	 *
	 * It is critical that every process awaits this method early on startup to get the right
	 * set of environment in `process.env`.
	 */
	resolveEnv(userEnv: IProcessEnvironment): Promise<void>;
}

export interface ISandboxContext {

	/**
	 * Whether the renderer runs with `sandbox` enabled or not.
	 */
	sandbox: boolean;
}

export interface IpcMessagePort {

	/**
	 * Establish a connection via `MessagePort` to a target. The main process
	 * will need to transfer the port over to the `channelResponse` after listening
	 * to `channelRequest` with a payload of `requestNonce` so that the
	 * source can correlate the response.
	 *
	 * The source should install a `window.on('message')` listener, ensuring `e.data`
	 * matches `requestNonce`, `e.source` matches `window` and then receiving the
	 * `MessagePort` via `e.ports[0]`.
	 */
	connect(channelRequest: string, channelResponse: string, requestNonce: string): void;
}

export const ipcRenderer: IpcRenderer = globals.vscode.ipcRenderer;
export const ipcMessagePort: IpcMessagePort = globals.vscode.ipcMessagePort;
export const webFrame: WebFrame = globals.vscode.webFrame;
export const crashReporter: CrashReporter = globals.vscode.crashReporter;
export const process: ISandboxNodeProcess = globals.vscode.process;
export const context: ISandboxContext = globals.vscode.context;
