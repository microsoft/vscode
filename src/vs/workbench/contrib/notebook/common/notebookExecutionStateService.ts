/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { NotebookCellExecutionState } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CellExecutionUpdateType, ICellExecuteOutputEdit, ICellExecuteOutputItemEdit } from 'vs/workbench/contrib/notebook/common/notebookExecutionService';

export type ICellExecuteUpdate = ICellExecuteOutputEdit | ICellExecuteOutputItemEdit | ICellExecutionStateUpdate;

export interface ICellExecutionStateUpdate {
	editType: CellExecutionUpdateType.ExecutionState;
	executionOrder?: number;
	runStartTime?: number;
}

export interface ICellExecutionComplete {
	runEndTime?: number;
	lastRunSuccess?: boolean;
}

export interface ICellExecutionState {
	state: NotebookCellExecutionState;
}

export interface INotebookExecutionEvent {
	notebook: URI;
	cellHandle: number;
}

export const INotebookExecutionStateService = createDecorator<INotebookExecutionStateService>('INotebookExecutionStateService');

export interface INotebookExecutionStateService {
	_serviceBrand: undefined;

	onDidChangeCellExecution: Event<INotebookExecutionEvent>;

	getCellExecutionState(notebook: URI, handle: number): ICellExecutionState | undefined;

	createNotebookCellExecution(notebook: URI, cellHandle: number): void;
	updateNotebookCellExecution(notebook: URI, cellHandle: number, updates: ICellExecuteUpdate[]): void;
	completeNotebookCellExecution(notebook: URI, cellHandle: number, complete: ICellExecutionComplete): void;
}
