/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, constObservable, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { ITransaction, disposableObservableValue, transaction } from 'vs/base/common/observableImpl/base';
import { CoreEditingCommands } from 'vs/editor/browser/coreCommands';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { inlineSuggestCommitId } from 'vs/editor/contrib/inlineCompletions/browser/commandIds';
import { GhostTextWidget } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextWidget';
import { InlineCompletionContextKeys } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionContextKeys';
import { InlineSuggestionHintsContentWidget } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsHintsWidget';
import { InlineCompletionsModel, VersionIdChangeReason } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsModel';
import { SuggestWidgetAdaptor } from 'vs/editor/contrib/inlineCompletions/browser/suggestWidgetInlineCompletionProvider';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class InlineCompletionsController extends Disposable {
	static ID = 'editor.contrib.inlineCompletionsController';

	public static get(editor: ICodeEditor): InlineCompletionsController | null {
		return editor.getContribution<InlineCompletionsController>(InlineCompletionsController.ID);
	}

	private readonly suggestWidgetAdaptor = this._register(new SuggestWidgetAdaptor(
		this.editor,
		() => this.model.get()?.currentInlineCompletion.get()?.toSingleTextEdit(),
		(tx) => this.updateObservables(tx, VersionIdChangeReason.Other)
	));

	private readonly textModelVersionId = observableValue<number, VersionIdChangeReason>('textModelVersionId', -1);
	private readonly cursorPosition = observableValue<Position>('cursorPosition', new Position(1, 1));
	public readonly model = disposableObservableValue<InlineCompletionsModel | undefined>('textModelVersionId', undefined);

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
	) {
		super();

		this._register(new InlineCompletionContextKeys(this.contextKeyService, this.model));

		const enabled = observableFromEvent(editor.onDidChangeConfiguration, () => editor.getOption(EditorOption.inlineSuggest).enabled);

		this._register(Event.runAndSubscribe(editor.onDidChangeModel, () => {
			this.model.set(undefined, undefined); // This disposes the model (do this outside of the transaction to dispose autoruns)
			transaction(tx => {
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
						enabled
					);
					this.model.set(model, tx);
				}
			});
		}));

		this._register(editor.onDidChangeModelContent((e) => transaction(tx =>
			this.updateObservables(tx,
				e.isUndoing ? VersionIdChangeReason.Undo
					: e.isRedoing ? VersionIdChangeReason.Redo
						: this.model.get()?.isAcceptingPartialWord ? VersionIdChangeReason.AcceptWord
							: VersionIdChangeReason.Other
			)
		)));

		this._register(editor.onDidChangeCursorPosition(e => transaction(tx => {
			this.updateObservables(tx, VersionIdChangeReason.Other);
			if (e.reason === CursorChangeReason.Explicit) {
				this.model.get()?.stop(tx);
			}
		})));

		this._register(editor.onDidType(() => transaction(tx => {
			this.updateObservables(tx, VersionIdChangeReason.Other);
			if (enabled.get()) {
				this.model.get()?.trigger(tx);
			}
		})));

		this._register(
			this.commandService.onDidExecuteCommand((e) => {
				// These commands don't trigger onDidType.
				const commands = new Set([
					CoreEditingCommands.Tab.id,
					CoreEditingCommands.DeleteLeft.id,
					CoreEditingCommands.DeleteRight.id,
					inlineSuggestCommitId,
					'acceptSelectedSuggestion',
				]);
				if (commands.has(e.commandId) && editor.hasTextFocus()) {
					transaction(tx => {
						this.model.get()?.trigger(tx);
					});
				}
			})
		);

		this._register(this.editor.onDidBlurEditorWidget(() => {
			// This is a hidden setting very useful for debugging
			if (this.configurationService.getValue('editor.inlineSuggest.keepOnBlur') ||
				editor.getOption(EditorOption.inlineSuggest).keepOnBlur) {
				return;
			}
			if (InlineSuggestionHintsContentWidget.dropDownVisible) {
				return;
			}
			transaction(tx => {
				this.model.get()?.stop(tx);
			});
		}));

		this._register(autorun('forceRenderingAbove', reader => {
			const model = this.model.read(reader);
			const ghostText = model?.ghostText.read(reader);
			const selectedSuggestItem = this.suggestWidgetAdaptor.selectedItem.read(reader);
			if (selectedSuggestItem) {
				if (ghostText && ghostText.lineCount >= 2) {
					this.suggestWidgetAdaptor.forceRenderingAbove();
				}
			} else {
				this.suggestWidgetAdaptor.stopForceRenderingAbove();
			}
		}));

		this._register(toDisposable(() => {
			this.suggestWidgetAdaptor.stopForceRenderingAbove();
		}));

		let lastEditorLine: string | undefined = undefined;
		this._register(autorun('play audio cue & read suggestion', reader => {
			const model = this.model.read(reader);
			const ghostText = model?.ghostText.read(reader);
			if (!model || !ghostText) {
				return;
			}

			const lineText = model.textModel.getLineContent(ghostText.lineNumber);
			if (lastEditorLine !== lineText) {
				lastEditorLine = lineText;
				this.audioCueService.playAudioCue(AudioCue.inlineSuggestion).then(() => {
					if (this.editor.getOption(EditorOption.screenReaderAnnounceInlineSuggestion)) {
						alert(ghostText.renderForScreenReader(lineText));
					}
				});
			}
		}));
	}

	private updateObservables(tx: ITransaction, changeReason: VersionIdChangeReason): void {
		const newModel = this.editor.getModel();
		this.textModelVersionId.set(newModel?.getVersionId() ?? -1, tx, changeReason);
		this.cursorPosition.set(this.editor.getPosition() ?? new Position(1, 1), tx);
	}

	shouldShowHoverAt(range: Range) {
		const ghostText = this.model.get()?.ghostText.get();
		if (ghostText) {
			return ghostText.parts.some(p => range.containsPosition(new Position(ghostText.lineNumber, p.column)));
		}
		return false;
	}

	public shouldShowHoverAtViewZone(viewZoneId: string): boolean {
		return this.ghostTextWidget.ownsViewZone(viewZoneId);
	}
}
