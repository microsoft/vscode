/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { NotebookCellTextModel } from './model/notebookCellTextModel.js';
import { INotebookTextModel, IOutputDto, IOutputItemDto } from './notebookCommon.js';
import { INotebookCellExecution } from './notebookExecutionStateService.js';
// --- Start Erdos ---
// Add start/end execution events.

import { Event } from '../../../../base/common/event.js';

/** An event that fires when a notebook cells execution is started. */
export interface IDidStartNotebookCellsExecutionEvent {
	/** The handles of the cells being executed. */
	cellHandles: number[];
}

/** An event that fires when a notebook cells execution is ended. */
export interface IDidEndNotebookCellsExecutionEvent {
	/** The handles of the cells that were executed. */
	cellHandles: number[];

	/** The duration of the execution in milliseconds. */
	duration: number;
}
// --- End Erdos ---

export enum CellExecutionUpdateType {
	Output = 1,
	OutputItems = 2,
	ExecutionState = 3,
}

export interface ICellExecuteOutputEdit {
	editType: CellExecutionUpdateType.Output;
	cellHandle: number;
	append?: boolean;
	outputs: IOutputDto[];
}

export interface ICellExecuteOutputItemEdit {
	editType: CellExecutionUpdateType.OutputItems;
	append?: boolean;
	outputId: string;
	items: IOutputItemDto[];
}

export const INotebookExecutionService = createDecorator<INotebookExecutionService>('INotebookExecutionService');

export interface INotebookExecutionService {
	_serviceBrand: undefined;
	// --- Start Erdos ---
	// Add start/end execution events.

	/** An event that fires when a notebook cells execution is started. */
	onDidStartNotebookCellsExecution: Event<IDidStartNotebookCellsExecutionEvent>;

	/** An event that fires when a notebook cells execution is ended. */
	onDidEndNotebookCellsExecution: Event<IDidEndNotebookCellsExecutionEvent>;
	// --- End Erdos ---

	executeNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>, contextKeyService: IContextKeyService): Promise<void>;
	cancelNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>): Promise<void>;
	cancelNotebookCellHandles(notebook: INotebookTextModel, cells: Iterable<number>): Promise<void>;
	registerExecutionParticipant(participant: ICellExecutionParticipant): IDisposable;
}

export interface ICellExecutionParticipant {
	onWillExecuteCell(executions: INotebookCellExecution[]): Promise<void>;
}
