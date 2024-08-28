/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheetFromObservable } from 'vs/base/browser/domObservable';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { timeout } from 'vs/base/common/async';
import { cancelOnDispose } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, ITransaction, autorun, constObservable, derived, observableFromEvent, observableSignal, observableValue, transaction, waitForState } from 'vs/base/common/observable';
import { ISettableObservable } from 'vs/base/common/observableInternal/base';
import { derivedDisposable } from 'vs/base/common/observableInternal/derived';
import { derivedObservableWithCache, mapObservableArrayCached } from 'vs/base/common/observableInternal/utils';
import { isUndefined } from 'vs/base/common/types';
import { CoreEditingCommands } from 'vs/editor/browser/coreCommands';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { observableCodeEditor, reactToChange, reactToChangeWithStore } from 'vs/editor/browser/observableCodeEditor';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { inlineSuggestCommitId } from 'vs/editor/contrib/inlineCompletions/browser/controller/commandIds';
import { GhostTextView } from 'vs/editor/contrib/inlineCompletions/browser/view/ghostTextView';
import { InlineCompletionContextKeys } from 'vs/editor/contrib/inlineCompletions/browser/controller/inlineCompletionContextKeys';
import { InlineCompletionsHintsWidget, InlineSuggestionHintsContentWidget } from 'vs/editor/contrib/inlineCompletions/browser/hintsWidget/inlineCompletionsHintsWidget';
import { InlineCompletionsModel } from 'vs/editor/contrib/inlineCompletions/browser/model/inlineCompletionsModel';
import { SuggestWidgetAdaptor } from 'vs/editor/contrib/inlineCompletions/browser/model/suggestWidgetAdaptor';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class InlineCompletionsController extends Disposable {
	static ID = 'editor.contrib.inlineCompletionsController';

	public static get(editor: ICodeEditor): InlineCompletionsController | null {
		return editor.getContribution<InlineCompletionsController>(InlineCompletionsController.ID);
	}

	private readonly _editorObs = observableCodeEditor(this.editor);
	private readonly _positions = derived(this, reader => this._editorObs.selections.read(reader)?.map(s => s.getEndPosition()) ?? [new Position(1, 1)]);

	private readonly _suggestWidgetAdaptor = this._register(new SuggestWidgetAdaptor(
		this.editor,
		() => {
			this._editorObs.forceUpdate();
			return this.model.get()?.selectedInlineCompletion.get()?.toSingleTextEdit(undefined);
		},
		(item) => this._editorObs.forceUpdate(_tx => {
			/** @description InlineCompletionsController.handleSuggestAccepted */
			this.model.get()?.handleSuggestAccepted(item);
		})
	));

	private readonly _suggestWidgetSelectedItem = observableFromEvent(this, cb => this._suggestWidgetAdaptor.onDidSelectedItemChange(() => {
		this._editorObs.forceUpdate(_tx => cb(undefined));
	}), () => this._suggestWidgetAdaptor.selectedItem);


	private readonly _enabledInConfig = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).enabled);
	private readonly _isScreenReaderEnabled = observableFromEvent(this, this._accessibilityService.onDidChangeScreenReaderOptimized, () => this._accessibilityService.isScreenReaderOptimized());
	private readonly _editorDictationInProgress = observableFromEvent(this,
		this._contextKeyService.onDidChangeContext,
		() => this._contextKeyService.getContext(this.editor.getDomNode()).getValue('editorDictation.inProgress') === true
	);
	private readonly _enabled = derived(this, reader => this._enabledInConfig.read(reader) && (!this._isScreenReaderEnabled.read(reader) || !this._editorDictationInProgress.read(reader)));

	private readonly _debounceValue = this._debounceService.for(
		this._languageFeaturesService.inlineCompletionsProvider,
		'InlineCompletionsDebounce',
		{ min: 50, max: 50 }
	);

	public readonly model = derivedDisposable<InlineCompletionsModel | undefined>(this, reader => {
		if (this._editorObs.isReadonly.read(reader)) { return undefined; }
		const textModel = this._editorObs.model.read(reader);
		if (!textModel) { return undefined; }

		const model: InlineCompletionsModel = this._instantiationService.createInstance(
			InlineCompletionsModel,
			textModel,
			this._suggestWidgetSelectedItem,
			this._editorObs.versionId,
			this._positions,
			this._debounceValue,
			observableFromEvent(this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.suggest).preview),
			observableFromEvent(this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.suggest).previewMode),
			observableFromEvent(this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).mode),
			this._enabled,
		);
		return model;
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _ghostTexts = derived(this, (reader) => {
		const model = this.model.read(reader);
		return model?.ghostTexts.read(reader) ?? [];
	});
	private readonly _stablizedGhostTexts = convertItemsToStableObservables(this._ghostTexts, this._store);

	private readonly _ghostTextWidgets = mapObservableArrayCached(this, this._stablizedGhostTexts, (ghostText, store) =>
		store.add(this._instantiationService.createInstance(GhostTextView, this.editor, {
			ghostText: ghostText,
			minReservedLineCount: constObservable(0),
			targetTextModel: this.model.map(v => v?.textModel),
		}))
	).recomputeInitiallyAndOnChange(this._store);

	private readonly _playAccessibilitySignal = observableSignal(this);

	private readonly _fontFamily = observableFromEvent(this, this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).fontFamily);

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageFeatureDebounceService private readonly _debounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();

		this._register(new InlineCompletionContextKeys(this._contextKeyService, this.model));

		this._register(reactToChange(this._editorObs.onDidType, (_value, _changes) => {
			if (this._enabled.get()) {
				this.model.get()?.trigger();
			}
		}));

		this._register(this._commandService.onDidExecuteCommand((e) => {
			// These commands don't trigger onDidType.
			const commands = new Set([
				CoreEditingCommands.Tab.id,
				CoreEditingCommands.DeleteLeft.id,
				CoreEditingCommands.DeleteRight.id,
				inlineSuggestCommitId,
				'acceptSelectedSuggestion',
			]);
			if (commands.has(e.commandId) && editor.hasTextFocus() && this._enabled.get()) {
				this._editorObs.forceUpdate(tx => {
					/** @description onDidExecuteCommand */
					this.model.get()?.trigger(tx);
				});
			}
		}));

		this._register(reactToChange(this._editorObs.selections, (_value, changes) => {
			if (changes.some(e => e.reason === CursorChangeReason.Explicit || e.source === 'api')) {
				this.model.get()?.stop();
			}
		}));

		this._register(this.editor.onDidBlurEditorWidget(() => {
			// This is a hidden setting very useful for debugging
			if (this._contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown')
				|| this._configurationService.getValue('editor.inlineSuggest.keepOnBlur')
				|| editor.getOption(EditorOption.inlineSuggest).keepOnBlur
				|| InlineSuggestionHintsContentWidget.dropDownVisible) {
				return;
			}

			transaction(tx => {
				/** @description InlineCompletionsController.onDidBlurEditorWidget */
				this.model.get()?.stop(tx);
			});
		}));

		this._register(autorun(reader => {
			/** @description InlineCompletionsController.forceRenderingAbove */
			const state = this.model.read(reader)?.state.read(reader);
			if (state?.suggestItem) {
				if (state.primaryGhostText.lineCount >= 2) {
					this._suggestWidgetAdaptor.forceRenderingAbove();
				}
			} else {
				this._suggestWidgetAdaptor.stopForceRenderingAbove();
			}
		}));
		this._register(toDisposable(() => {
			this._suggestWidgetAdaptor.stopForceRenderingAbove();
		}));

		const currentInlineCompletionBySemanticId = derivedObservableWithCache<string | undefined>(this, (reader, last) => {
			const model = this.model.read(reader);
			const state = model?.state.read(reader);
			if (this._suggestWidgetSelectedItem.get()) {
				return last;
			}
			return state?.inlineCompletion?.semanticId;
		});
		this._register(reactToChangeWithStore(derived(reader => {
			this._playAccessibilitySignal.read(reader);
			currentInlineCompletionBySemanticId.read(reader);
			return {};
		}), async (_value, _deltas, store) => {
			/** @description InlineCompletionsController.playAccessibilitySignalAndReadSuggestion */
			const model = this.model.get();
			const state = model?.state.get();
			if (!state || !model) { return; }
			const lineText = model.textModel.getLineContent(state.primaryGhostText.lineNumber);

			await timeout(50, cancelOnDispose(store));
			await waitForState(this._suggestWidgetSelectedItem, isUndefined, () => false, cancelOnDispose(store));

			await this._accessibilitySignalService.playSignal(AccessibilitySignal.inlineSuggestion);
			if (this.editor.getOption(EditorOption.screenReaderAnnounceInlineSuggestion)) {
				this._provideScreenReaderUpdate(state.primaryGhostText.renderForScreenReader(lineText));
			}
		}));

		this._register(new InlineCompletionsHintsWidget(this.editor, this.model, this._instantiationService));

		this._register(createStyleSheetFromObservable(derived(reader => {
			const fontFamily = this._fontFamily.read(reader);
			if (fontFamily === '' || fontFamily === 'default') { return ''; }
			return `
.monaco-editor .ghost-text-decoration,
.monaco-editor .ghost-text-decoration-preview,
.monaco-editor .ghost-text {
	font-family: ${fontFamily};
}`;
		})));

		// TODO@hediet
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('accessibility.verbosity.inlineCompletions')) {
				this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue('accessibility.verbosity.inlineCompletions') });
			}
		}));
		this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this._configurationService.getValue('accessibility.verbosity.inlineCompletions') });
	}

	public playAccessibilitySignal(tx: ITransaction) {
		this._playAccessibilitySignal.trigger(tx);
	}

	private _provideScreenReaderUpdate(content: string): void {
		const accessibleViewShowing = this._contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown');
		const accessibleViewKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleView');
		let hint: string | undefined;
		if (!accessibleViewShowing && accessibleViewKeybinding && this.editor.getOption(EditorOption.inlineCompletionsAccessibilityVerbose)) {
			hint = localize('showAccessibleViewHint', "Inspect this in the accessible view ({0})", accessibleViewKeybinding.getAriaLabel());
		}
		alert(hint ? content + ', ' + hint : content);
	}

	public shouldShowHoverAt(range: Range) {
		const ghostText = this.model.get()?.primaryGhostText.get();
		if (ghostText) {
			return ghostText.parts.some(p => range.containsPosition(new Position(ghostText.lineNumber, p.column)));
		}
		return false;
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this._ghostTextWidgets.get()[0]?.ownsViewZone(viewZoneId) ?? false;
	}

	public hide() {
		transaction(tx => {
			this.model.get()?.stop(tx);
		});
	}
}

function convertItemsToStableObservables<T>(items: IObservable<readonly T[]>, store: DisposableStore): IObservable<IObservable<T>[]> {
	const result = observableValue<IObservable<T>[]>('result', []);
	const innerObservables: ISettableObservable<T>[] = [];

	store.add(autorun(reader => {
		const itemsValue = items.read(reader);

		transaction(tx => {
			if (itemsValue.length !== innerObservables.length) {
				innerObservables.length = itemsValue.length;
				for (let i = 0; i < innerObservables.length; i++) {
					if (!innerObservables[i]) {
						innerObservables[i] = observableValue<T>('item', itemsValue[i]);
					}
				}
				result.set([...innerObservables], tx);
			}
			innerObservables.forEach((o, i) => o.set(itemsValue[i], tx));
		});
	}));

	return result;
}
