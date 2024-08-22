/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions';
import { TreeSitterTextModelService } from '../../../../editor/browser/services/treeSitter/treeSitterParserService';
import { ITreeSitterParserService } from '../../../../editor/common/services/treeSitterParserService';
import { ITreeSitterTokenizationFeature } from './treeSitterTokenizationFeature';

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
