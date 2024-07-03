/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IReplaceService } from 'vs/workbench/contrib/search/browser/replace';
import { ReplaceService, ReplacePreviewContentProvider } from 'vs/workbench/contrib/search/browser/replaceService';
import { WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';

export function registerContributions(): void {
	registerSingleton(IReplaceService, ReplaceService, InstantiationType.Delayed);
	registerWorkbenchContribution2(ReplacePreviewContentProvider.ID, ReplacePreviewContentProvider, WorkbenchPhase.BlockStartup /* registration only */);
}
