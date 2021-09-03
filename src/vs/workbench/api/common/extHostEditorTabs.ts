/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IEditorTabDto, IExtHostEditorTabsShape } from 'vs/workbench/api/common/extHost.protocol';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ViewColumn } from 'vs/workbench/api/common/extHostTypes';

export interface IEditorTab {
	label: string;
	viewColumn: ViewColumn;
	resource?: vscode.Uri | { primary?: vscode.Uri, secondary?: vscode.Uri };
	editorId?: string;
	isActive: boolean;
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

	private readonly _onDidChangeTabs = new Emitter<IEditorTab[]>();
	readonly onDidChangeTabs: Event<IEditorTab[]> = this._onDidChangeTabs.event;

	private readonly _onDidChangeActiveTab = new Emitter<IEditorTab | undefined>();
	readonly onDidChangeActiveTab: Event<IEditorTab | undefined> = this._onDidChangeActiveTab.event;

	private _tabs: IEditorTab[] = [];
	private _activeTab: IEditorTab | undefined;

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
			// Resolve resource into the right shape for either normal or side by side
			let resource = undefined;
			if (dto.resource) {
				const resourceAsSidebySide = dto.resource as ({ primary?: UriComponents, secondary?: UriComponents });
				if (resourceAsSidebySide.primary || resourceAsSidebySide.secondary) {
					resource = {
						primary: URI.revive(resourceAsSidebySide.primary),
						secondary: URI.revive(resourceAsSidebySide.secondary)
					};
				} else {
					resource = URI.revive(dto.resource as UriComponents | undefined);
				}
			}
			return Object.freeze({
				label: dto.label,
				viewColumn: dto.viewColumn,
				resource,
				editorId: dto.editorId,
				isActive: dto.isActive
			});
		});
		this._activeTab = activeIndex === -1 ? undefined : this._tabs[activeIndex];
		this._onDidChangeActiveTab.fire(this._activeTab);
		this._onDidChangeTabs.fire(this._tabs);
	}
}
