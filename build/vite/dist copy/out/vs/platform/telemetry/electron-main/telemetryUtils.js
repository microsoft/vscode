/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getDevDeviceId } from '../../../base/node/id.js';
import { machineIdKey, sqmIdKey, devDeviceIdKey } from '../common/telemetry.js';
import { resolveMachineId as resolveNodeMachineId, resolveSqmId as resolveNodeSqmId, resolveDevDeviceId as resolveNodeDevDeviceId } from '../node/telemetryUtils.js';
export async function resolveMachineId(stateService, logService) {
    logService.trace('Resolving machine identifier...');
    const machineId = await resolveNodeMachineId(stateService, logService);
    stateService.setItem(machineIdKey, machineId);
    logService.trace(`Resolved machine identifier: ${machineId}`);
    return machineId;
}
export async function resolveSqmId(stateService, logService) {
    logService.trace('Resolving SQM identifier...');
    const sqmId = await resolveNodeSqmId(stateService, logService);
    stateService.setItem(sqmIdKey, sqmId);
    logService.trace(`Resolved SQM identifier: ${sqmId}`);
    return sqmId;
}
export async function resolveDevDeviceId(stateService, logService) {
    logService.trace('Resolving devDevice identifier...');
    const devDeviceId = await resolveNodeDevDeviceId(stateService, logService);
    stateService.setItem(devDeviceIdKey, devDeviceId);
    logService.trace(`Resolved devDevice identifier: ${devDeviceId}`);
    return devDeviceId;
}
export async function validateDevDeviceId(stateService, logService) {
    const actualDeviceId = await getDevDeviceId(logService.error.bind(logService));
    const currentDeviceId = await resolveNodeDevDeviceId(stateService, logService);
    if (actualDeviceId !== currentDeviceId) {
        stateService.setItem(devDeviceIdKey, actualDeviceId);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5VXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZWxlbWV0cnkvZWxlY3Ryb24tbWFpbi90ZWxlbWV0cnlVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFHMUQsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDaEYsT0FBTyxFQUFFLGdCQUFnQixJQUFJLG9CQUFvQixFQUFFLFlBQVksSUFBSSxnQkFBZ0IsRUFBRSxrQkFBa0IsSUFBSSxzQkFBc0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBRXJLLE1BQU0sQ0FBQyxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsWUFBMkIsRUFBRSxVQUF1QjtJQUMxRixVQUFVLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7SUFDcEQsTUFBTSxTQUFTLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDdkUsWUFBWSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDOUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUM5RCxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDO0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxZQUFZLENBQUMsWUFBMkIsRUFBRSxVQUF1QjtJQUN0RixVQUFVLENBQUMsS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7SUFDaEQsTUFBTSxLQUFLLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDL0QsWUFBWSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdEMsVUFBVSxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUN0RCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxNQUFNLENBQUMsS0FBSyxVQUFVLGtCQUFrQixDQUFDLFlBQTJCLEVBQUUsVUFBdUI7SUFDNUYsVUFBVSxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQ3RELE1BQU0sV0FBVyxHQUFHLE1BQU0sc0JBQXNCLENBQUMsWUFBWSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQzNFLFlBQVksQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ2xELFVBQVUsQ0FBQyxLQUFLLENBQUMsa0NBQWtDLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFDbEUsT0FBTyxXQUFXLENBQUM7QUFDcEIsQ0FBQztBQUVELE1BQU0sQ0FBQyxLQUFLLFVBQVUsbUJBQW1CLENBQUMsWUFBMkIsRUFBRSxVQUF1QjtJQUM3RixNQUFNLGNBQWMsR0FBRyxNQUFNLGNBQWMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBQy9FLE1BQU0sZUFBZSxHQUFHLE1BQU0sc0JBQXNCLENBQUMsWUFBWSxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQy9FLElBQUksY0FBYyxLQUFLLGVBQWUsRUFBRSxDQUFDO1FBQ3hDLFlBQVksQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBQ3RELENBQUM7QUFDRixDQUFDIn0=