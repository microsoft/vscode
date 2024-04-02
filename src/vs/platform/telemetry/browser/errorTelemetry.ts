/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from 'vs/base/browser/window';
import { ErrorNoTelemetry } from 'vs/base/common/errors';
import { toDisposable } from 'vs/base/common/lifecycle';
import BaseErrorTelemetry, { ErrorEvent } from 'vs/platform/telemetry/common/errorTelemetry';

export default class ErrorTelemetry extends BaseErrorTelemetry {
	protected override installErrorListeners(): void {
		let oldOnError: OnErrorEventHandler;
		const that = this;
		if (typeof mainWindow.onerror === 'function') {
			oldOnError = mainWindow.onerror;
		}
		mainWindow.onerror = function (message: Event | string, filename?: string, line?: number, column?: number, error?: Error) {
			that._onUncaughtError(message as string, filename as string, line as number, column, error);
			oldOnError?.apply(this, [message, filename, line, column, error]);
		};
		this._disposables.add(toDisposable(() => {
			if (oldOnError) {
				mainWindow.onerror = oldOnError;
			}
		}));
	}

	private _onUncaughtError(msg: string, file: string, line: number, column?: number, err?: any): void {
		const data: ErrorEvent = {
			callstack: msg,
			msg,
			file,
			line,
			column
		};

		if (err) {
			// If it's the no telemetry error it doesn't get logged
			if (ErrorNoTelemetry.isErrorNoTelemetry(err)) {
				return;
			}

			const { name, message, stack } = err;
			data.uncaught_error_name = name;
			if (message) {
				data.uncaught_error_msg = message;
			}
			if (stack) {
				data.callstack = Array.isArray(err.stack)
					? err.stack = err.stack.join('\n')
					: err.stack;
			}
		}

		this._enqueue(data);
	}
}
