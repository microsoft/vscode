/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export async function retry<T>(fn: () => Promise<T>): Promise<T> {
	for (let run = 1; run <= 10; run++) {
		try {
			return await fn();
		} catch (err) {
			if (!/ECONNRESET/.test(err.message)) {
				throw err;
			}

			const millis = (Math.random() * 200) + (50 * Math.pow(1.5, run));
			console.log(`Failed with ECONNRESET, retrying in ${millis}ms...`);

			// maximum delay is 10th retry: ~3 seconds
			await new Promise(c => setTimeout(c, millis));
		}
	}

	throw new Error('Retried too many times');
}
