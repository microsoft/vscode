/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { IEditorTabDto, IEditorTabGroupDto, IExtHostEditorTabsShape, MainContext, MainThreadEditorTabsShape, TabKind } from 'vs/workbench/api/common/extHost.protocol';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ViewColumn } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
export interface IEditorTab {
	label: string;
	viewColumn: ViewColumn;
	resource: vscode.Uri | undefined;
	viewType: string | undefined;
	isActive: boolean;
	isPinned: boolean;
	kind: TabKind;
	isDirty: boolean;
	additionalResourcesAndViewTypes: { resource: vscode.Uri | undefined; viewType: string | undefined }[];
	move(index: number, viewColumn: ViewColumn): Promise<void>;
	close(preserveFocus: boolean): Promise<void>;
}

export interface IEditorTabGroup {
	isActive: boolean;
	viewColumn: ViewColumn;
	activeTab: IEditorTab | undefined;
	tabs: IEditorTab[];
}

export interface IEditorTabGroups {
	groups: IEditorTabGroup[];
	activeTabGroup: IEditorTabGroup | undefined;
	readonly onDidChangeTabGroup: Event<void>;
	readonly onDidChangeActiveTabGroup: Event<IEditorTabGroup | undefined>;
}

export interface IExtHostEditorTabs extends IExtHostEditorTabsShape {
	readonly _serviceBrand: undefined;
	tabGroups: IEditorTabGroups;
}

export const IExtHostEditorTabs = createDecorator<IExtHostEditorTabs>('IExtHostEditorTabs');

export class ExtHostEditorTabs implements IExtHostEditorTabs {
	readonly _serviceBrand: undefined;
	private readonly _proxy: MainThreadEditorTabsShape;

	private readonly _onDidChangeTabGroup = new Emitter<void>();

	private readonly _onDidChangeActiveTabGroup = new Emitter<IEditorTabGroup | undefined>();

	private _tabGroups: IEditorTabGroups = {
		groups: [],
		activeTabGroup: undefined,
		onDidChangeTabGroup: this._onDidChangeTabGroup.event,
		onDidChangeActiveTabGroup: this._onDidChangeActiveTabGroup.event
	};

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadEditorTabs);
	}

	get tabGroups(): IEditorTabGroups {
		return this._tabGroups;
	}

	$acceptEditorTabModel(tabGroups: IEditorTabGroupDto[]): void {
		// Clears the tab groups array
		this._tabGroups.groups.length = 0;
		let activeGroupFound = false;
		for (const group of tabGroups) {
			let activeTab: IEditorTab | undefined;
			const tabs = group.tabs.map(tab => {
				const extHostTab = this.createExtHostTabObject(tab);
				if (tab.isActive) {
					activeTab = extHostTab;
				}
				return extHostTab;
			});
			this._tabGroups.groups.push(Object.freeze({
				isActive: group.isActive,
				viewColumn: typeConverters.ViewColumn.to(group.viewColumn),
				activeTab,
				tabs
			}));
			// If the currrent group is active, set the active group to be that group.
			// We must use the same object so we pull from the array to allow for reference equality
			if (group.isActive) {
				activeGroupFound = true;
				const oldActiveTabGroup = this._tabGroups.activeTabGroup;
				this._tabGroups.activeTabGroup = this._tabGroups.groups[this._tabGroups.groups.length - 1];
				// Diff the old and current active group to decide if we should fire a change event
				if (this.groupDiff(oldActiveTabGroup, this._tabGroups.activeTabGroup)) {
					this._onDidChangeActiveTabGroup.fire(this._tabGroups.activeTabGroup);
				}
			}
		}
		// No active group was found in the model (most common case is model was empty) fire undefined event
		if (!activeGroupFound) {
			this._tabGroups.activeTabGroup = undefined;
			this._onDidChangeActiveTabGroup.fire(undefined);
		}
		this._onDidChangeTabGroup.fire();
	}

	private createExtHostTabObject(tabDto: IEditorTabDto): IEditorTab {
		return Object.freeze({
			label: tabDto.label,
			viewColumn: typeConverters.ViewColumn.to(tabDto.viewColumn),
			resource: URI.revive(tabDto.resource),
			additionalResourcesAndViewTypes: tabDto.additionalResourcesAndViewTypes.map(({ resource, viewId }) => ({ resource: URI.revive(resource), viewType: viewId })),
			viewType: tabDto.editorId,
			isActive: tabDto.isActive,
			kind: tabDto.kind,
			isDirty: tabDto.isDirty,
			isPinned: tabDto.isPinned,
			move: async (index: number, viewColumn: ViewColumn) => {
				this._proxy.$moveTab(tabDto, index, typeConverters.ViewColumn.from(viewColumn));
				// TODO: Need an on did change tab event at the group level
				return;
			},
			close: async (preserveFocus) => {
				await this._proxy.$closeTab(tabDto, preserveFocus);
				// TODO: Need an on did change tab event at the group level
				return;
			}
		});
	}

	/**
	 * Compares two groups determining if they're the same or different
	 * @param group1 The first group to compare
	 * @param group2 The second group to compare
	 * @returns True if different, false otherwise
	 */
	private groupDiff(group1: IEditorTabGroup | undefined, group2: IEditorTabGroup | undefined): boolean {
		if (group1 === group2) {
			return false;
		}
		// They would be reference equal if both undefined so one is undefined and one isn't hence different
		if (!group1 || !group2) {
			return true;
		}
		if (group1.isActive !== group2.isActive
			|| group1.viewColumn !== group2.viewColumn
			|| group1.tabs.length !== group2.tabs.length
		) {
			return true;
		}
		for (let i = 0; i < group1.tabs.length; i++) {
			if (this.tabDiff(group1.tabs[i], group2.tabs[i])) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Compares two tabs determining if they're the same or different
	 * @param tab1 The first tab to compare
	 * @param tab2 The second tab to compare
	 * @returns True if different, false otherwise
	 */
	private tabDiff(tab1: IEditorTab | undefined, tab2: IEditorTab | undefined): boolean {
		if (tab1 === tab2) {
			return false;
		}
		// They would be reference equal if both undefined so one is undefined and one isn't therefore they're different
		if (!tab1 || !tab2) {
			return true;
		}
		if (tab1.label !== tab2.label
			|| tab1.viewColumn !== tab2.viewColumn
			|| tab1.resource?.toString() !== tab2.resource?.toString()
			|| tab1.viewType !== tab2.viewType
			|| tab1.isActive !== tab2.isActive
			|| tab1.isPinned !== tab2.isPinned
			|| tab1.isDirty !== tab2.isDirty
			|| tab1.additionalResourcesAndViewTypes.length !== tab2.additionalResourcesAndViewTypes.length
		) {
			return true;
		}
		for (let i = 0; i < tab1.additionalResourcesAndViewTypes.length; i++) {
			const tab1Resource = tab1.additionalResourcesAndViewTypes[i].resource;
			const tab2Resource = tab2.additionalResourcesAndViewTypes[i].resource;
			const tab1viewType = tab1.additionalResourcesAndViewTypes[i].viewType;
			const tab2viewType = tab2.additionalResourcesAndViewTypes[i].viewType;
			if (tab1Resource?.toString() !== tab2Resource?.toString() || tab1viewType !== tab2viewType) {
				return true;
			}
		}
		return false;
	}
}
