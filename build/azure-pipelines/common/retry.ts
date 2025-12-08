/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export async function retry<T>(fn: (attempt: number) => Promise<T>): Promise<T> {
	let lastError: Error | undefined;

	for (let run = 1; run <= 10; run++) {
		try {
			return await fn(run);
		} catch (err) {
			if (!/ECONNRESET|CredentialUnavailableError|Audience validation failed/i.test(err.message)) {
				throw err;
			}

			lastError = err;
			const millis = (Math.random() * 200) + (50 * Math.pow(1.5, run));
			console.log(`Request failed, retrying in ${millis}ms...`);

			// maximum delay is 10th retry: ~3 seconds
			await new Promise(c => setTimeout(c, millis));
		}
	}

	console.log(`Too many retries, aborting.`);
	throw lastError;
}
