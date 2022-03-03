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
	viewId: string | undefined;
	isActive: boolean;
	isPinned: boolean;
	kind: TabKind;
	isDirty: boolean;
	additionalResourcesAndViewIds: { resource: vscode.Uri | undefined; viewId: string | undefined }[];
	move(index: number, viewColumn: ViewColumn): Promise<void>;
	close(): Promise<void>;
}

export interface IEditorTabGroup {
	isActive: boolean;
	viewColumn: ViewColumn;
	activeTab: IEditorTab | undefined;
	tabs: IEditorTab[];
}

export interface IEditorTabGroups {
	all: IEditorTabGroup[];
	activeTabGroup: IEditorTabGroup | undefined;
	onDidChangeTabGroup: Event<void>;
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
	readonly onDidChangeTabGroup: Event<void> = this._onDidChangeTabGroup.event;

	private _tabGroups: IEditorTabGroups = {
		all: [],
		activeTabGroup: undefined,
		onDidChangeTabGroup: this._onDidChangeTabGroup.event
	};

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadEditorTabs);
	}

	get tabGroups(): IEditorTabGroups {
		return this._tabGroups;
	}

	$acceptEditorTabModel(tabGroups: IEditorTabGroupDto[]): void {
		// Clears the tab groups array
		this._tabGroups.all.length = 0;
		for (const group of tabGroups) {
			let activeTab: IEditorTab | undefined;
			const tabs = group.tabs.map(tab => {
				const extHostTab = this.createExtHostTabObject(tab);
				if (tab.isActive) {
					activeTab = extHostTab;
				}
				return extHostTab;
			});
			this._tabGroups.all.push(Object.freeze({
				isActive: group.isActive,
				viewColumn: typeConverters.ViewColumn.to(group.viewColumn),
				activeTab,
				tabs
			}));
			// If the currrent group is active, set the active group to be that group.
			// We must use the same object so we pull from the array to allow for reference equality
			if (group.isActive) {
				this._tabGroups.activeTabGroup = this._tabGroups.all[this._tabGroups.all.length - 1];
			}
		}
		this._onDidChangeTabGroup.fire();
	}

	private createExtHostTabObject(tabDto: IEditorTabDto): IEditorTab {
		return Object.freeze({
			label: tabDto.label,
			viewColumn: typeConverters.ViewColumn.to(tabDto.viewColumn),
			resource: URI.revive(tabDto.resource),
			additionalResourcesAndViewIds: tabDto.additionalResourcesAndViewIds.map(({ resource, viewId }) => ({ resource: URI.revive(resource), viewId })),
			viewId: tabDto.editorId,
			isActive: tabDto.isActive,
			kind: tabDto.kind,
			isDirty: tabDto.isDirty,
			isPinned: tabDto.isPinned,
			move: async (index: number, viewColumn: ViewColumn) => {
				this._proxy.$moveTab(tabDto, index, typeConverters.ViewColumn.from(viewColumn));
				// TODO: Need an on did change tab event at the group level
				// await raceTimeout(Event.toPromise(this._onDidChangeTabs.event), 1000);
				return;
			},
			close: async () => {
				await this._proxy.$closeTab(tabDto);
				// TODO: Need an on did change tab event at the group level
				// await raceTimeout(Event.toPromise(this._onDidChangeTabs.event), 1000);
				return;
			}
		});
	}
}
