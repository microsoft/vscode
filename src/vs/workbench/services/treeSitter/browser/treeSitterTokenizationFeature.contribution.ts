/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { TreeSitterTextModelService } from 'vs/editor/browser/services/treeSitter/treeSitterParserService';
import { ITreeSitterParserService } from 'vs/editor/common/services/treeSitterParserService';
import { ITreeSitterTokenizationFeature } from 'vs/workbench/services/treeSitter/browser/treeSitterTokenizationFeature';

/**
 * Makes sure the ITreeSitterTokenizationService is instantiated
 */
class TreeSitterTokenizationInstantiator implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.treeSitterTokenizationInstantiator';

	constructor(
		@ITreeSitterParserService _treeSitterTokenizationService: ITreeSitterParserService,
		@ITreeSitterTokenizationFeature _treeSitterTokenizationFeature: ITreeSitterTokenizationFeature
	) { }
}

registerSingleton(ITreeSitterParserService, TreeSitterTextModelService, InstantiationType.Eager);

registerWorkbenchContribution2(TreeSitterTokenizationInstantiator.ID, TreeSitterTokenizationInstantiator, WorkbenchPhase.BlockRestore);
