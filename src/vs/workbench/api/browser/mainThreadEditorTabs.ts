/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostContext, IExtHostEditorTabsShape, MainContext, IEditorTabDto, IEditorTabGroupDto, TabKind } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { EditorResourceAccessor, IUntypedEditorInput, SideBySideEditor, GroupModelChangeKind } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { columnToEditorGroup, EditorGroupColumn, editorGroupToColumn } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { GroupDirection, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorsChangeEvent, IEditorService } from 'vs/workbench/services/editor/common/editorService';

@extHostNamedCustomer(MainContext.MainThreadEditorTabs)
export class MainThreadEditorTabs {

	private readonly _dispoables = new DisposableStore();
	private readonly _proxy: IExtHostEditorTabsShape;
	private _tabGroupModel: IEditorTabGroupDto[] = [];
	private readonly _groupModel: Map<number, IEditorTabGroupDto> = new Map();

	constructor(
		extHostContext: IExtHostContext,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService editorService: IEditorService,
	) {

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditorTabs);

		// Queue all events that arrive on the same event loop and then send them as a batch
		this._dispoables.add(editorService.onDidEditorsChange((event) => this._updateTabsModel(event)));
		this._editorGroupsService.whenReady.then(() => this._createTabsModel());
	}

	dispose(): void {
		this._dispoables.dispose();
	}

	/**
	 * Creates a tab object with the correct properties
	 * @param editor The editor input represented by the tab
	 * @param group The group the tab is in
	 * @returns A tab object
	 */
	private _buildTabObject(group: IEditorGroup, editor: EditorInput, editorIndex: number): IEditorTabDto {
		// Even though the id isn't a diff / sideBySide on the main side we need to let the ext host know what type of editor it is
		const editorId = editor.editorId;
		const tabKind = editor instanceof DiffEditorInput ? TabKind.Diff : editor instanceof SideBySideEditorInput ? TabKind.SidebySide : TabKind.Singular;
		const tab: IEditorTabDto = {
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


	private _tabToUntypedEditorInput(tab: IEditorTabDto): IUntypedEditorInput {
		if (tab.kind !== TabKind.Diff && tab.kind !== TabKind.SidebySide) {
			return { resource: URI.revive(tab.resource), options: { override: tab.editorId } };
		} else if (tab.kind === TabKind.SidebySide) {
			return {
				options: { override: tab.editorId },
				primary: { resource: URI.revive(tab.resource), options: { override: tab.editorId } },
				secondary: { resource: URI.revive(tab.additionalResourcesAndViewTypes[1].resource), options: { override: tab.additionalResourcesAndViewTypes[1].viewId } }
			};
		} else {
			// Diff case
			return {
				options: { override: tab.editorId },
				modified: { resource: URI.revive(tab.resource), options: { override: tab.editorId } },
				original: { resource: URI.revive(tab.additionalResourcesAndViewTypes[1].resource), options: { override: tab.additionalResourcesAndViewTypes[1]?.viewId } }
			};
		}
	}

	/**
	 * Called whenever a group activates, updates the model by marking the group as active an notifies the extension host
	 */
	private _onDidGroupActivate() {
		const activeGroupId = this._editorGroupsService.activeGroup.id;
		for (const group of this._tabGroupModel) {
			group.isActive = group.groupId === activeGroupId;
		}
	}

	/**
	 * Called when the tab label changes
	 * @param groupId The id of the group the tab exists in
	 * @param editorInput The editor input represented by the tab
	 * @param editorIndex The index of the editor within that group
	 */
	private _onDidTabLabelChange(groupId: number, editorInput: EditorInput, editorIndex: number) {
		const tabs = this._groupModel.get(groupId)?.tabs;
		if (tabs) {
			tabs[editorIndex].label = editorInput.getName();
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
		const groupInModel = this._groupModel.get(groupId) !== undefined;
		// Means a new group was likely created so we rebuild the model
		if (!group || !groupInModel) {
			this._createTabsModel();
			return;
		}
		const tabs = this._groupModel.get(groupId)?.tabs;
		if (tabs) {
			// Splice tab into group at index editorIndex
			tabs.splice(editorIndex, 0, this._buildTabObject(group, editorInput, editorIndex));
		}
	}

	/**
	 * Called when a tab is closed
	 * @param groupId The id of the group the tab is being removed from
	 * @param editorIndex The index of the editor within that group
	 */
	private _onDidTabClose(groupId: number, editorIndex: number) {
		const group = this._editorGroupsService.getGroup(groupId);
		const tabs = this._groupModel.get(groupId)?.tabs;
		// Something is wrong with the model state so we rebuild
		if (!group || !tabs) {
			this._createTabsModel();
			return;
		}
		// Splice tab into group at index editorIndex
		tabs.splice(editorIndex, 1);

		// If no tabs it's an empty group and gets deleted from the model
		// In the future we may want to support empty groups
		if (tabs.length === 0) {
			for (let i = 0; i < this._tabGroupModel.length; i++) {
				if (this._tabGroupModel[i].groupId === group.id) {
					this._tabGroupModel.splice(i, 1);
					return;
				}
			}
		}
	}

	/**
	 * Called when the active tab changes
	 * @param groupId The id of the group the tab is contained in
	 * @param editorIndex The index of the tab
	 */
	private _onDidTabActiveChange(groupId: number, editorIndex: number) {
		const tabs = this._groupModel.get(groupId)?.tabs;
		if (!tabs) {
			return;
		}
		let activeTab: IEditorTabDto | undefined;
		for (let i = 0; i < tabs.length; i++) {
			if (i === editorIndex) {
				tabs[i].isActive = true;
				activeTab = tabs[i];
			} else {
				tabs[i].isActive = false;
			}
		}
		// null assertion is ok here because if tabs is undefined then we would've returned above.
		// Therefore there must be a group here.
		this._groupModel.get(groupId)!.activeTab = activeTab;
	}

	/**
	 * Called when the dirty indicator on the tab changes
	 * @param groupId The id of the group the tab is in
	 * @param editorIndex The index of the tab
	 * @param editor The editor input represented by the tab
	 */
	private _onDidTabDirty(groupId: number, editorIndex: number, editor: EditorInput) {
		const tab = this._groupModel.get(groupId)?.tabs[editorIndex];
		// Something wrong with the model staate so we rebuild
		if (!tab) {
			this._createTabsModel();
			return;
		}
		tab.isDirty = editor.isDirty();
	}

	/**
	 * Called when the tab is pinned / unpinned
	 * @param groupId The id of the group the tab is in
	 * @param editorIndex The index of the tab
	 * @param editor The editor input represented by the tab
	 */
	private _onDidTabStickyChange(groupId: number, editorIndex: number, editor: EditorInput) {
		const group = this._editorGroupsService.getGroup(groupId);
		const tab = this._groupModel.get(groupId)?.tabs[editorIndex];
		// Something wrong with the model staate so we rebuild
		if (!group || !tab) {
			this._createTabsModel();
			return;
		}
		tab.isPinned = group.isSticky(editorIndex);
	}

	/**
	 * Builds the model from scratch based on the current state of the editor service.
	 */
	private _createTabsModel(): void {
		this._tabGroupModel = [];
		this._groupModel.clear();
		let tabs: IEditorTabDto[] = [];
		for (const group of this._editorGroupsService.groups) {
			const currentTabGroupModel: IEditorTabGroupDto = {
				groupId: group.id,
				isActive: group.id === this._editorGroupsService.activeGroup.id,
				viewColumn: editorGroupToColumn(this._editorGroupsService, group),
				activeTab: undefined,
				tabs: []
			};
			group.editors.forEach((editor, editorIndex) => {
				const tab = this._buildTabObject(group, editor, editorIndex);
				// Mark the tab active within the group
				if (tab.isActive) {
					currentTabGroupModel.activeTab = tab;
				}
				tabs.push(tab);
			});
			currentTabGroupModel.tabs = tabs;
			this._tabGroupModel.push(currentTabGroupModel);
			this._groupModel.set(group.id, currentTabGroupModel);
			tabs = [];
		}
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
				if (event.editor !== undefined && event.editorIndex !== undefined) {
					this._onDidTabLabelChange(event.groupId, event.editor, event.editorIndex);
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
		// notify the ext host of the new model
		this._proxy.$acceptEditorTabModel(this._tabGroupModel);
	}
	//#region Messages received from Ext Host
	$moveTab(tab: IEditorTabDto, index: number, viewColumn: EditorGroupColumn): void {
		const groupId = columnToEditorGroup(this._editorGroupsService, viewColumn);
		let targetGroup: IEditorGroup | undefined;
		const sourceGroup = this._editorGroupsService.getGroup(columnToEditorGroup(this._editorGroupsService, tab.viewColumn));
		if (!sourceGroup) {
			return;
		}
		// If group index is out of bounds then we make a new one that's to the right of the last group
		if (this._groupModel.get(groupId) === undefined) {
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
		const editorInput = sourceGroup.editors.find(editor => editor.matches(this._tabToUntypedEditorInput(tab)));
		if (!editorInput) {
			return;
		}
		// Move the editor to the target group
		sourceGroup.moveEditor(editorInput, targetGroup, { index, preserveFocus: true });
		return;
	}

	async $closeTab(tab: IEditorTabDto): Promise<void> {
		const group = this._editorGroupsService.getGroup(columnToEditorGroup(this._editorGroupsService, tab.viewColumn));
		if (!group) {
			return;
		}
		const editorTab = this._tabToUntypedEditorInput(tab);
		const editor = group.editors.find(editor => editor.matches(editorTab));
		if (!editor) {
			return;
		}
		await group.closeEditor(editor);
	}
	//#endregion
}
