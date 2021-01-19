/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IExtHostContext, MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { Verbosity } from 'vs/workbench/common/editor';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

export interface ITabInfo {
	name: string;
	resource: URI;
}

@extHostNamedCustomer(MainContext.MainThreadEditorTabs)
export class MainThreadEditorTabs {

	private readonly _registration: IDisposable;

	constructor(
		_extHostContext: IExtHostContext,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		this._registration = CommandsRegistry.registerCommand('_textEditorTabs', () => {
			return this._fetchTextEditors();
		});
	}

	dispose(): void {
		this._registration.dispose();
	}

	private _fetchTextEditors(): ITabInfo[] {
		const result: ITabInfo[] = [];
		for (const group of this._editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor.isDisposed() || !editor.resource) {
					continue;
				}
				result.push({
					name: editor.getTitle(Verbosity.SHORT) ?? '',
					resource: editor.resource
				});
			}
		}
		return result;
	}
}
