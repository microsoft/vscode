/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IReplaceService } from './replace.js';
import { ReplaceService, ReplacePreviewContentProvider } from './replaceService.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';

export function registerContributions(): void {
	registerSingleton(IReplaceService, ReplaceService, InstantiationType.Delayed);
	registerWorkbenchContribution2(ReplacePreviewContentProvider.ID, ReplacePreviewContentProvider, WorkbenchPhase.BlockStartup /* registration only */);
}
