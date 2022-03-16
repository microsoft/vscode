/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ExtHostContext, IExtHostEditorTabsShape, MainContext, IEditorTabDto, IEditorTabGroupDto, TabKind, MainThreadEditorTabsShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { EditorResourceAccessor, SideBySideEditor, GroupModelChangeKind } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { columnToEditorGroup, EditorGroupColumn, editorGroupToColumn } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { GroupDirection, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorsChangeEvent, IEditorService } from 'vs/workbench/services/editor/common/editorService';


interface TabInfo {
	tab: IEditorTabDto;
	group: IEditorGroup;
	editorInput: EditorInput;
}
@extHostNamedCustomer(MainContext.MainThreadEditorTabs)
export class MainThreadEditorTabs implements MainThreadEditorTabsShape {

	private readonly _dispoables = new DisposableStore();
	private readonly _proxy: IExtHostEditorTabsShape;
	// List of all groups and their corresponding tabs, this is **the** model
	private _tabGroupModel: IEditorTabGroupDto[] = [];
	// Lookup table for finding group by id
	private readonly _groupLookup: Map<number, IEditorTabGroupDto> = new Map();
	// Lookup table for finding tab by id
	private readonly _tabInfoLookup: Map<string, TabInfo> = new Map();

	constructor(
		extHostContext: IExtHostContext,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
	) {

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditorTabs);

