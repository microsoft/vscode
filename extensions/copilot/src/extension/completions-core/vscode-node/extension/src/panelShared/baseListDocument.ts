/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position, Range } from 'vscode';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { postInsertionTasks } from '../../../lib/src/postInsertion';
import { countLines } from '../../../lib/src/suggestions/partialSuggestions';
import { IPosition, ITextDocument } from '../../../lib/src/textDocument';
import { normalizeCompletionText, solutionCountTarget, SolutionManager } from '../lib/panelShared/common';
import { UnformattedSolution } from '../lib/panelShared/panelTypes';
import { BasePanelCompletion, ISuggestionsPanel } from './basePanelTypes';

// BaseListDocument to be shared with both the copilot and comparison completion panels.
export abstract class BaseListDocument<TPanelCompletion extends BasePanelCompletion> extends SolutionManager {
	private _solutionCount = 0;
	protected readonly _solutions: TPanelCompletion[] = [];

	constructor(
		textDocument: ITextDocument,
		position: IPosition,
		readonly panel: ISuggestionsPanel,
		countTarget = solutionCountTarget,
		@IInstantiationService protected readonly instantiationService: IInstantiationService
	) {
		super(textDocument, position, panel.cancellationToken, countTarget);
	}

	protected abstract createPanelCompletion(
		unformatted: UnformattedSolution,
		baseCompletion: BasePanelCompletion
	): TPanelCompletion;
	protected abstract shouldAddSolution(newItem: TPanelCompletion): boolean;
	protected abstract runSolutionsImpl(): Promise<void>;

	// Find if two solutions are duplicates by comparing their normalized text content.
	protected areSolutionsDuplicates(solutionA: TPanelCompletion, solutionB: TPanelCompletion): boolean {
		const stripA = normalizeCompletionText(solutionA.insertText);
		const stripB = normalizeCompletionText(solutionB.insertText);
		return stripA === stripB;
	}

	protected findDuplicateSolution(newItem: TPanelCompletion): TPanelCompletion | undefined {
		return this._solutions.find(item => this.areSolutionsDuplicates(item, newItem));
	}

	onSolution(unformatted: UnformattedSolution) {
		const offset = this.textDocument.offsetAt(this.targetPosition);
		const rank = this._solutions.length;

		const postInsertionCallback = () => {
			const telemetryData = this.savedTelemetryData!.extendedBy(
				{
					choiceIndex: unformatted.choiceIndex.toString(),
					engineName: unformatted.modelId || '',
				},
				{
					compCharLen: unformatted.insertText.length,
					meanProb: unformatted.meanProb,
					rank,
				}
			);
			return this.instantiationService.invokeFunction(postInsertionTasks,
				'solution',
				unformatted.insertText,
				offset,
				this.textDocument.uri,
				telemetryData,
				{
					compType: 'full',
					acceptedLength: unformatted.insertText.length,
					acceptedLines: countLines(unformatted.insertText),
				},
				unformatted.copilotAnnotations
			);
		};

		const baseCompletion: BasePanelCompletion = {
			insertText: unformatted.insertText,
			range: new Range(
				new Position(unformatted.range.start.line, unformatted.range.start.character),
				new Position(unformatted.range.end.line, unformatted.range.end.character)
			),
			copilotAnnotations: unformatted.copilotAnnotations,
			postInsertionCallback,
		};

		const newItem = this.createPanelCompletion(unformatted, baseCompletion);

		if (this.shouldAddSolution(newItem)) {
			this.panel.onItem(newItem);
			this._solutions.push(newItem);
		}
		this._solutionCount++;
		this.panel.onWorkDone({ percentage: (100 * this._solutionCount) / this.solutionCountTarget });
	}

	onFinishedNormally() {
		return this.panel.onFinished();
	}

	onFinishedWithError(_: string) {
		return this.onFinishedNormally();
	}

	runQuery() {
		return this.runSolutionsImpl();
	}
}
