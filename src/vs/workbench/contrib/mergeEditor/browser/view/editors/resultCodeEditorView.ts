/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompareResult } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { toDisposable } from 'vs/base/common/lifecycle';
import { autorun, derived } from 'vs/base/common/observable';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MergeMarkersController } from 'vs/workbench/contrib/mergeEditor/browser/mergeMarkers/mergeMarkersController';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
import { applyObservableDecorations, join } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from 'vs/workbench/contrib/mergeEditor/browser/view/colors';
import { EditorGutter } from 'vs/workbench/contrib/mergeEditor/browser/view/editorGutter';
import { ctxIsMergeResultEditor } from 'vs/workbench/contrib/mergeEditor/common/mergeEditor';
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from './codeEditorView';

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
			model.baseResultDiffs.read(reader),
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
				const range = model.getLineRangeInResult(modifiedBaseRange.baseRange, reader).toInclusiveRange();
				if (range) {
					const blockClassNames = ['merge-editor-block'];
					const isHandled = model.isHandled(modifiedBaseRange).read(reader);
					if (isHandled) {
						blockClassNames.push('handled');
					}
					if (modifiedBaseRange === activeModifiedBaseRange) {
						blockClassNames.push('focused');
					}
					if (modifiedBaseRange.isConflicting) {
						blockClassNames.push('conflicting');
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
							overviewRuler: modifiedBaseRange.isConflicting ? {
								position: OverviewRulerLane.Center,
								color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor },
							} : undefined
						}
					});
				}
			}


			if (!modifiedBaseRange || modifiedBaseRange.isConflicting) {
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
		}
		return result;
	});

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(instantiationService);

		this.editor.invokeWithinContext(accessor => {
			const contextKeyService = accessor.get(IContextKeyService);
			const isMergeResultEditor = ctxIsMergeResultEditor.bindTo(contextKeyService);
			isMergeResultEditor.set(true);
			this._register(toDisposable(() => isMergeResultEditor.reset()));
		});

		this._register(applyObservableDecorations(this.editor, this.decorations));

		this._register(new MergeMarkersController(this.editor, this.viewModel));

		this.htmlElements.gutterDiv.style.width = '5px';

		this._register(
			new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
				getIntersectingGutterItems: (range, reader) => [],
				createView: (item, target) => { throw new BugIndicatingError(); },
			})
		);

		this._register(autorun('update remainingConflicts label', reader => {
			// this is a bit of a hack, but it's the easiest way to get the label to update
			// when the view model updates, as the the base class resets the label in the setModel call.
			this.viewModel.read(reader);

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

		this._register(
			createSelectionsAutorun(this, (baseRange, viewModel) =>
				viewModel.model.translateBaseRangeToResult(baseRange)
			)
		);

		this._register(
			instantiationService.createInstance(
				TitleMenu,
				MenuId.MergeInputResultToolbar,
				this.htmlElements.toolbar
			)
		);
	}
}
