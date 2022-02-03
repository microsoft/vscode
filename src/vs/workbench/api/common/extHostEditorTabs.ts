/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { IEditorTabDto, IEditorTabGroupDto, IExtHostEditorTabsShape, MainContext, MainThreadEditorTabsShape } from 'vs/workbench/api/common/extHost.protocol';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ViewColumn } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
export interface IEditorTab {
	label: string;
	viewColumn: ViewColumn;
	index: number;
	resource: vscode.Uri | undefined;
	viewId: string | undefined;
	isActive: boolean;
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
}

export interface IExtHostEditorTabs extends IExtHostEditorTabsShape {
	readonly _serviceBrand: undefined;
	tabGroups: IEditorTabGroups;
	onDidChangeActiveTab: Event<IEditorTab | undefined>;
	onDidChangeTabs: Event<IEditorTab[]>;
}

export const IExtHostEditorTabs = createDecorator<IExtHostEditorTabs>('IExtHostEditorTabs');

export class ExtHostEditorTabs implements IExtHostEditorTabs {
	readonly _serviceBrand: undefined;
	private readonly _proxy: MainThreadEditorTabsShape;

	private readonly _onDidChangeTabs = new Emitter<IEditorTab[]>();
	readonly onDidChangeTabs: Event<IEditorTab[]> = this._onDidChangeTabs.event;

	private readonly _onDidChangeActiveTab = new Emitter<IEditorTab | undefined>();
	readonly onDidChangeActiveTab: Event<IEditorTab | undefined> = this._onDidChangeActiveTab.event;

	private _tabGroups: IEditorTabGroups = {
		all: []
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
			const tabs = group.tabs.map(tab => {
				return this.createExtHostTabObject(tab, tab.index);
			});
			this._tabGroups.all.push(Object.freeze({
				isActive: group.isActive,
				viewColumn: typeConverters.ViewColumn.to(group.viewColumn),
				activeTab: group.activeTabIndex ? tabs[group.activeTabIndex] : undefined,
				tabs
			}));
		}
	}

	private createExtHostTabObject(tabDto: IEditorTabDto, index: number) {
		return Object.freeze({
			label: tabDto.label,
			viewColumn: typeConverters.ViewColumn.to(tabDto.viewColumn),
			index,
			resource: URI.revive(tabDto.resource),
			additionalResourcesAndViewIds: tabDto.additionalResourcesAndViewIds.map(({ resource, viewId }) => ({ resource: URI.revive(resource), viewId })),
			viewId: tabDto.editorId,
			isActive: tabDto.isActive,
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
