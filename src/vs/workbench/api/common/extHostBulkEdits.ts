/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadBulkEditsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { WorkspaceEdit } from 'vs/workbench/api/common/extHostTypeConverters';
import type * as vscode from 'vscode';

export class ExtHostBulkEdits {

	private readonly _proxy: MainThreadBulkEditsShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		private readonly _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
		private readonly _extHostNotebooks: ExtHostNotebookController,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadBulkEdits);
	}

	applyWorkspaceEdit(edit: vscode.WorkspaceEdit): Promise<boolean> {
		const dto = WorkspaceEdit.from(edit, this._extHostDocumentsAndEditors, this._extHostNotebooks);
		return this._proxy.$tryApplyWorkspaceEdit(dto);
	}
}
