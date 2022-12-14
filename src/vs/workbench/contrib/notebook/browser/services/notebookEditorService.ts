/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';
import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { INotebookEditor, INotebookEditorCreationOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { Event } from 'vs/base/common/event';
import { Dimension } from 'vs/base/browser/dom';

export const INotebookEditorService = createDecorator<INotebookEditorService>('INotebookEditorWidgetService');

export interface IBorrowValue<T> {
	readonly value: T | undefined;
}

export interface INotebookEditorService {
	_serviceBrand: undefined;

	retrieveWidget(accessor: ServicesAccessor, group: IEditorGroup, input: NotebookEditorInput, creationOptions?: INotebookEditorCreationOptions, dimension?: Dimension): IBorrowValue<INotebookEditor>;

	onDidAddNotebookEditor: Event<INotebookEditor>;
	onDidRemoveNotebookEditor: Event<INotebookEditor>;
	addNotebookEditor(editor: INotebookEditor): void;
	removeNotebookEditor(editor: INotebookEditor): void;
	getNotebookEditor(editorId: string): INotebookEditor | undefined;
	listNotebookEditors(): readonly INotebookEditor[];
}
