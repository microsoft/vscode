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

	executeNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>, contextKeyService: IContextKeyService): Promise<void>;
	cancelNotebookCells(notebook: INotebookTextModel, cells: Iterable<NotebookCellTextModel>): Promise<void>;
	cancelNotebookCellHandles(notebook: INotebookTextModel, cells: Iterable<number>): Promise<void>;
	registerExecutionParticipant(participant: ICellExecutionParticipant): IDisposable;
}

export interface ICellExecutionParticipant {
	onWillExecuteCell(executions: INotebookCellExecution[]): Promise<void>;
}
