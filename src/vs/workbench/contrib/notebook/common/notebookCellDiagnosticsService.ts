/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICellExecutionError } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';
import { Event } from 'vs/base/common/event';

export const INotebookCellDiagnosticsService = createDecorator<INotebookCellDiagnosticsService>('notebookCellDiagnosticsService');

export interface INotebookCellDiagnosticsService {
	readonly _serviceBrand: undefined;

	onDidDiagnosticsChange: Event<void>;

	registerCellExecutionError(cellUri: URI, diagnostics: ICellExecutionError): IDisposable;
	getCellExecutionError(cellUri: URI): ICellExecutionError | undefined;
}
