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
import { diffSets } from '../../../base/common/collections.js';
import { Emitter } from '../../../base/common/event.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { MainContext } from './extHost.protocol.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import * as typeConverters from './extHostTypeConverters.js';
import { ChatEditorTabInput, CustomEditorTabInput, InteractiveWindowInput, NotebookDiffEditorTabInput, NotebookEditorTabInput, TerminalEditorTabInput, TextDiffTabInput, TextMergeTabInput, TextTabInput, WebviewEditorTabInput, TextMultiDiffTabInput } from './extHostTypes.js';
export const IExtHostEditorTabs = createDecorator('IExtHostEditorTabs');
class ExtHostEditorTab {
    constructor(dto, parentGroup, activeTabIdGetter) {
        this._activeTabIdGetter = activeTabIdGetter;
        this._parentGroup = parentGroup;
        this.acceptDtoUpdate(dto);
    }
    get apiObject() {
        if (!this._apiObject) {
            // Don't want to lose reference to parent `this` in the getters
            const that = this;
            const obj = {
                get isActive() {
                    // We use a getter function here to always ensure at most 1 active tab per group and prevent iteration for being required
                    return that._dto.id === that._activeTabIdGetter();
                },
                get label() {
                    return that._dto.label;
                },
                get input() {
                    return that._input;
                },
                get isDirty() {
                    return that._dto.isDirty;
                },
                get isPinned() {
                    return that._dto.isPinned;
                },
                get isPreview() {
                    return that._dto.isPreview;
                },
                get group() {
                    return that._parentGroup.apiObject;
                }
            };
            this._apiObject = Object.freeze(obj);
        }
        return this._apiObject;
    }
    get tabId() {
        return this._dto.id;
    }
    acceptDtoUpdate(dto) {
        this._dto = dto;
        this._input = this._initInput();
    }
    _initInput() {
        switch (this._dto.input.kind) {
            case 1 /* TabInputKind.TextInput */:
                return new TextTabInput(URI.revive(this._dto.input.uri));
            case 2 /* TabInputKind.TextDiffInput */:
                return new TextDiffTabInput(URI.revive(this._dto.input.original), URI.revive(this._dto.input.modified));
            case 3 /* TabInputKind.TextMergeInput */:
                return new TextMergeTabInput(URI.revive(this._dto.input.base), URI.revive(this._dto.input.input1), URI.revive(this._dto.input.input2), URI.revive(this._dto.input.result));
            case 6 /* TabInputKind.CustomEditorInput */:
                return new CustomEditorTabInput(URI.revive(this._dto.input.uri), this._dto.input.viewType);
            case 7 /* TabInputKind.WebviewEditorInput */:
                return new WebviewEditorTabInput(this._dto.input.viewType);
            case 4 /* TabInputKind.NotebookInput */:
                return new NotebookEditorTabInput(URI.revive(this._dto.input.uri), this._dto.input.notebookType);
            case 5 /* TabInputKind.NotebookDiffInput */:
                return new NotebookDiffEditorTabInput(URI.revive(this._dto.input.original), URI.revive(this._dto.input.modified), this._dto.input.notebookType);
            case 8 /* TabInputKind.TerminalEditorInput */:
                return new TerminalEditorTabInput();
            case 9 /* TabInputKind.InteractiveEditorInput */:
                return new InteractiveWindowInput(URI.revive(this._dto.input.uri), URI.revive(this._dto.input.inputBoxUri));
            case 10 /* TabInputKind.ChatEditorInput */:
                return new ChatEditorTabInput();
            case 11 /* TabInputKind.MultiDiffEditorInput */:
                return new TextMultiDiffTabInput(this._dto.input.diffEditors.map(diff => new TextDiffTabInput(URI.revive(diff.original), URI.revive(diff.modified))));
            default:
                return undefined;
        }
    }
}
class ExtHostEditorTabGroup {
    constructor(dto, activeGroupIdGetter) {
        this._tabs = [];
        this._activeTabId = '';
        this._dto = dto;
        this._activeGroupIdGetter = activeGroupIdGetter;
        // Construct all tabs from the given dto
        for (const tabDto of dto.tabs) {
            if (tabDto.isActive) {
                this._activeTabId = tabDto.id;
            }
            this._tabs.push(new ExtHostEditorTab(tabDto, this, () => this.activeTabId()));
        }
    }
    get apiObject() {
        if (!this._apiObject) {
            // Don't want to lose reference to parent `this` in the getters
            const that = this;
            const obj = {
                get isActive() {
                    // We use a getter function here to always ensure at most 1 active group and prevent iteration for being required
                    return that._dto.groupId === that._activeGroupIdGetter();
                },
                get viewColumn() {
                    return typeConverters.ViewColumn.to(that._dto.viewColumn);
                },
                get activeTab() {
                    return that._tabs.find(tab => tab.tabId === that._activeTabId)?.apiObject;
                },
                get tabs() {
                    return Object.freeze(that._tabs.map(tab => tab.apiObject));
                }
            };
            this._apiObject = Object.freeze(obj);
        }
        return this._apiObject;
    }
    get groupId() {
        return this._dto.groupId;
    }
    get tabs() {
        return this._tabs;
    }
    acceptGroupDtoUpdate(dto) {
        this._dto = dto;
    }
    acceptTabOperation(operation) {
        // In the open case we add the tab to the group
        if (operation.kind === 0 /* TabModelOperationKind.TAB_OPEN */) {
            const tab = new ExtHostEditorTab(operation.tabDto, this, () => this.activeTabId());
            // Insert tab at editor index
            this._tabs.splice(operation.index, 0, tab);
            if (operation.tabDto.isActive) {
                this._activeTabId = tab.tabId;
            }
            return tab;
        }
        else if (operation.kind === 1 /* TabModelOperationKind.TAB_CLOSE */) {
            const tab = this._tabs.splice(operation.index, 1)[0];
            if (!tab) {
                throw new Error(`Tab close updated received for index ${operation.index} which does not exist`);
            }
            if (tab.tabId === this._activeTabId) {
                this._activeTabId = '';
            }
            return tab;
        }
        else if (operation.kind === 3 /* TabModelOperationKind.TAB_MOVE */) {
            if (operation.oldIndex === undefined) {
                throw new Error('Invalid old index on move IPC');
            }
            // Splice to remove at old index and insert at new index === moving the tab
            const tab = this._tabs.splice(operation.oldIndex, 1)[0];
            if (!tab) {
                throw new Error(`Tab move updated received for index ${operation.oldIndex} which does not exist`);
            }
            this._tabs.splice(operation.index, 0, tab);
            return tab;
        }
        const tab = this._tabs.find(extHostTab => extHostTab.tabId === operation.tabDto.id);
        if (!tab) {
            throw new Error('INVALID tab');
        }
        if (operation.tabDto.isActive) {
            this._activeTabId = operation.tabDto.id;
        }
        else if (this._activeTabId === operation.tabDto.id && !operation.tabDto.isActive) {
            // Events aren't guaranteed to be in order so if we receive a dto that matches the active tab id
            // but isn't active we mark the active tab id as empty. This prevent onDidActiveTabChange from
            // firing incorrectly
            this._activeTabId = '';
        }
        tab.acceptDtoUpdate(operation.tabDto);
        return tab;
    }
    // Not a getter since it must be a function to be used as a callback for the tabs
    activeTabId() {
        return this._activeTabId;
    }
}
let ExtHostEditorTabs = class ExtHostEditorTabs {
    constructor(extHostRpc) {
        this._onDidChangeTabs = new Emitter();
        this._onDidChangeTabGroups = new Emitter();
        this._extHostTabGroups = [];
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadEditorTabs);
    }
    get tabGroups() {
        if (!this._apiObject) {
            const that = this;
            const obj = {
                // never changes -> simple value
                onDidChangeTabGroups: that._onDidChangeTabGroups.event,
                onDidChangeTabs: that._onDidChangeTabs.event,
                // dynamic -> getters
                get all() {
                    return Object.freeze(that._extHostTabGroups.map(group => group.apiObject));
                },
                get activeTabGroup() {
                    const activeTabGroupId = that._activeGroupId;
                    const activeTabGroup = assertReturnsDefined(that._extHostTabGroups.find(candidate => candidate.groupId === activeTabGroupId)?.apiObject);
                    return activeTabGroup;
                },
                close: async (tabOrTabGroup, preserveFocus) => {
                    const tabsOrTabGroups = Array.isArray(tabOrTabGroup) ? tabOrTabGroup : [tabOrTabGroup];
                    if (!tabsOrTabGroups.length) {
                        return true;
                    }
                    // Check which type was passed in and call the appropriate close
                    // Casting is needed as typescript doesn't seem to infer enough from this
                    if (isTabGroup(tabsOrTabGroups[0])) {
                        return this._closeGroups(tabsOrTabGroups, preserveFocus);
                    }
                    else {
                        return this._closeTabs(tabsOrTabGroups, preserveFocus);
                    }
                },
                // move: async (tab: vscode.Tab, viewColumn: ViewColumn, index: number, preserveFocus?: boolean) => {
                // 	const extHostTab = this._findExtHostTabFromApi(tab);
                // 	if (!extHostTab) {
                // 		throw new Error('Invalid tab');
                // 	}
                // 	this._proxy.$moveTab(extHostTab.tabId, index, typeConverters.ViewColumn.from(viewColumn), preserveFocus);
                // 	return;
                // }
            };
            this._apiObject = Object.freeze(obj);
        }
        return this._apiObject;
    }
    $acceptEditorTabModel(tabGroups) {
        const groupIdsBefore = new Set(this._extHostTabGroups.map(group => group.groupId));
        const groupIdsAfter = new Set(tabGroups.map(dto => dto.groupId));
        const diff = diffSets(groupIdsBefore, groupIdsAfter);
        const closed = this._extHostTabGroups.filter(group => diff.removed.includes(group.groupId)).map(group => group.apiObject);
        const opened = [];
        const changed = [];
        this._extHostTabGroups = tabGroups.map(tabGroup => {
            const group = new ExtHostEditorTabGroup(tabGroup, () => this._activeGroupId);
            if (diff.added.includes(group.groupId)) {
                opened.push(group.apiObject);
            }
            else {
                changed.push(group.apiObject);
            }
            return group;
        });
        // Set the active tab group id
        const activeTabGroupId = assertReturnsDefined(tabGroups.find(group => group.isActive === true)?.groupId);
        if (activeTabGroupId !== undefined && this._activeGroupId !== activeTabGroupId) {
            this._activeGroupId = activeTabGroupId;
        }
        this._onDidChangeTabGroups.fire(Object.freeze({ opened, closed, changed }));
    }
    $acceptTabGroupUpdate(groupDto) {
        const group = this._extHostTabGroups.find(group => group.groupId === groupDto.groupId);
        if (!group) {
            throw new Error('Update Group IPC call received before group creation.');
        }
        group.acceptGroupDtoUpdate(groupDto);
        if (groupDto.isActive) {
            this._activeGroupId = groupDto.groupId;
        }
        this._onDidChangeTabGroups.fire(Object.freeze({ changed: [group.apiObject], opened: [], closed: [] }));
    }
    $acceptTabOperation(operation) {
        const group = this._extHostTabGroups.find(group => group.groupId === operation.groupId);
        if (!group) {
            throw new Error('Update Tabs IPC call received before group creation.');
        }
        const tab = group.acceptTabOperation(operation);
        // Construct the tab change event based on the operation
        switch (operation.kind) {
            case 0 /* TabModelOperationKind.TAB_OPEN */:
                this._onDidChangeTabs.fire(Object.freeze({
                    opened: [tab.apiObject],
                    closed: [],
                    changed: []
                }));
                return;
            case 1 /* TabModelOperationKind.TAB_CLOSE */:
                this._onDidChangeTabs.fire(Object.freeze({
                    opened: [],
                    closed: [tab.apiObject],
                    changed: []
                }));
                return;
            case 3 /* TabModelOperationKind.TAB_MOVE */:
            case 2 /* TabModelOperationKind.TAB_UPDATE */:
                this._onDidChangeTabs.fire(Object.freeze({
                    opened: [],
                    closed: [],
                    changed: [tab.apiObject]
                }));
                return;
        }
    }
    _findExtHostTabFromApi(apiTab) {
        for (const group of this._extHostTabGroups) {
            for (const tab of group.tabs) {
                if (tab.apiObject === apiTab) {
                    return tab;
                }
            }
        }
        return;
    }
    _findExtHostTabGroupFromApi(apiTabGroup) {
        return this._extHostTabGroups.find(candidate => candidate.apiObject === apiTabGroup);
    }
    async _closeTabs(tabs, preserveFocus) {
        const extHostTabIds = [];
        for (const tab of tabs) {
            const extHostTab = this._findExtHostTabFromApi(tab);
            if (!extHostTab) {
                throw new Error('Tab close: Invalid tab not found!');
            }
            extHostTabIds.push(extHostTab.tabId);
        }
        return this._proxy.$closeTab(extHostTabIds, preserveFocus);
    }
    async _closeGroups(groups, preserverFoucs) {
        const extHostGroupIds = [];
        for (const group of groups) {
            const extHostGroup = this._findExtHostTabGroupFromApi(group);
            if (!extHostGroup) {
                throw new Error('Group close: Invalid group not found!');
            }
            extHostGroupIds.push(extHostGroup.groupId);
        }
        return this._proxy.$closeGroup(extHostGroupIds, preserverFoucs);
    }
};
ExtHostEditorTabs = __decorate([
    __param(0, IExtHostRpcService)
], ExtHostEditorTabs);
export { ExtHostEditorTabs };
//#region Utils
function isTabGroup(obj) {
    const tabGroup = obj;
    if (tabGroup.tabs !== undefined) {
        return true;
    }
    return false;
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEVkaXRvclRhYnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0RWRpdG9yVGFicy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDMUYsT0FBTyxFQUE4RCxXQUFXLEVBQWdGLE1BQU0sdUJBQXVCLENBQUM7QUFDOUwsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxLQUFLLGNBQWMsTUFBTSw0QkFBNEIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsb0JBQW9CLEVBQUUsc0JBQXNCLEVBQUUsMEJBQTBCLEVBQUUsc0JBQXNCLEVBQUUsc0JBQXNCLEVBQUUsZ0JBQWdCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFRbFIsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFxQixvQkFBb0IsQ0FBQyxDQUFDO0FBSTVGLE1BQU0sZ0JBQWdCO0lBT3JCLFlBQVksR0FBa0IsRUFBRSxXQUFrQyxFQUFFLGlCQUErQjtRQUNsRyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsaUJBQWlCLENBQUM7UUFDNUMsSUFBSSxDQUFDLFlBQVksR0FBRyxXQUFX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