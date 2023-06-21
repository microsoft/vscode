/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { binarySearch } from 'vs/base/common/arrays';
import { errorHandler, ErrorNoTelemetry } from 'vs/base/common/errors';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { safeStringify } from 'vs/base/common/objects';
import { FileOperationError } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

type ErrorEventFragment = {
	owner: 'lramos15, sbatten';
	comment: 'Whenever an error in VS Code is thrown.';
	callstack: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The callstack of the error.' };
	msg?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The message of the error. Normally the first line int the callstack.' };
	file?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The file the error originated from.' };
	line?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The line the error originate on.' };
	column?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The column of the line which the error orginated on.' };
	uncaught_error_name?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'If the error is uncaught what is the error type' };
	uncaught_error_msg?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'If the error is uncaught this is just msg but for uncaught errors.' };
	count?: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How many times this error has been thrown' };
};
export interface ErrorEvent {
	callstack: string;
	msg?: string;
	file?: string;
	line?: number;
	column?: number;
	uncaught_error_name?: string;
	uncaught_error_msg?: string;
	count?: number;
}

export namespace ErrorEvent {
	export function compare(a: ErrorEvent, b: ErrorEvent) {
		if (a.callstack < b.callstack) {
			return -1;
		} else if (a.callstack > b.callstack) {
			return 1;
		}
		return 0;
	}
}

export default abstract class BaseErrorTelemetry {

	public static ERROR_FLUSH_TIMEOUT: number = 5 * 1000;

	private _telemetryService: ITelemetryService;
	private _flushDelay: number;
	private _flushHandle: any = -1;
	private _buffer: ErrorEvent[] = [];
	protected readonly _disposables = new DisposableStore();

	constructor(telemetryService: ITelemetryService, flushDelay = BaseErrorTelemetry.ERROR_FLUSH_TIMEOUT) {
		this._telemetryService = telemetryService;
		this._flushDelay = flushDelay;

		// (1) check for unexpected but handled errors
		const unbind = errorHandler.addListener((err) => this._onErrorEvent(err));
		this._disposables.add(toDisposable(unbind));

		// (2) install implementation-specific error listeners
		this.installErrorListeners();
	}

	dispose() {
		clearTimeout(this._flushHandle);
		this._flushBuffer();
		this._disposables.dispose();
	}

	protected installErrorListeners(): void {
		// to override
	}

	private _onErrorEvent(err: any): void {

		if (!err) {
			return;
		}

		// unwrap nested errors from loader
		if (err.detail && err.detail.stack) {
			err = err.detail;
		}

		// If it's the no telemetry error it doesn't get logged
		// TOOD @lramos15 hacking in FileOperation error because it's too messy to adopt ErrorNoTelemetry. A better solution should be found
		if (ErrorNoTelemetry.isErrorNoTelemetry(err) || err instanceof FileOperationError || (typeof err?.message === 'string' && err.message.includes('Unable to read file'))) {
			return;
		}

		// work around behavior in workerServer.ts that breaks up Error.stack
		const callstack = Array.isArray(err.stack) ? err.stack.join('\n') : err.stack;
		const msg = err.message ? err.message : safeStringify(err);

		// errors without a stack are not useful telemetry
		if (!callstack) {
			return;
		}

		this._enqueue({ msg, callstack });
	}

	protected _enqueue(e: ErrorEvent): void {

		const idx = binarySearch(this._buffer, e, ErrorEvent.compare);
		if (idx < 0) {
			e.count = 1;
			this._buffer.splice(~idx, 0, e);
		} else {
			if (!this._buffer[idx].count) {
				this._buffer[idx].count = 0;
			}
			this._buffer[idx].count! += 1;
		}

		if (this._flushHandle === -1) {
			this._flushHandle = setTimeout(() => {
				this._flushBuffer();
				this._flushHandle = -1;
			}, this._flushDelay);
		}
	}

	private _flushBuffer(): void {
		for (const error of this._buffer) {
			type UnhandledErrorClassification = {} & ErrorEventFragment;
			this._telemetryService.publicLogError2<ErrorEvent, UnhandledErrorClassification>('UnhandledError', error);
		}
		this._buffer.length = 0;
	}
}
