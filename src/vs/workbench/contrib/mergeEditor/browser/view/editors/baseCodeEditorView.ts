/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h, reset } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { BugIndicatingError } from 'vs/base/common/errors';
import { IObservable, autorun, autorunWithStore, derived } from 'vs/base/common/observable';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { applyObservableDecorations } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from 'vs/workbench/contrib/mergeEditor/browser/view/colors';
import { EditorGutter } from 'vs/workbench/contrib/mergeEditor/browser/view/editorGutter';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { CodeEditorView, TitleMenu, createSelectionsAutorun } from './codeEditorView';

export class BaseCodeEditorView extends CodeEditorView {
	constructor(
		viewModel: IObservable<MergeEditorViewModel | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(instantiationService, viewModel, configurationService);

		this._register(
			createSelectionsAutorun(this, (baseRange, viewModel) => baseRange)
		);

		this._register(
			instantiationService.createInstance(TitleMenu, MenuId.MergeBaseToolbar, this.htmlElements.title)
		);

		this._register(
			autorunWithStore((reader, store) => {
				/** @description update checkboxes */
				if (this.checkboxesVisible.read(reader)) {
					store.add(new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
						getIntersectingGutterItems: (range, reader) => [],
						createView: (item, target) => { throw new BugIndicatingError(); },
					}));
				}
			})
		);

		this._register(
			autorun(reader => {
				/** @description update labels & text model */
				const vm = this.viewModel.read(reader);
				if (!vm) {
					return;
				}
				this.editor.setModel(vm.model.base);
				reset(this.htmlElements.title, ...renderLabelWithIcons(localize('base', 'Base')));

				const baseShowDiffAgainst = vm.baseShowDiffAgainst.read(reader);

				let node: Node | undefined = undefined;
				if (baseShowDiffAgainst) {
					const label = localize('compareWith', 'Comparing with {0}', baseShowDiffAgainst === 1 ? vm.model.input1.title : vm.model.input2.title);
					const tooltip = localize('compareWithTooltip', 'Differences are highlighted with a background color.');
					node = h('span', { title: tooltip }, [label]).root;
				}
				reset(this.htmlElements.description, ...(node ? [node] : []));
			})
		);

		this._register(applyObservableDecorations(this.editor, this.decorations));
	}

	private readonly decorations = derived(this, reader => {
		const viewModel = this.viewModel.read(reader);
		if (!viewModel) {
			return [];
		}
		const model = viewModel.model;
		const textModel = model.base;

		const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);
		const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
		const showDeletionMarkers = this.showDeletionMarkers.read(reader);

		const result: IModelDeltaDecoration[] = [];
		for (const modifiedBaseRange of model.modifiedBaseRanges.read(reader)) {

			const range = modifiedBaseRange.baseRange;
			if (!range) {
				continue;
			}

			const isHandled = model.isHandled(modifiedBaseRange).read(reader);
			if (!modifiedBaseRange.isConflicting && isHandled && !showNonConflictingChanges) {
				continue;
			}

			const blockClassNames = ['merge-editor-block'];
			let blockPadding: [top: number, right: number, bottom: number, left: number] = [0, 0, 0, 0];
			if (isHandled) {
				blockClassNames.push('handled');
			}
			if (modifiedBaseRange === activeModifiedBaseRange) {
				blockClassNames.push('focused');
				blockPadding = [0, 2, 0, 2];
			}
			blockClassNames.push('base');

			const inputToDiffAgainst = viewModel.baseShowDiffAgainst.read(reader);

			if (inputToDiffAgainst) {
				for (const diff of modifiedBaseRange.getInputDiffs(inputToDiffAgainst)) {
					const range = diff.inputRange.toInclusiveRange();
					if (range) {
						result.push({
							range,
							options: {
								className: `merge-editor-diff base`,
								description: 'Merge Editor',
								isWholeLine: true,
							}
						});
					}

					for (const diff2 of diff.rangeMappings) {
						if (showDeletionMarkers || !diff2.inputRange.isEmpty()) {
							result.push({
								range: diff2.inputRange,
								options: {
									className: diff2.inputRange.isEmpty() ? `merge-editor-diff-empty-word base` : `merge-editor-diff-word base`,
									description: 'Merge Editor',
									showIfCollapsed: true,
								},
							});
						}
					}
				}
			}

			result.push({
				range: range.toInclusiveRangeOrEmpty(),
				options: {
					showIfCollapsed: true,
					blockClassName: blockClassNames.join(' '),
					blockPadding,
					blockIsAfterEnd: range.startLineNumber > textModel.getLineCount(),
					description: 'Merge Editor',
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
		return result;
	});
}
