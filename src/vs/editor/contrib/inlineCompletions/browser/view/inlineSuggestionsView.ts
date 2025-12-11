/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheetFromObservable } from '../../../../../base/browser/domStylesheets.js';
import { createHotClass } from '../../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { derived, mapObservableArrayCached, derivedDisposable, derivedObservableWithCache, IObservable, ISettableObservable, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../browser/observableCodeEditor.js';
import { EditorOption } from '../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../common/core/ranges/lineRange.js';
import { InlineCompletionsHintsWidget } from '../hintsWidget/inlineCompletionsHintsWidget.js';
import { GhostTextOrReplacement } from '../model/ghostText.js';
import { InlineCompletionsModel } from '../model/inlineCompletionsModel.js';
import { InlineCompletionItem } from '../model/inlineSuggestionItem.js';
import { convertItemsToStableObservables } from '../utils.js';
import { GhostTextView, GhostTextWidgetWarning, IGhostTextWidgetData } from './ghostText/ghostTextView.js';
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from './inlineEdits/components/gutterIndicatorView.js';
import { InlineEditsOnboardingExperience } from './inlineEdits/inlineEditsNewUsers.js';
import { InlineCompletionViewKind, InlineEditTabAction } from './inlineEdits/inlineEditsViewInterface.js';
import { InlineEditsViewAndDiffProducer } from './inlineEdits/inlineEditsViewProducer.js';

export class InlineSuggestionsView extends Disposable {
	public static hot = createHotClass(this);

	private readonly _ghostTexts = derived(this, (reader) => {
		const model = this._model.read(reader);
		return model?.ghostTexts.read(reader) ?? [];
	});

	private readonly _stablizedGhostTexts;
	private readonly _editorObs;
	private readonly _ghostTextWidgets;

	private readonly _inlineEdit = derived(this, reader => this._model.read(reader)?.inlineEditState.read(reader)?.inlineSuggestion);
	private readonly _everHadInlineEdit = derivedObservableWithCache<boolean>(this,
		(reader, last) => last || !!this._inlineEdit.read(reader)
			|| !!this._model.read(reader)?.inlineCompletionState.read(reader)?.inlineSuggestion?.showInlineEditMenu
	);

	// To break a cyclic dependency
	private readonly _indicatorIsHoverVisible = observableValue<IObservable<boolean> | undefined>(this, undefined);

	private readonly _showInlineEditCollapsed = derived(this, reader => {
		const s = this._model.read(reader)?.showCollapsed.read(reader) ?? false;
		return s && !this._indicatorIsHoverVisible.read(reader)?.read(reader);
	});

	private readonly _inlineEditWidget = derivedDisposable(reader => {
		if (!this._everHadInlineEdit.read(reader)) {
			return undefined;
		}
		return this._instantiationService.createInstance(InlineEditsViewAndDiffProducer, this._editor, this._model, this._showInlineEditCollapsed);
	});

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

		this._inlineEditWidget.recomputeInitiallyAndOnChange(this._store);

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

		this._indicator = this._register(this._instantiationService.createInstance(
			InlineEditsGutterIndicator,
			this._editorObs,
			derived(reader => {
				const s = this._gutterIndicatorState.read(reader);
				if (!s) { return undefined; }
				return new InlineEditsGutterIndicatorData(
					InlineSuggestionGutterMenuData.fromInlineSuggestion(s.inlineSuggestion),
					s.displayRange,
					SimpleInlineSuggestModel.fromInlineCompletionModel(s.model),
					s.inlineSuggestion.action?.kind === 'edit' ? s.inlineSuggestion.action.alternativeAction : undefined,
				);
			}),
			this._gutterIndicatorState.map((s, reader) => s?.tabAction.read(reader) ?? InlineEditTabAction.Inactive),
			this._gutterIndicatorState.map((s, reader) => s?.gutterIndicatorOffset.read(reader) ?? 0),
			this._inlineEditWidget.map((w, reader) => w?.view.inlineEditsIsHovered.read(reader) ?? false),
			this._focusIsInMenu,
		));
		this._indicatorIsHoverVisible.set(this._indicator.isHoverVisible, undefined);

