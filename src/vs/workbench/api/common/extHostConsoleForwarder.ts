/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStackArgument } from 'vs/base/common/console';
import { safeStringify } from 'vs/base/common/objects';
import { MainContext, MainThreadConsoleShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export abstract class AbstractExtHostConsoleForwarder {

	private readonly _mainThreadConsole: MainThreadConsoleShape;
	private readonly _includeStack: boolean;
	private readonly _logNative: boolean;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		this._mainThreadConsole = extHostRpc.getProxy(MainContext.MainThreadConsole);
		this._includeStack = initData.consoleForward.includeStack;
		this._logNative = initData.consoleForward.logNative;

		// Pass console logging to the outside so that we have it in the main side if told so
		this._wrapConsoleMethod('info', 'log');
		this._wrapConsoleMethod('log', 'log');
		this._wrapConsoleMethod('warn', 'warn');
		this._wrapConsoleMethod('debug', 'debug');
		this._wrapConsoleMethod('error', 'error');
	}

	/**
	 * Wraps a console message so that it is transmitted to the renderer. If
	 * native logging is turned on, the original console message will be written
	 * as well. This is needed since the console methods are "magic" in V8 and
	 * are the only methods that allow later introspection of logged variables.
	 *
	 * The wrapped property is not defined with `writable: false` to avoid
	 * throwing errors, but rather a no-op setting. See https://github.com/microsoft/vscode-extension-telemetry/issues/88
	 */
	private _wrapConsoleMethod(method: 'log' | 'info' | 'warn' | 'error' | 'debug', severity: 'log' | 'warn' | 'error' | 'debug') {
		const that = this;
		const original = console[method];

		Object.defineProperty(console, method, {
			set: () => { },
			get: () => function () {
				that._handleConsoleCall(method, severity, original, arguments);
			},
		});
	}

	private _handleConsoleCall(method: 'log' | 'info' | 'warn' | 'error' | 'debug', severity: 'log' | 'warn' | 'error' | 'debug', original: (...args: any[]) => void, args: IArguments): void {
		this._mainThreadConsole.$logExtensionHostMessage({
			type: '__$console',
			severity,
			arguments: safeStringifyArgumentsToArray(args, this._includeStack)
		});
		if (this._logNative) {
			this._nativeConsoleLogMessage(method, original, args);
		}
	}

	protected abstract _nativeConsoleLogMessage(method: 'log' | 'info' | 'warn' | 'error' | 'debug', original: (...args: any[]) => void, args: IArguments): void;

}

const MAX_LENGTH = 100000;

/**
 * Prevent circular stringify and convert arguments to real array
 */
function safeStringifyArgumentsToArray(args: IArguments, includeStack: boolean): string {
	const argsArray = [];

	// Massage some arguments with special treatment
	if (args.length) {
		for (let i = 0; i < args.length; i++) {
			let arg = args[i];

			// Any argument of type 'undefined' needs to be specially treated because
			// JSON.stringify will simply ignore those. We replace them with the string
			// 'undefined' which is not 100% right, but good enough to be logged to console
			if (typeof arg === 'undefined') {
				arg = 'undefined';
			}

			// Any argument that is an Error will be changed to be just the error stack/message
			// itself because currently cannot serialize the error over entirely.
			else if (arg instanceof Error) {
				const errorObj = arg;
				if (errorObj.stack) {
					arg = errorObj.stack;
				} else {
					arg = errorObj.toString();
				}
			}

			argsArray.push(arg);
		}
	}

	// Add the stack trace as payload if we are told so. We remove the message and the 2 top frames
	// to start the stacktrace where the console message was being written
	if (includeStack) {
		const stack = new Error().stack;
		if (stack) {
			argsArray.push({ __$stack: stack.split('\n').slice(3).join('\n') } satisfies IStackArgument);
		}
	}

	try {
		const res = safeStringify(argsArray);

		if (res.length > MAX_LENGTH) {
			return 'Output omitted for a large object that exceeds the limits';
		}

		return res;
	} catch (error) {
		return `Output omitted for an object that cannot be inspected ('${error.toString()}')`;
	}
}
