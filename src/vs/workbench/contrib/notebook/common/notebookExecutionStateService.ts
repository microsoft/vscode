/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { NotebookCellExecutionState, NotebookExecutionState } from './notebookCommon.js';
import { CellExecutionUpdateType, ICellExecuteOutputEdit, ICellExecuteOutputItemEdit } from './notebookExecutionService.js';

export type ICellExecuteUpdate = ICellExecuteOutputEdit | ICellExecuteOutputItemEdit | ICellExecutionStateUpdate;

export interface ICellExecutionStateUpdate {
	editType: CellExecutionUpdateType.ExecutionState;
	executionOrder?: number;
	runStartTime?: number;
	didPause?: boolean;
	isPaused?: boolean;
}

export interface ICellExecutionError {
	message: string;
	stack: string | undefined;
	uri: UriComponents;
	location: IRange | undefined;
}
export interface ICellExecutionComplete {
	runEndTime?: number;
	lastRunSuccess?: boolean;
	error?: ICellExecutionError;
}
export enum NotebookExecutionType {
	cell,
	notebook
}
export interface ICellExecutionStateChangedEvent {
	type: NotebookExecutionType.cell;
	notebook: URI;
	cellHandle: number;
	changed?: INotebookCellExecution; // undefined -> execution was completed
	affectsCell(cell: URI): boolean;
	affectsNotebook(notebook: URI): boolean;
}
export interface IExecutionStateChangedEvent {
	type: NotebookExecutionType.notebook;
	notebook: URI;
	changed?: INotebookExecution; // undefined -> execution was completed
	affectsNotebook(notebook: URI): boolean;
}
export interface INotebookFailStateChangedEvent {
	visible: boolean;
	notebook: URI;
}

export interface IFailedCellInfo {
	cellHandle: number;
	disposable: IDisposable;
	visible: boolean;
}

export const INotebookExecutionStateService = createDecorator<INotebookExecutionStateService>('INotebookExecutionStateService');

export interface INotebookExecutionStateService {
	_serviceBrand: undefined;

	onDidChangeExecution: Event<ICellExecutionStateChangedEvent | IExecutionStateChangedEvent>;
	onDidChangeLastRunFailState: Event<INotebookFailStateChangedEvent>;

	forceCancelNotebookExecutions(notebookUri: URI): void;
	getCellExecutionsForNotebook(notebook: URI): INotebookCellExecution[];
	getCellExecutionsByHandleForNotebook(notebook: URI): Map<number, INotebookCellExecution> | undefined;
	getCellExecution(cellUri: URI): INotebookCellExecution | undefined;
	createCellExecution(notebook: URI, cellHandle: number): INotebookCellExecution;
	getExecution(notebook: URI): INotebookExecution | undefined;
	createExecution(notebook: URI): INotebookExecution;
	getLastFailedCellForNotebook(notebook: URI): number | undefined;
}

export interface INotebookCellExecution {
	readonly notebook: URI;
	readonly cellHandle: number;
	readonly state: NotebookCellExecutionState;
	readonly didPause: boolean;
	readonly isPaused: boolean;

	confirm(): void;
	update(updates: ICellExecuteUpdate[]): void;
	complete(complete: ICellExecutionComplete): void;
}
export interface INotebookExecution {
	readonly notebook: URI;
	readonly state: NotebookExecutionState;

	confirm(): void;
	begin(): void;
	complete(): void;
}
