/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { INotebookSearchService } from '../../common/notebookSearch.js';
import { NotebookSearchService } from './notebookSearchService.js';

export function registerContributions(): void {
	registerSingleton(INotebookSearchService, NotebookSearchService, InstantiationType.Delayed);
}
