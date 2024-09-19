/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { TreeSitterTextModelService } from '../../../../editor/browser/services/treeSitter/treeSitterParserService.js';
import { ITreeSitterParserService } from '../../../../editor/common/services/treeSitterParserService.js';
import { ITreeSitterTokenizationFeature } from './treeSitterTokenizationFeature.js';

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
