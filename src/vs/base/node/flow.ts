/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');

/**
 * Executes the given function (fn) over the given array of items (list) in parallel and returns the resulting errors and results as
 * array to the callback (callback). The resulting errors and results are evaluated by calling the provided callback function.
 */
export function parallel<T, E>(list: T[], fn: (item: T, callback: (err: Error, result: E) => void) => void, callback: (err: Error[], result: E[]) => void): void {
	let results = new Array(list.length);
	let errors = new Array<Error>(list.length);
	let didErrorOccur = false;
	let doneCount = 0;

	if (list.length === 0) {
		return callback(null, []);
	}

	list.forEach((item, index) => {
		fn(item, (error, result) => {
			if (error) {
				didErrorOccur = true;
				results[index] = null;
				errors[index] = error;
			} else {
				results[index] = result;
				errors[index] = null;
			}

			if (++doneCount === list.length) {
				return callback(didErrorOccur ? errors : null, results);
			}
		});
	});
}

/**
 * Executes the given function (fn) over the given array of items (param) in sequential order and returns the first occurred error or the result as
 * array to the callback (callback). The resulting errors and results are evaluated by calling the provided callback function. The first param can
 * either be a function that returns an array of results to loop in async fashion or be an array of items already.
 */
export function loop<T, E>(param: (callback: (error: Error, result: T[]) => void) => void, fn: (item: T, callback: (error: Error, result: E) => void, index: number, total: number) => void, callback: (error: Error, result: E[]) => void): void;
export function loop<T, E>(param: T[], fn: (item: T, callback: (error: Error, result: E) => void, index: number, total: number) => void, callback: (error: Error, result: E[]) => void): void;
export function loop<E>(param: any, fn: (item: any, callback: (error: Error, result: E) => void, index: number, total: number) => void, callback: (error: Error, result: E[]) => void): void {

	// Assert
	assert.ok(param, 'Missing first parameter');
	assert.ok(typeof (fn) === 'function', 'Second parameter must be a function that is called for each element');
	assert.ok(typeof (callback) === 'function', 'Third parameter must be a function that is called on error and success');

	// Param is function, execute to retrieve array
	if (typeof (param) === 'function') {
		try {
			param((error: Error, result: E[]) => {
				if (error) {
					callback(error, null);
				} else {
					loop(result, fn, callback);
				}
			});
		} catch (error) {
			callback(error, null);
		}
	}

	// Expect the param to be an array and loop over it
	else {
		let results: E[] = [];

		let looper: (i: number) => void = function (i: number): void {

			// Still work to do
			if (i < param.length) {

				// Execute function on array element
				try {
					fn(param[i], (error: any, result: E) => {

						// A method might only send a boolean value as return value (e.g. fs.exists), support this case gracefully
						if (error === true || error === false) {
							result = error;
							error = null;
						}

						// Quit looping on error
						if (error) {
							callback(error, null);
						}

						// Otherwise push result on stack and continue looping
						else {
							if (result) { //Could be that provided function is not returning a result
								results.push(result);
							}

							process.nextTick(() => {
								looper(i + 1);
							});
						}
					}, i, param.length);
				} catch (error) {
					callback(error, null);
				}
			}

			// Done looping, pass back results too callback function
			else {
				callback(null, results);
			}
		};

		// Start looping with first element in array
		looper(0);
	}
}