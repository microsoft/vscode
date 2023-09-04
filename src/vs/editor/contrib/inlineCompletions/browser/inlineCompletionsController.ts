/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { ITransaction, autorun, constObservable, disposableObservableValue, observableFromEvent, observableValue, transaction } from 'vs/base/common/observable';
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
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
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

	public readonly model = disposableObservableValue<InlineCompletionsModel | undefined>('inlineCompletionModel', undefined);
	private readonly textModelVersionId = observableValue<number, VersionIdChangeReason>('textModelVersionId', -1);
	private readonly cursorPosition = observableValue<Position>('cursorPosition', new Position(1, 1));
	private readonly suggestWidgetAdaptor = this._register(new SuggestWidgetAdaptor(
		this.editor,
		() => this.model.get()?.selectedInlineCompletion.get()?.toSingleTextEdit(undefined),
		(tx) => this.updateObservables(tx, VersionIdChangeReason.Other),
		(item) => {
			transaction(tx => {
				/** @description handleSuggestAccepted */
				this.updateObservables(tx, VersionIdChangeReason.Other);
				this.model.get()?.handleSuggestAccepted(item);
			});
		}
	));
	private readonly _enabled = observableFromEvent(this.editor.onDidChangeConfiguration, () => this.editor.getOption(EditorOption.inlineSuggest).enabled);

	private ghostTextWidget = this._register(this.instantiationService.createInstance(GhostTextWidget, this.editor, {
		ghostText: this.model.map((v, reader) => v?.ghostText.read(reader)),
		minReservedLineCount: constObservable(0),
		targetTextModel: this.model.map(v => v?.textModel),
	}));

	private readonly _debounceValue = this.debounceService.for(
		this.languageFeaturesService.inlineCompletionsProvider,
		'InlineCompletionsDebounce',
		{ min: 50, max: 50 }
	);

	constructor(
		public readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICommandService private readonly commandService: ICommandService,
		@ILanguageFeatureDebounceService private readonly debounceService: ILanguageFeatureDebounceService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IAudioCueService private readonly audioCueService: IAudioCueService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();

		this._register(new InlineCompletionContextKeys(this.contextKeyService, this.model));
		this._register(Event.runAndSubscribe(editor.onDidChangeModel, () => transaction(tx => {
			/** @description onDidChangeModel */
			this.model.set(undefined, tx);
			this.updateObservables(tx, VersionIdChangeReason.Other);

			const textModel = editor.getModel();
			if (textModel) {
				const model = instantiationService.createInstance(
					InlineCompletionsModel,
					textModel,
					this.suggestWidgetAdaptor.selectedItem,
					this.cursorPosition,
					this.textModelVersionId,
					this._debounceValue,
					observableFromEvent(editor.onDidChangeConfiguration, () => editor.getOption(EditorOption.suggest).preview),
					observableFromEvent(editor.onDidChangeConfiguration, () => editor.getOption(EditorOption.suggest).previewMode),
					observableFromEvent(editor.onDidChangeConfiguration, () => editor.getOption(EditorOption.inlineSuggest).mode),
					this._enabled,
				);
				this.model.set(model, tx);
			}
		})));

		const getReason = (e: IModelContentChangedEvent): VersionIdChangeReason => {
			if (e.isUndoing) { return VersionIdChangeReason.Undo; }
			if (e.isRedoing) { return VersionIdChangeReason.Redo; }
			if (this.model.get()?.isAcceptingPartially) { return VersionIdChangeReason.AcceptWord; }
			return VersionIdChangeReason.Other;
		};
		this._register(editor.onDidChangeModelContent((e) => transaction(tx =>
			/** @description onDidChangeModelContent */
			this.updateObservables(tx, getReason(e))
		)));

		this._register(editor.onDidChangeCursorPosition(e => transaction(tx => {
			/** @description onDidChangeCursorPosition */
			this.updateObservables(tx, VersionIdChangeReason.Other);
			if (e.reason === CursorChangeReason.Explicit || e.source === 'api') {
				this.model.get()?.stop(tx);
			}
		})));

		this._register(editor.onDidType(() => transaction(tx => {
			/** @description onDidType */
			this.updateObservables(tx, VersionIdChangeReason.Other);
			if (this._enabled.get()) {
				this.model.get()?.trigger(tx);
			}
		})));

		this._register(this.commandService.onDidExecuteCommand((e) => {
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
			if (this.contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown') || this.configurationService.getValue('editor.inlineSuggest.keepOnBlur') ||
				editor.getOption(EditorOption.inlineSuggest).keepOnBlur) {
				return;
			}
			if (InlineSuggestionHintsContentWidget.dropDownVisible) {
				return;
			}
			transaction(tx => {
				/** @description onDidBlurEditorWidget */
				this.model.get()?.stop(tx);
			});
		}));

		this._register(autorun(reader => {
			/** @description forceRenderingAbove */
			const state = this.model.read(reader)?.state.read(reader);
			if (state?.suggestItem) {
				if (state.ghostText.lineCount >= 2) {
					this.suggestWidgetAdaptor.forceRenderingAbove();
				}
			} else {
				this.suggestWidgetAdaptor.stopForceRenderingAbove();
			}
		}));
		this._register(toDisposable(() => {
			this.suggestWidgetAdaptor.stopForceRenderingAbove();
		}));

		let lastInlineCompletionId: string | undefined = undefined;
		this._register(autorun(reader => {
			/** @description play audio cue & read suggestion */
			const model = this.model.read(reader);
			const state = model?.state.read(reader);
			if (!model || !state || !state.inlineCompletion) {
				lastInlineCompletionId = undefined;
				return;
			}

			if (state.inlineCompletion.semanticId !== lastInlineCompletionId) {
				lastInlineCompletionId = state.inlineCompletion.semanticId;
				const lineText = model.textModel.getLineContent(state.ghostText.lineNumber);
				this.audioCueService.playAudioCue(AudioCue.inlineSuggestion).then(() => {
					if (this.editor.getOption(EditorOption.screenReaderAnnounceInlineSuggestion)) {
						this.provideScreenReaderUpdate(state.ghostText.renderForScreenReader(lineText));
					}
				});
			}
		}));

		this._register(new InlineCompletionsHintsWidget(this.editor, this.model, this.instantiationService));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('accessibility.verbosity.inlineCompletions')) {
				this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this.configurationService.getValue('accessibility.verbosity.inlineCompletions') });
			}
		}));
		this.editor.updateOptions({ inlineCompletionsAccessibilityVerbose: this.configurationService.getValue('accessibility.verbosity.inlineCompletions') });
	}

	private provideScreenReaderUpdate(content: string): void {
		const accessibleViewShowing = this.contextKeyService.getContextKeyValue<boolean>('accessibleViewIsShown');
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
		this.textModelVersionId.set(newModel?.getVersionId() ?? -1, tx, changeReason);
		this.cursorPosition.set(this.editor.getPosition() ?? new Position(1, 1), tx);
	}

	public shouldShowHoverAt(range: Range) {
		const ghostText = this.model.get()?.ghostText.get();
		if (ghostText) {
			return ghostText.parts.some(p => range.containsPosition(new Position(ghostText.lineNumber, p.column)));
		}
		return false;
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this.ghostTextWidget.ownsViewZone(viewZoneId);
	}

	public hide() {
		transaction(tx => {
			this.model.get()?.stop(tx);
		});
	}
}
