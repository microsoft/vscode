/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import objects = require('vs/base/common/objects');
import platform = require('vs/base/common/platform');
import types = require('vs/base/common/types');
import arrays = require('vs/base/common/arrays');
import strings = require('vs/base/common/strings');
import {IAction} from 'vs/base/common/actions';
import {IXHRResponse} from 'vs/base/common/http';
import Severity from 'vs/base/common/severity';
import { TPromise } from 'vs/base/common/winjs.base';

export interface ErrorListenerCallback {
	(error: any): void;
}

export interface ErrorListenerUnbind {
	(): void;
}

// Avoid circular dependency on EventEmitter by implementing a subset of the interface.
export class ErrorHandler {
	private unexpectedErrorHandler: (e: any) => void;
	private listeners: ErrorListenerCallback[];

	constructor() {

		this.listeners = [];

		this.unexpectedErrorHandler = function(e: any) {
			platform.setTimeout(() => {
				if (e.stack) {
					throw new Error(e.message + '\n\n' + e.stack);
				}

				throw e;
			}, 0);
		};
	}

	public addListener(listener: ErrorListenerCallback): ErrorListenerUnbind {
		this.listeners.push(listener);

		return () => {
			this._removeListener(listener);
		};
	}

	private emit(e: any): void {
		this.listeners.forEach((listener) => {
			listener(e);
		});
	}

	private _removeListener(listener: ErrorListenerCallback): void {
		this.listeners.splice(this.listeners.indexOf(listener), 1);
	}

	public setUnexpectedErrorHandler(newUnexpectedErrorHandler: (e: any) => void): void {
		this.unexpectedErrorHandler = newUnexpectedErrorHandler;
	}

	public getUnexpectedErrorHandler(): (e: any) => void {
		return this.unexpectedErrorHandler;
	}

	public onUnexpectedError(e: any): void {
		this.unexpectedErrorHandler(e);
		this.emit(e);
	}
}

export let errorHandler = new ErrorHandler();

export function setUnexpectedErrorHandler(newUnexpectedErrorHandler: (e: any) => void): void {
	errorHandler.setUnexpectedErrorHandler(newUnexpectedErrorHandler);
}

export function onUnexpectedError(e: any): void {

	// ignore errors from cancelled promises
	if (!isPromiseCanceledError(e)) {
		errorHandler.onUnexpectedError(e);
	}
}

export function onUnexpectedPromiseError<T>(promise: TPromise<T>): TPromise<T> {
	return promise.then<T>(null, onUnexpectedError);
}

export interface IConnectionErrorData {
	status: number;
	statusText?: string;
	responseText?: string;
}

export function transformErrorForSerialization(error: any): any {
	if (error instanceof Error) {
		let {name, message} = error;
		let stack: string = (<any>error).stacktrace || (<any>error).stack;
		return {
			$isError: true,
			name,
			message,
			stack
		};
	}

	// return as is
	return error;
}

/**
 * The base class for all connection errors originating from XHR requests.
 */
export class ConnectionError implements Error {
	public status: number;
	public statusText: string;
	public responseText: string;
	public errorMessage: string;
	public errorCode: string;
	public errorObject: any;
	public name: string;

	constructor(mixin: IConnectionErrorData);
	constructor(request: IXHRResponse);
	constructor(arg: any) {
		this.status = arg.status;
		this.statusText = arg.statusText;
		this.name = 'ConnectionError';

		try {
			this.responseText = arg.responseText;
		} catch (e) {
			this.responseText = '';
		}

		this.errorMessage = null;
		this.errorCode = null;
		this.errorObject = null;

		if (this.responseText) {
			try {
				let errorObj = JSON.parse(this.responseText);
				this.errorMessage = errorObj.message;
				this.errorCode = errorObj.code;
				this.errorObject = errorObj;
			} catch (error) {
				// Ignore
			}
		}
	}

	public get message(): string {
		return this.connectionErrorToMessage(this, false);
	}

	public get verboseMessage(): string {
		return this.connectionErrorToMessage(this, true);
	}

	private connectionErrorDetailsToMessage(error: ConnectionError, verbose: boolean): string {
		let errorCode = error.errorCode;
		let errorMessage = error.errorMessage;

		if (errorCode !== null && errorMessage !== null) {
			return nls.localize(
				{
					key: 'message',
					comment: [
						'{0} represents the error message',
						'{1} represents the error code'
					]
				},
				"{0}. Error code: {1}",
				strings.rtrim(errorMessage, '.'), errorCode);
		}

		if (errorMessage !== null) {
			return errorMessage;
		}

		if (verbose && error.responseText !== null) {
			return error.responseText;
		}

		return null;
	}

	private connectionErrorToMessage(error: ConnectionError, verbose: boolean): string {
		let details = this.connectionErrorDetailsToMessage(error, verbose);

		// Status Code based Error
		if (error.status === 401) {
			if (details !== null) {
				return nls.localize(
					{
						key: 'error.permission.verbose',
						comment: [
							'{0} represents detailed information why the permission got denied'
						]
					},
					"Permission Denied (HTTP {0})",
					details);
			}

			return nls.localize('error.permission', "Permission Denied");
		}

		// Return error details if present
		if (details) {
			return details;
		}

		// Fallback to HTTP Status and Code
		if (error.status > 0 && error.statusText !== null) {
			if (verbose && error.responseText !== null && error.responseText.length > 0) {
				return nls.localize('error.http.verbose', "{0} (HTTP {1}: {2})", error.statusText, error.status, error.responseText);
			}

			return nls.localize('error.http', "{0} (HTTP {1})", error.statusText, error.status);
		}

		// Finally its an Unknown Connection Error
		if (verbose && error.responseText !== null && error.responseText.length > 0) {
			return nls.localize('error.connection.unknown.verbose', "Unknown Connection Error ({0})", error.responseText);
		}

		return nls.localize('error.connection.unknown', "An unknown connection error occurred. Either you are no longer connected to the internet or the server you are connected to is offline.");
	}
}

