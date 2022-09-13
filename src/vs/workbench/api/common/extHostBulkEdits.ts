/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { MainContext, MainThreadBulkEditsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { WorkspaceEdit } from 'vs/workbench/api/common/extHostTypeConverters';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';
import type * as vscode from 'vscode';

export class ExtHostBulkEdits {

	private readonly _proxy: MainThreadBulkEditsShape;
	private readonly _versionInformationProvider: WorkspaceEdit.IVersionInformationProvider;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadBulkEdits);

		this._versionInformationProvider = {
			getTextDocumentVersion: uri => extHostDocumentsAndEditors.getDocument(uri)?.version,
			getNotebookDocumentVersion: () => undefined
		};
	}

	applyWorkspaceEdit(edit: vscode.WorkspaceEdit, extension: IExtensionDescription, isRefactoring?: boolean): Promise<boolean> {
		const allowIsRefactoring = isProposedApiEnabled(extension, 'workspaceEditIsRefactoring');
		if (isRefactoring && !allowIsRefactoring) {
			console.warn(`Extension '${extension.identifier.value}' uses a proposed API 'workspaceEditIsRefactoring' which is NOT enabled for it`);
			isRefactoring = undefined;
		}
		const dto = WorkspaceEdit.from(edit, this._versionInformationProvider);
		return this._proxy.$tryApplyWorkspaceEdit(dto, undefined, isRefactoring);
	}
}
