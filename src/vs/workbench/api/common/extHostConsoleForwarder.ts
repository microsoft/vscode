/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadConsoleShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export abstract class AbstractExtHostConsoleForwarder {

	protected readonly _mainThreadConsole: MainThreadConsoleShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		this._mainThreadConsole = extHostRpc.getProxy(MainContext.MainThreadConsole);
	}
}

const MAX_LENGTH = 100000;

/**
 * Prevent circular stringify and convert arguments to real array
 */
export function safeStringifyArgumentsToArray(args: IArguments, includeStack: boolean): string {
	const seen: any[] = [];
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
			argsArray.push({ __$stack: stack.split('\n').slice(3).join('\n') });
		}
	}

	try {
		const res = JSON.stringify(argsArray, function (key, value) {

			// Objects get special treatment to prevent circles
			if (isObject(value) || Array.isArray(value)) {
				if (seen.indexOf(value) !== -1) {
					return '[Circular]';
				}

				seen.push(value);
			}

			return value;
		});

		if (res.length > MAX_LENGTH) {
			return 'Output omitted for a large object that exceeds the limits';
		}

		return res;
	} catch (error) {
		return `Output omitted for an object that cannot be inspected ('${error.toString()}')`;
	}
}

function isObject(obj: unknown) {
	return typeof obj === 'object'
		&& obj !== null
		&& !Array.isArray(obj)
		&& !(obj instanceof RegExp)
		&& !(obj instanceof Date);
}
