/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceEditDto, MainContext, MainThreadBulkEditsShape, reviveWorkspaceEditDto } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';


@extHostNamedCustomer(MainContext.MainThreadBulkEdits)
export class MainThreadBulkEdits implements MainThreadBulkEditsShape {

	constructor(
		_extHostContext: IExtHostContext,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@ILogService private readonly _logService: ILogService,
	) { }

	dispose(): void { }

	$tryApplyWorkspaceEdit(dto: IWorkspaceEditDto, undoRedoGroupId?: number): Promise<boolean> {
		const edits = reviveWorkspaceEditDto(dto);
		return this._bulkEditService.apply(edits, { undoRedoGroupId }).then(() => true, err => {
			this._logService.warn('IGNORING workspace edit', err);
			return false;
		});
	}
}
