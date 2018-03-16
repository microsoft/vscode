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

interface ErrorEvent {
	stack: string;
	message?: string;
	filename?: string;
	line?: number;
	column?: number;
	error?: { name: string; message: string; };

	count?: number;
}

namespace ErrorEvent {
	export function compare(a: ErrorEvent, b: ErrorEvent) {
		if (a.stack < b.stack) {
			return -1;
		} else if (a.stack > b.stack) {
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
		let stack = Array.isArray(err.stack) ? err.stack.join('\n') : err.stack;
		let message = err.message ? err.message : safeStringify(err);

		// errors without a stack are not useful telemetry
		if (!stack) {
			return;
		}

		this._enqueue({ message, stack });
	}

	private _onUncaughtError(message: string, filename: string, line: number, column?: number, err?: any): void {

		let data: ErrorEvent = {
			stack: message,
			message,
			filename,
			line,
			column
		};

		if (err) {
			let { name, message, stack } = err;
			data.error = { name, message };
			if (stack) {
				data.stack = Array.isArray(err.stack)
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
					"filename" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
					"message" : { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
					"name": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
					"stack": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
					"id": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
					"line": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "isMeasurement": true },
					"column": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "isMeasurement": true },
					"count": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "isMeasurement": true }
				}
			*/
			// __GDPR__TODO__ what's the complete set of properties?
			this._telemetryService.publicLog('UnhandledError', error);
		}
		this._buffer.length = 0;
	}
}
