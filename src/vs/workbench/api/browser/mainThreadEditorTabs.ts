/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostContext, IExtHostEditorTabsShape, IExtHostContext, MainContext, IEditorTabDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { EditorResourceAccessor, IUntypedEditorInput, SideBySideEditor } from 'vs/workbench/common/editor';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { columnToEditorGroup, EditorGroupColumn, editorGroupToColumn } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { GroupChangeKind, GroupDirection, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorsChangeEvent, IEditorService } from 'vs/workbench/services/editor/common/editorService';


@extHostNamedCustomer(MainContext.MainThreadEditorTabs)
export class MainThreadEditorTabs {

	private readonly _dispoables = new DisposableStore();
	private readonly _proxy: IExtHostEditorTabsShape;
	private readonly _tabModel: Map<number, IEditorTabDto[]> = new Map<number, IEditorTabDto[]>();
	private _currentlyActiveTab: { groupId: number, tab: IEditorTabDto } | undefined = undefined;

	constructor(
		extHostContext: IExtHostContext,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditorTabs);

		// Queue all events that arrive on the same event loop and then send them as a batch
		this._dispoables.add(editorService.onDidEditorsChange((events) => this._updateTabsModel(events)));
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
	private _buildTabObject(editor: EditorInput, group: IEditorGroup): IEditorTabDto {
		// Even though the id isn't a diff / sideBySide on the main side we need to let the ext host know what type of editor it is
		const editorId = editor instanceof DiffEditorInput ? 'diff' : editor instanceof SideBySideEditorInput ? 'sideBySide' : editor.editorId;
		const tab: IEditorTabDto = {
			viewColumn: editorGroupToColumn(this._editorGroupsService, group),
			label: editor.getName(),
			resource: editor instanceof SideBySideEditorInput ? EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }) : EditorResourceAccessor.getCanonicalUri(editor),
			editorId,
			additionalResourcesAndViewIds: [],
			isActive: (this._editorGroupsService.activeGroup === group) && group.isActive(editor)
		};
		tab.additionalResourcesAndViewIds.push({ resource: tab.resource, viewId: tab.editorId });
		if (editor instanceof SideBySideEditorInput) {
			tab.additionalResourcesAndViewIds.push({ resource: EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY }), viewId: editor.primary.editorId ?? editor.editorId });
		}
		return tab;
	}


	private _tabToUntypedEditorInput(tab: IEditorTabDto): IUntypedEditorInput {
		if (tab.editorId !== 'diff' && tab.editorId !== 'sideBySide') {
			return { resource: URI.revive(tab.resource), options: { override: tab.editorId } };
		} else if (tab.editorId === 'sideBySide') {
			return {
				primary: { resource: URI.revive(tab.resource), options: { override: tab.editorId } },
				secondary: { resource: URI.revive(tab.additionalResourcesAndViewIds[1].resource), options: { override: tab.additionalResourcesAndViewIds[1].viewId } }
			};
		} else {
			return {
				modified: { resource: URI.revive(tab.resource), options: { override: tab.editorId } },
				original: { resource: URI.revive(tab.additionalResourcesAndViewIds[1].resource), options: { override: tab.additionalResourcesAndViewIds[1].viewId } }
			};
		}
	}

	/**
	 * Builds the model from scratch based on the current state of the editor service.
	 */
	private _createTabsModel(): void {
		this._tabModel.clear();
		let tabs: IEditorTabDto[] = [];
		for (const group of this._editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor.isDisposed()) {
					continue;
				}
				const tab = this._buildTabObject(editor, group);
				if (tab.isActive) {
					this._currentlyActiveTab = { groupId: group.id, tab };
				}
				tabs.push(tab);
			}
			this._tabModel.set(group.id, tabs);
		}
		this._proxy.$acceptEditorTabs(tabs);
	}

	private _onDidTabOpen(event: IEditorsChangeEvent): void {
		if (event.kind !== GroupChangeKind.EDITOR_OPEN || !event.editor || event.editorIndex === undefined) {
			return;
		}
		if (!this._tabModel.has(event.groupId)) {
			this._tabModel.set(event.groupId, []);
		}
		const editor = event.editor;
		const tab = this._buildTabObject(editor, this._editorGroupsService.getGroup(event.groupId) ?? this._editorGroupsService.activeGroup);
		this._tabModel.get(event.groupId)?.splice(event.editorIndex, 0, tab);
		// Update the currently active tab which may or may not be the opened one
		if (tab.isActive) {
			if (this._currentlyActiveTab) {
				this._currentlyActiveTab.tab.isActive = (this._editorGroupsService.activeGroup.id === this._currentlyActiveTab.groupId) && this._editorGroupsService.activeGroup.isActive(this._tabToUntypedEditorInput(this._currentlyActiveTab.tab));
			}
			this._currentlyActiveTab = { groupId: event.groupId, tab };
		}
	}

	private _onDidTabClose(event: IEditorsChangeEvent): void {
		if (event.kind !== GroupChangeKind.EDITOR_CLOSE || event.editorIndex === undefined) {
			return;
		}
		this._tabModel.get(event.groupId)?.splice(event.editorIndex, 1);
		this._findAndUpdateActiveTab();

		// Remove any empty groups
		if (this._tabModel.get(event.groupId)?.length === 0) {
			this._tabModel.delete(event.groupId);
		}
	}

	private _onDidTabMove(event: IEditorsChangeEvent): void {
		if (event.kind !== GroupChangeKind.EDITOR_MOVE || event.editorIndex === undefined || event.oldEditorIndex === undefined) {
			return;
		}
		const movedTab = this._tabModel.get(event.groupId)?.splice(event.oldEditorIndex, 1);
		if (movedTab === undefined) {
			return;
		}
		this._tabModel.get(event.groupId)?.splice(event.editorIndex, 0, movedTab[0]);
		movedTab[0].isActive = (this._editorGroupsService.activeGroup.id === event.groupId) && this._editorGroupsService.activeGroup.isActive(this._tabToUntypedEditorInput(movedTab[0]));
		// Update the currently active tab
		if (movedTab[0].isActive) {
			if (this._currentlyActiveTab) {
				this._currentlyActiveTab.tab.isActive = (this._editorGroupsService.activeGroup.id === this._currentlyActiveTab.groupId) && this._editorGroupsService.activeGroup.isActive(this._tabToUntypedEditorInput(this._currentlyActiveTab.tab));
			}
			this._currentlyActiveTab = { groupId: event.groupId, tab: movedTab[0] };
		}
	}

	private _onDidGroupActivate(event: IEditorsChangeEvent): void {
		if (event.kind !== GroupChangeKind.GROUP_INDEX && event.kind !== GroupChangeKind.EDITOR_ACTIVE) {
			return;
		}
		this._findAndUpdateActiveTab();
	}

	/**
	 * Updates the currently active tab so that `this._currentlyActiveTab` is up to date.
	 */
	private _findAndUpdateActiveTab() {
		// Go to the active group and update the active tab
		const activeGroupId = this._editorGroupsService.activeGroup.id;
		this._tabModel.get(activeGroupId)?.forEach(t => {
			if (t.resource) {
				t.isActive = this._editorGroupsService.activeGroup.isActive(this._tabToUntypedEditorInput(t));
			}
			if (t.isActive) {
				if (this._currentlyActiveTab) {
					this._currentlyActiveTab.tab.isActive = (this._editorGroupsService.activeGroup.id === this._currentlyActiveTab.groupId) && this._editorGroupsService.activeGroup.isActive(this._tabToUntypedEditorInput(this._currentlyActiveTab.tab));
				}
				this._currentlyActiveTab = { groupId: activeGroupId, tab: t };
				return;
			}
		}, this);
	}

	// TODOD @lramos15 Remove this after done finishing the tab model code
	// private _eventArrayToString(events: IEditorsChangeEvent[]): void {
	// 	let eventString = '[';
	// 	events.forEach(event => {
	// 		switch (event.kind) {
	// 			case GroupChangeKind.GROUP_INDEX: eventString += 'GROUP_INDEX, '; break;
	// 			case GroupChangeKind.EDITOR_ACTIVE: eventString += 'EDITOR_ACTIVE, '; break;
	// 			case GroupChangeKind.EDITOR_PIN: eventString += 'EDITOR_PIN, '; break;
	// 			case GroupChangeKind.EDITOR_OPEN: eventString += 'EDITOR_OPEN, '; break;
	// 			case GroupChangeKind.EDITOR_CLOSE: eventString += 'EDITOR_CLOSE, '; break;
	// 			case GroupChangeKind.EDITOR_MOVE: eventString += 'EDITOR_MOVE, '; break;
	// 			case GroupChangeKind.EDITOR_LABEL: eventString += 'EDITOR_LABEL, '; break;
	// 			case GroupChangeKind.GROUP_ACTIVE: eventString += 'GROUP_ACTIVE, '; break;
	// 			case GroupChangeKind.GROUP_LOCKED: eventString += 'GROUP_LOCKED, '; break;
	// 			default: eventString += 'UNKNOWN, '; break;
	// 		}
	// 	});
	// 	eventString += ']';
	// 	console.log(eventString);
	// }

	/**
	 * The main handler for the tab events
	 * @param events The list of events to process
	 */
	private _updateTabsModel(events: IEditorsChangeEvent[]): void {
		events.forEach(event => {
			// Call the correct function for the change type
			switch (event.kind) {
				case GroupChangeKind.EDITOR_OPEN:
					this._onDidTabOpen(event);
					break;
				case GroupChangeKind.EDITOR_CLOSE:
					this._onDidTabClose(event);
					break;
				case GroupChangeKind.EDITOR_ACTIVE:
				case GroupChangeKind.GROUP_ACTIVE:
					if (this._editorGroupsService.activeGroup.id !== event.groupId) {
						return;
					}
					this._onDidGroupActivate(event);
					break;
				case GroupChangeKind.GROUP_INDEX:
					this._createTabsModel();
					// Here we stop the loop as no need to process other events
					break;
				case GroupChangeKind.EDITOR_MOVE:
					this._onDidTabMove(event);
					break;
				default:
					break;
			}
		});
		// Flatten the map into a singular array to send the ext host
		let allTabs: IEditorTabDto[] = [];
		this._tabModel.forEach((tabs) => allTabs = allTabs.concat(tabs));
		this._proxy.$acceptEditorTabs(allTabs);
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
		if (this._tabModel.get(groupId) === undefined) {
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
	}

	async $closeTab(tab: IEditorTabDto): Promise<void> {
		const group = this._editorGroupsService.getGroup(columnToEditorGroup(this._editorGroupsService, tab.viewColumn));
		if (!group) {
			return;
		}
		const editor = group.editors.find(editor => editor.matches(this._tabToUntypedEditorInput(tab)));
		if (!editor) {
			return;
		}
		await group.closeEditor(editor);
	}
	//#endregion
}
