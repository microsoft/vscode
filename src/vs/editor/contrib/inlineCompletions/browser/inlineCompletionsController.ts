/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { autorun, constObservable, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { IObservable, ITransaction, disposableObservableValue, transaction } from 'vs/base/common/observableImpl/base';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { GhostTextWidget } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextWidget';
import { InlineCompletionsModel, VersionIdChangeReason } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsModel';
import { SuggestWidgetAdaptor } from 'vs/editor/contrib/inlineCompletions/browser/suggestWidgetInlineCompletionProvider';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import * as nls from 'vs/nls';
import { CursorColumns } from 'vs/editor/common/core/cursorColumns';
import { firstNonWhitespaceIndex } from 'vs/base/common/strings';
import { InlineSuggestionHintsContentWidget } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsHintsWidget';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CoreEditingCommands } from 'vs/editor/browser/coreCommands';
import { inlineSuggestCommitId } from 'vs/editor/contrib/inlineCompletions/browser/commandIds';
import { ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { alert } from 'vs/base/browser/ui/aria/aria';

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
			if (this.configurationService.getValue('editor.inlineSuggest.keepOnBlur')) {
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

export class InlineCompletionContextKeys extends Disposable {
	public static readonly inlineSuggestionVisible = new RawContextKey<boolean>('inlineSuggestionVisible', false, nls.localize('inlineSuggestionVisible', "Whether an inline suggestion is visible"));
	public static readonly inlineSuggestionHasIndentation = new RawContextKey<boolean>('inlineSuggestionHasIndentation', false, nls.localize('inlineSuggestionHasIndentation', "Whether the inline suggestion starts with whitespace"));
	public static readonly inlineSuggestionHasIndentationLessThanTabSize = new RawContextKey<boolean>('inlineSuggestionHasIndentationLessThanTabSize', true, nls.localize('inlineSuggestionHasIndentationLessThanTabSize', "Whether the inline suggestion starts with whitespace that is less than what would be inserted by tab"));
	public static readonly alwaysShowInlineSuggestionToolbar = new RawContextKey<boolean>('alwaysShowInlineSuggestionToolbar', false, nls.localize('alwaysShowInlineSuggestionToolbar', "Whether the inline suggestion toolbar should always be visible"));

	public readonly inlineCompletionVisible = InlineCompletionContextKeys.inlineSuggestionVisible.bindTo(this.contextKeyService);
	public readonly inlineCompletionSuggestsIndentation = InlineCompletionContextKeys.inlineSuggestionHasIndentation.bindTo(this.contextKeyService);
	public readonly inlineCompletionSuggestsIndentationLessThanTabSize = InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize.bindTo(this.contextKeyService);

	constructor(
		private readonly contextKeyService: IContextKeyService,
		private readonly model: IObservable<InlineCompletionsModel | undefined>,
	) {
		super();

		this._register(autorun('update context key: inlineCompletionVisible', (reader) => {
			const model = this.model.read(reader);
			const ghostText = model?.ghostText.read(reader);
			const selectedSuggestItem = model?.selectedSuggestItem.read(reader);
			this.inlineCompletionVisible.set(selectedSuggestItem === undefined && ghostText !== undefined);
		}));

		this._register(autorun('update context key: inlineCompletionSuggestsIndentation, inlineCompletionSuggestsIndentationLessThanTabSize', (reader) => {
			const model = this.model.read(reader);

			let startsWithIndentation = false;
			let startsWithIndentationLessThanTabSize = true;

			const ghostText = model?.ghostText.read(reader);
			if (!!model?.selectedSuggestItem && ghostText && ghostText.parts.length > 0) {
				const { column, lines } = ghostText.parts[0];

				const firstLine = lines[0];

				const indentationEndColumn = model.textModel.getLineIndentColumn(ghostText.lineNumber);
				const inIndentation = column <= indentationEndColumn;

				if (inIndentation) {
					let firstNonWsIdx = firstNonWhitespaceIndex(firstLine);
					if (firstNonWsIdx === -1) {
						firstNonWsIdx = firstLine.length - 1;
					}
					startsWithIndentation = firstNonWsIdx > 0;

					const tabSize = model.textModel.getOptions().tabSize;
					const visibleColumnIndentation = CursorColumns.visibleColumnFromColumn(firstLine, firstNonWsIdx + 1, tabSize);
					startsWithIndentationLessThanTabSize = visibleColumnIndentation < tabSize;
				}
			}

			this.inlineCompletionSuggestsIndentation.set(startsWithIndentation);
			this.inlineCompletionSuggestsIndentationLessThanTabSize.set(startsWithIndentationLessThanTabSize);
		}));
	}
}
