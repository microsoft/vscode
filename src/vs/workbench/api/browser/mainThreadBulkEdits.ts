/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBulkEditService, ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IWorkspaceEditDto, MainThreadBulkEditsShape, MainContext, reviveWorkspaceEditDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ILogService } from 'vs/platform/log/common/log';
import { ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';

export function reviveWorkspaceEditDto2(data: IWorkspaceEditDto): ResourceEdit[] {
	const edits = reviveWorkspaceEditDto(data)?.edits;
	if (!edits) {
		return [];
	}
	return edits.map(edit => {
		if (ResourceTextEdit.is(edit)) {
			return ResourceTextEdit.lift(edit);
		}
		if (ResourceFileEdit.is(edit)) {
			return ResourceFileEdit.lift(edit);
		}
		if (ResourceNotebookCellEdit.is(edit)) {
			return ResourceNotebookCellEdit.lift(edit);
		}
		throw new Error('Unsupported edit');
	});
}

@extHostNamedCustomer(MainContext.MainThreadBulkEdits)
export class MainThreadBulkEdits implements MainThreadBulkEditsShape {

	constructor(
		_extHostContext: IExtHostContext,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@ILogService private readonly _logService: ILogService,
	) { }

	dispose(): void { }

	$tryApplyWorkspaceEdit(dto: IWorkspaceEditDto, undoRedoGroupId?: number): Promise<boolean> {
		const edits = reviveWorkspaceEditDto2(dto);
		return this._bulkEditService.apply(edits, { undoRedoGroupId }).then(() => true, err => {
			this._logService.warn('IGNORING workspace edit', err);
			return false;
		});
	}
}
