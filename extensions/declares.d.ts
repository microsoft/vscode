/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../src/typings/mocha.d.ts" />
/// <reference path="../src/typings/thenable.d.ts" />

// Declaring the following because the code gets compiled with es5, which lack definitions for console and timers.
declare var console: {
	assert(value: any, message?: string, ...optionalParams: any[]): void;
	dir(obj: any, options?: { showHidden?: boolean, depth?: number, colors?: boolean }): void;
	error(message?: any, ...optionalParams: any[]): void;
	info(message?: any, ...optionalParams: any[]): void;
	log(message?: any, ...optionalParams: any[]): void;
	time(label: string): void;
	timeEnd(label: string): void;
	trace(message?: any, ...optionalParams: any[]): void;
	warn(message?: any, ...optionalParams: any[]): void;
};


// ---- ES6 promise ------------------------------------------------------

/**
 * Represents the completion of an asynchronous operation.
 */
interface Promise<T> extends Thenable<T> {
	/**
	* Attaches callbacks for the resolution and/or rejection of the Promise.
	* @param onfulfilled The callback to execute when the Promise is resolved.
	* @param onrejected The callback to execute when the Promise is rejected.
	* @returns A Promise for the completion of which ever callback is executed.
	*/
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Promise<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Promise<TResult>;

	/**
	 * Attaches a callback for only the rejection of the Promise.
	 * @param onrejected The callback to execute when the Promise is rejected.
	 * @returns A Promise for the completion of the callback.
	 */
	catch(onrejected?: (reason: any) => T | Thenable<T>): Promise<T>;

	// [Symbol.toStringTag]: string;
}

interface PromiseConstructor {
	// /**
	//   * A reference to the prototype.
	//   */
	// prototype: Promise<any>;

	/**
	 * Creates a new Promise.
	 * @param executor A callback used to initialize the promise. This callback is passed two arguments:
	 * a resolve callback used to resolve the promise with a value or the result of another promise,
	 * and a reject callback used to reject the promise with a provided reason or error.
	 */
	new <T>(executor: (resolve: (value?: T | Thenable<T>) => void, reject: (reason?: any) => void) => void): Promise<T>;

	/**
	 * Creates a Promise that is resolved with an array of results when all of the provided Promises
	 * resolve, or rejected when any Promise is rejected.
	 * @param values An array of Promises.
	 * @returns A new Promise.
	 */
	all<T>(values: Array<T | Thenable<T>>): Promise<T[]>;

	/**
	 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
	 * or rejected.
	 * @param values An array of Promises.
	 * @returns A new Promise.
	 */
	race<T>(values: Array<T | Thenable<T>>): Promise<T>;

	/**
	 * Creates a new rejected promise for the provided reason.
	 * @param reason The reason the promise was rejected.
	 * @returns A new rejected Promise.
	 */
	reject(reason: any): Promise<void>;

	/**
	 * Creates a new rejected promise for the provided reason.
	 * @param reason The reason the promise was rejected.
	 * @returns A new rejected Promise.
	 */
	reject<T>(reason: any): Promise<T>;

	/**
	 * Creates a new resolved promise for the provided value.
	 * @param value A promise.
	 * @returns A promise whose internal state matches the provided promise.
	 */
	resolve<T>(value: T | Thenable<T>): Promise<T>;

	/**
	 * Creates a new resolved promise.
	 * @returns A resolved promise.
	 */
	resolve(): Promise<void>;

	// [Symbol.species]: Function;
}

declare var Promise: PromiseConstructor;
