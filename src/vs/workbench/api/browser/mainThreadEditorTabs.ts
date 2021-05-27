/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ExtHostContext, IExtHostEditorTabsShape, IExtHostContext, MainContext, IEditorTabDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { Verbosity } from 'vs/workbench/common/editor';
import { GroupChangeKind, IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';

export interface ITabInfo {
	name: string;
	resource: URI;
}

@extHostNamedCustomer(MainContext.MainThreadEditorTabs)
export class MainThreadEditorTabs {

	private static _GroupEventFilter = new Set([GroupChangeKind.EDITOR_CLOSE, GroupChangeKind.EDITOR_OPEN]);

	private readonly _dispoables = new DisposableStore();
	private readonly _groups = new Map<IEditorGroup, IDisposable>();
	private readonly _proxy: IExtHostEditorTabsShape;

	constructor(
		extHostContext: IExtHostContext,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostEditorTabs);

		this._editorGroupsService.groups.forEach(this._subscribeToGroup, this);
		this._dispoables.add(_editorGroupsService.onDidAddGroup(this._subscribeToGroup, this));
		this._dispoables.add(_editorGroupsService.onDidRemoveGroup(e => {
			const subscription = this._groups.get(e);
			if (subscription) {
				subscription.dispose();
				this._groups.delete(e);
				this._pushEditorTabs();
			}
		}));
		this._pushEditorTabs();
	}

	dispose(): void {
		dispose(this._groups.values());
		this._dispoables.dispose();
	}

	private _subscribeToGroup(group: IEditorGroup) {
		this._groups.get(group)?.dispose();
		const listener = group.onDidGroupChange(e => {
			if (MainThreadEditorTabs._GroupEventFilter.has(e.kind)) {
				this._pushEditorTabs();
			}
		});
		this._groups.set(group, listener);
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
					resource: editor.resource
				});
			}
		}

		this._proxy.$acceptEditorTabs(tabs);
	}
}
