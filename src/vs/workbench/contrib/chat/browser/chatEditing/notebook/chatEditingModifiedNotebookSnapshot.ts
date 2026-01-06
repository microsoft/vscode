/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { filter } from '../../../../../../base/common/objects.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { SnapshotContext } from '../../../../../services/workingCopy/common/fileWorkingCopy.js';
import { NotebookCellTextModel } from '../../../../notebook/common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../../notebook/common/model/notebookTextModel.js';
import { CellEditType, ICellDto2, ICellEditOperation, IOutputItemDto, NotebookData, NotebookSetting, TransientOptions } from '../../../../notebook/common/notebookCommon.js';

const BufferMarker = 'ArrayBuffer-4f56482b-5a03-49ba-8356-210d3b0c1c3d';

type ChatEditingSnapshotNotebookContentQueryData = { sessionId: string; requestId: string | undefined; undoStop: string | undefined; viewType: string };
export const ChatEditingNotebookSnapshotScheme = 'chat-editing-notebook-snapshot-model';

export function getNotebookSnapshotFileURI(chatSessionId: string, requestId: string | undefined, undoStop: string | undefined, path: string, viewType: string): URI {
	return URI.from({
		scheme: ChatEditingNotebookSnapshotScheme,
		path,
		query: JSON.stringify({ sessionId: chatSessionId, requestId: requestId ?? '', undoStop: undoStop ?? '', viewType } satisfies ChatEditingSnapshotNotebookContentQueryData),
	});
}

export function parseNotebookSnapshotFileURI(resource: URI): ChatEditingSnapshotNotebookContentQueryData {
	const data: ChatEditingSnapshotNotebookContentQueryData = JSON.parse(resource.query);
	return { sessionId: data.sessionId ?? '', requestId: data.requestId ?? '', undoStop: data.undoStop ?? '', viewType: data.viewType };
}

export function createSnapshot(notebook: NotebookTextModel, transientOptions: TransientOptions | undefined, outputSizeConfig: IConfigurationService | number): string {
	const outputSizeLimit = (typeof outputSizeConfig === 'number' ? outputSizeConfig : outputSizeConfig.getValue<number>(NotebookSetting.outputBackupSizeLimit)) * 1024;
	return serializeSnapshot(notebook.createSnapshot({ context: SnapshotContext.Backup, outputSizeLimit, transientOptions }), transientOptions);
}

export function restoreSnapshot(notebook: NotebookTextModel, snapshot: string): void {
	try {
		const { transientOptions, data } = deserializeSnapshot(snapshot);
		notebook.restoreSnapshot(data, transientOptions);
		const edits: ICellEditOperation[] = [];
		data.cells.forEach((cell, index) => {
			const internalId = cell.internalMetadata?.internalId;
			if (internalId) {
				edits.push({ editType: CellEditType.PartialInternalMetadata, index, internalMetadata: { internalId } });
			}
		});
		notebook.applyEdits(edits, true, undefined, () => undefined, undefined, false);
	}
	catch (ex) {
		console.error('Error restoring Notebook snapshot', ex);
	}
}

export class SnapshotComparer {
	private readonly data: NotebookData;
	private readonly transientOptions: TransientOptions | undefined;
	constructor(initialCotent: string) {
		this.transientOptions = deserializeSnapshot(initialCotent).transientOptions;
		this.data = deserializeSnapshot(initialCotent).data;
	}

