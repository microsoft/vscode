/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Runs a callback without allowing synchronous environment mutations to escape. */
export function runWithFencedProcessEnvironment<T>(callback: () => T): T {
	const environment = { ...process.env };
	try {
		return callback();
	} finally {
		for (const key of Object.keys(process.env)) {
			if (!Object.hasOwn(environment, key)) {
				delete process.env[key];
			}
		}
		Object.assign(process.env, environment);
	}
}
