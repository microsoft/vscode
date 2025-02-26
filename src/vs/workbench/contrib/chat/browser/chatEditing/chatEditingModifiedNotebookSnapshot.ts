/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { NotebookTextModel } from '../../../notebook/common/model/notebookTextModel.js';
import { ICellDto2, IOutputItemDto, NotebookData, NotebookSetting, TransientOptions } from '../../../notebook/common/notebookCommon.js';

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

export function createSnapshot(notebook: NotebookTextModel, transientOptions: TransientOptions | undefined, configurationService: IConfigurationService): string {
	const outputSizeLimit = configurationService.getValue<number>(NotebookSetting.outputBackupSizeLimit) * 1024;
	return serializeSnapshot(notebook.createSnapshot({ context: SnapshotContext.Backup, outputSizeLimit, transientOptions }), transientOptions);
}

export function restoreSnapshot(notebook: NotebookTextModel, snapshot: string): void {
	try {
		const { transientOptions, data } = deserializeSnapshot(snapshot);
		notebook.restoreSnapshot(data, transientOptions);
	}
	catch (ex) {
		console.error('Error restoring Notebook snapshot', ex);
	}
}

export function serializeSnapshot(data: NotebookData, transientOptions: TransientOptions | undefined): string {
	data.cells.forEach(cell => {
		const outputs = cell.outputs.map(output => {
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
			metadata: cell.metadata,
			outputs,
			mime: cell.mime,
			source: cell.source,
			collapseState: cell.collapseState,
			// No need to store the internal metadata, as this can contain unique information such as cell ids.
			// Also its not something that can be persisted, hence no need to try to restore that either.
			internalMetadata: undefined
		} satisfies ICellDto2;
	});
	return JSON.stringify([
		JSON.stringify(transientOptions)
		, JSON.stringify(data, (_key, value) => {
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
