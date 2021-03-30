/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IResolvedNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IReference } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';

export const INotebookEditorModelResolverService = createDecorator<INotebookEditorModelResolverService>('INotebookModelResolverService');

export interface INotebookEditorModelResolverService {
	readonly _serviceBrand: undefined;

	onDidSaveNotebook: Event<URI>;

	resolve(resource: URI, viewType?: string): Promise<IReference<IResolvedNotebookEditorModel>>;
}
