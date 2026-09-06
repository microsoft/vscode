/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { IPosition, ITextDocument } from '../../../lib/src/textDocument';
import { solutionCountTarget } from '../lib/copilotPanel/common';
import { runSolutions } from '../lib/copilotPanel/panel';
import { UnformattedSolution } from '../lib/panelShared/panelTypes';
import { BaseListDocument } from '../panelShared/baseListDocument';
import { BasePanelCompletion, ISuggestionsPanel } from '../panelShared/basePanelTypes';
import { PanelCompletion } from './common';

/**
 * Class representing a Open Copilot list using a ITextDocument as a way of displaying results.
 * Currently only used in the VSCode extension.
 */
export class CopilotListDocument extends BaseListDocument<PanelCompletion> {
	constructor(
		textDocument: ITextDocument,
		position: IPosition,
		panel: ISuggestionsPanel,
		countTarget = solutionCountTarget,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(textDocument, position, panel, countTarget, instantiationService);
	}

	protected createPanelCompletion(
		unformatted: UnformattedSolution,
		baseCompletion: BasePanelCompletion
	): PanelCompletion {
		return {
			insertText: baseCompletion.insertText,
			range: baseCompletion.range,
			copilotAnnotations: baseCompletion.copilotAnnotations,
			postInsertionCallback: baseCompletion.postInsertionCallback,
		};
	}

	protected shouldAddSolution(newItem: PanelCompletion): boolean {
		return !this.findDuplicateSolution(newItem);
	}

	protected runSolutionsImpl(): Promise<void> {
		return this.instantiationService.invokeFunction(runSolutions, this, this);
	}
}
