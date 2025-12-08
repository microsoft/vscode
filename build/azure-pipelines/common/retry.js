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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmV0cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyZXRyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUV6RixLQUFLLFVBQVUsS0FBSyxDQUFJLEVBQW1DO0lBQ2pFLElBQUksU0FBNEIsQ0FBQztJQUVqQyxLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxHQUFHLElBQUksRUFBRSxFQUFFLEdBQUcsRUFBRSxFQUFFO1FBQ25DLElBQUk7WUFDSCxPQUFPLE1BQU0sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ3JCO1FBQUMsT0FBTyxHQUFHLEVBQUU7WUFDYixJQUFJLENBQUMsbUVBQW1FLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRTtnQkFDM0YsTUFBTSxHQUFHLENBQUM7YUFDVjtZQUVELFNBQVMsR0FBRyxHQUFHLENBQUM7WUFDaEIsTUFBTSxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNqRSxPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixNQUFNLE9BQU8sQ0FBQyxDQUFDO1lBRTFELDBDQUEwQztZQUMxQyxNQUFNLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO1NBQzlDO0tBQ0Q7SUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLENBQUM7SUFDM0MsTUFBTSxTQUFTLENBQUM7QUFDakIsQ0FBQztBQXRCRCxzQkFzQkMifQ==