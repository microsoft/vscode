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
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { BrowserViewGroup } from './browserViewGroup.js';
export const IBrowserViewGroupMainService = createDecorator('browserViewGroupMainService');
/**
 * Main-process service that manages {@link BrowserViewGroup} instances.
 *
 * Implements {@link IBrowserViewGroupService} so it can be surfaced to
 * the workbench/shared process via {@link ProxyChannel}.
 */
let BrowserViewGroupMainService = class BrowserViewGroupMainService extends Disposable {
    constructor(instantiationService) {
        super();
        this.instantiationService = instantiationService;
        this.groups = this._register(new DisposableMap());
    }
    async createGroup(windowId) {
        const id = generateUuid();
        const group = this.instantiationService.createInstance(BrowserViewGroup, id, windowId);
        this.groups.set(id, group);
        // Auto-cleanup when the group disposes itself
        Event.once(group.onDidDestroy)(() => {
            this.groups.deleteAndLeak(id);
        });
        return id;
    }
    async destroyGroup(groupId) {
        this.groups.deleteAndDispose(groupId);
    }
    async addViewToGroup(groupId, viewId) {
        return this._getGroup(groupId).addView(viewId);
    }
    async removeViewFromGroup(groupId, viewId) {
        return this._getGroup(groupId).removeView(viewId);
    }
    async sendCDPMessage(groupId, message) {
        return this._getGroup(groupId).debugger.sendMessage(message);
    }
    onDynamicDidAddView(groupId) {
        return this._getGroup(groupId).onDidAddView;
    }
    onDynamicDidRemoveView(groupId) {
        return this._getGroup(groupId).onDidRemoveView;
    }
    onDynamicDidDestroy(groupId) {
        return this._getGroup(groupId).onDidDestroy;
    }
    onDynamicCDPMessage(groupId) {
        return this._getGroup(groupId).debugger.onMessage;
    }
    /**
     * Get a group or throw if not found.
     */
    _getGroup(groupId) {
        const group = this.groups.get(groupId);
        if (!group) {
            throw new Error(`Browser view group ${groupId} not found`);
        }
        return group;
    }
};
BrowserViewGroupMainService = __decorate([
    __param(0, IInstantiationService)
], BrowserViewGroupMainService);
export { BrowserViewGroupMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdHcm91cE1haW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYnJvd3NlclZpZXcvZWxlY3Ryb24tbWFpbi9icm93c2VyVmlld0dyb3VwTWFpblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUd6RCxNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBRyxlQUFlLENBQStCLDZCQUE2QixDQUFDLENBQUM7QUFNekg7Ozs7O0dBS0c7QUFDSSxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUE0QixTQUFRLFVBQVU7SUFLMUQsWUFDd0Isb0JBQTREO1FBRW5GLEtBQUssRUFBRSxDQUFDO1FBRmdDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFIbkUsV0FBTSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQTRCLENBQUMsQ0FBQztJQU14RixDQUFDO0lBRUQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFnQjtRQUNqQyxNQUFNLEVBQUUsR0FBRyxZQUFZLEVBQUUsQ0FBQztRQUMxQixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGdCQUFnQixFQUFFLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUN2RixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFM0IsOENBQThDO1FBQzlDLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsRUFBRTtZQUNuQyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvQixDQUFDLENBQUMsQ0FBQztRQUVILE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZLENBQUMsT0FBZTtRQUNqQyxJQUFJLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQWUsRUFBRSxNQUFjO1FBQ25ELE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxPQUFlLEVBQUUsTUFBYztRQUN4RCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxLQUFLLENBQUMsY0FBYyxDQUFDLE9BQWUsRUFBRSxPQUFtQjtRQUN4RCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUM5RCxDQUFDO0lBRUQsbUJBQW1CLENBQUMsT0FBZTtRQUNsQyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsWUFBWSxDQUFDO0lBQzdDLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxPQUFlO1FBQ3JDLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxlQUFlLENBQUM7SUFDaEQsQ0FBQztJQUVELG1CQUFtQixDQUFDLE9BQWU7UUFDbEMsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFlBQVksQ0FBQztJQUM3QyxDQUFDO0lBRUQsbUJBQW1CLENBQUMsT0FBZTtRQUNsQyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQztJQUNuRCxDQUFDO0lBRUQ7O09BRUc7SUFDSyxTQUFTLENBQUMsT0FBZTtRQUNoQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixPQUFPLFlBQVksQ0FBQyxDQUFDO1FBQzVELENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7Q0FDRCxDQUFBO0FBbEVZLDJCQUEyQjtJQU1yQyxXQUFBLHFCQUFxQixDQUFBO0dBTlgsMkJBQTJCLENBa0V2QyJ9