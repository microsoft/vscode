/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType, ICellExecuteOutputEdit, ICellExecuteOutputItemEdit } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';

export type ICellExecuteUpdate = ICellExecuteOutputEdit | ICellExecuteOutputItemEdit | ICellExecutionStateUpdate;

export interface ICellExecutionStateUpdate {
	editType: CellExecutionUpdateType.ExecutionState;
	executionOrder?: number;
	runStartTime?: number;
	didPause?: boolean;
}

export interface ICellExecutionComplete {
	runEndTime?: number;
	lastRunSuccess?: boolean;
}

export interface ICellExecutionEntry {
	notebook: URI;
	cellHandle: number;
	state: NotebookCellExecutionState;
	didPause: boolean;
}

export interface ICellExecutionStateChangedEvent {
	notebook: URI;
	cellHandle: number;
	changed?: ICellExecutionEntry; // undefined -> execution was completed
	affectsCell(cell: NotebookCellTextModel): boolean;
}

export const INotebookExecutionStateService = createDecorator<INotebookExecutionStateService>('INotebookExecutionStateService');

export interface INotebookExecutionStateService {
	_serviceBrand: undefined;

	onDidChangeCellExecution: Event<ICellExecutionStateChangedEvent>;

	getCellExecutionStatesForNotebook(notebook: URI): ICellExecutionEntry[];

	getCellExecutionState(cellUri: URI): ICellExecutionEntry | undefined;

	createNotebookCellExecution(notebook: URI, cellHandle: number): void;
	updateNotebookCellExecution(notebook: URI, cellHandle: number, updates: ICellExecuteUpdate[]): void;
	completeNotebookCellExecution(notebook: URI, cellHandle: number, complete: ICellExecutionComplete): void;
}
