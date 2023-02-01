/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO@bpasero remove me once we are on Electron 22

import type { EventEmitter } from 'events';
import * as electron from 'electron';

export declare namespace UtilityProcessProposedApi {
	interface ForkOptions {
		/**
		 * Environment key-value pairs. Default is `process.env`.
		 */
		env?: NodeJS.ProcessEnv;
		/**
		 * List of string arguments passed to the executable.
		 */
		execArgv?: string[];
		/**
		 * Current working directory of the child process.
		 */
		cwd?: string;
		/**
		 * Allows configuring the mode for `stdout` and `stderr` of the child process.
		 * Default is `inherit`. String value can be one of `pipe`, `ignore`, `inherit`,
		 * for more details on these values you can refer to stdio documentation from
		 * Node.js. Currently this option only supports configuring `stdout` and `stderr`
		 * to either `pipe`, `inherit` or `ignore`. Configuring `stdin` is not supported;
		 * `stdin` will always be ignored. For example, the supported values will be
		 * processed as following:
		 */
		stdio?: (Array<'pipe' | 'ignore' | 'inherit'>) | (string);
		/**
		 * Name of the process that will appear in `name` property of `child-process-gone`
		 * event of `app`. Default is `node.mojom.NodeService`.
		 */
		serviceName?: string;
		/**
		 * With this flag, the utility process will be launched via the `Electron Helper
		 * (Plugin).app` helper executable on macOS, which can be codesigned with
		 * `com.apple.security.cs.disable-library-validation` and
		 * `com.apple.security.cs.allow-unsigned-executable-memory` entitlements. This will
		 * allow the utility process to load unsigned libraries. Unless you specifically
		 * need this capability, it is best to leave this disabled. Default is `false`.
		 *
		 * @platform darwin
		 */
		allowLoadingUnsignedLibraries?: boolean;
	}
	class UtilityProcess extends EventEmitter {

		// Docs: https://electronjs.org/docs/api/utility-process

		static fork(modulePath: string, args?: string[], options?: ForkOptions): UtilityProcess;
		/**
		 * Emitted after the child process ends.
		 */
		on(event: 'exit', listener: (
			/**
			 * Contains the exit code for the process obtained from waitpid on posix, or
			 * GetExitCodeProcess on windows.
			 */
			code: number) => void): this;
		once(event: 'exit', listener: (
			/**
			 * Contains the exit code for the process obtained from waitpid on posix, or
			 * GetExitCodeProcess on windows.
			 */
			code: number) => void): this;
		addListener(event: 'exit', listener: (
			/**
			 * Contains the exit code for the process obtained from waitpid on posix, or
			 * GetExitCodeProcess on windows.
			 */
			code: number) => void): this;
		removeListener(event: 'exit', listener: (
			/**
			 * Contains the exit code for the process obtained from waitpid on posix, or
			 * GetExitCodeProcess on windows.
			 */
			code: number) => void): this;
		/**
		 * Emitted when the child process sends a message using
		 * `process.parentPort.postMessage()`.
		 */
		on(event: 'message', listener: (message: any) => void): this;
		once(event: 'message', listener: (message: any) => void): this;
		addListener(event: 'message', listener: (message: any) => void): this;
		removeListener(event: 'message', listener: (message: any) => void): this;
		/**
		 * Emitted once the child process has spawned successfully.
		 */
		on(event: 'spawn', listener: Function): this;
		once(event: 'spawn', listener: Function): this;
		addListener(event: 'spawn', listener: Function): this;
		removeListener(event: 'spawn', listener: Function): this;
		/**
		 * Terminates the process gracefully. On POSIX, it uses SIGTERM but will ensure the
		 * process is reaped on exit. This function returns true if the kill is successful,
		 * and false otherwise.
		 */
		kill(): boolean;
		/**
		 * Send a message to the child process, optionally transferring ownership of zero
		 * or more [`MessagePortMain`][] objects.
		 *
		 * For example:
		 */
		postMessage(message: any, transfer?: Electron.MessagePortMain[]): void;
		/**
		 * A `Integer | undefined` representing the process identifier (PID) of the child
		 * process. If the child process fails to spawn due to errors, then the value is
		 * `undefined`. When the child process exits, then the value is `undefined` after
		 * the `exit` event is emitted.
		 */
		pid: (number) | (undefined);
		/**
		 * A `NodeJS.ReadableStream | null` that represents the child process's stderr. If
		 * the child was spawned with options.stdio[2] set to anything other than 'pipe',
		 * then this will be `null`. When the child process exits, then the value is `null`
		 * after the `exit` event is emitted.
		 */
		stderr: (NodeJS.ReadableStream) | (null);
		/**
		 * A `NodeJS.ReadableStream | null` that represents the child process's stdout. If
		 * the child was spawned with options.stdio[1] set to anything other than 'pipe',
		 * then this will be `null`. When the child process exits, then the value is `null`
		 * after the `exit` event is emitted.
		 */
		stdout: (NodeJS.ReadableStream) | (null);
	}
}

export const UtilityProcess = <typeof UtilityProcessProposedApi.UtilityProcess>((electron as any).utilityProcess);
export const canUseUtilityProcess = (typeof UtilityProcess !== 'undefined');
