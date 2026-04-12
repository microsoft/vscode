/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isMacintosh } from '../../../base/common/platform.js';
import { getMachineId, getSqmMachineId, getDevDeviceId } from '../../../base/node/id.js';
import { machineIdKey, sqmIdKey, devDeviceIdKey } from '../common/telemetry.js';
export async function resolveMachineId(stateService, logService) {
    // We cache the machineId for faster lookups
    // and resolve it only once initially if not cached or we need to replace the macOS iBridge device
    let machineId = stateService.getItem(machineIdKey);
    if (typeof machineId !== 'string' || (isMacintosh && machineId === '6c9d2bc8f91b89624add29c0abeae7fb42bf539fa1cdb2e3e57cd668fa9bcead')) {
        machineId = await getMachineId(logService.error.bind(logService));
    }
    return machineId;
}
export async function resolveSqmId(stateService, logService) {
    let sqmId = stateService.getItem(sqmIdKey);
    if (typeof sqmId !== 'string') {
        sqmId = await getSqmMachineId(logService.error.bind(logService));
    }
    return sqmId;
}
export async function resolveDevDeviceId(stateService, logService) {
    let devDeviceId = stateService.getItem(devDeviceIdKey);
    if (typeof devDeviceId !== 'string') {
        devDeviceId = await getDevDeviceId(logService.error.bind(logService));
    }
    return devDeviceId;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5VXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZWxlbWV0cnkvbm9kZS90ZWxlbWV0cnlVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFHekYsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFHaEYsTUFBTSxDQUFDLEtBQUssVUFBVSxnQkFBZ0IsQ0FBQyxZQUErQixFQUFFLFVBQXVCO0lBQzlGLDRDQUE0QztJQUM1QyxrR0FBa0c7SUFDbEcsSUFBSSxTQUFTLEdBQUcsWUFBWSxDQUFDLE9BQU8sQ0FBUyxZQUFZLENBQUMsQ0FBQztJQUMzRCxJQUFJLE9BQU8sU0FBUyxLQUFLLFFBQVEsSUFBSSxDQUFDLFdBQVcsSUFBSSxTQUFTLEtBQUssa0VBQWtFLENBQUMsRUFBRSxDQUFDO1FBQ3hJLFNBQVMsR0FBRyxNQUFNLFlBQVksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBQ25FLENBQUM7SUFFRCxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDO0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxZQUFZLENBQUMsWUFBK0IsRUFBRSxVQUF1QjtJQUMxRixJQUFJLEtBQUssR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFTLFFBQVEsQ0FBQyxDQUFDO0lBQ25ELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDL0IsS0FBSyxHQUFHLE1BQU0sZUFBZSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELE1BQU0sQ0FBQyxLQUFLLFVBQVUsa0JBQWtCLENBQUMsWUFBK0IsRUFBRSxVQUF1QjtJQUNoRyxJQUFJLFdBQVcsR0FBRyxZQUFZLENBQUMsT0FBTyxDQUFTLGNBQWMsQ0FBQyxDQUFDO0lBQy9ELElBQUksT0FBTyxXQUFXLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDckMsV0FBVyxHQUFHLE1BQU0sY0FBYyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDdkUsQ0FBQztJQUVELE9BQU8sV0FBVyxDQUFDO0FBQ3BCLENBQUMifQ==