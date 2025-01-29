"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.retry = retry;
async function retry(fn) {
    let lastError;
    for (let run = 1; run <= 10; run++) {
        try {
            return await fn(run);
        }
        catch (err) {
            if (!/fetch failed|terminated|aborted|timeout|TimeoutError|Timeout Error|RestError|Client network socket disconnected|socket hang up|ECONNRESET|CredentialUnavailableError|endpoints_resolution_error|Audience validation failed|end of central directory record signature not found/i.test(err.message)) {
                throw err;
            }
            lastError = err;
            // maximum delay is 10th retry: ~3 seconds
            const millis = Math.floor((Math.random() * 200) + (50 * Math.pow(1.5, run)));
            await new Promise(c => setTimeout(c, millis));
        }
    }
    console.error(`Too many retries, aborting.`);
    throw lastError;
}
//# sourceMappingURL=retry.js.map