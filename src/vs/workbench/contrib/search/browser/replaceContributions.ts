/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IReplaceService } from 'vs/workbench/contrib/search/common/replace';
import { ReplaceService, ReplacePreviewContentProvider } from 'vs/workbench/contrib/search/browser/replaceService';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export function registerContributions(): void {
	registerSingleton(IReplaceService, ReplaceService, true);
	Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ReplacePreviewContentProvider, 'ReplacePreviewContentProvider', LifecyclePhase.Starting);
}
