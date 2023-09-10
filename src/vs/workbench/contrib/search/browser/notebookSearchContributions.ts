/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ReplacePreviewContentProvider } from 'vs/workbench/contrib/search/browser/replaceService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { INotebookSearchService } from 'vs/workbench/contrib/search/common/notebookSearch';
import { NotebookSearchService } from 'vs/workbench/contrib/search/browser/notebookSearchService';

export function registerContributions(): void {
	registerSingleton(INotebookSearchService, NotebookSearchService, InstantiationType.Delayed);
	Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ReplacePreviewContentProvider, LifecyclePhase.Starting);
}
