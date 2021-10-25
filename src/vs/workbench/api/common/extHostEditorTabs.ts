/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { IEditorTabDto, IExtHostEditorTabsShape, MainContext, MainThreadEditorTabsShape } from 'vs/workbench/api/common/extHost.protocol';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ViewColumn } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { raceTimeout } from 'vs/base/common/async';

export interface IEditorTab {
	label: string;
	viewColumn: ViewColumn;
	index: number;
	resource: vscode.Uri | undefined;
	viewId: string | undefined;
	isActive: boolean;
	additionalResourcesAndViewIds: { resource: vscode.Uri | undefined, viewId: string | undefined }[];
	move(index: number, viewColumn: ViewColumn): Promise<void>;
	close(): Promise<void>;
}

export interface IExtHostEditorTabs extends IExtHostEditorTabsShape {
	readonly _serviceBrand: undefined;
	tabs: readonly IEditorTab[];
	activeTab: IEditorTab | undefined;
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

	private _tabs: IEditorTab[] = [];
	private _activeTab: IEditorTab | undefined;

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadEditorTabs);
	}

	get tabs(): readonly IEditorTab[] {
		return this._tabs;
	}

	get activeTab(): IEditorTab | undefined {
		return this._activeTab;
	}

	$acceptEditorTabs(tabs: IEditorTabDto[]): void {
		let activeIndex = -1;
		this._tabs = tabs.map((dto, index) => {
			if (dto.isActive) {
				activeIndex = index;
			}
			return Object.freeze({
				label: dto.label,
				viewColumn: typeConverters.ViewColumn.to(dto.viewColumn),
				index,
				resource: URI.revive(dto.resource),
				additionalResourcesAndViewIds: dto.additionalResourcesAndViewIds.map(({ resource, viewId }) => ({ resource: URI.revive(resource), viewId })),
				viewId: dto.editorId,
				isActive: dto.isActive,
				move: async (index: number, viewColumn: ViewColumn) => {
					this._proxy.$moveTab(dto, index, typeConverters.ViewColumn.from(viewColumn));
					await raceTimeout(Event.toPromise(this._onDidChangeTabs.event), 1000);
					return;
				},
				close: async () => {
					await this._proxy.$closeTab(dto);
					await raceTimeout(Event.toPromise(this._onDidChangeTabs.event), 1000);
					return;
				}
			});
		});
		this._tabs = this._tabs.sort((t1, t2) => {
			return t1.viewColumn === t2.viewColumn ? t1.index - t2.index : t1.viewColumn - t2.viewColumn;
		});
		const oldActiveTab = this._activeTab;
		this._activeTab = activeIndex === -1 ? undefined : this._tabs[activeIndex];
		if (this._activeTab !== oldActiveTab) {
			this._onDidChangeActiveTab.fire(this._activeTab);
		}
		this._onDidChangeTabs.fire(this._tabs);
	}
}
