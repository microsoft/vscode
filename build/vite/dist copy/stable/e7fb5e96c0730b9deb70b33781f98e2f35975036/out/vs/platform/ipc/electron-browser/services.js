/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { SyncDescriptor } from '../../instantiation/common/descriptors.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { IMainProcessService } from '../common/mainProcessService.js';
class RemoteServiceStub {
    constructor(channelName, options, remote, instantiationService) {
        const channel = remote.getChannel(channelName);
        if (isRemoteServiceWithChannelClientOptions(options)) {
            return instantiationService.createInstance(new SyncDescriptor(options.channelClientCtor, [channel]));
        }
        return ProxyChannel.toService(channel, options?.proxyOptions);
    }
}
function isRemoteServiceWithChannelClientOptions(obj) {
    const candidate = obj;
    return !!candidate?.channelClientCtor;
}
//#region Main Process
let MainProcessRemoteServiceStub = class MainProcessRemoteServiceStub extends RemoteServiceStub {
    constructor(channelName, options, ipcService, instantiationService) {
        super(channelName, options, ipcService, instantiationService);
    }
};
MainProcessRemoteServiceStub = __decorate([
    __param(2, IMainProcessService),
    __param(3, IInstantiationService)
], MainProcessRemoteServiceStub);
export function registerMainProcessRemoteService(id, channelName, options) {
    registerSingleton(id, new SyncDescriptor(MainProcessRemoteServiceStub, [channelName, options], true));
}
//#endregion
//#region Shared Process
export const ISharedProcessService = createDecorator('sharedProcessService');
let SharedProcessRemoteServiceStub = class SharedProcessRemoteServiceStub extends RemoteServiceStub {
    constructor(channelName, options, ipcService, instantiationService) {
        super(channelName, options, ipcService, instantiationService);
    }
};
SharedProcessRemoteServiceStub = __decorate([
    __param(2, ISharedProcessService),
    __param(3, IInstantiationService)
], SharedProcessRemoteServiceStub);
export function registerSharedProcessRemoteService(id, channelName, options) {
    registerSingleton(id, new SyncDescriptor(SharedProcessRemoteServiceStub, [channelName, options], true));
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9pcGMvZWxlY3Ryb24tYnJvd3Nlci9zZXJ2aWNlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQVksWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxlQUFlLEVBQUUscUJBQXFCLEVBQXFCLE1BQU0sNkNBQTZDLENBQUM7QUFDeEgsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFPdEUsTUFBZSxpQkFBaUI7SUFDL0IsWUFDQyxXQUFtQixFQUNuQixPQUErRixFQUMvRixNQUFjLEVBQ2Qsb0JBQTJDO1FBRTNDLE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUM7UUFFL0MsSUFBSSx1Q0FBdUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ3RELE9BQU8sb0JBQW9CLENBQUMsY0FBYyxDQUFDLElBQUksY0FBYyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RyxDQUFDO1FBRUQsT0FBTyxZQUFZLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDL0QsQ0FBQztDQUNEO0FBVUQsU0FBUyx1Q0FBdUMsQ0FBSSxHQUFZO0lBQy9ELE1BQU0sU0FBUyxHQUFHLEdBQTRELENBQUM7SUFFL0UsT0FBTyxDQUFDLENBQUMsU0FBUyxFQUFFLGlCQUFpQixDQUFDO0FBQ3ZDLENBQUM7QUFFRCxzQkFBc0I7QUFFdEIsSUFBTSw0QkFBNEIsR0FBbEMsTUFBTSw0QkFBK0MsU0FBUSxpQkFBb0I7SUFDaEYsWUFBWSxXQUFtQixFQUFFLE9BQStGLEVBQXVCLFVBQStCLEVBQXlCLG9CQUEyQztRQUN6UCxLQUFLLENBQUMsV0FBVyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztJQUMvRCxDQUFDO0NBQ0QsQ0FBQTtBQUpLLDRCQUE0QjtJQUNrRyxXQUFBLG1CQUFtQixDQUFBO0lBQW1DLFdBQUEscUJBQXFCLENBQUE7R0FEek0sNEJBQTRCLENBSWpDO0FBRUQsTUFBTSxVQUFVLGdDQUFnQyxDQUFJLEVBQXdCLEVBQUUsV0FBbUIsRUFBRSxPQUFvRjtJQUN0TCxpQkFBaUIsQ0FBQyxFQUFFLEVBQUUsSUFBSSxjQUFjLENBQUMsNEJBQTRCLEVBQUUsQ0FBQyxXQUFXLEVBQUUsT0FBTyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztBQUN2RyxDQUFDO0FBRUQsWUFBWTtBQUVaLHdCQUF3QjtBQUV4QixNQUFNLENBQUMsTUFBTSxxQkFBcUIsR0FBRyxlQUFlLENBQXdCLHNCQUFzQixDQUFDLENBQUM7QUFvQnBHLElBQU0sOEJBQThCLEdBQXBDLE1BQU0sOEJBQWlELFNBQVEsaUJBQW9CO0lBQ2xGLFlBQVksV0FBbUIsRUFBRSxPQUErRixFQUF5QixVQUFpQyxFQUF5QixvQkFBMkM7UUFDN1AsS0FBSyxDQUFDLFdBQVcsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFDL0QsQ0FBQztDQUNELENBQUE7QUFKSyw4QkFBOEI7SUFDZ0csV0FBQSxxQkFBcUIsQ0FBQTtJQUFxQyxXQUFBLHFCQUFxQixDQUFBO0dBRDdNLDhCQUE4QixDQUluQztBQUVELE1BQU0sVUFBVSxrQ0FBa0MsQ0FBSSxFQUF3QixFQUFFLFdBQW1CLEVBQUUsT0FBb0Y7SUFDeEwsaUJBQWlCLENBQUMsRUFBRSxFQUFFLElBQUksY0FBYyxDQUFDLDhCQUE4QixFQUFFLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDekcsQ0FBQztBQUVELFlBQVkifQ==