		derived(reader => {
			const w = this._inlineEditWidget.read(reader);
			if (!w) { return undefined; }
			return reader.store.add(this._instantiationService.createInstance(
				InlineEditsOnboardingExperience,
				w._inlineEditModel,
				constObservable(this._indicator),
				w.view._inlineCollapsedView,
			));
		}).recomputeInitiallyAndOnChange(this._store);
	}

	private _createGhostText(ghostText: IObservable<GhostTextOrReplacement>): GhostTextView {
		return this._instantiationService.createInstance(
			GhostTextView,
			this._editor,
			derived(reader => {
				const model = this._model.read(reader);
				const inlineCompletion = model?.inlineCompletionState.read(reader)?.inlineSuggestion;
				if (!model || !inlineCompletion) {
					return undefined;
				}
				return {
					ghostText: ghostText.read(reader),
					handleInlineCompletionShown: (viewData) => model.handleInlineSuggestionShown(inlineCompletion, InlineCompletionViewKind.GhostText, viewData, Date.now()),
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

	private readonly _gutterIndicatorState = derived(reader => {
		const model = this._model.read(reader);
		if (!model) {
			return undefined;
		}

		const state = model.state.read(reader);

		if (state?.kind === 'ghostText' && state.inlineSuggestion?.showInlineEditMenu) {
			return {
				displayRange: LineRange.ofLength(state.primaryGhostText.lineNumber, 1),
				tabAction: derived<InlineEditTabAction>(this,
					reader => this._editorObs.isFocused.read(reader) ? InlineEditTabAction.Accept : InlineEditTabAction.Inactive
				),
				gutterIndicatorOffset: constObservable(getGhostTextTopOffset(state.inlineSuggestion, this._editor)),
				inlineSuggestion: state.inlineSuggestion,
				model,
			};
		} else if (state?.kind === 'inlineEdit') {
			const inlineEditWidget = this._inlineEditWidget.read(reader)?.view;
			if (!inlineEditWidget) { return undefined; }

			const displayRange = inlineEditWidget.displayRange.read(reader);
			if (!displayRange) { return undefined; }
			return {
				displayRange,
				tabAction: derived(reader => {
					if (this._editorObs.isFocused.read(reader)) {
						if (model.tabShouldJumpToInlineEdit.read(reader)) { return InlineEditTabAction.Jump; }
						if (model.tabShouldAcceptInlineEdit.read(reader)) { return InlineEditTabAction.Accept; }
					}
					return InlineEditTabAction.Inactive;
				}),
				gutterIndicatorOffset: inlineEditWidget.gutterIndicatorOffset,
				inlineSuggestion: state.inlineSuggestion,
				model,
			};
		} else {
			return undefined;
		}
	});

	protected readonly _indicator;
}

function getGhostTextTopOffset(inlineCompletion: InlineCompletionItem, editor: ICodeEditor): number {
	const replacement = inlineCompletion.getSingleTextEdit();
	const textModel = editor.getModel();
	if (!textModel) {
		return 0;
	}

	const EOL = textModel.getEOL();
	if (replacement.range.isEmpty() && replacement.text.startsWith(EOL)) {
		const lineHeight = editor.getLineHeightForPosition(replacement.range.getStartPosition());
		return countPrefixRepeats(replacement.text, EOL) * lineHeight;
	}

	return 0;
}

function countPrefixRepeats(str: string, prefix: string): number {
	if (!prefix.length) {
		return 0;
	}
	let count = 0;
	let i = 0;
	while (str.startsWith(prefix, i)) {
		count++;
		i += prefix.length;
	}
	return count;
}
