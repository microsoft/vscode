/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { INotebookSearchService } from 'vs/workbench/contrib/search/common/notebookSearch';
import { NotebookSearchService } from 'vs/workbench/contrib/search/browser/notebookSearch/notebookSearchService';

export function registerContributions(): void {
	registerSingleton(INotebookSearchService, NotebookSearchService, InstantiationType.Delayed);
}
