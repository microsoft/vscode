/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { ITreeSitterTokenizationService } from 'vs/workbench/services/treeSitter/browser/treeSitterTokenizationFeature';
import { TreeSitterTokenizationService } from 'vs/workbench/services/treeSitter/browser/treeSitterTokenizationFeatureImpl';

/**
 * Makes sure the ITreeSitterTokenizationService is instantiated
 */
class TreeSitterTokenizationInstantiator implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.treeSitterTokenizationInstantiator';

	constructor(
		@ITreeSitterTokenizationService _treeSitterTokenizationService: ITreeSitterTokenizationService
	) { }
}

registerSingleton(ITreeSitterTokenizationService, TreeSitterTokenizationService, InstantiationType.Eager);

registerWorkbenchContribution2(TreeSitterTokenizationInstantiator.ID, TreeSitterTokenizationInstantiator, WorkbenchPhase.BlockRestore);
