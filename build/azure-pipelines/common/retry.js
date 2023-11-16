"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.retry = void 0;
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
exports.retry = retry;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmV0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUV6RixLQUFLLFVBQVUsS0FBSyxDQUFJLEVBQW1DO0lBQ2pFLElBQUksU0FBNEIsQ0FBQztJQUVqQyxLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxHQUFHLElBQUksRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUM7UUFDcEMsSUFBSSxDQUFDO1lBQ0osT0FBTyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0QixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNkLElBQUksQ0FBQyxpUkFBaVIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQzFTLE1BQU0sR0FBRyxDQUFDO1lBQ1gsQ0FBQztZQUVELFNBQVMsR0FBRyxHQUFHLENBQUM7WUFFaEIsMENBQTBDO1lBQzFDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdFLE1BQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDL0MsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7SUFDN0MsTUFBTSxTQUFTLENBQUM7QUFDakIsQ0FBQztBQXJCRCxzQkFxQkMifQ==