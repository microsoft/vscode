/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export async function retry<T>(fn: (attempt: number) => Promise<T>): Promise<T> {
	let lastError: Error | undefined;

	for (let run = 1; run <= 10; run++) {
		try {
			console.log(`[retry] Attempt ${run}...`);
			return await fn(run);
		} catch (err) {
			if (!/fetch failed|timeout|TimeoutError|Timeout Error|RestError|Client network socket disconnected|socket hang up|ECONNRESET|CredentialUnavailableError|endpoints_resolution_error|Audience validation failed/i.test(err.message)) {
				throw err;
			}

			lastError = err;
			const millis = Math.floor((Math.random() * 200) + (50 * Math.pow(1.5, run)));
			console.log(`[retry] Request failed, retrying in ${millis}ms...`);
			console.error(err);

			// maximum delay is 10th retry: ~3 seconds
			await new Promise(c => setTimeout(c, millis));

			console.log('[retry] After delay, retrying request...');
		}
	}

	console.log(`[retry] Too many retries, aborting.`);
	throw lastError;
}
