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
import { mainWindow } from '../../../../base/browser/window.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IPlaywrightService } from '../../../../platform/browserView/common/playwrightService.js';
import { registerSharedProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../platform/log/common/log.js';
let PlaywrightChannelClient = class PlaywrightChannelClient {
    constructor(channel, logService) {
        /**
         * send the current window's ID once via `__initialize`, so the server-side {@link PlaywrightChannel}
         * can create a per-window {@link PlaywrightWindowInstance}. All subsequent calls and events are proxied directly.
         */
        void channel.call('__initialize', mainWindow.vscodeWindowId).catch((e) => {
            logService.error(`Failed to initialize Playwright service`, e);
        });
        return ProxyChannel.toService(channel);
    }
};
PlaywrightChannelClient = __decorate([
    __param(1, ILogService)
], PlaywrightChannelClient);
registerSharedProcessRemoteService(IPlaywrightService, 'playwright', { channelClientCtor: PlaywrightChannelClient });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheXdyaWdodFdvcmtiZW5jaFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci9wbGF5d3JpZ2h0V29ya2JlbmNoU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDaEUsT0FBTyxFQUFZLFlBQVksRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzNHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVyRSxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF1QjtJQUM1QixZQUNDLE9BQWlCLEVBQ0osVUFBdUI7UUFFcEM7OztXQUdHO1FBQ0gsS0FBSyxPQUFPLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDeEUsVUFBVSxDQUFDLEtBQUssQ0FBQyx5Q0FBeUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRSxDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sWUFBWSxDQUFDLFNBQVMsQ0FBcUIsT0FBTyxDQUFDLENBQUM7SUFDNUQsQ0FBQztDQUNELENBQUE7QUFkSyx1QkFBdUI7SUFHMUIsV0FBQSxXQUFXLENBQUE7R0FIUix1QkFBdUIsQ0FjNUI7QUFFRCxrQ0FBa0MsQ0FBQyxrQkFBa0IsRUFBRSxZQUFZLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSx1QkFBdUIsRUFBRSxDQUFDLENBQUMifQ==