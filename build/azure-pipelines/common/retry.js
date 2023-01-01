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
            return await fn();
        }
        catch (err) {
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
exports.retry = retry;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmV0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUV6RixLQUFLLFVBQVUsS0FBSyxDQUFJLEVBQW9CO0lBQ2xELElBQUksU0FBNEIsQ0FBQztJQUVqQyxLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxHQUFHLElBQUksRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQ25DLElBQUk7WUFDSCxPQUFPLE1BQU0sRUFBRSxFQUFFLENBQUM7U0FDbEI7UUFBQyxPQUFPLEdBQUcsRUFBRTtZQUNiLElBQUksQ0FBQyxtRUFBbUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUMzRixNQUFNLEdBQUcsQ0FBQzthQUNWO1lBRUQsU0FBUyxHQUFHLEdBQUcsQ0FBQztZQUNoQixNQUFNLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2pFLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLE1BQU0sT0FBTyxDQUFDLENBQUM7WUFFMUQsMENBQTBDO1lBQzFDLE1BQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7U0FDOUM7S0FDRDtJQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLENBQUMsQ0FBQztJQUMzQyxNQUFNLFNBQVMsQ0FBQztBQUNqQixDQUFDO0FBdEJELHNCQXNCQyJ9