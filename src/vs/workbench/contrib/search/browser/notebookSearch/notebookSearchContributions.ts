/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions';
import { INotebookSearchService } from '../../common/notebookSearch';
import { NotebookSearchService } from './notebookSearchService';

export function registerContributions(): void {
	registerSingleton(INotebookSearchService, NotebookSearchService, InstantiationType.Delayed);
}
