/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extHostProtocol from 'vs/workbench/api/common/extHost.protocol';
import * as notebookCommon from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';
import { ICellExecuteUpdate, ICellExecutionComplete } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export namespace NotebookDto {

	export function toNotebookOutputItemDto(item: notebookCommon.IOutputItemDto): extHostProtocol.NotebookOutputItemDto {
		return {
			mime: item.mime,
			valueBytes: item.data
		};
	}

	export function toNotebookOutputDto(output: notebookCommon.IOutputDto): extHostProtocol.NotebookOutputDto {
		return {
			outputId: output.outputId,
			metadata: output.metadata,
			items: output.outputs.map(toNotebookOutputItemDto)
		};
	}

	export function toNotebookCellDataDto(cell: notebookCommon.ICellDto2): extHostProtocol.NotebookCellDataDto {
		return {
			cellKind: cell.cellKind,
			language: cell.language,
			mime: cell.mime,
			source: cell.source,
			internalMetadata: cell.internalMetadata,
			metadata: cell.metadata,
			outputs: cell.outputs.map(toNotebookOutputDto)
		};
	}

	export function toNotebookDataDto(data: notebookCommon.NotebookData): extHostProtocol.NotebookDataDto {
		return {
			metadata: data.metadata,
			cells: data.cells.map(toNotebookCellDataDto)
		};
	}

	export function fromNotebookOutputItemDto(item: extHostProtocol.NotebookOutputItemDto): notebookCommon.IOutputItemDto {
		return {
			mime: item.mime,
			data: item.valueBytes
		};
	}

	export function fromNotebookOutputDto(output: extHostProtocol.NotebookOutputDto): notebookCommon.IOutputDto {
		return {
			outputId: output.outputId,
			metadata: output.metadata,
			outputs: output.items.map(fromNotebookOutputItemDto)
		};
	}

	export function fromNotebookCellDataDto(cell: extHostProtocol.NotebookCellDataDto): notebookCommon.ICellDto2 {
		return {
			cellKind: cell.cellKind,
			language: cell.language,
			mime: cell.mime,
			source: cell.source,
			outputs: cell.outputs.map(fromNotebookOutputDto),
			metadata: cell.metadata,
			internalMetadata: cell.internalMetadata
		};
	}

	export function fromNotebookDataDto(data: extHostProtocol.NotebookDataDto): notebookCommon.NotebookData {
		return {
			metadata: data.metadata,
			cells: data.cells.map(fromNotebookCellDataDto)
		};
	}

	export function toNotebookCellDto(cell: notebookCommon.ICell): extHostProtocol.NotebookCellDto {
		return {
			handle: cell.handle,
			uri: cell.uri,
			source: cell.textBuffer.getLinesContent(),
			eol: cell.textBuffer.getEOL(),
			language: cell.language,
			cellKind: cell.cellKind,
			outputs: cell.outputs.map(toNotebookOutputDto),
			metadata: cell.metadata,
			internalMetadata: cell.internalMetadata,
		};
	}

	export function fromCellExecuteUpdateDto(data: extHostProtocol.ICellExecuteUpdateDto): ICellExecuteUpdate {
		if (data.editType === CellExecutionUpdateType.Output) {
			return {
				editType: data.editType,
				cellHandle: data.cellHandle,
				append: data.append,
				outputs: data.outputs.map(fromNotebookOutputDto)
			};
		} else if (data.editType === CellExecutionUpdateType.OutputItems) {
			return {
				editType: data.editType,
				append: data.append,
				outputId: data.outputId,
				items: data.items.map(fromNotebookOutputItemDto)
			};
		} else {
			return data;
		}
	}

	export function fromCellExecuteCompleteDto(data: extHostProtocol.ICellExecutionCompleteDto): ICellExecutionComplete {
		return data;
	}

	export function fromCellEditOperationDto(edit: extHostProtocol.ICellEditOperationDto): notebookCommon.ICellEditOperation {
		if (edit.editType === notebookCommon.CellEditType.Replace) {
			return {
				editType: edit.editType,
				index: edit.index,
				count: edit.count,
				cells: edit.cells.map(fromNotebookCellDataDto)
			};
		} else {
			return edit;
		}
	}
}
