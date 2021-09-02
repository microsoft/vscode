/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ExtHostContext, IExtHostEditorTabsShape, IExtHostContext, MainContext, IEditorTabDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { EditorResourceAccessor } from 'vs/workbench/common/editor';
import { editorGroupToColumn } from 'vs/workbench/services/editor/common/editorGroupColumn';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';


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
				if (editor.isDisposed()) {
					continue;
				}
				tabs.push({
					viewColumn: editorGroupToColumn(this._editorGroupsService, group),
					label: editor.getName(),
					resource: EditorResourceAccessor.getCanonicalUri(editor),
					isActive: (this._editorGroupsService.activeGroup === group) && group.isActive(editor)
				});
			}
		}

		this._proxy.$acceptEditorTabs(tabs);
	}
}
