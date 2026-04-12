/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { ExtHostTerminalService } from './extHostTerminalService.js';
import { ExtHostTask } from './extHostTask.js';
import { ExtHostDebugService } from './extHostDebugService.js';
import { NativeExtHostSearch } from './extHostSearch.js';
import { ExtHostExtensionService } from './extHostExtensionService.js';
import { NodeExtHostTunnelService } from './extHostTunnelService.js';
import { IExtHostDebugService } from '../common/extHostDebugService.js';
import { IExtHostExtensionService } from '../common/extHostExtensionService.js';
import { IExtHostSearch } from '../common/extHostSearch.js';
import { IExtHostTask } from '../common/extHostTask.js';
import { IExtHostTerminalService } from '../common/extHostTerminalService.js';
import { IExtHostTunnelService } from '../common/extHostTunnelService.js';
import { IExtensionStoragePaths } from '../common/extHostStoragePaths.js';
import { ExtensionStoragePaths } from './extHostStoragePaths.js';
import { ExtHostLoggerService } from './extHostLoggerService.js';
import { ILogService, ILoggerService } from '../../../platform/log/common/log.js';
import { NodeExtHostVariableResolverProviderService } from './extHostVariableResolverService.js';
import { IExtHostVariableResolverProvider } from '../common/extHostVariableResolverService.js';
import { ExtHostLogService } from '../common/extHostLogService.js';
import { SyncDescriptor } from '../../../platform/instantiation/common/descriptors.js';
import { ISignService } from '../../../platform/sign/common/sign.js';
import { SignService } from '../../../platform/sign/node/signService.js';
import { ExtHostTelemetry, IExtHostTelemetry } from '../common/extHostTelemetry.js';
import { IExtHostMpcService } from '../common/extHostMcp.js';
import { NodeExtHostMpcService } from './extHostMcpNode.js';
import { IExtHostAuthentication } from '../common/extHostAuthentication.js';
import { NodeExtHostAuthentication } from './extHostAuthentication.js';
// #########################################################################
// ###                                                                   ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO extHost.common.services.ts !!! ###
// ###                                                                   ###
// #########################################################################
registerSingleton(IExtHostExtensionService, ExtHostExtensionService, 0 /* InstantiationType.Eager */);
registerSingleton(ILoggerService, ExtHostLoggerService, 1 /* InstantiationType.Delayed */);
registerSingleton(ILogService, new SyncDescriptor(ExtHostLogService, [false], true));
registerSingleton(ISignService, SignService, 1 /* InstantiationType.Delayed */);
registerSingleton(IExtensionStoragePaths, ExtensionStoragePaths, 0 /* InstantiationType.Eager */);
registerSingleton(IExtHostTelemetry, new SyncDescriptor(ExtHostTelemetry, [false], true));
registerSingleton(IExtHostAuthentication, NodeExtHostAuthentication, 0 /* InstantiationType.Eager */);
registerSingleton(IExtHostDebugService, ExtHostDebugService, 0 /* InstantiationType.Eager */);
registerSingleton(IExtHostSearch, NativeExtHostSearch, 0 /* InstantiationType.Eager */);
registerSingleton(IExtHostTask, ExtHostTask, 0 /* InstantiationType.Eager */);
registerSingleton(IExtHostTerminalService, ExtHostTerminalService, 0 /* InstantiationType.Eager */);
registerSingleton(IExtHostTunnelService, NodeExtHostTunnelService, 0 /* InstantiationType.Eager */);
registerSingleton(IExtHostVariableResolverProvider, NodeExtHostVariableResolverProviderService, 0 /* InstantiationType.Eager */);
registerSingleton(IExtHostMpcService, NodeExtHostMpcService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdC5ub2RlLnNlcnZpY2VzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9ub2RlL2V4dEhvc3Qubm9kZS5zZXJ2aWNlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDNUcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDckUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3JFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDakUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDakUsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsMENBQTBDLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMvRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDdkYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNwRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUV2RSw0RUFBNEU7QUFDNUUsNEVBQTRFO0FBQzVFLDRFQUE0RTtBQUM1RSw0RUFBNEU7QUFDNUUsNEVBQTRFO0FBRTVFLGlCQUFpQixDQUFDLHdCQUF3QixFQUFFLHVCQUF1QixrQ0FBMEIsQ0FBQztBQUM5RixpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsb0JBQW9CLG9DQUE0QixDQUFDO0FBQ25GLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxJQUFJLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDckYsaUJBQWlCLENBQUMsWUFBWSxFQUFFLFdBQVcsb0NBQTRCLENBQUM7QUFDeEUsaUJBQWlCLENBQUMsc0JBQXNCLEVBQUUscUJBQXFCLGtDQUEwQixDQUFDO0FBQzFGLGlCQUFpQixDQUFDLGlCQUFpQixFQUFFLElBQUksY0FBYyxDQUFDLGdCQUFnQixFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUUxRixpQkFBaUIsQ0FBQyxzQkFBc0IsRUFBRSx5QkFBeUIsa0NBQTBCLENBQUM7QUFDOUYsaUJBQWlCLENBQUMsb0JBQW9CLEVBQUUsbUJBQW1CLGtDQUEwQixDQUFDO0FBQ3RGLGlCQUFpQixDQUFDLGNBQWMsRUFBRSxtQkFBbUIsa0NBQTBCLENBQUM7QUFDaEYsaUJBQWlCLENBQUMsWUFBWSxFQUFFLFdBQVcsa0NBQTBCLENBQUM7QUFDdEUsaUJBQWlCLENBQUMsdUJBQXVCLEVBQUUsc0JBQXNCLGtDQUEwQixDQUFDO0FBQzVGLGlCQUFpQixDQUFDLHFCQUFxQixFQUFFLHdCQUF3QixrQ0FBMEIsQ0FBQztBQUM1RixpQkFBaUIsQ0FBQyxnQ0FBZ0MsRUFBRSwwQ0FBMEMsa0NBQTBCLENBQUM7QUFDekgsaUJBQWlCLENBQUMsa0JBQWtCLEVBQUUscUJBQXFCLGtDQUEwQixDQUFDIn0=