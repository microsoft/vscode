/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint func-names: "error" */
export const factorial = function (n: number): number {
	if (n === 1) {
		return 1;
	} else {
		return n * factorial(n - 1);
	}
}
export const functionName = factorial;
