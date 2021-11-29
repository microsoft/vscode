/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookTextModel, IOutputDto, IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernel } from 'vs/workbench/contrib/notebook/common/notebookKernelService';

export enum CellExecutionUpdateType {
	Output = 1,
	OutputItems = 2,
	ExecutionState = 3,
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

export const INotebookExecutionService = createDecorator<INotebookExecutionService>('INotebookExecutionService');

export interface INotebookExecutionService {
	_serviceBrand: undefined;

	createNotebookCellExecution(notebook: URI, cellHandle: number): void;
	updateNotebookCellExecution(notebook: URI, cellHandle: number, updates: ICellExecuteUpdate[]): void;
	completeNotebookCellExecution(notebook: URI, cellHandle: number, complete: ICellExecutionComplete): void;
	getSelectedOrSuggestedKernel(notebook: INotebookTextModel): INotebookKernel | undefined;
	executeNotebookCells(notebook: INotebookTextModel, cells: Iterable<ICellViewModel>): Promise<void>;
	cancelNotebookCells(notebook: INotebookTextModel, cells: Iterable<ICellViewModel>): Promise<void>;
	cancelNotebookCellHandles(notebook: INotebookTextModel, cells: Iterable<number>): Promise<void>;
}
