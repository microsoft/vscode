/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompareResult } from 'vs/base/common/arrays';
import { autorun, derived } from 'vs/base/common/observable';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { applyObservableDecorations, join } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from 'vs/workbench/contrib/mergeEditor/browser/view/colors';
import { CodeEditorView } from './codeEditorView';

export class ResultCodeEditorView extends CodeEditorView {
	private readonly decorations = derived('result.decorations', reader => {
		const viewModel = this.viewModel.read(reader);
		if (!viewModel) {
			return [];
		}
		const model = viewModel.model;
		const result = new Array<IModelDeltaDecoration>();

		const baseRangeWithStoreAndTouchingDiffs = join(
			model.modifiedBaseRanges.read(reader),
			model.resultDiffs.read(reader),
			(baseRange, diff) => baseRange.baseRange.touches(diff.inputRange)
				? CompareResult.neitherLessOrGreaterThan
				: LineRange.compareByStart(
					baseRange.baseRange,
					diff.inputRange
				)
		);

		const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);

		for (const m of baseRangeWithStoreAndTouchingDiffs) {
			const modifiedBaseRange = m.left;

			if (modifiedBaseRange) {
				const range = model.getRangeInResult(modifiedBaseRange.baseRange, reader).toInclusiveRange();
				if (range) {
					const blockClassNames = ['merge-editor-block'];
					const isHandled = model.isHandled(modifiedBaseRange).read(reader);
					if (isHandled) {
						blockClassNames.push('handled');
					}
					if (modifiedBaseRange === activeModifiedBaseRange) {
						blockClassNames.push('focused');
					}
					blockClassNames.push('result');

					result.push({
						range,
						options: {
							isWholeLine: true,
							blockClassName: blockClassNames.join(' '),
							description: 'Result Diff',
							minimap: {
								position: MinimapPosition.Gutter,
								color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
							},
							overviewRuler: {
								position: OverviewRulerLane.Center,
								color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
							}
						}
					});
				}
			}

			for (const diff of m.rights) {
				const range = diff.outputRange.toInclusiveRange();
				if (range) {
					result.push({
						range,
						options: {
							className: `merge-editor-diff result`,
							description: 'Merge Editor',
							isWholeLine: true,
						}
					});
				}

				if (diff.rangeMappings) {
					for (const d of diff.rangeMappings) {
						result.push({
							range: d.outputRange,
							options: {
								className: `merge-editor-diff-word result`,
								description: 'Merge Editor'
							}
						});
					}
				}
			}
		}
		return result;
	});

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(instantiationService);

		this._register(applyObservableDecorations(this.editor, this.decorations));


		this._register(autorun('update remainingConflicts label', reader => {
			const model = this.model.read(reader);
			if (!model) {
				return;
			}
			const count = model.unhandledConflictsCount.read(reader);

			this.htmlElements.detail.innerText = count === 1
				? localize(
					'mergeEditor.remainingConflicts',
					'{0} Conflict Remaining',
					count
				)
				: localize(
					'mergeEditor.remainingConflict',
					'{0} Conflicts Remaining ',
					count
				);

		}));
	}
}
