/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { IEditorTabDto, IEditorTabGroupDto, IExtHostEditorTabsShape, MainContext, MainThreadEditorTabsShape } from 'vs/workbench/api/common/extHost.protocol';
import { URI } from 'vs/base/common/uri';
import { Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ViewColumn } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export interface IExtHostEditorTabs extends IExtHostEditorTabsShape {
	readonly _serviceBrand: undefined;
	tabGroups: vscode.TabGroups;
}

export const IExtHostEditorTabs = createDecorator<IExtHostEditorTabs>('IExtHostEditorTabs');

class ExtHostEditorTabGroup {

	private _apiObject: vscode.TabGroup | undefined;
	private _dto: IEditorTabGroupDto;
	private _tabs: ExtHostEditorTab[] = [];
	// private _activeTabId: string = '';

	constructor(dto: IEditorTabGroupDto, proxy: MainThreadEditorTabsShape) {
		this._dto = dto;
		// Construct all tabs from the given dto
		this._tabs = dto.tabs.map(tab => new ExtHostEditorTab(tab, proxy));
	}

	get apiObject(): vscode.TabGroup {
		// Don't want to lose reference to parent `this` in the getters
		const that = this;
		if (!this._apiObject) {
			this._apiObject = Object.freeze({
				get isActive() {
					return that._dto.isActive;
				},
				get viewColumn() {
					return typeConverters.ViewColumn.to(that._dto.viewColumn);
				},
				get activeTab() {
					return that._tabs.find(tab => that._dto.activeTab?.id === tab.tabId)?.apiObject;
					// return that._tabs.find(tab => tab.tabId === that._activeTabId)?.apiObject;
				},
				get tabs() {
					return that._tabs.map(tab => tab.apiObject);
				}
			});
		}
		return this._apiObject;
	}

	get groupId(): number {
		return this._dto.groupId;
	}

	findExtHostTabFromApi(apiTab: vscode.Tab): ExtHostEditorTab | undefined {
		return this._tabs.find(extHostTab => extHostTab.apiObject === apiTab);
	}
}

class ExtHostEditorTab {
	private _apiObject: vscode.Tab | undefined;
	private _dto: IEditorTabDto;
	private _proxy: MainThreadEditorTabsShape;

	constructor(dto: IEditorTabDto, proxy: MainThreadEditorTabsShape) {
		this._dto = dto;
		this._proxy = proxy;
	}

	get apiObject(): vscode.Tab {
		// Don't want to lose reference to parent `this` in the getters
		const that = this;
		if (!this._apiObject) {
			this._apiObject = Object.freeze({
				get isActive() {
					return that._dto.isActive;
				},
				get label() {
					return that._dto.label;
				},
				get resource() {
					return URI.revive(that._dto.resource);
				},
				get viewType() {
					return that._dto.editorId;
				},
				get isDirty() {
					return that._dto.isDirty;
				},
				get isPinned() {
					return that._dto.isDirty;
				},
				get viewColumn() {
					return typeConverters.ViewColumn.to(that._dto.viewColumn);
				},
				get kind() {
					return that._dto.kind;
				},
				get additionalResourcesAndViewTypes() {
					return that._dto.additionalResourcesAndViewTypes.map(({ resource, viewId }) => ({ resource: URI.revive(resource), viewType: viewId }));
				},
				move: async (index: number, viewColumn: ViewColumn) => {
					this._proxy.$moveTab(that._dto, index, typeConverters.ViewColumn.from(viewColumn));
					return;
				},
				close: async (preserveFocus) => {
					this._proxy.$closeTab(that._dto, preserveFocus);
					return;
				}
			});
		}
		return this._apiObject;
	}

	get tabId(): string {
		return this._dto.id;
	}

}

export class ExtHostEditorTabs implements IExtHostEditorTabs {
	readonly _serviceBrand: undefined;
	private readonly _proxy: MainThreadEditorTabsShape;

	private readonly _onDidChangeTabGroup = new Emitter<void>();

	private readonly _onDidChangeActiveTabGroup = new Emitter<vscode.TabGroup | undefined>();

	private _activeGroupId: number | undefined;

