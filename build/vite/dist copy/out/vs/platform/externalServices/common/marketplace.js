/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getServiceMachineId } from './serviceMachineId.js';
import { getTelemetryLevel, supportsTelemetry } from '../../telemetry/common/telemetryUtils.js';
export async function resolveMarketplaceHeaders(version, productService, environmentService, configurationService, fileService, storageService, telemetryService) {
    const headers = {
        'X-Market-Client-Id': `VSCode ${version}`,
        'User-Agent': `VSCode ${version} (${productService.nameShort})`
    };
    if (supportsTelemetry(productService, environmentService) && getTelemetryLevel(configurationService) === 3 /* TelemetryLevel.USAGE */) {
        const serviceMachineId = await getServiceMachineId(environmentService, fileService, storageService);
        headers['X-Market-User-Id'] = serviceMachineId;
        // Send machineId as VSCode-SessionId so we can correlate telemetry events across different services
        // machineId can be undefined sometimes (eg: when launching from CLI), so send serviceMachineId instead otherwise
        // Marketplace will reject the request if there is no VSCode-SessionId header
        headers['VSCode-SessionId'] = telemetryService.machineId || serviceMachineId;
    }
    return headers;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2V0cGxhY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlcm5hbFNlcnZpY2VzL2NvbW1vbi9tYXJrZXRwbGFjZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUs1RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVoRyxNQUFNLENBQUMsS0FBSyxVQUFVLHlCQUF5QixDQUFDLE9BQWUsRUFDOUQsY0FBK0IsRUFDL0Isa0JBQXVDLEVBQ3ZDLG9CQUEyQyxFQUMzQyxXQUF5QixFQUN6QixjQUEyQyxFQUMzQyxnQkFBbUM7SUFFbkMsTUFBTSxPQUFPLEdBQWE7UUFDekIsb0JBQW9CLEVBQUUsVUFBVSxPQUFPLEVBQUU7UUFDekMsWUFBWSxFQUFFLFVBQVUsT0FBTyxLQUFLLGNBQWMsQ0FBQyxTQUFTLEdBQUc7S0FDL0QsQ0FBQztJQUVGLElBQUksaUJBQWlCLENBQUMsY0FBYyxFQUFFLGtCQUFrQixDQUFDLElBQUksaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsaUNBQXlCLEVBQUUsQ0FBQztRQUMvSCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sbUJBQW1CLENBQUMsa0JBQWtCLEVBQUUsV0FBVyxFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3BHLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLGdCQUFnQixDQUFDO1FBQy9DLG9HQUFvRztRQUNwRyxpSEFBaUg7UUFDakgsNkVBQTZFO1FBQzdFLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLGdCQUFnQixDQUFDLFNBQVMsSUFBSSxnQkFBZ0IsQ0FBQztJQUM5RSxDQUFDO0lBRUQsT0FBTyxPQUFPLENBQUM7QUFDaEIsQ0FBQyJ9