		// Main listener which responds to events from the editor service
		this._dispoables.add(editorService.onDidEditorsChange((event) => this._updateTabsModel(event)));
		this._editorGroupsService.whenReady.then(() => this._createTabsModel());
	}

	dispose(): void {
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
	private _buildTabObject(group: IEditorGroup, editor: EditorInput, editorIndex: number): IEditorTabDto {
		const editorId = editor.editorId;
		const tabKind = editor instanceof DiffEditorInput ? TabKind.Diff : editor instanceof SideBySideEditorInput ? TabKind.SidebySide : TabKind.Singular;
		const tab: IEditorTabDto = {
			id: this._generateTabId(editor, group.id),
			viewColumn: editorGroupToColumn(this._editorGroupsService, group),
			label: editor.getName(),
			resource: editor instanceof SideBySideEditorInput ? EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }) : EditorResourceAccessor.getCanonicalUri(editor),
			editorId,
			kind: tabKind,
			additionalResourcesAndViewTypes: [],
			isPinned: group.isSticky(editorIndex),
			isActive: group.isActive(editor),
			isDirty: editor.isDirty()
		};
		tab.additionalResourcesAndViewTypes.push({ resource: tab.resource, viewId: tab.editorId });
		if (editor instanceof SideBySideEditorInput) {
			tab.additionalResourcesAndViewTypes.push({ resource: EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY }), viewId: editor.primary.editorId ?? editor.editorId });
		}
		return tab;
	}

	/**
	 * Generates a unique id for a tab
	 * @param editor The editor input
	 * @param groupId The group id
	 * @returns A unique identifier for a specific tab
	 */
	private _generateTabId(editor: EditorInput, groupId: number) {
		return `${groupId}~${editor.editorId}-${editor.typeId}-${editor.resource?.toString()}`;
	}

	/**
	 * Called whenever a group activates, updates the model by marking the group as active an notifies the extension host
	 */
	private _onDidGroupActivate() {
		const activeGroupId = this._editorGroupsService.activeGroup.id;
		const activeGroup = this._groupLookup.get(activeGroupId);
		if (activeGroup) {
			activeGroup.isActive = true;
			// TODO @lramos15 Should we make this more efficient to not "update" all tabs within the group?
			this._proxy.$acceptTabGroupUpdate(activeGroup);
		}
	}

	/**
	 * Called when the tab label changes
	 * @param groupId The id of the group the tab exists in
	 * @param editorInput The editor input represented by the tab
	 */
	private _onDidTabLabelChange(groupId: number, editorInput: EditorInput) {
		const tabId = this._generateTabId(editorInput, groupId);
		const tabInfo = this._tabInfoLookup.get(tabId);
		// If tab is found patch, else rebuild
		if (tabInfo) {
			tabInfo.tab.label = editorInput.getName();
			this._proxy.$acceptTabUpdate(groupId, tabInfo.tab);
		} else {
			console.error('Invalid model for label change, rebuilding');
			this._createTabsModel();
		}
	}

	/**
	 * Called when a new tab is opened
	 * @param groupId The id of the group the tab is being created in
	 * @param editorInput The editor input being opened
	 * @param editorIndex The index of the editor within that group
	 */
	private _onDidTabOpen(groupId: number, editorInput: EditorInput, editorIndex: number) {
		const group = this._editorGroupsService.getGroup(groupId);
		// Even if the editor service knows about the group the group might not exist yet in our model
		const groupInModel = this._groupLookup.get(groupId) !== undefined;
		// Means a new group was likely created so we rebuild the model
		if (!group || !groupInModel) {
			this._createTabsModel();
			return;
		}
		const tabs = this._groupLookup.get(groupId)?.tabs;
		if (tabs) {
			// Splice tab into group at index editorIndex
			const tabObject = this._buildTabObject(group, editorInput, editorIndex);
			tabs.splice(editorIndex, 0, tabObject);
			// Update lookup
			this._tabInfoLookup.set(this._generateTabId(editorInput, groupId), { group, editorInput, tab: tabObject });
		}
		// TODO @lramos15 Switch to patching here
		this._proxy.$acceptEditorTabModel(this._tabGroupModel);
	}

	/**
	 * Called when a tab is closed
	 * @param groupId The id of the group the tab is being removed from
	 * @param editorIndex The index of the editor within that group
	 */
	private _onDidTabClose(groupId: number, editorIndex: number) {
		const group = this._editorGroupsService.getGroup(groupId);
		const tabs = this._groupLookup.get(groupId)?.tabs;
		// Something is wrong with the model state so we rebuild
		if (!group || !tabs) {
			this._createTabsModel();
			return;
		}
		// Splice tab into group at index editorIndex
		const removedTab = tabs.splice(editorIndex, 1);
		// Update lookup
		this._tabInfoLookup.delete(removedTab[0]?.id ?? '');

		// If no tabs left, it's an empty group and the group gets deleted from the model
		// In the future we may want to support empty groups
		if (tabs.length === 0) {
			for (let i = 0; i < this._tabGroupModel.length; i++) {
				if (this._tabGroupModel[i].groupId === group.id) {
					this._tabGroupModel.splice(i, 1);
					this._groupLookup.delete(group.id);
					return;
				}
			}
		}
		// TODO @lramos15 Switch to patching here
		this._proxy.$acceptEditorTabModel(this._tabGroupModel);
	}

	/**
	 * Called when the active tab changes
	 * @param groupId The id of the group the tab is contained in
	 * @param editorIndex The index of the tab
	 */
	private _onDidTabActiveChange(groupId: number, editorIndex: number) {
		// TODO @lramos15 use the tab lookup here if possible. Do we have an editor input?!
		const tabs = this._groupLookup.get(groupId)?.tabs;
		if (!tabs) {
			return;
		}
		const activeTab = tabs[editorIndex];
		// No need to loop over as the exthost uses the most recently marked active tab
		activeTab.isActive = true;
		// Send DTO update to the exthost
		this._proxy.$acceptTabUpdate(groupId, activeTab);

	}

	/**
	 * Called when the dirty indicator on the tab changes
	 * @param groupId The id of the group the tab is in
	 * @param editorIndex The index of the tab
	 * @param editor The editor input represented by the tab
	 */
	private _onDidTabDirty(groupId: number, editorIndex: number, editor: EditorInput) {
		const tab = this._groupLookup.get(groupId)?.tabs[editorIndex];
		// Something wrong with the model staate so we rebuild
		if (!tab) {
			console.error('Invalid model for dirty change, rebuilding');
			this._createTabsModel();
			return;
		}
		tab.isDirty = editor.isDirty();
		this._proxy.$acceptTabUpdate(groupId, tab);
	}

	/**
	 * Called when the tab is pinned / unpinned
	 * @param groupId The id of the group the tab is in
	 * @param editorIndex The index of the tab
	 * @param editor The editor input represented by the tab
	 */
	private _onDidTabStickyChange(groupId: number, editorIndex: number, editor: EditorInput) {
		const tabId = this._generateTabId(editor, groupId);
		const tabInfo = this._tabInfoLookup.get(tabId);
		const group = tabInfo?.group;
		const tab = tabInfo?.tab;
		// Something wrong with the model state so we rebuild
		if (!group || !tab) {
			console.error('Invalid model for sticky change, rebuilding');
			this._createTabsModel();
			return;
		}
		tab.isPinned = group.isSticky(editorIndex);
		this._proxy.$acceptTabUpdate(groupId, tab);
	}

	/**
	 * Builds the model from scratch based on the current state of the editor service.
	 */
	private _createTabsModel(): void {
		this._tabGroupModel = [];
		this._groupLookup.clear();
		this._tabInfoLookup.clear();
		let tabs: IEditorTabDto[] = [];
		for (const group of this._editorGroupsService.groups) {
			const currentTabGroupModel: IEditorTabGroupDto = {
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
	// private _eventToString(event: IEditorsChangeEvent): string {
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
	private _updateTabsModel(event: IEditorsChangeEvent): void {
		switch (event.kind) {
			case GroupModelChangeKind.GROUP_ACTIVE:
				if (event.groupId === this._editorGroupsService.activeGroup.id) {
					this._onDidGroupActivate();
					break;
				} else {
					return;
				}
			case GroupModelChangeKind.EDITOR_LABEL:
				if (event.editor !== undefined) {
					this._onDidTabLabelChange(event.groupId, event.editor);
					break;
				}
			case GroupModelChangeKind.EDITOR_OPEN:
				if (event.editor !== undefined && event.editorIndex !== undefined) {
					this._onDidTabOpen(event.groupId, event.editor, event.editorIndex);
					break;
				}
			case GroupModelChangeKind.EDITOR_CLOSE:
				if (event.editorIndex !== undefined) {
					this._onDidTabClose(event.groupId, event.editorIndex);
					break;
				}
			case GroupModelChangeKind.EDITOR_ACTIVE:
				if (event.editorIndex !== undefined) {
					this._onDidTabActiveChange(event.groupId, event.editorIndex);
					break;
				}
			case GroupModelChangeKind.EDITOR_DIRTY:
				if (event.editorIndex !== undefined && event.editor !== undefined) {
					this._onDidTabDirty(event.groupId, event.editorIndex, event.editor);
					break;
				}
			case GroupModelChangeKind.EDITOR_STICKY:
				if (event.editorIndex !== undefined && event.editor !== undefined) {
					this._onDidTabStickyChange(event.groupId, event.editorIndex, event.editor);
					break;
				}
			default:
				// If it's not an optimized case we rebuild the tabs model from scratch
				this._createTabsModel();
		}
	}
	//#region Messages received from Ext Host
	$moveTab(tabId: string, index: number, viewColumn: EditorGroupColumn): void {
		const groupId = columnToEditorGroup(this._editorGroupsService, viewColumn);
		const tabInfo = this._tabInfoLookup.get(tabId);
		const tab = tabInfo?.tab;
		if (!tab) {
			throw new Error(`Attempted to close tab with id ${tabId} which does not exist`);
		}
		let targetGroup: IEditorGroup | undefined;
		const sourceGroup = this._editorGroupsService.getGroup(columnToEditorGroup(this._editorGroupsService, tab.viewColumn));
		if (!sourceGroup) {
			return;
		}
		// If group index is out of bounds then we make a new one that's to the right of the last group
		if (this._groupLookup.get(groupId) === undefined) {
			targetGroup = this._editorGroupsService.addGroup(this._editorGroupsService.groups[this._editorGroupsService.groups.length - 1], GroupDirection.RIGHT, undefined);
		} else {
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
		sourceGroup.moveEditor(editorInput, targetGroup, { index, preserveFocus: true });
		return;
	}

	async $closeTab(tabId: string, preserveFocus: boolean): Promise<void> {
		const tabInfo = this._tabInfoLookup.get(tabId);
		const tab = tabInfo?.tab;
		const group = tabInfo?.group;
		const editorTab = tabInfo?.editorInput;
		if (!group || !tab || !tabInfo || !editorTab) {
			return;
		}
		const editor = group.editors.find(editor => editor.matches(editorTab));
		if (!editor) {
			return;
		}
		await group.closeEditor(editor, { preserveFocus });
	}
	//#endregion
}
