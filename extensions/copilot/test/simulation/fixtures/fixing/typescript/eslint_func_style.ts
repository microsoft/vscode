/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint func-style: "error" */
export function testo(tests: Record<string, () => void>) {
	for (const key in tests) {
		if (Object.prototype.hasOwnProperty.call(tests, key)) {
			tests[key]();
		}
	}
}