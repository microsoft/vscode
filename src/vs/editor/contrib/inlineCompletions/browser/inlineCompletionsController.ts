/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createStyleSheet2 } from 'vs/base/browser/dom';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { timeout } from 'vs/base/common/async';
import { cancelOnDispose } from 'vs/base/common/cancellation';
import { itemEquals, itemsEquals } from 'vs/base/common/equals';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, ITransaction, autorun, autorunHandleChanges, constObservable, derived, disposableObservableValue, observableFromEvent, observableSignal, observableValue, transaction, waitForState } from 'vs/base/common/observable';
import { ISettableObservable, observableValueOpts } from 'vs/base/common/observableInternal/base';
import { mapObservableArrayCached } from 'vs/base/common/observableInternal/utils';
import { isUndefined } from 'vs/base/common/types';
import { CoreEditingCommands } from 'vs/editor/browser/coreCommands';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { inlineSuggestCommitId } from 'vs/editor/contrib/inlineCompletions/browser/commandIds';
import { GhostTextWidget } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextWidget';
import { InlineCompletionContextKeys } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionContextKeys';
import { InlineCompletionsHintsWidget, InlineSuggestionHintsContentWidget } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsHintsWidget';
import { InlineCompletionsModel, VersionIdChangeReason } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsModel';
import { SuggestWidgetAdaptor } from 'vs/editor/contrib/inlineCompletions/browser/suggestWidgetInlineCompletionProvider';
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

	public readonly model = this._register(disposableObservableValue<InlineCompletionsModel | undefined>('inlineCompletionModel', undefined));
	private readonly _textModelVersionId = observableValue<number, VersionIdChangeReason>(this, -1);
	private readonly _positions = observableValueOpts<readonly Position[]>({ owner: this, equalsFn: itemsEquals(itemEquals()) }, [new Position(1, 1)]);
	private readonly _suggestWidgetAdaptor = this._register(new SuggestWidgetAdaptor(
		this.editor,
		() => this.model.get()?.selectedInlineCompletion.get()?.toSingleTextEdit(undefined),
		(tx) => this.updateObservables(tx, VersionIdChangeReason.Other),
		(item) => {
			transaction(tx => {
				/** @description InlineCompletionsController.handleSuggestAccepted */
				this.updateObservables(tx, VersionIdChangeReason.Other);
				this.model.get()?.handleSuggestAccepted(item);
			});
		}
	));
	private readonly _enabledInConfig = observableFromEvent(this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).enabled);
	private readonly _isScreenReaderEnabled = observableFromEvent(this._accessibilityService.onDidChangeScreenReaderOptimized, () => this._accessibilityService.isScreenReaderOptimized());
	private readonly _editorDictationInProgress = observableFromEvent(this._contextKeyService.onDidChangeContext, () => this._contextKeyService.getContext(this.editor.getDomNode()).getValue('editorDictation.inProgress') === true);
	private readonly _enabled = derived(this, reader => this._enabledInConfig.read(reader) && (!this._isScreenReaderEnabled.read(reader) || !this._editorDictationInProgress.read(reader)));

	private readonly _fontFamily = observableFromEvent(this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).fontFamily);

	private readonly _ghostTexts = derived(this, (reader) => {
		const model = this.model.read(reader);
		return model?.ghostTexts.read(reader) ?? [];
	});

	private readonly _stablizedGhostTexts = convertItemsToStableObservables(this._ghostTexts, this._store);

	private readonly _ghostTextWidgets = mapObservableArrayCached(this, this._stablizedGhostTexts, (ghostText, store) => {
		return store.add(this._instantiationService.createInstance(GhostTextWidget, this.editor, {
			ghostText: ghostText,
			minReservedLineCount: constObservable(0),
			targetTextModel: this.model.map(v => v?.textModel),
		}));
	}).recomputeInitiallyAndOnChange(this._store);

	private readonly _debounceValue = this._debounceService.for(
		this._languageFeaturesService.inlineCompletionsProvider,
		'InlineCompletionsDebounce',
		{ min: 50, max: 50 }
	);

	private readonly _playAccessibilitySignal = observableSignal(this);

	private readonly _isReadonly = observableFromEvent(this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.readOnly));
	private readonly _textModel = observableFromEvent(this.editor.onDidChangeModel, () => this.editor.getModel());
	private readonly _textModelIfWritable = derived(reader => this._isReadonly.read(reader) ? undefined : this._textModel.read(reader));

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

		this._register(autorun(reader => {
			/** @description InlineCompletionsController.update model */
			const textModel = this._textModelIfWritable.read(reader);
			transaction(tx => {
				/** @description InlineCompletionsController.onDidChangeModel/readonly */
				this.model.set(undefined, tx);
				this.updateObservables(tx, VersionIdChangeReason.Other);

				if (textModel) {
					const model = _instantiationService.createInstance(
						InlineCompletionsModel,
						textModel,
						this._suggestWidgetAdaptor.selectedItem,
						this._textModelVersionId,
						this._positions,
						this._debounceValue,
						observableFromEvent(editor.onDidChangeConfiguration, () => editor.getOption(EditorOption.suggest).preview),
						observableFromEvent(editor.onDidChangeConfiguration, () => editor.getOption(EditorOption.suggest).previewMode),
						observableFromEvent(editor.onDidChangeConfiguration, () => editor.getOption(EditorOption.inlineSuggest).mode),
						this._enabled,
					);
					this.model.set(model, tx);
				}
			});
		}));

		const styleElement = this._register(createStyleSheet2());
		this._register(autorun(reader => {
			const fontFamily = this._fontFamily.read(reader);
			styleElement.setStyle(fontFamily === '' || fontFamily === 'default' ? `` : `
.monaco-editor .ghost-text-decoration,
.monaco-editor .ghost-text-decoration-preview,
.monaco-editor .ghost-text {
	font-family: ${fontFamily};
}`);
		}));

		const getReason = (e: IModelContentChangedEvent): VersionIdChangeReason => {
			if (e.isUndoing) { return VersionIdChangeReason.Undo; }
			if (e.isRedoing) { return VersionIdChangeReason.Redo; }
			if (this.model.get()?.isAcceptingPartially) { return VersionIdChangeReason.AcceptWord; }
			return VersionIdChangeReason.Other;
		};
		this._register(editor.onDidChangeModelContent((e) => transaction(tx =>
			/** @description InlineCompletionsController.onDidChangeModelContent */
			this.updateObservables(tx, getReason(e))
		)));

		this._register(editor.onDidChangeCursorPosition(e => transaction(tx => {
			/** @description InlineCompletionsController.onDidChangeCursorPosition */
			this.updateObservables(tx, VersionIdChangeReason.Other);
			if (e.reason === CursorChangeReason.Explicit || e.source === 'api') {
				this.model.get()?.stop(tx);
			}
		})));

		this._register(editor.onDidType(() => transaction(tx => {
			/** @description InlineCompletionsController.onDidType */
			this.updateObservables(tx, VersionIdChangeReason.Other);
			if (this._enabled.get()) {
				this.model.get()?.trigger(tx);
			}
		})));

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
				transaction(tx => {
					/** @description onDidExecuteCommand */
					this.model.get()?.trigger(tx);
				});
			}
		}));

		this._register(this.editor.onDidBlurEditorWidget(() => {
			// This is a hidden setting very useful for debugging
			if (this._contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown') || this._configurationService.getValue('editor.inlineSuggest.keepOnBlur') ||
				editor.getOption(EditorOption.inlineSuggest).keepOnBlur) {
				return;
			}
			if (InlineSuggestionHintsContentWidget.dropDownVisible) {
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

		const cancellationStore = this._register(new DisposableStore());
		let lastInlineCompletionId: string | undefined = undefined;
		this._register(autorunHandleChanges({
			handleChange: (context, changeSummary) => {
				if (context.didChange(this._playAccessibilitySignal)) {
					lastInlineCompletionId = undefined;
				}
				return true;
			},
		}, async (reader, _) => {
			/** @description InlineCompletionsController.playAccessibilitySignalAndReadSuggestion */
			this._playAccessibilitySignal.read(reader);

			const model = this.model.read(reader);
			const state = model?.state.read(reader);
			if (!model || !state || !state.inlineCompletion) {
				lastInlineCompletionId = undefined;
				return;
			}

			if (state.inlineCompletion.semanticId !== lastInlineCompletionId) {
				cancellationStore.clear();
				lastInlineCompletionId = state.inlineCompletion.semanticId;
				const lineText = model.textModel.getLineContent(state.primaryGhostText.lineNumber);

				await timeout(50, cancelOnDispose(cancellationStore));
				await waitForState(this._suggestWidgetAdaptor.selectedItem, isUndefined, () => false, cancelOnDispose(cancellationStore));

				await this._accessibilitySignalService.playSignal(AccessibilitySignal.inlineSuggestion);

				if (this.editor.getOption(EditorOption.screenReaderAnnounceInlineSuggestion)) {
					this.provideScreenReaderUpdate(state.primaryGhostText.renderForScreenReader(lineText));
				}
			}
		}));

		this._register(new InlineCompletionsHintsWidget(this.editor, this.model, this._instantiationService));
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

	private provideScreenReaderUpdate(content: string): void {
		const accessibleViewShowing = this._contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown');
		const accessibleViewKeybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleView');
		let hint: string | undefined;
		if (!accessibleViewShowing && accessibleViewKeybinding && this.editor.getOption(EditorOption.inlineCompletionsAccessibilityVerbose)) {
			hint = localize('showAccessibleViewHint', "Inspect this in the accessible view ({0})", accessibleViewKeybinding.getAriaLabel());
		}
		hint ? alert(content + ', ' + hint) : alert(content);
	}

	/**
	 * Copies over the relevant state from the text model to observables.
	 * This solves all kind of eventing issues, as we make sure we always operate on the latest state,
	 * regardless of who calls into us.
	 */
	private updateObservables(tx: ITransaction, changeReason: VersionIdChangeReason): void {
		const newModel = this.editor.getModel();
		this._textModelVersionId.set(newModel?.getVersionId() ?? -1, tx, changeReason);
		this._positions.set(this.editor.getSelections()?.map(selection => selection.getPosition()) ?? [new Position(1, 1)], tx);
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
