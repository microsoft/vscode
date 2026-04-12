/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ipcBrowserViewGroupChannelName } from '../common/browserViewGroup.js';
/**
 * Remote proxy for a browser view group living in the main process.
 */
class RemoteBrowserViewGroup extends Disposable {
    constructor(id, groupService) {
        super();
        this.id = id;
        this.groupService = groupService;
        this._register(groupService.onDynamicDidDestroy(this.id)(() => {
            // Avoid loops
            this.dispose(true);
        }));
    }
    get onDidAddView() {
        return this.groupService.onDynamicDidAddView(this.id);
    }
    get onDidRemoveView() {
        return this.groupService.onDynamicDidRemoveView(this.id);
    }
    get onDidDestroy() {
        return this.groupService.onDynamicDidDestroy(this.id);
    }
    async addView(viewId) {
        return this.groupService.addViewToGroup(this.id, viewId);
    }
    async removeView(viewId) {
        return this.groupService.removeViewFromGroup(this.id, viewId);
    }
    async sendCDPMessage(msg) {
        return this.groupService.sendCDPMessage(this.id, msg);
    }
    get onCDPMessage() {
        return this.groupService.onDynamicCDPMessage(this.id);
    }
    dispose(fromService = false) {
        if (!fromService) {
            this.groupService.destroyGroup(this.id);
        }
        super.dispose();
    }
}
export class BrowserViewGroupRemoteService {
    constructor(mainProcessService) {
        this._groups = new Map();
        const channel = mainProcessService.getChannel(ipcBrowserViewGroupChannelName);
        this._groupService = ProxyChannel.toService(channel);
    }
    async createGroup(windowId) {
        const id = await this._groupService.createGroup(windowId);
        return this._wrap(id);
    }
    _wrap(id) {
        const group = new RemoteBrowserViewGroup(id, this._groupService);
        this._groups.set(id, group);
        Event.once(group.onDidDestroy)(() => {
            this._groups.delete(id);
        });
        return group;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdHcm91cFJlbW90ZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyVmlldy9ub2RlL2Jyb3dzZXJWaWV3R3JvdXBSZW1vdGVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN0RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXJFLE9BQU8sRUFBMkUsOEJBQThCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQW9CeEo7O0dBRUc7QUFDSCxNQUFNLHNCQUF1QixTQUFRLFVBQVU7SUFDOUMsWUFDVSxFQUFVLEVBQ0YsWUFBc0M7UUFFdkQsS0FBSyxFQUFFLENBQUM7UUFIQyxPQUFFLEdBQUYsRUFBRSxDQUFRO1FBQ0YsaUJBQVksR0FBWixZQUFZLENBQTBCO1FBSXZELElBQUksQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLEVBQUU7WUFDN0QsY0FBYztZQUNkLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxJQUFJLFlBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRCxJQUFJLGVBQWU7UUFDbEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRUQsSUFBSSxZQUFZO1FBQ2YsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFjO1FBQzNCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRUQsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFjO1FBQzlCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFRCxLQUFLLENBQUMsY0FBYyxDQUFDLEdBQWU7UUFDbkMsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFRCxJQUFJLFlBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFUSxPQUFPLENBQUMsV0FBVyxHQUFHLEtBQUs7UUFDbkMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxZQUFZLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBQ0QsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyw2QkFBNkI7SUFJekMsWUFDQyxrQkFBdUM7UUFIdkIsWUFBTyxHQUFHLElBQUksR0FBRyxFQUE2QixDQUFDO1FBSy9ELE1BQU0sT0FBTyxHQUFHLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxhQUFhLEdBQUcsWUFBWSxDQUFDLFNBQVMsQ0FBMkIsT0FBTyxDQUFDLENBQUM7SUFDaEYsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBZ0I7UUFDakMsTUFBTSxFQUFFLEdBQUcsTUFBTSxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMxRCxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUVPLEtBQUssQ0FBQyxFQUFVO1FBQ3ZCLE1BQU0sS0FBSyxHQUFHLElBQUksc0JBQXNCLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFNUIsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxFQUFFO1lBQ25DLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3pCLENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0NBQ0QifQ==