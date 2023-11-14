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
            console.log(`[retry] Attempt ${run}...`);
            return await fn(run);
        }
        catch (err) {
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
exports.retry = retry;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmV0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUV6RixLQUFLLFVBQVUsS0FBSyxDQUFJLEVBQW1DO0lBQ2pFLElBQUksU0FBNEIsQ0FBQztJQUVqQyxLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxHQUFHLElBQUksRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFLENBQUM7UUFDcEMsSUFBSSxDQUFDO1lBQ0osT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLENBQUMsQ0FBQztZQUN6QyxPQUFPLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RCLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsSUFBSSxDQUFDLDBNQUEwTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDbk8sTUFBTSxHQUFHLENBQUM7WUFDWCxDQUFDO1lBRUQsU0FBUyxHQUFHLEdBQUcsQ0FBQztZQUNoQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3RSxPQUFPLENBQUMsR0FBRyxDQUFDLHVDQUF1QyxNQUFNLE9BQU8sQ0FBQyxDQUFDO1lBQ2xFLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFbkIsMENBQTBDO1lBQzFDLE1BQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFFOUMsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO1FBQ3pELENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO0lBQ25ELE1BQU0sU0FBUyxDQUFDO0FBQ2pCLENBQUM7QUExQkQsc0JBMEJDIn0=