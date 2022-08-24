/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { revive } from 'vs/base/common/marshalling';
import { URI } from 'vs/base/common/uri';
import { IBulkEditService, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IWorkspaceEditDto, MainContext, MainThreadBulkEditsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';


@extHostNamedCustomer(MainContext.MainThreadBulkEdits)
export class MainThreadBulkEdits implements MainThreadBulkEditsShape {

	constructor(
		_extHostContext: IExtHostContext,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@ILogService private readonly _logService: ILogService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService
	) { }

	dispose(): void { }

	$tryApplyWorkspaceEdit(dto: IWorkspaceEditDto, undoRedoGroupId?: number): Promise<boolean> {
		const edits = reviveWorkspaceEditDto(dto, this._uriIdentService);
		return this._bulkEditService.apply(edits, { undoRedoGroupId }).then(() => true, err => {
			this._logService.warn('IGNORING workspace edit', err);
			return false;
		});
	}
}

export function reviveWorkspaceEditDto(data: IWorkspaceEditDto, uriIdentityService: IUriIdentityService): WorkspaceEdit;
export function reviveWorkspaceEditDto(data: IWorkspaceEditDto | undefined, uriIdentityService: IUriIdentityService): WorkspaceEdit | undefined;
export function reviveWorkspaceEditDto(data: IWorkspaceEditDto | undefined, uriIdentityService: IUriIdentityService): WorkspaceEdit | undefined {
	if (!data || !data.edits) {
		return <WorkspaceEdit>data;
	}
	for (const edit of data.edits) {
		if (ResourceTextEdit.is(edit)) {
			edit.resource = uriIdentityService.asCanonicalUri(URI.revive(edit.resource));
			edit.metadata = revive(edit.metadata);
		}
		if (ResourceFileEdit.is(edit)) {
			edit.newResource = edit.newResource && uriIdentityService.asCanonicalUri(URI.revive(edit.newResource));
			edit.oldResource = edit.oldResource && uriIdentityService.asCanonicalUri(URI.revive(edit.oldResource));
			edit.metadata = revive(edit.metadata);
		}
		if (ResourceNotebookCellEdit.is(edit)) {
			edit.resource = uriIdentityService.asCanonicalUri(URI.revive(edit.resource));
			edit.metadata = revive(edit.metadata);
			edit.cellEdit = revive(edit.cellEdit); // better safe than sorry...
		}
	}
	return <WorkspaceEdit>data;
}
