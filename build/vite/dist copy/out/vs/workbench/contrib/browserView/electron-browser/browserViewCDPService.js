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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ipcBrowserViewGroupChannelName } from '../../../../platform/browserView/common/browserViewGroup.js';
import { BrowserViewUri } from '../../../../platform/browserView/common/browserViewUri.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
let BrowserViewCDPService = class BrowserViewCDPService extends Disposable {
    constructor(mainProcessService, editorService, editorGroupsService) {
        super();
        this.editorService = editorService;
        this.editorGroupsService = editorGroupsService;
        const channel = mainProcessService.getChannel(ipcBrowserViewGroupChannelName);
        this._groupService = ProxyChannel.toService(channel);
    }
    async createSessionGroup(browserId) {
        const windowId = this._getWindowIdForBrowser(browserId);
        const groupId = await this._groupService.createGroup(windowId);
        await this._groupService.addViewToGroup(groupId, browserId);
        return groupId;
    }
    async destroySessionGroup(groupId) {
        await this._groupService.destroyGroup(groupId);
    }
    async sendCDPMessage(groupId, message) {
        await this._groupService.sendCDPMessage(groupId, message);
    }
    onCDPMessage(groupId) {
        return this._groupService.onDynamicCDPMessage(groupId);
    }
    onDidDestroy(groupId) {
        return this._groupService.onDynamicDidDestroy(groupId);
    }
    _getWindowIdForBrowser(browserId) {
        const browserUri = BrowserViewUri.forId(browserId);
        const editors = this.editorService.findEditors(browserUri);
        if (editors.length > 0) {
            const group = this.editorGroupsService.getGroup(editors[0].groupId);
            if (group) {
                return group.windowId;
            }
        }
        // Fall back to main window
        return this.editorGroupsService.mainPart.windowId;
    }
};
BrowserViewCDPService = __decorate([
    __param(0, IMainProcessService),
    __param(1, IEditorService),
    __param(2, IEditorGroupsService)
], BrowserViewCDPService);
export { BrowserViewCDPService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdDRFBTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci9icm93c2VyVmlld0NEUFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUV4RSxPQUFPLEVBQTRCLDhCQUE4QixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDdkksT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBRTVGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUV2RixJQUFNLHFCQUFxQixHQUEzQixNQUFNLHFCQUFzQixTQUFRLFVBQVU7SUFLcEQsWUFDc0Isa0JBQXVDLEVBQzNCLGFBQTZCLEVBQ3ZCLG1CQUF5QztRQUVoRixLQUFLLEVBQUUsQ0FBQztRQUh5QixrQkFBYSxHQUFiLGFBQWEsQ0FBZ0I7UUFDdkIsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFzQjtRQUdoRixNQUFNLE9BQU8sR0FBRyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsYUFBYSxHQUFHLFlBQVksQ0FBQyxTQUFTLENBQTJCLE9BQU8sQ0FBQyxDQUFDO0lBQ2hGLENBQUM7SUFFRCxLQUFLLENBQUMsa0JBQWtCLENBQUMsU0FBaUI7UUFDekMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3hELE1BQU0sT0FBTyxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDL0QsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUQsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxPQUFlO1FBQ3hDLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBZSxFQUFFLE9BQW1CO1FBQ3hELE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxZQUFZLENBQUMsT0FBZTtRQUMzQixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDeEQsQ0FBQztJQUVELFlBQVksQ0FBQyxPQUFlO1FBQzNCLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBRU8sc0JBQXNCLENBQUMsU0FBaUI7UUFDL0MsTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNuRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzRCxJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDeEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDcEUsSUFBSSxLQUFLLEVBQUUsQ0FBQztnQkFDWCxPQUFPLEtBQUssQ0FBQyxRQUFRLENBQUM7WUFDdkIsQ0FBQztRQUNGLENBQUM7UUFDRCwyQkFBMkI7UUFDM0IsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQztJQUNuRCxDQUFDO0NBQ0QsQ0FBQTtBQWxEWSxxQkFBcUI7SUFNL0IsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLGNBQWMsQ0FBQTtJQUNkLFdBQUEsb0JBQW9CLENBQUE7R0FSVixxQkFBcUIsQ0FrRGpDIn0=