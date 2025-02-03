/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { CompareResult } from '../../../../../base/common/arrays.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader } from '../../../../../base/common/observable.js';
import { ICodeEditor, IViewZoneChangeAccessor } from '../../../../../editor/browser/editorBrowser.js';
import { LineRange } from '../model/lineRange.js';
import { DetailedLineRangeMapping } from '../model/mapping.js';
import { ModifiedBaseRange } from '../model/modifiedBaseRange.js';
import { join } from '../utils.js';
import { ActionsSource, ConflictActionsFactory, IContentWidgetAction } from './conflictActions.js';
import { getAlignments } from './lineAlignment.js';
import { MergeEditorViewModel } from './viewModel.js';

export class ViewZoneComputer {
	private readonly conflictActionsFactoryInput1 = new ConflictActionsFactory(this.input1Editor);
	private readonly conflictActionsFactoryInput2 = new ConflictActionsFactory(this.input2Editor);
	private readonly conflictActionsFactoryResult = new ConflictActionsFactory(this.resultEditor);

	constructor(
		private readonly input1Editor: ICodeEditor,
		private readonly input2Editor: ICodeEditor,
		private readonly resultEditor: ICodeEditor,
	) { }

	public computeViewZones(
		reader: IReader,
		viewModel: MergeEditorViewModel,
		options: {
			shouldAlignResult: boolean;
			shouldAlignBase: boolean;
			codeLensesVisible: boolean;
			showNonConflictingChanges: boolean;
		}
	): MergeEditorViewZones {
		let input1LinesAdded = 0;
		let input2LinesAdded = 0;
		let baseLinesAdded = 0;
		let resultLinesAdded = 0;

		const input1ViewZones: MergeEditorViewZone[] = [];
		const input2ViewZones: MergeEditorViewZone[] = [];
		const baseViewZones: MergeEditorViewZone[] = [];
		const resultViewZones: MergeEditorViewZone[] = [];

		const model = viewModel.model;

		const resultDiffs = model.baseResultDiffs.read(reader);
		const baseRangeWithStoreAndTouchingDiffs = join(
			model.modifiedBaseRanges.read(reader),
			resultDiffs,
			(baseRange, diff) =>
				baseRange.baseRange.touches(diff.inputRange)
					? CompareResult.neitherLessOrGreaterThan
					: LineRange.compareByStart(
						baseRange.baseRange,
						diff.inputRange
					)
		);

		const shouldShowCodeLenses = options.codeLensesVisible;
		const showNonConflictingChanges = options.showNonConflictingChanges;

		let lastModifiedBaseRange: ModifiedBaseRange | undefined = undefined;
		let lastBaseResultDiff: DetailedLineRangeMapping | undefined = undefined;
		for (const m of baseRangeWithStoreAndTouchingDiffs) {
			if (shouldShowCodeLenses && m.left && (m.left.isConflicting || showNonConflictingChanges || !model.isHandled(m.left).read(reader))) {
				const actions = new ActionsSource(viewModel, m.left);
				if (options.shouldAlignResult || !actions.inputIsEmpty.read(reader)) {
					input1ViewZones.push(new CommandViewZone(this.conflictActionsFactoryInput1, m.left.input1Range.startLineNumber - 1, actions.itemsInput1));
					input2ViewZones.push(new CommandViewZone(this.conflictActionsFactoryInput2, m.left.input2Range.startLineNumber - 1, actions.itemsInput2));
					if (options.shouldAlignBase) {
						baseViewZones.push(new Placeholder(m.left.baseRange.startLineNumber - 1, 16));
					}
				}
				const afterLineNumber = m.left.baseRange.startLineNumber + (lastBaseResultDiff?.resultingDeltaFromOriginalToModified ?? 0) - 1;
				resultViewZones.push(new CommandViewZone(this.conflictActionsFactoryResult, afterLineNumber, actions.resultItems));

			}

			const lastResultDiff = m.rights.at(-1)!;
			if (lastResultDiff) {
				lastBaseResultDiff = lastResultDiff;
			}
			let alignedLines: LineAlignment[];
			if (m.left) {
				alignedLines = getAlignments(m.left).map(a => ({
					input1Line: a[0],
					baseLine: a[1],
					input2Line: a[2],
					resultLine: undefined,
				}));

				lastModifiedBaseRange = m.left;
				// This is a total hack.
				alignedLines[alignedLines.length - 1].resultLine =
					m.left.baseRange.endLineNumberExclusive
					+ (lastBaseResultDiff ? lastBaseResultDiff.resultingDeltaFromOriginalToModified : 0);

			} else {
				alignedLines = [{
					baseLine: lastResultDiff.inputRange.endLineNumberExclusive,
					input1Line: lastResultDiff.inputRange.endLineNumberExclusive + (lastModifiedBaseRange ? (lastModifiedBaseRange.input1Range.endLineNumberExclusive - lastModifiedBaseRange.baseRange.endLineNumberExclusive) : 0),
					input2Line: lastResultDiff.inputRange.endLineNumberExclusive + (lastModifiedBaseRange ? (lastModifiedBaseRange.input2Range.endLineNumberExclusive - lastModifiedBaseRange.baseRange.endLineNumberExclusive) : 0),
					resultLine: lastResultDiff.outputRange.endLineNumberExclusive,
				}];
			}

			for (const { input1Line, baseLine, input2Line, resultLine } of alignedLines) {
				if (!options.shouldAlignBase && (input1Line === undefined || input2Line === undefined)) {
					continue;
				}

				const input1Line_ =
					input1Line !== undefined ? input1Line + input1LinesAdded : -1;
				const input2Line_ =
					input2Line !== undefined ? input2Line + input2LinesAdded : -1;
				const baseLine_ = baseLine + baseLinesAdded;
				const resultLine_ = resultLine !== undefined ? resultLine + resultLinesAdded : -1;

				const max = Math.max(options.shouldAlignBase ? baseLine_ : 0, input1Line_, input2Line_, options.shouldAlignResult ? resultLine_ : 0);

				if (input1Line !== undefined) {
					const diffInput1 = max - input1Line_;
					if (diffInput1 > 0) {
						input1ViewZones.push(new Spacer(input1Line - 1, diffInput1));
						input1LinesAdded += diffInput1;
					}
				}

				if (input2Line !== undefined) {
					const diffInput2 = max - input2Line_;
					if (diffInput2 > 0) {
						input2ViewZones.push(new Spacer(input2Line - 1, diffInput2));
						input2LinesAdded += diffInput2;
					}
				}

				if (options.shouldAlignBase) {
					const diffBase = max - baseLine_;
					if (diffBase > 0) {
						baseViewZones.push(new Spacer(baseLine - 1, diffBase));
						baseLinesAdded += diffBase;
					}
				}

				if (options.shouldAlignResult && resultLine !== undefined) {
					const diffResult = max - resultLine_;
					if (diffResult > 0) {
						resultViewZones.push(new Spacer(resultLine - 1, diffResult));
						resultLinesAdded += diffResult;
					}
				}
			}
		}

		return new MergeEditorViewZones(input1ViewZones, input2ViewZones, baseViewZones, resultViewZones);
	}
}

