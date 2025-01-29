/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, decodeBase64 } from '../../../base/common/buffer.js';
import { revive } from '../../../base/common/marshalling.js';
import { IBulkEditService, ResourceFileEdit, ResourceTextEdit } from '../../../editor/browser/services/bulkEditService.js';
import { WorkspaceEdit } from '../../../editor/common/languages.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceCellEditDto, IWorkspaceEditDto, IWorkspaceFileEditDto, MainContext, MainThreadBulkEditsShape } from '../common/extHost.protocol.js';
import { ResourceNotebookCellEdit } from '../../contrib/bulkEdit/browser/bulkCellEdits.js';
import { CellEditType } from '../../contrib/notebook/common/notebookCommon.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';


@extHostNamedCustomer(MainContext.MainThreadBulkEdits)
export class MainThreadBulkEdits implements MainThreadBulkEditsShape {

	constructor(
		_extHostContext: IExtHostContext,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@ILogService private readonly _logService: ILogService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService
	) { }

	dispose(): void { }

	$tryApplyWorkspaceEdit(dto: SerializableObjectWithBuffers<IWorkspaceEditDto>, undoRedoGroupId?: number, isRefactoring?: boolean): Promise<boolean> {
		const edits = reviveWorkspaceEditDto(dto.value, this._uriIdentService);
		return this._bulkEditService.apply(edits, { undoRedoGroupId, respectAutoSaveConfig: isRefactoring }).then((res) => res.isApplied, err => {
			this._logService.warn(`IGNORING workspace edit: ${err}`);
			return false;
		});
	}
}

export function reviveWorkspaceEditDto(data: IWorkspaceEditDto, uriIdentityService: IUriIdentityService, resolveDataTransferFile?: (id: string) => Promise<VSBuffer>): WorkspaceEdit;
export function reviveWorkspaceEditDto(data: IWorkspaceEditDto | undefined, uriIdentityService: IUriIdentityService, resolveDataTransferFile?: (id: string) => Promise<VSBuffer>): WorkspaceEdit | undefined;
export function reviveWorkspaceEditDto(data: IWorkspaceEditDto | undefined, uriIdentityService: IUriIdentityService, resolveDataTransferFile?: (id: string) => Promise<VSBuffer>): WorkspaceEdit | undefined {
	if (!data || !data.edits) {
		return <WorkspaceEdit>data;
	}
	const result = revive<WorkspaceEdit>(data);
	for (const edit of result.edits) {
		if (ResourceTextEdit.is(edit)) {
			edit.resource = uriIdentityService.asCanonicalUri(edit.resource);
		}
		if (ResourceFileEdit.is(edit)) {
			if (edit.options) {
				const inContents = (edit as IWorkspaceFileEditDto).options?.contents;
				if (inContents) {
					if (inContents.type === 'base64') {
						edit.options.contents = Promise.resolve(decodeBase64(inContents.value));
					} else {
						if (resolveDataTransferFile) {
							edit.options.contents = resolveDataTransferFile(inContents.id);
						} else {
							throw new Error('Could not revive data transfer file');
						}
					}
				}
			}
			edit.newResource = edit.newResource && uriIdentityService.asCanonicalUri(edit.newResource);
			edit.oldResource = edit.oldResource && uriIdentityService.asCanonicalUri(edit.oldResource);
		}
		if (ResourceNotebookCellEdit.is(edit)) {
			edit.resource = uriIdentityService.asCanonicalUri(edit.resource);
			const cellEdit = (edit as IWorkspaceCellEditDto).cellEdit;
			if (cellEdit.editType === CellEditType.Replace) {
				edit.cellEdit = {
					...cellEdit,
					cells: cellEdit.cells.map(cell => ({
						...cell,
						outputs: cell.outputs.map(output => ({
							...output,
							outputs: output.items.map(item => {
								return {
									mime: item.mime,
									data: item.valueBytes
								};
							})
						}))
					}))
				};
			}
		}
	}
	return <WorkspaceEdit>data;
}
