/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheetFromObservable } from '../../../../../base/browser/domStylesheets.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, mapObservableArrayCached, derivedDisposable, constObservable, derivedObservableWithCache, IObservable, ISettableObservable } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { InlineCompletionsHintsWidget } from '../hintsWidget/inlineCompletionsHintsWidget.js';
import { InlineCompletionsModel } from '../model/inlineCompletionsModel.js';
import { convertItemsToStableObservables } from '../utils.js';
import { GhostTextView } from './ghostText/ghostTextView.js';
import { InlineCompletionViewData, InlineCompletionViewKind } from './inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsViewAndDiffProducer } from './inlineEdits/inlineEditsViewProducer.js';

export class InlineCompletionsView extends Disposable {
	private readonly _ghostTexts;

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
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._ghostTexts = derived(this, (reader) => {
			const model = this._model.read(reader);
			return model?.ghostTexts.read(reader) ?? [];
		});
		this._stablizedGhostTexts = convertItemsToStableObservables(this._ghostTexts, this._store);
		this._editorObs = observableCodeEditor(this._editor);
		this._ghostTextWidgets = mapObservableArrayCached(this, this._stablizedGhostTexts, (ghostText, store) => derivedDisposable((reader) => this._instantiationService.createInstance(
			GhostTextView.hot.read(reader),
			this._editor,
			{
				ghostText: ghostText,
				warning: this._model.map((m, reader) => {
					const warning = m?.warning?.read(reader);
					return warning ? { icon: warning.icon } : undefined;
				}),
				minReservedLineCount: constObservable(0),
				targetTextModel: this._model.map(v => v?.textModel),
				handleInlineCompletionShown: this._model.map((model, reader) => {
					const inlineCompletion = model?.inlineCompletionState.read(reader)?.inlineCompletion;
					if (inlineCompletion) {
						return (viewData: InlineCompletionViewData) => model.handleInlineSuggestionShown(inlineCompletion, InlineCompletionViewKind.GhostText, viewData);
					}
					return () => { };
				}),
			},
			this._editorObs.getOption(EditorOption.inlineSuggest).map(v => ({ syntaxHighlightingEnabled: v.syntaxHighlightingEnabled })),
			false,
			false
		)
		).recomputeInitiallyAndOnChange(store)
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

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this._ghostTextWidgets.get()[0]?.get().ownsViewZone(viewZoneId) ?? false;
	}
}