interface LineAlignment {
	baseLine: number;
	input1Line?: number;
	input2Line?: number;
	resultLine?: number;
}

export class MergeEditorViewZones {
	constructor(
		public readonly input1ViewZones: readonly MergeEditorViewZone[],
		public readonly input2ViewZones: readonly MergeEditorViewZone[],
		public readonly baseViewZones: readonly MergeEditorViewZone[],
		public readonly resultViewZones: readonly MergeEditorViewZone[],
	) { }
}

/**
 * This is an abstract class to create various editor view zones.
*/
export abstract class MergeEditorViewZone {
	abstract create(viewZoneChangeAccessor: IViewZoneChangeAccessor, viewZoneIdsToCleanUp: string[], disposableStore: DisposableStore): void;
}

class Spacer extends MergeEditorViewZone {
	constructor(
		private readonly afterLineNumber: number,
		private readonly heightInLines: number
	) {
		super();
	}

	override create(
		viewZoneChangeAccessor: IViewZoneChangeAccessor,
		viewZoneIdsToCleanUp: string[],
		disposableStore: DisposableStore
	): void {
		viewZoneIdsToCleanUp.push(
			viewZoneChangeAccessor.addZone({
				afterLineNumber: this.afterLineNumber,
				heightInLines: this.heightInLines,
				domNode: $('div.diagonal-fill'),
			})
		);
	}
}

class Placeholder extends MergeEditorViewZone {
	constructor(
		private readonly afterLineNumber: number,
		private readonly heightPx: number
	) {
		super();
	}

	override create(
		viewZoneChangeAccessor: IViewZoneChangeAccessor,
		viewZoneIdsToCleanUp: string[],
		disposableStore: DisposableStore
	): void {
		viewZoneIdsToCleanUp.push(
			viewZoneChangeAccessor.addZone({
				afterLineNumber: this.afterLineNumber,
				heightInPx: this.heightPx,
				domNode: $('div.conflict-actions-placeholder'),
			})
		);
	}
}

class CommandViewZone extends MergeEditorViewZone {
	constructor(
		private readonly conflictActionsFactory: ConflictActionsFactory,
		private readonly lineNumber: number,
		private readonly items: IObservable<IContentWidgetAction[]>,
	) {
		super();
	}

	override create(viewZoneChangeAccessor: IViewZoneChangeAccessor, viewZoneIdsToCleanUp: string[], disposableStore: DisposableStore): void {
		disposableStore.add(
			this.conflictActionsFactory.createWidget(
				viewZoneChangeAccessor,
				this.lineNumber,
				this.items,
				viewZoneIdsToCleanUp,
			)
		);
	}
}