	isEqual(notebook: NotebookData | NotebookTextModel): boolean {
		if (notebook.cells.length !== this.data.cells.length) {
			return false;
		}
		const transientDocumentMetadata = this.transientOptions?.transientDocumentMetadata || {};
		const notebookMetadata = filter(notebook.metadata || {}, key => !transientDocumentMetadata[key]);
		const comparerMetadata = filter(this.data.metadata || {}, key => !transientDocumentMetadata[key]);
		// When comparing ignore transient items.
		if (JSON.stringify(notebookMetadata) !== JSON.stringify(comparerMetadata)) {
			return false;
		}
		const transientCellMetadata = this.transientOptions?.transientCellMetadata || {};
		for (let i = 0; i < notebook.cells.length; i++) {
			const notebookCell = notebook.cells[i];
			const comparerCell = this.data.cells[i];
			if (notebookCell instanceof NotebookCellTextModel) {
				if (!notebookCell.fastEqual(comparerCell, true)) {
					return false;
				}
			} else {
				if (notebookCell.cellKind !== comparerCell.cellKind) {
					return false;
				}
				if (notebookCell.language !== comparerCell.language) {
					return false;
				}
				if (notebookCell.mime !== comparerCell.mime) {
					return false;
				}
				if (notebookCell.source !== comparerCell.source) {
					return false;
				}
				if (!this.transientOptions?.transientOutputs && notebookCell.outputs.length !== comparerCell.outputs.length) {
					return false;
				}
				// When comparing ignore transient items.
				const cellMetadata = filter(notebookCell.metadata || {}, key => !transientCellMetadata[key]);
				const comparerCellMetadata = filter(comparerCell.metadata || {}, key => !transientCellMetadata[key]);
				if (JSON.stringify(cellMetadata) !== JSON.stringify(comparerCellMetadata)) {
					return false;
				}

				// When comparing ignore transient items.
				if (JSON.stringify(sanitizeCellDto2(notebookCell, true, this.transientOptions)) !== JSON.stringify(sanitizeCellDto2(comparerCell, true, this.transientOptions))) {
					return false;
				}
			}
		}

		return true;
	}
}

function sanitizeCellDto2(cell: ICellDto2, ignoreInternalMetadata?: boolean, transientOptions?: TransientOptions): ICellDto2 {
	const transientCellMetadata = transientOptions?.transientCellMetadata || {};
	const outputs = transientOptions?.transientOutputs ? [] : cell.outputs.map(output => {
		// Ensure we're in full control of the data being stored.
		// Possible we have classes instead of plain objects.
		return {
			outputId: output.outputId,
			metadata: output.metadata,
			outputs: output.outputs.map(item => {
				return {
					data: item.data,
					mime: item.mime,
				} satisfies IOutputItemDto;
			}),
		};
	});
	// Ensure we're in full control of the data being stored.
	// Possible we have classes instead of plain objects.
	return {
		cellKind: cell.cellKind,
		language: cell.language,
		metadata: cell.metadata ? filter(cell.metadata, key => !transientCellMetadata[key]) : cell.metadata,
		outputs,
		mime: cell.mime,
		source: cell.source,
		collapseState: cell.collapseState,
		internalMetadata: ignoreInternalMetadata ? undefined : cell.internalMetadata
	} satisfies ICellDto2;
}

function serializeSnapshot(data: NotebookData, transientOptions: TransientOptions | undefined): string {
	const dataDto: NotebookData = {
		// Never pass transient options, as we're after a backup here.
		// Else we end up stripping outputs from backups.
		// Whether its persisted or not is up to the serializer.
		// However when reloading/restoring we need to preserve outputs.
		cells: data.cells.map(cell => sanitizeCellDto2(cell)),
		metadata: data.metadata,
	};
	return JSON.stringify([
		JSON.stringify(transientOptions)
		, JSON.stringify(dataDto, (_key, value) => {
			if (value instanceof VSBuffer) {
				return {
					type: BufferMarker,
					data: encodeBase64(value)
				};
			}
			return value;
		})
	]);
}

export function deserializeSnapshot(snapshot: string): { transientOptions: TransientOptions | undefined; data: NotebookData } {
	const [transientOptionsStr, dataStr] = JSON.parse(snapshot);
	const transientOptions = transientOptionsStr ? JSON.parse(transientOptionsStr) as TransientOptions : undefined;

	const data: NotebookData = JSON.parse(dataStr, (_key, value) => {
		if (value && value.type === BufferMarker) {
			return decodeBase64(value.data);
		}
		return value;
	});

	return { transientOptions, data };
}
