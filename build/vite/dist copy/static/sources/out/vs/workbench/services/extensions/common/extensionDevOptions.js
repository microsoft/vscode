/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../base/common/network.js';
export function parseExtensionDevOptions(environmentService) {
    // handle extension host lifecycle a bit special when we know we are developing an extension that runs inside
    const isExtensionDevHost = environmentService.isExtensionDevelopment;
    let debugOk = true;
    const extDevLocs = environmentService.extensionDevelopmentLocationURI;
    if (extDevLocs) {
        for (const x of extDevLocs) {
            if (x.scheme !== Schemas.file) {
                debugOk = false;
            }
        }
    }
    const isExtensionDevDebug = debugOk && typeof environmentService.debugExtensionHost.port === 'number';
    const isExtensionDevDebugBrk = debugOk && !!environmentService.debugExtensionHost.break;
    const isExtensionDevTestFromCli = isExtensionDevHost && !!environmentService.extensionTestsLocationURI && !environmentService.debugExtensionHost.debugId;
    return {
        isExtensionDevHost,
        isExtensionDevDebug,
        isExtensionDevDebugBrk,
        isExtensionDevTestFromCli
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRGV2T3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25EZXZPcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQVU3RCxNQUFNLFVBQVUsd0JBQXdCLENBQUMsa0JBQXVDO0lBQy9FLDZHQUE2RztJQUM3RyxNQUFNLGtCQUFrQixHQUFHLGtCQUFrQixDQUFDLHNCQUFzQixDQUFDO0lBRXJFLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQztJQUNuQixNQUFNLFVBQVUsR0FBRyxrQkFBa0IsQ0FBQywrQkFBK0IsQ0FBQztJQUN0RSxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQ2hCLEtBQUssTUFBTSxDQUFDLElBQUksVUFBVSxFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLENBQUMsTUFBTSxLQUFLLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDL0IsT0FBTyxHQUFHLEtBQUssQ0FBQztZQUNqQixDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRCxNQUFNLG1CQUFtQixHQUFHLE9BQU8sSUFBSSxPQUFPLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLElBQUksS0FBSyxRQUFRLENBQUM7SUFDdEcsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLElBQUksQ0FBQyxDQUFDLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztJQUN4RixNQUFNLHlCQUF5QixHQUFHLGtCQUFrQixJQUFJLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyx5QkFBeUIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQztJQUN6SixPQUFPO1FBQ04sa0JBQWtCO1FBQ2xCLG1CQUFtQjtRQUNuQixzQkFBc0I7UUFDdEIseUJBQXlCO0tBQ3pCLENBQUM7QUFDSCxDQUFDIn0=