// Bug: Can not subclass a JS Type. Do it manually (as done in WinJS.Class.derive)
objects.derive(Error, ConnectionError);

function xhrToErrorMessage(xhr: IConnectionErrorData, verbose: boolean): string {
	let ce = new ConnectionError(xhr);
	if (verbose) {
		return ce.verboseMessage;
	} else {
		return ce.message;
	}
}

function exceptionToErrorMessage(exception: any, verbose: boolean): string {
	if (exception.message) {
		if (verbose && (exception.stack || exception.stacktrace)) {
			return nls.localize('stackTrace.format', "{0}: {1}", detectSystemErrorMessage(exception), exception.stack || exception.stacktrace);
		}

		return detectSystemErrorMessage(exception);
	}

	return nls.localize('error.defaultMessage', "An unknown error occurred. Please consult the log for more details.");
}

function detectSystemErrorMessage(exception: any): string {

	// See https://nodejs.org/api/errors.html#errors_class_system_error
	if (typeof exception.code === 'string' && typeof exception.errno === 'number' && typeof exception.syscall === 'string') {
		return nls.localize('nodeExceptionMessage', "A system error occured ({0})", exception.message);
	}

	return exception.message;
}

/**
 * Tries to generate a human readable error message out of the error. If the verbose parameter
 * is set to true, the error message will include stacktrace details if provided.
 * @returns A string containing the error message.
 */
export function toErrorMessage(error: any = null, verbose: boolean = false): string {
	if (!error) {
		return nls.localize('error.defaultMessage', "An unknown error occurred. Please consult the log for more details.");
	}

	if (Array.isArray(error)) {
		let errors: any[] = arrays.coalesce(error);
		let msg = toErrorMessage(errors[0], verbose);

		if (errors.length > 1) {
			return nls.localize('error.moreErrors', "{0} ({1} errors in total)", msg, errors.length);
		}

		return msg;
	}

	if (types.isString(error)) {
		return error;
	}

	if (!types.isUndefinedOrNull(error.status)) {
		return xhrToErrorMessage(error, verbose);
	}

	if (error.detail) {
		let detail = error.detail;

		if (detail.error) {
			if (detail.error && !types.isUndefinedOrNull(detail.error.status)) {
				return xhrToErrorMessage(detail.error, verbose);
			}

			if (types.isArray(detail.error)) {
				for (let i = 0; i < detail.error.length; i++) {
					if (detail.error[i] && !types.isUndefinedOrNull(detail.error[i].status)) {
						return xhrToErrorMessage(detail.error[i], verbose);
					}
				}
			}

			else {
				return exceptionToErrorMessage(detail.error, verbose);
			}
		}

		if (detail.exception) {
			if (!types.isUndefinedOrNull(detail.exception.status)) {
				return xhrToErrorMessage(detail.exception, verbose);
			}

			return exceptionToErrorMessage(detail.exception, verbose);
		}
	}

	if (error.stack) {
		return exceptionToErrorMessage(error, verbose);
	}

	if (error.message) {
		return error.message;
	}

	return nls.localize('error.defaultMessage', "An unknown error occurred. Please consult the log for more details.");
}

const canceledName = 'Canceled';

/**
 * Checks if the given error is a promise in canceled state
 */
export function isPromiseCanceledError(error: any): boolean {
	return error instanceof Error && error.name === canceledName && error.message === canceledName;
}

/**
 * Returns an error that signals cancellation.
 */
export function canceled(): Error {
	let error = new Error(canceledName);
	error.name = error.message;
	return error;
}

/**
 * Returns an error that signals something is not implemented.
 */
export function notImplemented(): Error {
	return new Error(nls.localize('notImplementedError', "Not Implemented"));
}

export function illegalArgument(name?: string): Error {
	if (name) {
		return new Error(nls.localize('illegalArgumentError', "Illegal argument: {0}", name));
	} else {
		return new Error(nls.localize('illegalArgumentError2', "Illegal argument"));
	}
}

export function illegalState(name?: string): Error {
	if (name) {
		return new Error(nls.localize('illegalStateError', "Illegal state: {0}", name));
	} else {
		return new Error(nls.localize('illegalStateError2', "Illegal state"));
	}
}

export function readonly(): Error {
	return new Error('readonly property cannot be changed');
}

export function loaderError(err: Error): Error {
	if (platform.isWeb) {
		return new Error(nls.localize('loaderError', "Failed to load a required file. Either you are no longer connected to the internet or the server you are connected to is offline. Please refresh the browser to try again."));
	}

	return new Error(nls.localize('loaderErrorNative', "Failed to load a required file. Please restart the application to try again. Details: {0}", JSON.stringify(err)));
}

export interface IErrorOptions {
	severity?: Severity;
	actions?: IAction[];
}

export function create(message: string, options: IErrorOptions = {}): Error {
	let result = new Error(message);

	if (types.isNumber(options.severity)) {
		(<any>result).severity = options.severity;
	}

	if (options.actions) {
		(<any>result).actions = options.actions;
	}

	return result;
}