/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { IEditorTabDto, IEditorTabGroupDto, IExtHostEditorTabsShape, MainContext, MainThreadEditorTabsShape, TabInputKind } from 'vs/workbench/api/common/extHost.protocol';
import { URI } from 'vs/base/common/uri';
import { Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { CustomEditorTabInput, NotebookDiffEditorTabInput, NotebookEditorTabInput, TextDiffTabInput, TextTabInput, ViewColumn } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export interface IExtHostEditorTabs extends IExtHostEditorTabsShape {
	readonly _serviceBrand: undefined;
	tabGroups: vscode.TabGroups;
}

export const IExtHostEditorTabs = createDecorator<IExtHostEditorTabs>('IExtHostEditorTabs');

type AnyTabInput = TextTabInput | TextDiffTabInput;

class ExtHostEditorTab {
	private _apiObject: vscode.Tab | undefined;
	private _dto!: IEditorTabDto;
	private _input: AnyTabInput | undefined;
	private _parentGroup: ExtHostEditorTabGroup;
	private readonly _activeTabIdGetter: () => string;

	constructor(dto: IEditorTabDto, parentGroup: ExtHostEditorTabGroup, activeTabIdGetter: () => string) {
		this._activeTabIdGetter = activeTabIdGetter;
		this._parentGroup = parentGroup;
		this.acceptDtoUpdate(dto);
	}

	get apiObject(): vscode.Tab {
		// Don't want to lose reference to parent `this` in the getters
		const that = this;
		if (!this._apiObject) {
			const obj: vscode.Tab = {
				get isActive() {
					// We use a getter function here to always ensure at most 1 active tab per group and prevent iteration for being required
					return that._dto.id === that._activeTabIdGetter();
				},
				get label() {
					return that._dto.label;
				},
				get kind() {
					return that._input;
				},
				get isDirty() {
					return that._dto.isDirty;
				},
				get isPinned() {
					return that._dto.isDirty;
				},
				get isPreview() {
					return that._dto.isPreview;
				},
				get group() {
					return that._parentGroup.apiObject;
				}
			};
			this._apiObject = Object.freeze<vscode.Tab>(obj);
		}
		return this._apiObject;
	}

	get tabId(): string {
		return this._dto.id;
	}

	acceptDtoUpdate(dto: IEditorTabDto) {
		this._dto = dto;
		this._input = this._initInput();
	}

	private _initInput() {
		switch (this._dto.input.kind) {
			case TabInputKind.TextInput:
				return new TextTabInput(URI.revive(this._dto.input.uri));
			case TabInputKind.TextDiffInput:
				return new TextDiffTabInput(URI.revive(this._dto.input.original), URI.revive(this._dto.input.modified));
			case TabInputKind.CustomEditorInput:
				return new CustomEditorTabInput(URI.revive(this._dto.input.uri), this._dto.input.viewType);
			case TabInputKind.NotebookInput:
				return new NotebookEditorTabInput(URI.revive(this._dto.input.uri), this._dto.input.notebookType);
			case TabInputKind.NotebookDiffInput:
				return new NotebookDiffEditorTabInput(URI.revive(this._dto.input.original), URI.revive(this._dto.input.modified), this._dto.input.notebookType);
			default:
				return undefined;
		}
	}
}

class ExtHostEditorTabGroup {

	private _apiObject: vscode.TabGroup | undefined;
	private _dto: IEditorTabGroupDto;
	private _tabs: ExtHostEditorTab[] = [];
	private _activeTabId: string = '';
	private _activeGroupIdGetter: () => number | undefined;

	constructor(dto: IEditorTabGroupDto, proxy: MainThreadEditorTabsShape, activeGroupIdGetter: () => number | undefined) {
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

	get apiObject(): vscode.TabGroup {
		// Don't want to lose reference to parent `this` in the getters
		const that = this;
		if (!this._apiObject) {
			const obj: vscode.TabGroup = {
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
			this._apiObject = Object.freeze<vscode.TabGroup>(obj);
		}
		return this._apiObject;
	}

	get groupId(): number {
		return this._dto.groupId;
	}

	get tabs(): ExtHostEditorTab[] {
		return this._tabs;
	}

	acceptGroupDtoUpdate(dto: IEditorTabGroupDto) {
		this._dto = dto;
	}

	acceptTabDtoUpdate(dto: IEditorTabDto) {
		const tab = this._tabs.find(extHostTab => extHostTab.tabId === dto.id);
		if (!tab) {
			throw new Error('INVALID tab');
		}
		if (dto.isActive) {
			this._activeTabId = dto.id;
		}
		tab.acceptDtoUpdate(dto);
		return tab;
	}

	// Not a getter since it must be a function to be used as a callback for the tabs
	activeTabId(): string {
		return this._activeTabId;
	}
}

export class ExtHostEditorTabs implements IExtHostEditorTabs {
	readonly _serviceBrand: undefined;

	private readonly _proxy: MainThreadEditorTabsShape;
	private readonly _onDidChangeTab = new Emitter<vscode.Tab>();
	private readonly _onDidChangeTabGroup = new Emitter<void>();
	private readonly _onDidChangeActiveTabGroup = new Emitter<vscode.TabGroup | undefined>();

	private _activeGroupId: number | undefined;

	private _extHostTabGroups: ExtHostEditorTabGroup[] = [];

	private _apiObject: vscode.TabGroups | undefined;

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadEditorTabs);
	}

	get tabGroups(): vscode.TabGroups {
		if (!this._apiObject) {
			const that = this;
			const obj: vscode.TabGroups = {
				// never changes -> simple value
				onDidChangeTabGroup: that._onDidChangeTabGroup.event,
				onDidChangeActiveTabGroup: that._onDidChangeActiveTabGroup.event,
				onDidChangeTab: that._onDidChangeTab.event,
				// dynamic -> getters
				get groups() {
					return Object.freeze(that._extHostTabGroups.map(group => group.apiObject));
				},
				get activeTabGroup() {
					const activeTabGroupId = that._activeGroupId;
					if (activeTabGroupId === undefined) {
						return undefined;
					}
					return that._extHostTabGroups.find(candidate => candidate.groupId === activeTabGroupId)?.apiObject;
				},
				close: async (tab: vscode.Tab | vscode.Tab[], preserveFocus?: boolean) => {
					const tabs = Array.isArray(tab) ? tab : [tab];
					const extHostTabIds: string[] = [];
					for (const tab of tabs) {
						const extHostTab = this._findExtHostTabFromApi(tab);
						if (!extHostTab) {
							throw new Error('Tab close: Invalid tab not found!');
						}
						extHostTabIds.push(extHostTab.tabId);
					}
					this._proxy.$closeTab(extHostTabIds, preserveFocus);
					return;
				},
				move: async (tab: vscode.Tab, viewColumn: ViewColumn, index: number, preservceFocus?: boolean) => {
					const extHostTab = this._findExtHostTabFromApi(tab);
					if (!extHostTab) {
						throw new Error('Invalid tab');
					}
					this._proxy.$moveTab(extHostTab.tabId, index, typeConverters.ViewColumn.from(viewColumn), preservceFocus);
					return;
				}
			};
			this._apiObject = Object.freeze(obj);
		}
		return this._apiObject;
	}

	private _findExtHostTabFromApi(apiTab: vscode.Tab): ExtHostEditorTab | undefined {
		for (const group of this._extHostTabGroups) {
			for (const tab of group.tabs) {
				if (tab.apiObject === apiTab) {
					return tab;
				}
			}
		}
		return;
	}

	$acceptEditorTabModel(tabGroups: IEditorTabGroupDto[]): void {

		this._extHostTabGroups = tabGroups.map(tabGroup => {
			const group = new ExtHostEditorTabGroup(tabGroup, this._proxy, () => this._activeGroupId);
			return group;
		});

		// Set the active tab group id
		const activeTabGroupId = tabGroups.find(group => group.isActive === true)?.groupId;
		if (this._activeGroupId !== activeTabGroupId) {
			this._activeGroupId = activeTabGroupId;
			this._onDidChangeActiveTabGroup.fire(this.tabGroups.activeTabGroup);
		}
		this._onDidChangeTabGroup.fire();
	}

	$acceptTabGroupUpdate(groupDto: IEditorTabGroupDto) {
		const group = this._extHostTabGroups.find(group => group.groupId === groupDto.groupId);
		if (!group) {
			throw new Error('Update Group IPC call received before group creation.');
		}
		group.acceptGroupDtoUpdate(groupDto);
		if (groupDto.isActive) {
			const oldActiveGroupId = this._activeGroupId;
			this._activeGroupId = groupDto.groupId;
			if (oldActiveGroupId !== this._activeGroupId) {
				this._onDidChangeActiveTabGroup.fire(group.apiObject);
			}
		}
		this._onDidChangeTabGroup.fire();
	}

	$acceptTabUpdate(groupId: number, tabDto: IEditorTabDto) {
		const group = this._extHostTabGroups.find(group => group.groupId === groupId);
		if (!group) {
			throw new Error('Update Tabs IPC call received before group creation.');
		}
		const tab = group.acceptTabDtoUpdate(tabDto);
		this._onDidChangeTab.fire(tab.apiObject);
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