	private _tabGroups: vscode.TabGroups = {
		groups: [],
		activeTabGroup: undefined,
		onDidChangeTabGroup: this._onDidChangeTabGroup.event,
		onDidChangeActiveTabGroup: this._onDidChangeActiveTabGroup.event
	};

	private _extHostTabGroups: ExtHostEditorTabGroup[] = [];

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadEditorTabs);
	}

	get tabGroups(): vscode.TabGroups {
		return this._tabGroups;
	}

	$acceptEditorTabModel(tabGroups: IEditorTabGroupDto[]): void {
		// Clears the tab groups array
		this._tabGroups.groups.length = 0;
		this._extHostTabGroups = tabGroups.map(tabGroup => {
			const group = new ExtHostEditorTabGroup(tabGroup, this._proxy);
			return group;
		});
		for (const group of this._extHostTabGroups) {
			this._tabGroups.groups.push(group.apiObject);
		}
		// Set the active tab group id
		const activeTabGroup = this._extHostTabGroups.find(group => group.apiObject.isActive === true);
		const activeTabGroupId = activeTabGroup?.groupId;
		if (activeTabGroupId !== this._activeGroupId) {
			this._activeGroupId = activeTabGroupId;
			this._onDidChangeActiveTabGroup.fire(activeTabGroup?.apiObject);
			// TODO @lramos15 how do we set this without messing up readonly
			this._tabGroups.activeTabGroup = activeTabGroup?.apiObject;
		}
		this._onDidChangeTabGroup.fire();
	}

	/**
	 * Compares two groups determining if they're the same or different
	 * @param group1 The first group to compare
	 * @param group2 The second group to compare
	 * @returns True if different, false otherwise
	 */
	// private groupDiff(group1: IEditorTabGroup | undefined, group2: IEditorTabGroup | undefined): boolean {
	// 	if (group1 === group2) {
	// 		return false;
	// 	}
	// 	// They would be reference equal if both undefined so one is undefined and one isn't hence different
	// 	if (!group1 || !group2) {
	// 		return true;
	// 	}
	// 	if (group1.isActive !== group2.isActive
	// 		|| group1.viewColumn !== group2.viewColumn
	// 		|| group1.tabs.length !== group2.tabs.length
	// 	) {
	// 		return true;
	// 	}
	// 	for (let i = 0; i < group1.tabs.length; i++) {
	// 		if (this.tabDiff(group1.tabs[i], group2.tabs[i])) {
	// 			return true;
	// 		}
	// 	}
	// 	return false;
	// }

	/**
	 * Compares two tabs determining if they're the same or different
	 * @param tab1 The first tab to compare
	 * @param tab2 The second tab to compare
	 * @returns True if different, false otherwise
	 */
	// private tabDiff(tab1: IEditorTab | undefined, tab2: IEditorTab | undefined): boolean {
	// 	if (tab1 === tab2) {
	// 		return false;
	// 	}
	// 	// They would be reference equal if both undefined so one is undefined and one isn't therefore they're different
	// 	if (!tab1 || !tab2) {
	// 		return true;
	// 	}
	// 	if (tab1.label !== tab2.label
	// 		|| tab1.viewColumn !== tab2.viewColumn
	// 		|| tab1.resource?.toString() !== tab2.resource?.toString()
	// 		|| tab1.viewType !== tab2.viewType
	// 		|| tab1.isActive !== tab2.isActive
	// 		|| tab1.isPinned !== tab2.isPinned
	// 		|| tab1.isDirty !== tab2.isDirty
	// 		|| tab1.additionalResourcesAndViewTypes.length !== tab2.additionalResourcesAndViewTypes.length
	// 	) {
	// 		return true;
	// 	}
	// 	for (let i = 0; i < tab1.additionalResourcesAndViewTypes.length; i++) {
	// 		const tab1Resource = tab1.additionalResourcesAndViewTypes[i].resource;
	// 		const tab2Resource = tab2.additionalResourcesAndViewTypes[i].resource;
	// 		const tab1viewType = tab1.additionalResourcesAndViewTypes[i].viewType;
	// 		const tab2viewType = tab2.additionalResourcesAndViewTypes[i].viewType;
	// 		if (tab1Resource?.toString() !== tab2Resource?.toString() || tab1viewType !== tab2viewType) {
	// 			return true;
	// 		}
	// 	}
	// 	return false;
	// }
}
