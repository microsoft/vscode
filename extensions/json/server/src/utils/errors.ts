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

export function runSafe<T>(func: () => Thenable<T> | T, errorVal: T, errorMessage: string): Thenable<T> | T {
	try {
		let t = func();
		if (t instanceof Promise) {
			return t.then(void 0, e => {
				console.error(formatError(errorMessage, e));
				return errorVal;
			});
		}
		return t;
	} catch (e) {
		console.error(formatError(errorMessage, e));
		return errorVal;
	}
}