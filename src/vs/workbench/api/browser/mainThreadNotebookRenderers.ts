/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ExtHostContext, ExtHostNotebookRenderersShape, IExtHostContext, MainContext, MainThreadNotebookRenderersShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/notebookEditorService';

@extHostNamedCustomer(MainContext.MainThreadNotebookRenderers)
export class MainThreadNotebookRenderers extends Disposable implements MainThreadNotebookRenderersShape {
	private readonly proxy: ExtHostNotebookRenderersShape;
	private readonly editors = new Map<INotebookEditor, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@INotebookEditorService notebookEditorService: INotebookEditorService
	) {
		super();
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookRenderers);

		// notebookEditorService.listNotebookEditors().forEach(this._onEditorAdd, this);
		// notebookEditorService.onDidAddNotebookEditor(this._onEditorAdd, this, this._disposables);
		// notebookEditorService.onDidRemoveNotebookEditor(this._onEditorRemove, this, this._disposables);
	}

	$postMessage(rendererId: string, message: unknown): void {
		throw new Error('Method not implemented.');
	}
}
