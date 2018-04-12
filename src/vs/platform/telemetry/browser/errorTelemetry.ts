/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { binarySearch } from 'vs/base/common/arrays';
import { globals } from 'vs/base/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IDisposable, toDisposable, dispose } from 'vs/base/common/lifecycle';
import * as Errors from 'vs/base/common/errors';
import { safeStringify } from 'vs/base/common/objects';

/* __GDPR__FRAGMENT__
	"ErrorEvent" : {
		"stack": { "classification": "CustomerContent", "purpose": "PerformanceAndHealth" },
		"message" : { "classification": "CustomerContent", "purpose": "PerformanceAndHealth" },
		"filename" : { "classification": "CustomerContent", "purpose": "PerformanceAndHealth" },
		"callstack": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
		"msg" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
		"file" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
		"line": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"column": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "isMeasurement": true },
		"uncaught_error_name": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
		"uncaught_error_msg": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
		"count": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "isMeasurement": true }
	}
 */
interface ErrorEvent {
	callstack: string;
	msg?: string;
	file?: string;
	line?: number;
	column?: number;
	uncaught_error_name?: string;
	uncaught_error_msg?: string;
	count?: number;
}

namespace ErrorEvent {
	export function compare(a: ErrorEvent, b: ErrorEvent) {
		if (a.callstack < b.callstack) {
			return -1;
		} else if (a.callstack > b.callstack) {
			return 1;
		}
		return 0;
	}
}

export default class ErrorTelemetry {

	public static ERROR_FLUSH_TIMEOUT: number = 5 * 1000;

	private _telemetryService: ITelemetryService;
	private _flushDelay: number;
	private _flushHandle = -1;
	private _buffer: ErrorEvent[] = [];
	private _disposables: IDisposable[] = [];

	constructor(telemetryService: ITelemetryService, flushDelay = ErrorTelemetry.ERROR_FLUSH_TIMEOUT) {
		this._telemetryService = telemetryService;
		this._flushDelay = flushDelay;

		// (1) check for unexpected but handled errors
		const unbind = Errors.errorHandler.addListener((err) => this._onErrorEvent(err));
		this._disposables.push(toDisposable(unbind));

		// (2) check for uncaught global errors
		let oldOnError: Function;
		let that = this;
		if (typeof globals.onerror === 'function') {
			oldOnError = globals.onerror;
		}
		globals.onerror = function (message: string, filename: string, line: number, column?: number, e?: any) {
			that._onUncaughtError(message, filename, line, column, e);
			if (oldOnError) {
				oldOnError.apply(this, arguments);
			}
		};
		this._disposables.push(toDisposable(function () {
			if (oldOnError) {
				globals.onerror = oldOnError;
			}
		}));
	}

	dispose() {
		clearTimeout(this._flushHandle);
		this._flushBuffer();
		this._disposables = dispose(this._disposables);
	}

	private _onErrorEvent(err: any): void {

		if (!err) {
			return;
		}

		// unwrap nested errors from loader
		if (err.detail && err.detail.stack) {
			err = err.detail;
		}

		// work around behavior in workerServer.ts that breaks up Error.stack
		let callstack = Array.isArray(err.stack) ? err.stack.join('\n') : err.stack;
		let msg = err.message ? err.message : safeStringify(err);

		// errors without a stack are not useful telemetry
		if (!callstack) {
			return;
		}

		this._enqueue({ msg, callstack });
	}

	private _onUncaughtError(msg: string, file: string, line: number, column?: number, err?: any): void {

		let data: ErrorEvent = {
			callstack: msg,
			msg,
			file,
			line,
			column
		};

		if (err) {
			let { name, message, stack } = err;
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

	private _enqueue(e: ErrorEvent): void {

		const idx = binarySearch(this._buffer, e, ErrorEvent.compare);
		if (idx < 0) {
			e.count = 1;
			this._buffer.splice(~idx, 0, e);
		} else {
			this._buffer[idx].count += 1;
		}

		if (this._flushHandle === -1) {
			this._flushHandle = setTimeout(() => {
				this._flushBuffer();
				this._flushHandle = -1;
			}, this._flushDelay);
		}
	}

	private _flushBuffer(): void {
		for (let error of this._buffer) {
			/* __GDPR__
			"UnhandledError" : {
					"${include}": [ "${ErrorEvent}" ]
				}
			*/
			this._telemetryService.publicLog('UnhandledError', error);
		}
		this._buffer.length = 0;
	}
}
