/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import platform = require('vs/base/common/platform');
import types = require('vs/base/common/types');
import { IAction } from 'vs/base/common/actions';
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

		this.unexpectedErrorHandler = function (e: any) {
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

	// For external errors, we don't want the listeners to be called
	public onUnexpectedExternalError(e: any): void {
		this.unexpectedErrorHandler(e);
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

export function onUnexpectedExternalError(e: any): void {

	// ignore errors from cancelled promises
	if (!isPromiseCanceledError(e)) {
		errorHandler.onUnexpectedExternalError(e);
	}
}

export function onUnexpectedPromiseError<T>(promise: TPromise<T>): TPromise<T> {
	return promise.then<T>(null, onUnexpectedError);
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
	return new Error('Not Implemented');
}

export function illegalArgument(name?: string): Error {
	if (name) {
		return new Error(`Illegal argument: ${name}`);
	} else {
		return new Error('Illegal argument');
	}
}

export function illegalState(name?: string): Error {
	if (name) {
		return new Error(`Illegal state: ${name}`);
	} else {
		return new Error('Illegal state');
	}
}

export function readonly(name?: string): Error {
	return name
		? new Error(`readonly property '${name} cannot be changed'`)
		: new Error('readonly property cannot be changed');
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

export function getErrorMessage(err: any): string {
	if (!err) {
		return 'Error';
	}

	if (err.message) {
		return err.message;
	}

	if (err.stack) {
		return err.stack.split('\n')[0];
	}

	return String(err);
}