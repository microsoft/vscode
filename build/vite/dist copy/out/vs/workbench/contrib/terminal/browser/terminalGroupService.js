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
import { timeout } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { TerminalGroup } from './terminalGroup.js';
import { getInstanceFromResource } from './terminalUri.js';
import { TERMINAL_VIEW_ID } from '../common/terminal.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
import { asArray } from '../../../../base/common/arrays.js';
let TerminalGroupService = class TerminalGroupService extends Disposable {
    get instances() {
        return this.groups.reduce((p, c) => p.concat(c.terminalInstances), []);
    }
    constructor(_contextKeyService, _instantiationService, _viewsService, _viewDescriptorService, _quickInputService) {
        super();
        this._contextKeyService = _contextKeyService;
        this._instantiationService = _instantiationService;
        this._viewsService = _viewsService;
        this._viewDescriptorService = _viewDescriptorService;
        this._quickInputService = _quickInputService;
        this.groups = [];
        this.activeGroupIndex = -1;
        this.lastAccessedMenu = 'inline-tab';
        this._isQuickInputOpened = false;
        this._onDidChangeActiveGroup = this._register(new Emitter());
        this.onDidChangeActiveGroup = this._onDidChangeActiveGroup.event;
        this._onDidDisposeGroup = this._register(new Emitter());
        this.onDidDisposeGroup = this._onDidDisposeGroup.event;
        this._onDidChangeGroups = this._register(new Emitter());
        this.onDidChangeGroups = this._onDidChangeGroups.event;
        this._onDidShow = this._register(new Emitter());
        this.onDidShow = this._onDidShow.event;
        this._onDidDisposeInstance = this._register(new Emitter());
        this.onDidDisposeInstance = this._onDidDisposeInstance.event;
        this._onDidFocusInstance = this._register(new Emitter());
        this.onDidFocusInstance = this._onDidFocusInstance.event;
        this._onDidChangeActiveInstance = this._register(new Emitter());
        this.onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
        this._onDidChangeInstances = this._register(new Emitter());
        this.onDidChangeInstances = this._onDidChangeInstances.event;
        this._onDidChangeInstanceCapability = this._register(new Emitter());
        this.onDidChangeInstanceCapability = this._onDidChangeInstanceCapability.event;
        this._onDidChangePanelOrientation = this._register(new Emitter());
        this.onDidChangePanelOrientation = this._onDidChangePanelOrientation.event;
        this._getValidTerminalGroups = (sources) => {
            return new Set(sources
                .map(source => this.getGroupForInstance(source))
                .filter((group) => group !== undefined));
        };
        const terminalGroupCountContextKey = TerminalContextKeys.groupCount.bindTo(this._contextKeyService);
        this._register(Event.runAndSubscribe(this.onDidChangeGroups, () => terminalGroupCountContextKey.set(this.groups.length)));
        const splitTerminalActiveContextKey = TerminalContextKeys.splitTerminalActive.bindTo(this._contextKeyService);
        this._register(Event.runAndSubscribe(this.onDidFocusInstance, () => {
            const activeInstance = this.activeInstance;
            splitTerminalActiveContextKey.set(activeInstance ? this.instanceIsSplit(activeInstance) : false);
        }));
        this._register(this.onDidDisposeGroup(group => this._removeGroup(group)));
        this._register(Event.any(this.onDidChangeActiveGroup, this.onDidChangeInstances)(() => this.updateVisibility()));
        this._register(this._quickInputService.onShow(() => this._isQuickInputOpened = true));
        this._register(this._quickInputService.onHide(() => this._isQuickInputOpened = false));
    }
    hidePanel() {
        // Hide the panel if the terminal is in the panel and it has no sibling views
        const panel = this._viewDescriptorService.getViewContainerByViewId(TERMINAL_VIEW_ID);
        if (panel && this._viewDescriptorService.getViewContainerModel(panel).visibleViewDescriptors.length === 1) {
            this._viewsService.closeView(TERMINAL_VIEW_ID);
            TerminalContextKeys.tabsMouse.bindTo(this._contextKeyService).set(false);
        }
    }
    get activeGroup() {
        if (this.activeGroupIndex < 0 || this.activeGroupIndex >= this.groups.length) {
            return undefined;
        }
        return this.groups[this.activeGroupIndex];
    }
    set activeGroup(value) {
        if (value === undefined) {
            // Setting to undefined is not possible, this can only be done when removing the last group
            return;
        }
        const index = this.groups.findIndex(e => e === value);
        this.setActiveGroupByIndex(index);
    }
    get activeInstance() {
        return this.activeGroup?.activeInstance;
    }
    setActiveInstance(instance) {
        this.setActiveInstanceByIndex(this._getIndexFromId(instance.instanceId));
    }
    _getIndexFromId(terminalId) {
        const terminalIndex = this.instances.findIndex(e => e.instanceId === terminalId);
        if (terminalIndex === -1) {
            throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
        }
        return terminalIndex;
    }
    setContainer(container) {
        this._container = container;
        this.groups.forEach(group => group.attachToElement(container));
    }
    async focusTabs() {
        if (this.instances.length === 0) {
            return;
        }
        await this.showPanel(true);
        const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
        pane?.terminalTabbedView?.focusTabs();
    }
    async focusHover() {
        if (this.instances.length === 0) {
            return;
        }
        const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
        pane?.terminalTabbedView?.focusHover();
    }
    async focusInstance(instance) {
        if (this.instances.includes(instance)) {
            this.setActiveInstance(instance);
        }
        await this.showPanel(true);
    }
    async focusActiveInstance() {
        return this.showPanel(true);
    }
    createGroup(slcOrInstance) {
        const group = this._instantiationService.createInstance(TerminalGroup, this._container, slcOrInstance);
        this.groups.push(group);
        group.addDisposable(Event.forward(group.onPanelOrientationChanged, this._onDidChangePanelOrientation));
        group.addDisposable(Event.forward(group.onDidDisposeInstance, this._onDidDisposeInstance));
        group.addDisposable(Event.forward(group.onDidFocusInstance, this._onDidFocusInstance));
        group.addDisposable(Event.forward(group.onDidChangeInstanceCapability, this._onDidChangeInstanceCapability));
        group.addDisposable(Event.forward(group.onInstancesChanged, this._onDidChangeInstances));
        group.addDisposable(Event.forward(group.onDisposed, this._onDidDisposeGroup));
        group.addDisposable(group.onDidChangeActiveInstance(e => {
            if (group === this.activeGroup) {
                this._onDidChangeActiveInstance.fire(e);
            }
        }));
        if (group.terminalInstances.length > 0) {
            this._onDidChangeInstances.fire();
        }
        if (this.instances.length === 1) {
            // It's the first instance so it should be made active automatically, this must fire
            // after onInstancesChanged so consumers can react to the instance being added first
            this.setActiveInstanceByIndex(0);
        }
        this._onDidChangeGroups.fire();
        return group;
    }
    async showPanel(focus) {
        const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID)
            ?? await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
        pane?.setExpanded(true);
        if (focus) {
            // Do the focus call asynchronously as going through the
            // command palette will force editor focus
            await timeout(0);
            const instance = this.activeInstance;
            if (instance) {
                // HACK: Ensure the panel is still visible at this point as there may have been
                // a request since it was opened to show a different panel
                if (pane && !pane.isVisible()) {
                    await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
                }
                await instance.focusWhenReady(true);
            }
        }
        this._onDidShow.fire();
    }
    getInstanceFromResource(resource) {
        return getInstanceFromResource(this.instances, resource);
    }
    _removeGroup(group) {
        // Get the index of the group and remove it from the list
        const activeGroup = this.activeGroup;
        const wasActiveGroup = group === activeGroup;
        const index = this.groups.indexOf(group);
        if (index !== -1) {
            this.groups.splice(index, 1);
            this._onDidChangeGroups.fire();
        }
        if (wasActiveGroup) {
            // Adjust focus if the group was active
            if (this.groups.length > 0 && !this._isQuickInputOpened) {
                const newIndex = index < this.groups.length ? index : this.groups.length - 1;
                this.setActiveGroupByIndex(newIndex, true);
                if (group.hadFocusOnExit) {
                    this.activeInstance?.focus(true);
                }
            }
        }
        else {
            // Adjust the active group if the removed group was above the active group
            if (this.activeGroupIndex > index) {
                this.setActiveGroupByIndex(this.activeGroupIndex - 1);
            }
        }
        // Ensure the active group is still valid, this should set the activeGroupIndex to -1 if
        // there are no groups
        if (this.activeGroupIndex >= this.groups.length) {
            this.setActiveGroupByIndex(this.groups.length - 1);
        }
        this._onDidChangeInstances.fire();
        this._onDidChangeGroups.fire();
        if (wasActiveGroup) {
            this._onDidChangeActiveGroup.fire(this.activeGroup);
            this._onDidChangeActiveInstance.fire(this.activeInstance);
        }
    }
    /**
     * @param force Whether to force the group change, this should be used when the previous active
     * group has been removed.
     */
    setActiveGroupByIndex(index, force) {
        // Unset active group when the last group is removed
        if (index === -1 && this.groups.length === 0) {
            if (this.activeGroupIndex !== -1) {
                this.activeGroupIndex = -1;
                this._onDidChangeActiveGroup.fire(this.activeGroup);
                this._onDidChangeActiveInstance.fire(this.activeInstance);
            }
            return;
        }
        // Ensure index is valid
        if (index < 0 || index >= this.groups.length) {
            return;
        }
        // Fire group/instance change if needed
        const oldActiveGroup = this.activeGroup;
        this.activeGroupIndex = index;
        if (force || oldActiveGroup !== this.activeGroup) {
            this._onDidChangeActiveGroup.fire(this.activeGroup);
            this._onDidChangeActiveInstance.fire(this.activeInstance);
        }
    }
    _getInstanceLocation(index) {
        let currentGroupIndex = 0;
        while (index >= 0 && currentGroupIndex < this.groups.length) {
            const group = this.groups[currentGroupIndex];
            const count = group.terminalInstances.length;
            if (index < count) {
                return {
                    group,
                    groupIndex: currentGroupIndex,
                    instance: group.terminalInstances[index],
                    instanceIndex: index
                };
            }
            index -= count;
            currentGroupIndex++;
        }
        return undefined;
    }
    setActiveInstanceByIndex(index) {
        const activeInstance = this.activeInstance;
        const instanceLocation = this._getInstanceLocation(index);
        const newActiveInstance = instanceLocation?.group.terminalInstances[instanceLocation.instanceIndex];
        if (!instanceLocation || activeInstance === newActiveInstance) {
            return;
        }
        const activeInstanceIndex = instanceLocation.instanceIndex;
        this.activeGroupIndex = instanceLocation.groupIndex;
        this._onDidChangeActiveGroup.fire(this.activeGroup);
        instanceLocation.group.setActiveInstanceByIndex(activeInstanceIndex, true);
    }
    setActiveGroupToNext() {
        if (this.groups.length <= 1) {
            return;
        }
        let newIndex = this.activeGroupIndex + 1;
        if (newIndex >= this.groups.length) {
            newIndex = 0;
        }
        this.setActiveGroupByIndex(newIndex);
    }
    setActiveGroupToPrevious() {
        if (this.groups.length <= 1) {
            return;
        }
        let newIndex = this.activeGroupIndex - 1;
        if (newIndex < 0) {
            newIndex = this.groups.length - 1;
        }
        this.setActiveGroupByIndex(newIndex);
    }
    moveGroup(source, target) {
        source = asArray(source);
        const sourceGroups = this._getValidTerminalGroups(source);
        const targetGroup = this.getGroupForInstance(target);
        if (!targetGroup || sourceGroups.size === 0) {
            return;
        }
        // The groups are the same, rearrange within the group
        if (sourceGroups.size === 1 && sourceGroups.has(targetGroup)) {
            const targetIndex = targetGroup.terminalInstances.indexOf(target);
            const sortedSources = source.sort((a, b) => {
                return targetGroup.terminalInstances.indexOf(a) - targetGroup.terminalInstances.indexOf(b);
            });
            const firstTargetIndex = targetGroup.terminalInstances.indexOf(sortedSources[0]);
            const position = firstTargetIndex < targetIndex ? 'after' : 'before';
            targetGroup.moveInstance(sortedSources, targetIndex, position);
            this._onDidChangeInstances.fire();
            return;
        }
        // The groups differ, rearrange groups
        const targetGroupIndex = this.groups.indexOf(targetGroup);
        const sortedSourceGroups = Array.from(sourceGroups).sort((a, b) => {
            return this.groups.indexOf(a) - this.groups.indexOf(b);
        });
        const firstSourceGroupIndex = this.groups.indexOf(sortedSourceGroups[0]);
        const position = firstSourceGroupIndex < targetGroupIndex ? 'after' : 'before';
        const insertIndex = position === 'after' ? targetGroupIndex + 1 : targetGroupIndex;
        this.groups.splice(insertIndex, 0, ...sortedSourceGroups);
        for (const sourceGroup of sortedSourceGroups) {
            const originSourceGroupIndex = position === 'after' ? this.groups.indexOf(sourceGroup) : this.groups.lastIndexOf(sourceGroup);
            this.groups.splice(originSourceGroupIndex, 1);
        }
        this._onDidChangeInstances.fire();
    }
    moveGroupToEnd(source) {
        source = asArray(source);
        const sourceGroups = this._getValidTerminalGroups(source);
        if (sourceGroups.size === 0) {
            return;
        }
        const lastInstanceIndex = this.groups.length - 1;
        const sortedSourceGroups = Array.from(sourceGroups).sort((a, b) => {
            return this.groups.indexOf(a) - this.groups.indexOf(b);
        });
        this.groups.splice(lastInstanceIndex + 1, 0, ...sortedSourceGroups);
        for (const sourceGroup of sortedSourceGroups) {
            const sourceGroupIndex = this.groups.indexOf(sourceGroup);
            this.groups.splice(sourceGroupIndex, 1);
        }
        this._onDidChangeInstances.fire();
    }
    moveInstance(source, target, side) {
        const sourceGroup = this.getGroupForInstance(source);
        const targetGroup = this.getGroupForInstance(target);
        if (!sourceGroup || !targetGroup) {
            return;
        }
        // Move from the source group to the target group
        if (sourceGroup !== targetGroup) {
            // Move groups
            sourceGroup.removeInstance(source);
            targetGroup.addInstance(source);
        }
        // Rearrange within the target group
        const index = targetGroup.terminalInstances.indexOf(target) + (side === 'after' ? 1 : 0);
        targetGroup.moveInstance(source, index, side);
    }
    unsplitInstance(instance) {
        const oldGroup = this.getGroupForInstance(instance);
        if (!oldGroup || oldGroup.terminalInstances.length < 2) {
            return;
        }
        oldGroup.removeInstance(instance);
        this.createGroup(instance);
    }
    joinInstances(instances) {
        const group = this.getGroupForInstance(instances[0]);
        if (group) {
            let differentGroups = true;
            for (let i = 1; i < group.terminalInstances.length; i++) {
                if (group.terminalInstances.includes(instances[i])) {
                    differentGroups = false;
                    break;
                }
            }
            if (!differentGroups && group.terminalInstances.length === instances.length) {
                return;
            }
        }
        // Find the group of the first instance that is the only instance in the group, if one exists
        let candidateInstance = undefined;
        let candidateGroup = undefined;
        for (const instance of instances) {
            const group = this.getGroupForInstance(instance);
            if (group?.terminalInstances.length === 1) {
                candidateInstance = instance;
                candidateGroup = group;
                break;
            }
        }
        // Create a new group if needed
        if (!candidateGroup) {
            candidateGroup = this.createGroup();
        }
        const wasActiveGroup = this.activeGroup === candidateGroup;
        // Unsplit all other instances and add them to the new group
        for (const instance of instances) {
            if (instance === candidateInstance) {
                continue;
            }
            const oldGroup = this.getGroupForInstance(instance);
            if (!oldGroup) {
                // Something went wrong, don't join this one
                continue;
            }
            oldGroup.removeInstance(instance);
            candidateGroup.addInstance(instance);
        }
        // Set the active terminal
        this.setActiveInstance(instances[0]);
        // Fire events
        this._onDidChangeInstances.fire();
        if (!wasActiveGroup) {
            this._onDidChangeActiveGroup.fire(this.activeGroup);
        }
    }
    instanceIsSplit(instance) {
        const group = this.getGroupForInstance(instance);
        if (!group) {
            return false;
        }
        return group.terminalInstances.length > 1;
    }
    getGroupForInstance(instance) {
        return this.groups.find(group => group.terminalInstances.includes(instance));
    }
    getGroupLabels() {
        return this.groups.filter(group => group.terminalInstances.length > 0).map((group, index) => {
            return `${index + 1}: ${group.title ? group.title : ''}`;
        });
    }
    /**
     * Visibility should be updated in the following cases:
     * 1. Toggle `TERMINAL_VIEW_ID` visibility
     * 2. Change active group
     * 3. Change instances in active group
     */
    updateVisibility() {
        const visible = this._viewsService.isViewVisible(TERMINAL_VIEW_ID);
        this.groups.forEach((g, i) => g.setVisible(visible && i === this.activeGroupIndex));
    }
};
TerminalGroupService = __decorate([
    __param(0, IContextKeyService),
    __param(1, IInstantiationService),
    __param(2, IViewsService),
    __param(3, IViewDescriptorService),
    __param(4, IQuickInputService)
], TerminalGroupService);
export { TerminalGroupService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxHcm91cFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUVuRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNsRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFL0UsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ25ELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBRTNELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUdyRCxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLFVBQVU7SUFLbkQsSUFBSSxTQUFTO1FBQ1osT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBeUIsQ0FBQyxDQUFDO0lBQy9GLENBQUM7SUErQkQsWUFDcUIsa0JBQThDLEVBQzNDLHFCQUE2RCxFQUNyRSxhQUE2QyxFQUNwQyxzQkFBK0QsRUFDbkUsa0JBQXVEO1FBRTNFLEtBQUssRUFBRSxDQUFDO1FBTm9CLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDMUIsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUNwRCxrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUNuQiwyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXdCO1FBQ2xELHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUF4QzVFLFdBQU0sR0FBcUIsRUFBRSxDQUFDO1FBQzlCLHFCQUFnQixHQUFXLENBQUMsQ0FBQyxDQUFDO1FBSzlCLHFCQUFnQixHQUE4QixZQUFZLENBQUM7UUFJbkQsd0JBQW1CLEdBQVksS0FBSyxDQUFDO1FBRTVCLDRCQUF1QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQThCLENBQUMsQ0FBQztRQUM1RiwyQkFBc0IsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxDQUFDO1FBQ3BELHVCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWtCLENBQUMsQ0FBQztRQUMzRSxzQkFBaUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO1FBQzFDLHVCQUFrQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ2pFLHNCQUFpQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUM7UUFDMUMsZUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ3pELGNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQztRQUUxQiwwQkFBcUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFxQixDQUFDLENBQUM7UUFDakYseUJBQW9CLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQztRQUNoRCx3QkFBbUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFxQixDQUFDLENBQUM7UUFDL0UsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQztRQUM1QywrQkFBMEIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFpQyxDQUFDLENBQUM7UUFDbEcsOEJBQXlCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQztRQUMxRCwwQkFBcUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUNwRSx5QkFBb0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDO1FBQ2hELG1DQUE4QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXFCLENBQUMsQ0FBQztRQUMxRixrQ0FBNkIsR0FBRyxJQUFJLENBQUMsOEJBQThCLENBQUMsS0FBSyxDQUFDO1FBRWxFLGlDQUE0QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQWUsQ0FBQyxDQUFDO1FBQ2xGLGdDQUEyQixHQUFHLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxLQUFLLENBQUM7UUFvUnZFLDRCQUF1QixHQUFHLENBQUMsT0FBNEIsRUFBdUIsRUFBRTtZQUN2RixPQUFPLElBQUksR0FBRyxDQUNiLE9BQU87aUJBQ0wsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDO2lCQUMvQyxNQUFNLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssS0FBSyxTQUFTLENBQUMsQ0FDeEMsQ0FBQztRQUNILENBQUMsQ0FBQztRQS9RRCxNQUFNLDRCQUE0QixHQUFHLG1CQUFtQixDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDcEcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFMUgsTUFBTSw2QkFBNkIsR0FBRyxtQkFBbUIsQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDOUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLEVBQUU7WUFDbEUsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztZQUMzQyw2QkFBNkIsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNqSCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDdEYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3hGLENBQUM7SUFFRCxTQUFTO1FBQ1IsNkVBQTZFO1FBQzdFLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyx3QkFBd0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3JGLElBQUksS0FBSyxJQUFJLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDM0csSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztZQUMvQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxRSxDQUFDO0lBQ0YsQ0FBQztJQUVELElBQUksV0FBVztRQUNkLElBQUksSUFBSSxDQUFDLGdCQUFnQixHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM5RSxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFDRCxJQUFJLFdBQVcsQ0FBQyxLQUFpQztRQUNoRCxJQUFJLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUN6QiwyRkFBMkY7WUFDM0YsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELElBQUksY0FBYztRQUNqQixPQUFPLElBQUksQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDO0lBQ3pDLENBQUM7SUFFRCxpQkFBaUIsQ0FBQyxRQUEyQjtRQUM1QyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUMxRSxDQUFDO0lBRU8sZUFBZSxDQUFDLFVBQWtCO1FBQ3pDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsS0FBSyxVQUFVLENBQUMsQ0FBQztRQUNqRixJQUFJLGFBQWEsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzFCLE1BQU0sSUFBSSxLQUFLLENBQUMsb0JBQW9CLFVBQVUsaURBQWlELENBQUMsQ0FBQztRQUNsRyxDQUFDO1FBQ0QsT0FBTyxhQUFhLENBQUM7SUFDdEIsQ0FBQztJQUVELFlBQVksQ0FBQyxTQUFzQjtRQUNsQyxJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztRQUM1QixJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBRUQsS0FBSyxDQUFDLFNBQVM7UUFDZCxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzNCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsbUJBQW1CLENBQW1CLGdCQUFnQixDQUFDLENBQUM7UUFDeEYsSUFBSSxFQUFFLGtCQUFrQixFQUFFLFNBQVMsRUFBRSxDQUFDO0lBQ3ZDLENBQUM7SUFFRCxLQUFLLENBQUMsVUFBVTtRQUNmLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDakMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLG1CQUFtQixDQUFtQixnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3hGLElBQUksRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRUQsS0FBSyxDQUFDLGFBQWEsQ0FBQyxRQUEyQjtRQUM5QyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDdkMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFDRCxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUVELEtBQUssQ0FBQyxtQkFBbUI7UUFDeEIsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFRCxXQUFXLENBQUMsYUFBc0Q7UUFDakUsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUN2RyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QixLQUFLLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLHlCQUF5QixFQUFFLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDLENBQUM7UUFDdkcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQzNGLEtBQUssQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQztRQUN2RixLQUFLLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixFQUFFLElBQUksQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUM7UUFDN0csS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQ3pGLEtBQUssQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFDOUUsS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDdkQsSUFBSSxLQUFLLEtBQUssSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUNoQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3hDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNuQyxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxvRkFBb0Y7WUFDcEYsb0ZBQW9GO1lBQ3BGLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQy9CLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELEtBQUssQ0FBQyxTQUFTLENBQUMsS0FBZTtRQUM5QixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixDQUFDO2VBQ2pFLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0QsSUFBSSxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUV4QixJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1gsd0RBQXdEO1lBQ3hELDBDQUEwQztZQUMxQyxNQUFNLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDO1lBQ3JDLElBQUksUUFBUSxFQUFFLENBQUM7Z0JBQ2QsK0VBQStFO2dCQUMvRSwwREFBMEQ7Z0JBQzFELElBQUksSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUM7b0JBQy9CLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQzVELENBQUM7Z0JBQ0QsTUFBTSxRQUFRLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3JDLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN4QixDQUFDO0lBRUQsdUJBQXVCLENBQUMsUUFBeUI7UUFDaEQsT0FBTyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFTyxZQUFZLENBQUMsS0FBcUI7UUFDekMseURBQXlEO1FBQ3pELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDckMsTUFBTSxjQUFjLEdBQUcsS0FBSyxLQUFLLFdBQVcsQ0FBQztRQUM3QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN6QyxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM3QixJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDaEMsQ0FBQztRQUVELElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsdUNBQXVDO1lBQ3ZDLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7Z0JBQ3pELE1BQU0sUUFBUSxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7Z0JBQzdFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUM7Z0JBQzNDLElBQUksS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO29CQUMxQixJQUFJLENBQUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDbEMsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO2FBQU0sQ0FBQztZQUNQLDBFQUEwRTtZQUMxRSxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLEVBQUUsQ0FBQztnQkFDbkMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN2RCxDQUFDO1FBQ0YsQ0FBQztRQUNELHdGQUF3RjtRQUN4RixzQkFBc0I7UUFDdEIsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNqRCxJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDcEQsQ0FBQztRQUVELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDL0IsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNwQixJQUFJLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNwRCxJQUFJLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0YsQ0FBQztJQUVEOzs7T0FHRztJQUNILHFCQUFxQixDQUFDLEtBQWEsRUFBRSxLQUFlO1FBQ25ELG9EQUFvRDtRQUNwRCxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM5QyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO2dCQUNwRCxJQUFJLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUMzRCxDQUFDO1lBQ0QsT0FBTztRQUNSLENBQUM7UUFFRCx3QkFBd0I7UUFDeEIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxJQUFJLEtBQUssSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzlDLE9BQU87UUFDUixDQUFDO1FBRUQsdUNBQXVDO1FBQ3ZDLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDeEMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUM5QixJQUFJLEtBQUssSUFBSSxjQUFjLEtBQUssSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2xELElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3BELElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzNELENBQUM7SUFDRixDQUFDO0lBRU8sb0JBQW9CLENBQUMsS0FBYTtRQUN6QyxJQUFJLGlCQUFpQixHQUFHLENBQUMsQ0FBQztRQUMxQixPQUFPLEtBQUssSUFBSSxDQUFDLElBQUksaUJBQWlCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM3RCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDN0MsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQztZQUM3QyxJQUFJLEtBQUssR0FBRyxLQUFLLEVBQUUsQ0FBQztnQkFDbkIsT0FBTztvQkFDTixLQUFLO29CQUNMLFVBQVUsRUFBRSxpQkFBaUI7b0JBQzdCLFFBQVEsRUFBRSxLQUFLLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDO29CQUN4QyxhQUFhLEVBQUUsS0FBSztpQkFDcEIsQ0FBQztZQUNILENBQUM7WUFDRCxLQUFLLElBQUksS0FBSyxDQUFDO1lBQ2YsaUJBQWlCLEVBQUUsQ0FBQztRQUNyQixDQUFDO1FBQ0QsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELHdCQUF3QixDQUFDLEtBQWE7UUFDckMsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztRQUMzQyxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxRCxNQUFNLGlCQUFpQixHQUFHLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNwRyxJQUFJLENBQUMsZ0JBQWdCLElBQUksY0FBYyxLQUFLLGlCQUFpQixFQUFFLENBQUM7WUFDL0QsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLG1CQUFtQixHQUFHLGdCQUFnQixDQUFDLGFBQWEsQ0FBQztRQUUzRCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDO1FBQ3BELElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3BELGdCQUFnQixDQUFDLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRUQsb0JBQW9CO1FBQ25CLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDN0IsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDO1FBQ3pDLElBQUksUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDcEMsUUFBUSxHQUFHLENBQUMsQ0FBQztRQUNkLENBQUM7UUFDRCxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVELHdCQUF3QjtRQUN2QixJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzdCLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQztRQUN6QyxJQUFJLFFBQVEsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNsQixRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ25DLENBQUM7UUFDRCxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQVVELFNBQVMsQ0FBQyxNQUF1QyxFQUFFLE1BQXlCO1FBQzNFLE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDekIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsV0FBVyxJQUFJLFlBQVksQ0FBQyxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0MsT0FBTztRQUNSLENBQUM7UUFFRCxzREFBc0Q7UUFDdEQsSUFBSSxZQUFZLENBQUMsSUFBSSxLQUFLLENBQUMsSUFBSSxZQUFZLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUM7WUFDOUQsTUFBTSxXQUFXLEdBQUcsV0FBVyxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsRSxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUMxQyxPQUFPLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1RixDQUFDLENBQUMsQ0FBQztZQUNILE1BQU0sZ0JBQWdCLEdBQUcsV0FBVyxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqRixNQUFNLFFBQVEsR0FBdUIsZ0JBQWdCLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQztZQUN6RixXQUFXLENBQUMsWUFBWSxDQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDL0QsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2xDLE9BQU87UUFDUixDQUFDO1FBRUQsc0NBQXNDO1FBQ3RDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDMUQsTUFBTSxrQkFBa0IsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNqRSxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hELENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLE1BQU0sUUFBUSxHQUF1QixxQkFBcUIsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7UUFDbkcsTUFBTSxXQUFXLEdBQUcsUUFBUSxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQztRQUNuRixJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxFQUFFLEdBQUcsa0JBQWtCLENBQUMsQ0FBQztRQUMxRCxLQUFLLE1BQU0sV0FBVyxJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDOUMsTUFBTSxzQkFBc0IsR0FBRyxRQUFRLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDOUgsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0MsQ0FBQztRQUNELElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRUQsY0FBYyxDQUFDLE1BQXVDO1FBQ3JELE1BQU0sR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDekIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzFELElBQUksWUFBWSxDQUFDLElBQUksS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM3QixPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDakUsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RCxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGlCQUFpQixHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3BFLEtBQUssTUFBTSxXQUFXLElBQUksa0JBQWtCLEVBQUUsQ0FBQztZQUM5QyxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzFELElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLENBQUM7UUFDRCxJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDbkMsQ0FBQztJQUVELFlBQVksQ0FBQyxNQUF5QixFQUFFLE1BQXlCLEVBQUUsSUFBd0I7UUFDMUYsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsV0FBVyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbEMsT0FBTztRQUNSLENBQUM7UUFFRCxpREFBaUQ7UUFDakQsSUFBSSxXQUFXLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDakMsY0FBYztZQUNkLFdBQVcsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDbkMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBRUQsb0NBQW9DO1FBQ3BDLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pGLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUQsZUFBZSxDQUFDLFFBQTJCO1FBQzFDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDeEQsT0FBTztRQUNSLENBQUM7UUFFRCxRQUFRLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUIsQ0FBQztJQUVELGFBQWEsQ0FBQyxTQUE4QjtRQUMzQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUNYLElBQUksZUFBZSxHQUFHLElBQUksQ0FBQztZQUMzQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN6RCxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztvQkFDcEQsZUFBZSxHQUFHLEtBQUssQ0FBQztvQkFDeEIsTUFBTTtnQkFDUCxDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksQ0FBQyxlQUFlLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sS0FBSyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7Z0JBQzdFLE9BQU87WUFDUixDQUFDO1FBQ0YsQ0FBQztRQUNELDZGQUE2RjtRQUM3RixJQUFJLGlCQUFpQixHQUFrQyxTQUFTLENBQUM7UUFDakUsSUFBSSxjQUFjLEdBQStCLFNBQVMsQ0FBQztRQUMzRCxLQUFLLE1BQU0sUUFBUSxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2xDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNqRCxJQUFJLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQzNDLGlCQUFpQixHQUFHLFFBQVEsQ0FBQztnQkFDN0IsY0FBYyxHQUFHLEtBQUssQ0FBQztnQkFDdkIsTUFBTTtZQUNQLENBQUM7UUFDRixDQUFDO1FBRUQsK0JBQStCO1FBQy9CLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQixjQUFjLEdBQUcsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3JDLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsV0FBVyxLQUFLLGNBQWMsQ0FBQztRQUUzRCw0REFBNEQ7UUFDNUQsS0FBSyxNQUFNLFFBQVEsSUFBSSxTQUFTLEVBQUUsQ0FBQztZQUNsQyxJQUFJLFFBQVEsS0FBSyxpQkFBaUIsRUFBRSxDQUFDO2dCQUNwQyxTQUFTO1lBQ1YsQ0FBQztZQUVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNwRCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ2YsNENBQTRDO2dCQUM1QyxTQUFTO1lBQ1YsQ0FBQztZQUNELFFBQVEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDbEMsY0FBYyxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBRUQsMEJBQTBCO1FBQzFCLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVyQyxjQUFjO1FBQ2QsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNyQixJQUFJLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNyRCxDQUFDO0lBQ0YsQ0FBQztJQUVELGVBQWUsQ0FBQyxRQUEyQjtRQUMxQyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsbUJBQW1CLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUMsaUJBQWlCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBRUQsbUJBQW1CLENBQUMsUUFBMkI7UUFDOUMsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztJQUM5RSxDQUFDO0lBRUQsY0FBYztRQUNiLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsaUJBQWlCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUMzRixPQUFPLEdBQUcsS0FBSyxHQUFHLENBQUMsS0FBSyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUMxRCxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILGdCQUFnQjtRQUNmLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDbkUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLE9BQU8sSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztJQUNyRixDQUFDO0NBQ0QsQ0FBQTtBQTFlWSxvQkFBb0I7SUF1QzlCLFdBQUEsa0JBQWtCLENBQUE7SUFDbEIsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsc0JBQXNCLENBQUE7SUFDdEIsV0FBQSxrQkFBa0IsQ0FBQTtHQTNDUixvQkFBb0IsQ0EwZWhDIn0=