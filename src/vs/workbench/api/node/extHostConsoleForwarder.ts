/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractExtHostConsoleForwarder, safeStringifyArgumentsToArray } from 'vs/workbench/api/common/extHostConsoleForwarder';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export class ExtHostConsoleForwarder extends AbstractExtHostConsoleForwarder {
	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		super(extHostRpc, initData);

		pipeLoggingToParent(initData.consoleForward.includeStack, initData.consoleForward.logNative);

		// Use IPC messages to forward console-calls, note that the console is
		// already patched to use`process.send()`
		const nativeProcessSend = process.send!;
		// const mainThreadConsole = this._extHostContext.getProxy(MainContext.MainThreadConsole);
		process.send = (...args) => {
			if ((args as unknown[]).length === 0 || !args[0] || args[0].type !== '__$console') {
				return nativeProcessSend.apply(process, args);
			}
			this._mainThreadConsole.$logExtensionHostMessage(args[0]);
			return false;
		};
	}
}

// TODO@Alex: remove duplication
function pipeLoggingToParent(includeStack: boolean, logNative: boolean) {
	const MAX_STREAM_BUFFER_LENGTH = 1024 * 1024;

	function safeSend(arg: { type: string; severity: string; arguments: string }) {
		try {
			if (process.send) {
				process.send(arg);
			}
		} catch (error) {
			// Can happen if the parent channel is closed meanwhile
		}
	}

	function safeSendConsoleMessage(severity: 'log' | 'warn' | 'error', args: string) {
		safeSend({ type: '__$console', severity, arguments: args });
	}

	let isMakingConsoleCall = false;

	/**
	 * Wraps a console message so that it is transmitted to the renderer. If
	 * native logging is turned on, the original console message will be written
	 * as well. This is needed since the console methods are "magic" in V8 and
	 * are the only methods that allow later introspection of logged variables.
	 *
	 * The wrapped property is not defined with `writable: false` to avoid
	 * throwing errors, but rather a no-op setting. See https://github.com/microsoft/vscode-extension-telemetry/issues/88
	 */
	function wrapConsoleMethod(method: 'log' | 'info' | 'warn' | 'error', severity: 'log' | 'warn' | 'error') {
		if (logNative) {
			const original = console[method];
			const stream = method === 'error' || method === 'warn' ? process.stderr : process.stdout;
			Object.defineProperty(console, method, {
				set: () => { },
				get: () => function () {
					safeSendConsoleMessage(severity, safeStringifyArgumentsToArray(arguments, includeStack));
					isMakingConsoleCall = true;
					stream.write('\nSTART_NATIVE_LOG\n');
					original.apply(console, arguments as any);
					stream.write('\nEND_NATIVE_LOG\n');
					isMakingConsoleCall = false;
				},
			});
		} else {
			Object.defineProperty(console, method, {
				set: () => { },
				get: () => function () { safeSendConsoleMessage(severity, safeStringifyArgumentsToArray(arguments, includeStack)); },
			});
		}
	}

	/**
	 * Wraps process.stderr/stdout.write() so that it is transmitted to the
	 * renderer or CLI. It both calls through to the original method as well
	 * as to console.log with complete lines so that they're made available
	 * to the debugger/CLI.
	 */
	function wrapStream(streamName: 'stdout' | 'stderr', severity: 'log' | 'warn' | 'error') {
		const stream = process[streamName];
		const original = stream.write;

		/** @type string */
		let buf = '';

		Object.defineProperty(stream, 'write', {
			set: () => { },
			get: () => (chunk: Uint8Array | string, encoding?: BufferEncoding, callback?: (err?: Error) => void) => {
				if (!isMakingConsoleCall) {
					buf += (chunk as any).toString(encoding);
					const eol = buf.length > MAX_STREAM_BUFFER_LENGTH ? buf.length : buf.lastIndexOf('\n');
					if (eol !== -1) {
						console[severity](buf.slice(0, eol));
						buf = buf.slice(eol + 1);
					}
				}

				original.call(stream, chunk, encoding, callback);
			},
		});
	}

	// Pass console logging to the outside so that we have it in the main side if told so
	wrapConsoleMethod('info', 'log');
	wrapConsoleMethod('log', 'log');
	wrapConsoleMethod('warn', 'warn');
	wrapConsoleMethod('error', 'error');

	wrapStream('stderr', 'error');
	wrapStream('stdout', 'log');
}
