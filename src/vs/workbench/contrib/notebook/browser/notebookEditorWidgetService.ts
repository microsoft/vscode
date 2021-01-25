/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';

export const INotebookEditorWidgetService = createDecorator<INotebookEditorWidgetService>('INotebookEditorWidgetService');

export interface IBorrowValue<T> {
	readonly value: T | undefined;
}

export interface INotebookEditorWidgetService {
	_serviceBrand: undefined;
	widgets: NotebookEditorWidget[];
	retrieveWidget(accessor: ServicesAccessor, group: IEditorGroup, input: NotebookEditorInput): IBorrowValue<NotebookEditorWidget>;
}
