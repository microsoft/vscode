/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reset } from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { autorun, derived, IObservable } from 'vs/base/common/observable';
import { EditorExtensionsRegistry, IEditorContributionDescription } from 'vs/editor/browser/editorExtensions';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane } from 'vs/editor/common/model';
import { CodeLensContribution } from 'vs/editor/contrib/codelens/browser/codelensController';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { applyObservableDecorations } from 'vs/workbench/contrib/mergeEditor/browser/utils';
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from 'vs/workbench/contrib/mergeEditor/browser/view/colors';
import { MergeEditorViewModel } from 'vs/workbench/contrib/mergeEditor/browser/view/viewModel';
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from './codeEditorView';

export class BaseCodeEditorView extends CodeEditorView {
	constructor(
		viewModel: IObservable<MergeEditorViewModel | undefined>,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(instantiationService, viewModel);

		this._register(
			createSelectionsAutorun(this, (baseRange, viewModel) => baseRange)
		);

		this._register(
			instantiationService.createInstance(TitleMenu, MenuId.MergeBaseToolbar, this.htmlElements.title)
		);

		this._register(
			autorun('update labels & text model', (reader) => {
				const vm = this.viewModel.read(reader);
				if (!vm) {
					return;
				}
				this.editor.setModel(vm.model.base);
				reset(this.htmlElements.title, ...renderLabelWithIcons(localize('base', 'Base')));
			})
		);

		this._register(applyObservableDecorations(this.editor, this.decorations));
	}

	private readonly decorations = derived(`base.decorations`, reader => {
		const viewModel = this.viewModel.read(reader);
		if (!viewModel) {
			return [];
		}
		const model = viewModel.model;

		const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);

		const result: IModelDeltaDecoration[] = [];
		for (const modifiedBaseRange of model.modifiedBaseRanges.read(reader)) {

			const range = modifiedBaseRange.baseRange;
			if (!range) {
				continue;
			}

			const blockClassNames = ['merge-editor-block'];
			const isHandled = model.isHandled(modifiedBaseRange).read(reader);
			if (isHandled) {
				blockClassNames.push('handled');
			}
			if (modifiedBaseRange === activeModifiedBaseRange) {
				blockClassNames.push('focused');
			}
			blockClassNames.push('base');

			result.push({
				range: range.toInclusiveRangeOrEmpty(),
				options: {
					showIfCollapsed: true,
					blockClassName: blockClassNames.join(' '),
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

	protected override getEditorContributions(): IEditorContributionDescription[] | undefined {
		return EditorExtensionsRegistry.getEditorContributions().filter(c => c.id !== CodeLensContribution.ID);
	}
}
