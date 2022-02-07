/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostContext, IExtHostEditorTabsShape, MainContext, IEditorTabDto, IEditorTabGroupDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { EditorResourceAccessor, IUntypedEditorInput, SideBySideEditor, DEFAULT_EDITOR_ASSOCIATION } from 'vs/workbench/common/editor';
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
	private readonly _tabModel: Map<number, IEditorTabDto[]> = new Map();

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
	private _buildTabObject(editor: EditorInput, group: IEditorGroup, index: number): IEditorTabDto {
		// Even though the id isn't a diff / sideBySide on the main side we need to let the ext host know what type of editor it is
		const editorId = editor instanceof DiffEditorInput ? 'diff' : editor instanceof SideBySideEditorInput ? 'sideBySide' : editor.editorId;
		const tab: IEditorTabDto = {
			viewColumn: editorGroupToColumn(this._editorGroupsService, group),
			label: editor.getName(),
			resource: editor instanceof SideBySideEditorInput ? EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }) : EditorResourceAccessor.getCanonicalUri(editor),
			editorId,
			index,
			additionalResourcesAndViewIds: [],
			isActive: group.isActive(editor)
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
			// For now only text diff editor are supported
			return {
				modified: { resource: URI.revive(tab.resource), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } },
				original: { resource: URI.revive(tab.additionalResourcesAndViewIds[1].resource), options: { override: DEFAULT_EDITOR_ASSOCIATION.id } }
			};
		}
	}

	/**
	 * Builds the model from scratch based on the current state of the editor service.
	 */
	private _createTabsModel(): void {
		this._tabGroupModel = [];
		this._tabModel.clear();
		let tabs: IEditorTabDto[] = [];
		for (const group of this._editorGroupsService.groups) {
			const currentTabGroupModel: IEditorTabGroupDto = {
				isActive: group.id === this._editorGroupsService.activeGroup.id,
				viewColumn: editorGroupToColumn(this._editorGroupsService, group),
				activeTabIndex: undefined,
				tabs: []
			};
			for (let i = 0; i < group.editors.length; i++) {
				const editor = group.editors[i];
				if (editor.isDisposed()) {
					continue;
				}
				const tab = this._buildTabObject(editor, group, i);
				// Mark the tab active within the group
				if (tab.isActive) {
					currentTabGroupModel.activeTabIndex = i;
				}
				tabs.push(tab);
			}
			currentTabGroupModel.tabs = tabs;
			this._tabGroupModel.push(currentTabGroupModel);
			this._tabModel.set(group.id, tabs);
			tabs = [];
		}
		this._proxy.$acceptEditorTabModel(this._tabGroupModel);
	}

	// TODOD @lramos15 Remove this after done finishing the tab model code
	// private _eventArrayToString(events: IEditorsChangeEvent[]): void {
	// 	let eventString = '[';
	// 	events.forEach(event => {
	// 		switch (event.kind) {
	// 			case GroupModelChangeKind.GROUP_INDEX: eventString += 'GROUP_INDEX, '; break;
	// 			case GroupModelChangeKind.EDITOR_ACTIVE: eventString += 'EDITOR_ACTIVE, '; break;
	// 			case GroupModelChangeKind.EDITOR_PIN: eventString += 'EDITOR_PIN, '; break;
	// 			case GroupModelChangeKind.EDITOR_OPEN: eventString += 'EDITOR_OPEN, '; break;
	// 			case GroupModelChangeKind.EDITOR_CLOSE: eventString += 'EDITOR_CLOSE, '; break;
	// 			case GroupModelChangeKind.EDITOR_MOVE: eventString += 'EDITOR_MOVE, '; break;
	// 			case GroupModelChangeKind.EDITOR_LABEL: eventString += 'EDITOR_LABEL, '; break;
	// 			case GroupModelChangeKind.GROUP_ACTIVE: eventString += 'GROUP_ACTIVE, '; break;
	// 			case GroupModelChangeKind.GROUP_LOCKED: eventString += 'GROUP_LOCKED, '; break;
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
		console.log(`Total Events: ${events.length}`);
		console.time('updateTabModel');
		// Because events are aggregated rebuilding the tab model is much easier
		// In the future we can optimize certain events rather than full rebuilds
		this._createTabsModel();
		console.timeEnd('updateTabModel');
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
		const editorTab = this._tabToUntypedEditorInput(tab);
		const editor = group.editors.find(editor => editor.matches(editorTab));
		if (!editor) {
			return;
		}
		await group.closeEditor(editor);
	}
	//#endregion
}
