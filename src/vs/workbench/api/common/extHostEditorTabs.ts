/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IEditorTabDto, IExtHostEditorTabsShape } from 'vs/workbench/api/common/extHost.protocol';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';


export interface IEditorTab {
	name: string;
	group: number;
	resource: vscode.Uri
}

export class ExtHostEditorTabs implements IExtHostEditorTabsShape {

	private readonly _onDidChangeTabs = new Emitter<void>();
	readonly onDidChangeTabs: Event<void> = this._onDidChangeTabs.event;

	private _tabs: IEditorTab[] = [];

	get tabs(): readonly IEditorTab[] {
		return this._tabs;
	}

	$acceptEditorTabs(tabs: IEditorTabDto[]): void {
		this._tabs = tabs.map(dto => {
			return {
				name: dto.name,
				group: dto.group,
				resource: URI.revive(dto.resource)
			};
		});
		this._onDidChangeTabs.fire();
	}
}
