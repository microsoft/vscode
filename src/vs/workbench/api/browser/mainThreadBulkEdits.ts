/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IExtHostContext, IWorkspaceEditDto, MainThreadBulkEditsShape, MainContext } from 'vs/workbench/api/common/extHost.protocol'; import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { reviveWorkspaceEditDto2 } from 'vs/workbench/api/browser/mainThreadEditors';

@extHostNamedCustomer(MainContext.MainThreadBulkEdits)
export class MainThreadBulkEdits implements MainThreadBulkEditsShape {

	constructor(
		_extHostContext: IExtHostContext,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
	) { }

	dispose(): void { }

	$tryApplyWorkspaceEdit(dto: IWorkspaceEditDto, undoRedoGroupId?: number): Promise<boolean> {
		const edits = reviveWorkspaceEditDto2(dto);
		return this._bulkEditService.apply(edits, { undoRedoGroupId }).then(() => true, _err => false);
	}
}
