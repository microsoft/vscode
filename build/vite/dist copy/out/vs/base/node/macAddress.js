/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { networkInterfaces } from 'os';
const invalidMacAddresses = new Set([
    '00:00:00:00:00:00',
    'ff:ff:ff:ff:ff:ff',
    'ac:de:48:00:11:22'
]);
function validateMacAddress(candidate) {
    const tempCandidate = candidate.replace(/\-/g, ':').toLowerCase();
    return !invalidMacAddresses.has(tempCandidate);
}
export function getMac() {
    const ifaces = networkInterfaces();
    for (const name in ifaces) {
        const networkInterface = ifaces[name];
        if (networkInterface) {
            for (const { mac } of networkInterface) {
                if (validateMacAddress(mac)) {
                    return mac;
                }
            }
        }
    }
    throw new Error('Unable to retrieve mac address (unexpected format)');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFjQWRkcmVzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2Uvbm9kZS9tYWNBZGRyZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLElBQUksQ0FBQztBQUV2QyxNQUFNLG1CQUFtQixHQUFHLElBQUksR0FBRyxDQUFDO0lBQ25DLG1CQUFtQjtJQUNuQixtQkFBbUI7SUFDbkIsbUJBQW1CO0NBQ25CLENBQUMsQ0FBQztBQUVILFNBQVMsa0JBQWtCLENBQUMsU0FBaUI7SUFDNUMsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDbEUsT0FBTyxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztBQUNoRCxDQUFDO0FBRUQsTUFBTSxVQUFVLE1BQU07SUFDckIsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztJQUNuQyxLQUFLLE1BQU0sSUFBSSxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQzNCLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RDLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUN0QixLQUFLLE1BQU0sRUFBRSxHQUFHLEVBQUUsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO2dCQUN4QyxJQUFJLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQzdCLE9BQU8sR0FBRyxDQUFDO2dCQUNaLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxNQUFNLElBQUksS0FBSyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7QUFDdkUsQ0FBQyJ9