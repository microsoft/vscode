/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function formatError(message: string, err: any): string {
	if (err instanceof Error) {
		let error = <Error>err;
		return `${message}: ${error.message}\n${error.stack}`;
	} else if (typeof err === 'string') {
		return `${message}: ${err}`;
	} else if (err) {
		return `${message}: ${err.toString()}`;
	}
	return message;
}

export function runSafeAsync<T>(func: () => Thenable<T>, errorVal: T, errorMessage: string): Thenable<T> {
	let t = func();
	return t.then(void 0, e => {
		console.error(formatError(errorMessage, e));
		return errorVal;
	});
}
export function runSafe<T>(func: () => T, errorVal: T, errorMessage: string): T {
	try {
		return func();
	} catch (e) {
		console.error(formatError(errorMessage, e));
		return errorVal;
	}
}