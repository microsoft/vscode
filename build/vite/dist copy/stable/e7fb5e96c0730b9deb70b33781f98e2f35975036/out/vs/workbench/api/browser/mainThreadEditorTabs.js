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
import { Event } from '../../../base/common/event.js';
import { DisposableMap, DisposableStore } from '../../../base/common/lifecycle.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../common/editor.js';
import { DiffEditorInput } from '../../common/editor/diffEditorInput.js';
import { isGroupEditorMoveEvent } from '../../common/editor/editorGroupModel.js';
import { SideBySideEditorInput } from '../../common/editor/sideBySideEditorInput.js';
import { AbstractTextResourceEditorInput } from '../../common/editor/textResourceEditorInput.js';
import { ChatEditorInput } from '../../contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { CustomEditorInput } from '../../contrib/customEditor/browser/customEditorInput.js';
import { InteractiveEditorInput } from '../../contrib/interactive/browser/interactiveEditorInput.js';
import { MergeEditorInput } from '../../contrib/mergeEditor/browser/mergeEditorInput.js';
import { MultiDiffEditorInput } from '../../contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { NotebookEditorInput } from '../../contrib/notebook/common/notebookEditorInput.js';
import { TerminalEditorInput } from '../../contrib/terminal/browser/terminalEditorInput.js';
import { WebviewInput } from '../../contrib/webviewPanel/browser/webviewEditorInput.js';
import { columnToEditorGroup, editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService, preferredSideBySideGroupDirection } from '../../services/editor/common/editorGroupsService.js';
import { IEditorService, SIDE_GROUP } from '../../services/editor/common/editorService.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
let MainThreadEditorTabs = class MainThreadEditorTabs {
    constructor(extHostContext, _editorGroupsService, _configurationService, _logService, editorService) {
        this._editorGroupsService = _editorGroupsService;
        this._configurationService = _configurationService;
        this._logService = _logService;
        this._dispoables = new DisposableStore();
        // List of all groups and their corresponding tabs, this is **the** model
        this._tabGroupModel = [];
        // Lookup table for finding group by id
        this._groupLookup = new Map();
        // Lookup table for finding tab by id
        this._tabInfoLookup = new Map();
        // Tracks the currently open MultiDiffEditorInputs to listen to resource changes
        this._multiDiffEditorInputListeners = new DisposableMap();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditorTabs);
        // Main listener which responds to events from the editor service
        this._dispoables.add(editorService.onDidEditorsChange((event) => {
            try {
                this._updateTabsModel(event);
            }
            catch {
                this._logService.error('Failed to update model, rebuilding');
                this._createTabsModel();
            }
        }));
        this._dispoables.add(this._multiDiffEditorInputListeners);
        // Structural group changes (add, remove, move, etc) are difficult to patch.
        // Since they happen infrequently we just rebuild the entire model
        this._dispoables.add(this._editorGroupsService.onDidAddGroup(() => this._createTabsModel()));
        this._dispoables.add(this._editorGroupsService.onDidRemoveGroup(() => this._createTabsModel()));
        // Once everything is read go ahead and initialize the model
        this._editorGroupsService.whenReady.then(() => this._createTabsModel());
    }
    dispose() {
        this._groupLookup.clear();
        this._tabInfoLookup.clear();
        this._dispoables.dispose();
    }
    /**
     * Creates a tab object with the correct properties
     * @param editor The editor input represented by the tab
     * @param group The group the tab is in
     * @returns A tab object
     */
    _buildTabObject(group, editor, editorIndex) {
        const editorId = editor.editorId;
        const tab = {
            id: this._generateTabId(editor, group.id),
            label: editor.getName(),
            editorId,
            input: this._editorInputToDto(editor),
            isPinned: group.isSticky(editorIndex),
            isPreview: !group.isPinned(editorIndex),
            isActive: group.isActive(editor),
            isDirty: editor.isDirty()
        };
        return tab;
    }
    _editorInputToDto(editor) {
        if (editor instanceof MergeEditorInput) {
            return {
                kind: 3 /* TabInputKind.TextMergeInput */,
                base: editor.base,
                input1: editor.input1.uri,
                input2: editor.input2.uri,
                result: editor.resource
            };
        }
        if (editor instanceof AbstractTextResourceEditorInput) {
            return {
                kind: 1 /* TabInputKind.TextInput */,
                uri: editor.resource
            };
        }
        if (editor instanceof SideBySideEditorInput && !(editor instanceof DiffEditorInput)) {
            const primaryResource = editor.primary.resource;
            const secondaryResource = editor.secondary.resource;
            // If side by side editor with same resource on both sides treat it as a singular tab kind
            if (editor.primary instanceof AbstractTextResourceEditorInput
                && editor.secondary instanceof AbstractTextResourceEditorInput
                && isEqual(primaryResource, secondaryResource)
                && primaryResource
                && secondaryResource) {
                return {
                    kind: 1 /* TabInputKind.TextInput */,
                    uri: primaryResource
                };
            }
            return { kind: 0 /* TabInputKind.UnknownInput */ };
        }
        if (editor instanceof NotebookEditorInput) {
            return {
                kind: 4 /* TabInputKind.NotebookInput */,
                notebookType: editor.viewType,
                uri: editor.resource
            };
        }
        if (editor instanceof CustomEditorInput) {
            return {
                kind: 6 /* TabInputKind.CustomEditorInput */,
                viewType: editor.viewType,
                uri: editor.resource,
            };
        }
        if (editor instanceof WebviewInput) {
            return {
                kind: 7 /* TabInputKind.WebviewEditorInput */,
                viewType: editor.viewType
            };
        }
        if (editor instanceof TerminalEditorInput) {
            return {
                kind: 8 /* TabInputKind.TerminalEditorInput */
            };
        }
        if (editor instanceof DiffEditorInput) {
            if (editor.modified instanceof AbstractTextResourceEditorInput && editor.original instanceof AbstractTextResourceEditorInput) {
                return {
                    kind: 2 /* TabInputKind.TextDiffInput */,
                    modified: editor.modified.resource,
                    original: editor.original.resource
                };
            }
            if (editor.modified instanceof NotebookEditorInput && editor.original instanceof NotebookEditorInput) {
                return {
                    kind: 5 /* TabInputKind.NotebookDiffInput */,
                    notebookType: editor.original.viewType,
                    modified: editor.modified.resource,
                    original: editor.original.resource
                };
            }
        }
        if (editor instanceof InteractiveEditorInput) {
            return {
                kind: 9 /* TabInputKind.InteractiveEditorInput */,
                uri: editor.resource,
                inputBoxUri: editor.inputResource
            };
        }
        if (editor instanceof ChatEditorInput) {
            return {
                kind: 10 /* TabInputKind.ChatEditorInput */,
            };
        }
        if (editor instanceof MultiDiffEditorInput) {
            const diffEditors = [];
            for (const resource of (editor?.resources.get() ?? [])) {
                if (resource.originalUri && resource.modifiedUri) {
                    diffEditors.push({
                        kind: 2 /* TabInputKind.TextDiffInput */,
                        original: resource.originalUri,
                        modified: resource.modifiedUri
                    });
                }
            }
            return {
                kind: 11 /* TabInputKind.MultiDiffEditorInput */,
                diffEditors
            };
        }
        return { kind: 0 /* TabInputKind.UnknownInput */ };
    }
    /**
     * Generates a unique id for a tab
     * @param editor The editor input
     * @param groupId The group id
     * @returns A unique identifier for a specific tab
     */
    _generateTabId(editor, groupId) {
        let resourceString;
        // Properly get the resource and account for side by side editors
        const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
        if (resource instanceof URI) {
            resourceString = resource.toString();
        }
        else {
            resourceString = `${resource?.primary?.toString()}-${resource?.secondary?.toString()}`;
        }
        return `${groupId}~${editor.editorId}-${editor.typeId}-${resourceString} `;
    }
    /**
     * Called whenever a group activates, updates the model by marking the group as active an notifies the extension host
     */
    _onDidGroupActivate() {
        const activeGroupId = this._editorGroupsService.activeGroup.id;
        const activeGroup = this._groupLookup.get(activeGroupId);
        if (activeGroup) {
            // Ok not to loop as exthost accepts last active group
            activeGroup.isActive = true;
            this._proxy.$acceptTabGroupUpdate(activeGroup);
        }
    }
    /**
     * Called when the tab label changes
     * @param groupId The id of the group the tab exists in
     * @param editorInput The editor input represented by the tab
     */
    _onDidTabLabelChange(groupId, editorInput, editorIndex) {
        const tabId = this._generateTabId(editorInput, groupId);
        const tabInfo = this._tabInfoLookup.get(tabId);
        // If tab is found patch, else rebuild
        if (tabInfo) {
            tabInfo.tab.label = editorInput.getName();
            this._proxy.$acceptTabOperation({
                groupId,
                index: editorIndex,
                tabDto: tabInfo.tab,
                kind: 2 /* TabModelOperationKind.TAB_UPDATE */
            });
        }
        else {
            this._logService.error('Invalid model for label change, rebuilding');
            this._createTabsModel();
        }
    }
    /**
     * Called when a new tab is opened
     * @param groupId The id of the group the tab is being created in
     * @param editorInput The editor input being opened
     * @param editorIndex The index of the editor within that group
     */
    _onDidTabOpen(groupId, editorInput, editorIndex) {
        const group = this._editorGroupsService.getGroup(groupId);
        // Even if the editor service knows about the group the group might not exist yet in our model
        const groupInModel = this._groupLookup.get(groupId) !== undefined;
        // Means a new group was likely created so we rebuild the model
        if (!group || !groupInModel) {
            this._createTabsModel();
            return;
        }
        const tabs = this._groupLookup.get(groupId)?.tabs;
        if (!tabs) {
            return;
        }
        // Splice tab into group at index editorIndex
        const tabObject = this._buildTabObject(group, editorInput, editorIndex);
        tabs.splice(editorIndex, 0, tabObject);
        // Update lookup
        const tabId = this._generateTabId(editorInput, groupId);
        this._tabInfoLookup.set(tabId, { group, editorInput, tab: tabObject });
        if (editorInput instanceof MultiDiffEditorInput) {
            this._multiDiffEditorInputListeners.set(editorInput, Event.fromObservableLight(editorInput.resources)(() => {
                const tabInfo = this._tabInfoLookup.get(tabId);
                if (!tabInfo) {
                    return;
                }
                tabInfo.tab = this._buildTabObject(group, editorInput, editorIndex);
                this._proxy.$acceptTabOperation({
                    groupId,
                    index: editorIndex,
                    tabDto: tabInfo.tab,
                    kind: 2 /* TabModelOperationKind.TAB_UPDATE */
                });
            }));
        }
        this._proxy.$acceptTabOperation({
            groupId,
            index: editorIndex,
            tabDto: tabObject,
            kind: 0 /* TabModelOperationKind.TAB_OPEN */
        });
    }
    /**
     * Called when a tab is closed
     * @param groupId The id of the group the tab is being removed from
     * @param editorIndex The index of the editor within that group
     */
    _onDidTabClose(groupId, editorIndex) {
        const group = this._editorGroupsService.getGroup(groupId);
        const tabs = this._groupLookup.get(groupId)?.tabs;
        // Something is wrong with the model state so we rebuild
        if (!group || !tabs) {
            this._createTabsModel();
            return;
        }
        // Splice tab into group at index editorIndex
        const removedTab = tabs.splice(editorIndex, 1);
        // Index must no longer be valid so we return prematurely
        if (removedTab.length === 0) {
            return;
        }
        // Update lookup
        this._tabInfoLookup.delete(removedTab[0]?.id ?? '');
        if (removedTab[0]?.input instanceof MultiDiffEditorInput) {
            this._multiDiffEditorInputListeners.deleteAndDispose(removedTab[0]?.input);
        }
        this._proxy.$acceptTabOperation({
            groupId,
            index: editorIndex,
            tabDto: removedTab[0],
            kind: 1 /* TabModelOperationKind.TAB_CLOSE */
        });
    }
    /**
     * Called when the active tab changes
     * @param groupId The id of the group the tab is contained in
     * @param editorIndex The index of the tab
     */
    _onDidTabActiveChange(groupId, editorIndex) {
        // TODO @lramos15 use the tab lookup here if possible. Do we have an editor input?!
        const tabs = this._groupLookup.get(groupId)?.tabs;
        if (!tabs) {
            return;
        }
        const activeTab = tabs[editorIndex];
        // No need to loop over as the exthost uses the most recently marked active tab
        activeTab.isActive = true;
        // Send DTO update to the exthost
        this._proxy.$acceptTabOperation({
            groupId,
            index: editorIndex,
            tabDto: activeTab,
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */
        });
    }
    /**
     * Called when the dirty indicator on the tab changes
     * @param groupId The id of the group the tab is in
     * @param editorIndex The index of the tab
     * @param editor The editor input represented by the tab
     */
    _onDidTabDirty(groupId, editorIndex, editor) {
        const tabId = this._generateTabId(editor, groupId);
        const tabInfo = this._tabInfoLookup.get(tabId);
        // Something wrong with the model state so we rebuild
        if (!tabInfo) {
            this._logService.error('Invalid model for dirty change, rebuilding');
            this._createTabsModel();
            return;
        }
        tabInfo.tab.isDirty = editor.isDirty();
        this._proxy.$acceptTabOperation({
            groupId,
            index: editorIndex,
            tabDto: tabInfo.tab,
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */
        });
    }
    /**
     * Called when the tab is pinned/unpinned
     * @param groupId The id of the group the tab is in
     * @param editorIndex The index of the tab
     * @param editor The editor input represented by the tab
     */
    _onDidTabPinChange(groupId, editorIndex, editor) {
        const tabId = this._generateTabId(editor, groupId);
        const tabInfo = this._tabInfoLookup.get(tabId);
        const group = tabInfo?.group;
        const tab = tabInfo?.tab;
        // Something wrong with the model state so we rebuild
        if (!group || !tab) {
            this._logService.error('Invalid model for sticky change, rebuilding');
            this._createTabsModel();
            return;
        }
        // Whether or not the tab has the pin icon (internally it's called sticky)
        tab.isPinned = group.isSticky(editorIndex);
        this._proxy.$acceptTabOperation({
            groupId,
            index: editorIndex,
            tabDto: tab,
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */
        });
    }
    /**
 * Called when the tab is preview / unpreviewed
 * @param groupId The id of the group the tab is in
 * @param editorIndex The index of the tab
 * @param editor The editor input represented by the tab
 */
    _onDidTabPreviewChange(groupId, editorIndex, editor) {
        const tabId = this._generateTabId(editor, groupId);
        const tabInfo = this._tabInfoLookup.get(tabId);
        const group = tabInfo?.group;
        const tab = tabInfo?.tab;
        // Something wrong with the model state so we rebuild
        if (!group || !tab) {
            this._logService.error('Invalid model for sticky change, rebuilding');
            this._createTabsModel();
            return;
        }
        // Whether or not the tab has the pin icon (internally it's called pinned)
        tab.isPreview = !group.isPinned(editorIndex);
        this._proxy.$acceptTabOperation({
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */,
            groupId,
            tabDto: tab,
            index: editorIndex
        });
    }
    _onDidTabMove(groupId, editorIndex, oldEditorIndex, editor) {
        const tabs = this._groupLookup.get(groupId)?.tabs;
        // Something wrong with the model state so we rebuild
        if (!tabs) {
            this._logService.error('Invalid model for move change, rebuilding');
            this._createTabsModel();
            return;
        }
        // Move tab from old index to new index
        const removedTab = tabs.splice(oldEditorIndex, 1);
        if (removedTab.length === 0) {
            return;
        }
        tabs.splice(editorIndex, 0, removedTab[0]);
        // Notify exthost of move
        this._proxy.$acceptTabOperation({
            kind: 3 /* TabModelOperationKind.TAB_MOVE */,
            groupId,
            tabDto: removedTab[0],
            index: editorIndex,
            oldIndex: oldEditorIndex
        });
    }
    /**
     * Builds the model from scratch based on the current state of the editor service.
     */
    _createTabsModel() {
        if (this._editorGroupsService.groups.length === 0) {
            return; // skip this invalid state, it may happen when the entire editor area is transitioning to other state ("editor working sets")
        }
        this._tabGroupModel = [];
        this._groupLookup.clear();
        this._tabInfoLookup.clear();
        let tabs = [];
        for (const group of this._editorGroupsService.groups) {
            const currentTabGroupModel = {
                groupId: group.id,
                isActive: group.id === this._editorGroupsService.activeGroup.id,
                viewColumn: editorGroupToColumn(this._editorGroupsService, group),
                tabs: []
            };
            group.editors.forEach((editor, editorIndex) => {
                const tab = this._buildTabObject(group, editor, editorIndex);
                tabs.push(tab);
                // Add information about the tab to the lookup
                this._tabInfoLookup.set(this._generateTabId(editor, group.id), {
                    group,
                    tab,
                    editorInput: editor
                });
            });
            currentTabGroupModel.tabs = tabs;
            this._tabGroupModel.push(currentTabGroupModel);
            this._groupLookup.set(group.id, currentTabGroupModel);
            tabs = [];
        }
        // notify the ext host of the new model
        this._proxy.$acceptEditorTabModel(this._tabGroupModel);
    }
    // TODOD @lramos15 Remove this after done finishing the tab model code
    // private _eventToString(event: IEditorsChangeEvent | IEditorsMoveEvent): string {
    // 	let eventString = '';
    // 	switch (event.kind) {
    // 		case GroupModelChangeKind.GROUP_INDEX: eventString += 'GROUP_INDEX'; break;
    // 		case GroupModelChangeKind.EDITOR_ACTIVE: eventString += 'EDITOR_ACTIVE'; break;
    // 		case GroupModelChangeKind.EDITOR_PIN: eventString += 'EDITOR_PIN'; break;
    // 		case GroupModelChangeKind.EDITOR_OPEN: eventString += 'EDITOR_OPEN'; break;
    // 		case GroupModelChangeKind.EDITOR_CLOSE: eventString += 'EDITOR_CLOSE'; break;
    // 		case GroupModelChangeKind.EDITOR_MOVE: eventString += 'EDITOR_MOVE'; break;
    // 		case GroupModelChangeKind.EDITOR_LABEL: eventString += 'EDITOR_LABEL'; break;
    // 		case GroupModelChangeKind.GROUP_ACTIVE: eventString += 'GROUP_ACTIVE'; break;
    // 		case GroupModelChangeKind.GROUP_LOCKED: eventString += 'GROUP_LOCKED'; break;
    // 		case GroupModelChangeKind.EDITOR_DIRTY: eventString += 'EDITOR_DIRTY'; break;
    // 		case GroupModelChangeKind.EDITOR_STICKY: eventString += 'EDITOR_STICKY'; break;
    // 		default: eventString += `UNKNOWN: ${event.kind}`; break;
    // 	}
    // 	return eventString;
    // }
    /**
     * The main handler for the tab events
     * @param events The list of events to process
     */
    _updateTabsModel(changeEvent) {
        const event = changeEvent.event;
        const groupId = changeEvent.groupId;
        switch (event.kind) {
            case 0 /* GroupModelChangeKind.GROUP_ACTIVE */:
                if (groupId === this._editorGroupsService.activeGroup.id) {
                    this._onDidGroupActivate();
                    break;
                }
                else {
                    return;
                }
            case 9 /* GroupModelChangeKind.EDITOR_LABEL */:
                if (event.editor !== undefined && event.editorIndex !== undefined) {
                    this._onDidTabLabelChange(groupId, event.editor, event.editorIndex);
                    break;
                }
            case 5 /* GroupModelChangeKind.EDITOR_OPEN */:
                if (event.editor !== undefined && event.editorIndex !== undefined) {
                    this._onDidTabOpen(groupId, event.editor, event.editorIndex);
                    break;
                }
            case 6 /* GroupModelChangeKind.EDITOR_CLOSE */:
                if (event.editorIndex !== undefined) {
                    this._onDidTabClose(groupId, event.editorIndex);
                    break;
                }
            case 8 /* GroupModelChangeKind.EDITOR_ACTIVE */:
                if (event.editorIndex !== undefined) {
                    this._onDidTabActiveChange(groupId, event.editorIndex);
                    break;
                }
            case 14 /* GroupModelChangeKind.EDITOR_DIRTY */:
                if (event.editorIndex !== undefined && event.editor !== undefined) {
                    this._onDidTabDirty(groupId, event.editorIndex, event.editor);
                    break;
                }
            case 13 /* GroupModelChangeKind.EDITOR_STICKY */:
                if (event.editorIndex !== undefined && event.editor !== undefined) {
                    this._onDidTabPinChange(groupId, event.editorIndex, event.editor);
                    break;
                }
            case 11 /* GroupModelChangeKind.EDITOR_PIN */:
                if (event.editorIndex !== undefined && event.editor !== undefined) {
                    this._onDidTabPreviewChange(groupId, event.editorIndex, event.editor);
                    break;
                }
            case 12 /* GroupModelChangeKind.EDITOR_TRANSIENT */:
                // Currently not exposed in the API
                break;
            case 7 /* GroupModelChangeKind.EDITOR_MOVE */:
                if (isGroupEditorMoveEvent(event) && event.editor && event.editorIndex !== undefined && event.oldEditorIndex !== undefined) {
                    this._onDidTabMove(groupId, event.editorIndex, event.oldEditorIndex, event.editor);
                    break;
                }
            default:
                // If it's not an optimized case we rebuild the tabs model from scratch
                this._createTabsModel();
        }
    }
    //#region Messages received from Ext Host
    $moveTab(tabId, index, viewColumn, preserveFocus) {
        const groupId = columnToEditorGroup(this._editorGroupsService, this._configurationService, viewColumn);
        const tabInfo = this._tabInfoLookup.get(tabId);
        const tab = tabInfo?.tab;
        if (!tab) {
            throw new Error(`Attempted to close tab with id ${tabId} which does not exist`);
        }
        let targetGroup;
        const sourceGroup = this._editorGroupsService.getGroup(tabInfo.group.id);
        if (!sourceGroup) {
            return;
        }
        // If group index is out of bounds then we make a new one that's to the right of the last group
        if (this._groupLookup.get(groupId) === undefined) {
            let direction = 3 /* GroupDirection.RIGHT */;
            // Make sure we respect the user's preferred side direction
            if (viewColumn === SIDE_GROUP) {
                direction = preferredSideBySideGroupDirection(this._configurationService);
            }
            targetGroup = this._editorGroupsService.addGroup(this._editorGroupsService.groups[this._editorGroupsService.groups.length - 1], direction);
        }
        else {
            targetGroup = this._editorGroupsService.getGroup(groupId);
        }
        if (!targetGroup) {
            return;
        }
        // Similar logic to if index is out of bounds we place it at the end
        if (index < 0 || index > targetGroup.editors.length) {
            index = targetGroup.editors.length;
        }
        // Find the correct EditorInput using the tab info
        const editorInput = tabInfo?.editorInput;
        if (!editorInput) {
            return;
        }
        // Move the editor to the target group
        sourceGroup.moveEditor(editorInput, targetGroup, { index, preserveFocus });
        return;
    }
    async $closeTab(tabIds, preserveFocus) {
        const groups = new Map();
        for (const tabId of tabIds) {
            const tabInfo = this._tabInfoLookup.get(tabId);
            const tab = tabInfo?.tab;
            const group = tabInfo?.group;
            const editorTab = tabInfo?.editorInput;
            // If not found skip
            if (!group || !tab || !tabInfo || !editorTab) {
                continue;
            }
            const groupEditors = groups.get(group);
            if (!groupEditors) {
                groups.set(group, [editorTab]);
            }
            else {
                groupEditors.push(editorTab);
            }
        }
        // Loop over keys of the groups map and call closeEditors
        const results = [];
        for (const [group, editors] of groups) {
            results.push(await group.closeEditors(editors, { preserveFocus }));
        }
        // TODO @jrieken This isn't quite right how can we say true for some but not others?
        return results.every(result => result);
    }
    async $closeGroup(groupIds, preserveFocus) {
        const groupCloseResults = [];
        for (const groupId of groupIds) {
            const group = this._editorGroupsService.getGroup(groupId);
            if (group) {
                groupCloseResults.push(await group.closeAllEditors());
                // Make sure group is empty but still there before removing it
                if (group.count === 0 && this._editorGroupsService.getGroup(group.id)) {
                    this._editorGroupsService.removeGroup(group);
                }
            }
        }
        return groupCloseResults.every(result => result);
    }
};
MainThreadEditorTabs = __decorate([
    extHostNamedCustomer(MainContext.MainThreadEditorTabs),
    __param(1, IEditorGroupsService),
    __param(2, IConfigurationService),
    __param(3, ILogService),
    __param(4, IEditorService)
], MainThreadEditorTabs);
export { MainThreadEditorTabs };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEVkaXRvclRhYnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZEVkaXRvclRhYnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxhQUFhLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNsRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFlLGNBQWMsRUFBOEQsV0FBVyxFQUFvRixNQUFNLCtCQUErQixDQUFDO0FBQ3ZPLE9BQU8sRUFBRSxzQkFBc0IsRUFBd0IsZ0JBQWdCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUN4RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFakYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDckYsT0FBTyxFQUFFLCtCQUErQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZEQUE2RCxD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