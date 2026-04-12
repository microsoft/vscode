/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { localize } from '../../../nls.js';
export const IRemoteTunnelService = createDecorator('IRemoteTunnelService');
export const INACTIVE_TUNNEL_MODE = { active: false };
export var TunnelStates;
(function (TunnelStates) {
    TunnelStates.disconnected = (onTokenFailed) => ({ type: 'disconnected', onTokenFailed });
    TunnelStates.connected = (info, serviceInstallFailed) => ({ type: 'connected', info, serviceInstallFailed });
    TunnelStates.connecting = (progress) => ({ type: 'connecting', progress });
    TunnelStates.uninitialized = { type: 'uninitialized' };
})(TunnelStates || (TunnelStates = {}));
export const CONFIGURATION_KEY_PREFIX = 'remote.tunnels.access';
export const CONFIGURATION_KEY_HOST_NAME = CONFIGURATION_KEY_PREFIX + '.hostNameOverride';
export const CONFIGURATION_KEY_PREVENT_SLEEP = CONFIGURATION_KEY_PREFIX + '.preventSleep';
export const LOG_ID = 'remoteTunnelService';
export const LOGGER_NAME = localize('remoteTunnelLog', "Remote Tunnel Service");
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlVHVubmVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcmVtb3RlVHVubmVsL2NvbW1vbi9yZW1vdGVUdW5uZWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQVMzQyxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxlQUFlLENBQXVCLHNCQUFzQixDQUFDLENBQUM7QUE2QmxHLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUF1QixFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsQ0FBQztBQU8xRSxNQUFNLEtBQVcsWUFBWSxDQXNCNUI7QUF0QkQsV0FBaUIsWUFBWTtJQWlCZix5QkFBWSxHQUFHLENBQUMsYUFBb0MsRUFBZ0IsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7SUFDakgsc0JBQVMsR0FBRyxDQUFDLElBQW9CLEVBQUUsb0JBQTZCLEVBQWEsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBRSxDQUFDLENBQUM7SUFDcEksdUJBQVUsR0FBRyxDQUFDLFFBQWlCLEVBQWMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDbkYsMEJBQWEsR0FBa0IsRUFBRSxJQUFJLEVBQUUsZUFBZSxFQUFFLENBQUM7QUFFdkUsQ0FBQyxFQXRCZ0IsWUFBWSxLQUFaLFlBQVksUUFzQjVCO0FBU0QsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcsdUJBQXVCLENBQUM7QUFDaEUsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcsd0JBQXdCLEdBQUcsbUJBQW1CLENBQUM7QUFDMUYsTUFBTSxDQUFDLE1BQU0sK0JBQStCLEdBQUcsd0JBQXdCLEdBQUcsZUFBZSxDQUFDO0FBRTFGLE1BQU0sQ0FBQyxNQUFNLE1BQU0sR0FBRyxxQkFBcUIsQ0FBQztBQUM1QyxNQUFNLENBQUMsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixFQUFFLHVCQUF1QixDQUFDLENBQUMifQ==