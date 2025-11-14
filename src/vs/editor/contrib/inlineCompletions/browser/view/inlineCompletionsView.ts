/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheetFromObservable } from '../../../../../base/browser/domStylesheets.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, mapObservableArrayCached, derivedDisposable, derivedObservableWithCache, IObservable, ISettableObservable } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { InlineCompletionsHintsWidget } from '../hintsWidget/inlineCompletionsHintsWidget.js';
import { GhostTextOrReplacement } from '../model/ghostText.js';
import { InlineCompletionsModel } from '../model/inlineCompletionsModel.js';
import { convertItemsToStableObservables } from '../utils.js';
import { GhostTextView, GhostTextWidgetWarning, IGhostTextWidgetData } from './ghostText/ghostTextView.js';
import { InlineCompletionViewKind } from './inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsViewAndDiffProducer } from './inlineEdits/inlineEditsViewProducer.js';

export class InlineCompletionsView extends Disposable {
	private readonly _ghostTexts = derived(this, (reader) => {
		const model = this._model.read(reader);
		return model?.ghostTexts.read(reader) ?? [];
	});

	private readonly _stablizedGhostTexts;
	private readonly _editorObs;

	private readonly _ghostTextWidgets;

	private readonly _inlineEdit;
	private readonly _everHadInlineEdit;
	protected readonly _inlineEditWidget;

	private readonly _fontFamily;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _model: IObservable<InlineCompletionsModel | undefined>,
		private readonly _focusIsInMenu: ISettableObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._stablizedGhostTexts = convertItemsToStableObservables(this._ghostTexts, this._store);
		this._editorObs = observableCodeEditor(this._editor);

		this._ghostTextWidgets = mapObservableArrayCached(
			this,
			this._stablizedGhostTexts,
			(ghostText, store) => store.add(this._createGhostText(ghostText))
		).recomputeInitiallyAndOnChange(this._store);

		this._inlineEdit = derived(this, reader => this._model.read(reader)?.inlineEditState.read(reader)?.inlineEdit);
		this._everHadInlineEdit = derivedObservableWithCache<boolean>(this, (reader, last) => last || !!this._inlineEdit.read(reader) || !!this._model.read(reader)?.inlineCompletionState.read(reader)?.inlineCompletion?.showInlineEditMenu);
		this._inlineEditWidget = derivedDisposable(reader => {
			if (!this._everHadInlineEdit.read(reader)) {
				return undefined;
			}
			return this._instantiationService.createInstance(InlineEditsViewAndDiffProducer.hot.read(reader), this._editor, this._inlineEdit, this._model, this._focusIsInMenu);
		})
			.recomputeInitiallyAndOnChange(this._store);
		this._fontFamily = this._editorObs.getOption(EditorOption.inlineSuggest).map(val => val.fontFamily);

		this._register(createStyleSheetFromObservable(derived(reader => {
			const fontFamily = this._fontFamily.read(reader);
			return `
.monaco-editor .ghost-text-decoration,
.monaco-editor .ghost-text-decoration-preview,
.monaco-editor .ghost-text {
	font-family: ${fontFamily};
}`;
		})));

		this._register(new InlineCompletionsHintsWidget(this._editor, this._model, this._instantiationService));
	}

	private _createGhostText(ghostText: IObservable<GhostTextOrReplacement>): GhostTextView {
		return this._instantiationService.createInstance(
			GhostTextView,
			this._editor,
			derived(reader => {
				const model = this._model.read(reader);
				const inlineCompletion = model?.inlineCompletionState.read(reader)?.inlineCompletion;
				if (!model || !inlineCompletion) {
					return undefined;
				}
				return {
					ghostText: ghostText.read(reader),
					handleInlineCompletionShown: (viewData) => model.handleInlineSuggestionShown(inlineCompletion, InlineCompletionViewKind.GhostText, viewData),
					warning: GhostTextWidgetWarning.from(model?.warning.read(reader)),
				} satisfies IGhostTextWidgetData;
			}),
			{
				useSyntaxHighlighting: this._editorObs.getOption(EditorOption.inlineSuggest).map(v => v.syntaxHighlightingEnabled),
			},
		);
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this._ghostTextWidgets.get()[0]?.ownsViewZone(viewZoneId) ?? false;
	}
}
