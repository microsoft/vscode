/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IOutputDto, IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export enum CellExecutionUpdateType {
	Output = 1,
	OutputItems = 2,
	ExecutionState = 3,
	Complete = 4,
}

export interface ICellExecuteOutputEdit {
	editType: CellExecutionUpdateType.Output;
	cellHandle: number;
	append?: boolean;
	outputs: IOutputDto[]
}

export interface ICellExecuteOutputItemEdit {
	editType: CellExecutionUpdateType.OutputItems;
	append?: boolean;
	outputId: string;
	items: IOutputItemDto[]
}

export type ICellExecuteUpdate = ICellExecuteOutputEdit | ICellExecuteOutputItemEdit | ICellExecutionStateUpdate | ICellExecutionComplete;

export interface ICellExecutionStateUpdate {
	editType: CellExecutionUpdateType.ExecutionState;
	executionOrder?: number;
	runStartTime?: number;
}

export interface ICellExecutionComplete {
	editType: CellExecutionUpdateType.Complete;
	runEndTime?: number;
	lastRunSuccess?: boolean;
}

export interface INotebookCellExecution {
	readonly notebook: URI;
	readonly cellHandle: number;
	update(updates: ICellExecuteUpdate[]): void;
}

export const INotebookExecutionService = createDecorator<INotebookExecutionService>('INotebookExecutionService');

export interface INotebookExecutionService {
	_serviceBrand: undefined;

	createNotebookCellExecution(notebook: URI, cellHandle: number): INotebookCellExecution;
}
