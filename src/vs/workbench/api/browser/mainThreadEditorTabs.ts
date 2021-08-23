/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostContext, IExtHostEditorTabsShape, IExtHostContext, MainContext, IEditorTabDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { EditorResourceAccessor, Verbosity } from 'vs/workbench/common/editor';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export interface ITabInfo {
	name: string;
	resource: URI;
}

@extHostNamedCustomer(MainContext.MainThreadEditorTabs)
export class MainThreadEditorTabs {

	private readonly _dispoables = new DisposableStore();
	private readonly _proxy: IExtHostEditorTabsShape;

	constructor(
		extHostContext: IExtHostContext,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IEditorService editorService: IEditorService
	) {

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditorTabs);

		this._dispoables.add(editorService.onDidEditorsChange(this._pushEditorTabs, this));
		this._editorGroupsService.whenReady.then(() => this._pushEditorTabs());
	}

	dispose(): void {
		this._dispoables.dispose();
	}

	private _pushEditorTabs(): void {
		const tabs: IEditorTabDto[] = [];
		for (const group of this._editorGroupsService.groups) {
			for (const editor of group.editors) {
				if (editor.isDisposed() || !editor.resource) {
					continue;
				}
				tabs.push({
					group: group.id,
					name: editor.getTitle(Verbosity.SHORT) ?? '',
					resource: EditorResourceAccessor.getOriginalUri(editor) ?? editor.resource,
					isActive: (this._editorGroupsService.activeGroup === group) && group.isActive(editor)
				});
			}
		}

		this._proxy.$acceptEditorTabs(tabs);
	}
}
