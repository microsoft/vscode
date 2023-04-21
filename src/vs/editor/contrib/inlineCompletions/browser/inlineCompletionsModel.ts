/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { BugIndicatingError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ITransaction, autorun, autorunHandleChanges, derived, observableSignal, observableValue, transaction } from 'vs/base/common/observable';
import { isDefined } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { InlineCompletionTriggerKind } from 'vs/editor/common/languages';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { IFeatureDebounceInformation } from 'vs/editor/common/services/languageFeatureDebounce';
import { GhostText } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { addPositions, lengthOfText } from 'vs/editor/contrib/inlineCompletions/browser/utils';
import { InlineCompletionWithUpdatedRange, InlineCompletionsSource } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsSource';
import { SuggestItemInfo } from 'vs/editor/contrib/inlineCompletions/browser/suggestWidgetInlineCompletionProvider';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export enum VersionIdChangeReason {
	Undo,
	Redo,
	AcceptWord,
	Other,
}

export class InlineCompletionsModel extends Disposable {
	private readonly _source = this._register(this._instantiationService.createInstance(InlineCompletionsSource, this.textModel, this.textModelVersionId, this._debounceValue));
	private readonly _isActive = observableValue('isActive', false);

	private _isAcceptingPartialWord = false;
	public get isAcceptingPartialWord() { return this._isAcceptingPartialWord; }

	private _isNavigatingCurrentInlineCompletion = false;
	public get isNavigatingCurrentInlineCompletion() { return this._isNavigatingCurrentInlineCompletion; }

	constructor(
		public readonly textModel: ITextModel,
		public readonly selectedSuggestItem: IObservable<SuggestItemInfo | undefined>,
		public readonly cursorPosition: IObservable<Position>,
		public readonly textModelVersionId: IObservable<number, VersionIdChangeReason>,
		private readonly _debounceValue: IFeatureDebounceInformation,
		private readonly _suggestPreviewEnabled: IObservable<boolean>,
		private readonly _suggestPreviewMode: IObservable<'prefix' | 'subword' | 'subwordSmart'>,
		private readonly _inlineSuggestMode: IObservable<'prefix' | 'subword' | 'subwordSmart'>,
		private readonly _enabled: IObservable<boolean>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ICommandService private readonly _commandService: ICommandService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
	) {
		super();

		let preserveCurrentCompletion = false;
		const preserveCurrentCompletionReasons = new Set([
			VersionIdChangeReason.Redo,
			VersionIdChangeReason.Undo,
			VersionIdChangeReason.AcceptWord,
		]);
		this._register(autorunHandleChanges('update', {
			handleChange: ctx => {
				if (ctx.didChange(this.textModelVersionId) && preserveCurrentCompletionReasons.has(ctx.change)) {
					preserveCurrentCompletion = true;
				}
				return true;
			}
		}, (reader) => {
			if ((this._enabled.read(reader) && this.selectedSuggestItem.read(reader)) || this._isActive.read(reader)) {
				this._update(reader, InlineCompletionTriggerKind.Automatic, preserveCurrentCompletion);
			}
			preserveCurrentCompletion = false;
		}));

		let lastItem: InlineCompletionWithUpdatedRange | undefined = undefined;
		this._register(autorun('call handleItemDidShow', reader => {
			const item = this.ghostTextAndCompletion.read(reader);
			const completion = item?.completion;
			if (completion?.semanticId !== lastItem?.semanticId) {
				lastItem = completion;
				if (completion) {
					const i = completion.inlineCompletion;
					const src = i.source;
					src.provider.handleItemDidShow?.(src.inlineCompletions, i.sourceInlineCompletion, i.insertText);
				}
			}
		}));
	}

	private async _update(reader: IReader | undefined, triggerKind: InlineCompletionTriggerKind, preserveCurrentCompletion: boolean = false): Promise<void> {
		preserveCurrentCompletion = preserveCurrentCompletion || (this.selectedInlineCompletion.get()?.inlineCompletion.source.inlineCompletions.enableForwardStability ?? false);

		const suggestItem = this.selectedSuggestItem.read(reader);
		const cursorPosition = this.cursorPosition.read(reader);
		this.textModelVersionId.read(reader);

		const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.get();
		if (suggestWidgetInlineCompletions && !suggestItem) {
			const inlineCompletions = this._source.inlineCompletions.get();
			if (inlineCompletions && suggestWidgetInlineCompletions.request.versionId > inlineCompletions.request.versionId) {
				this._source.inlineCompletions.set(suggestWidgetInlineCompletions.clone(), undefined);
			}
			this._source.clearSuggestWidgetInlineCompletions();
		}

		await this._source.update(
			cursorPosition,
			{ triggerKind, selectedSuggestionInfo: suggestItem?.toSelectedSuggestionInfo() },
			preserveCurrentCompletion ? this.selectedInlineCompletion.get() : undefined
		);
	}

	public trigger(tx?: ITransaction): void {
		this._isActive.set(true, tx);
	}

	public stop(tx?: ITransaction): void {
		if (!tx) {
			transaction(tx => this.stop(tx));
			return;
		}
		this._isActive.set(false, tx);
		this._source.clear(tx);
	}

	private readonly _filteredInlineCompletionItems = derived('filteredInlineCompletionItems', (reader) => {
		const c = this._source.inlineCompletions.read(reader);
		if (!c) { return []; }
		const cursorPosition = this.cursorPosition.read(reader);
		const filteredCompletions = c.inlineCompletions.filter(c => c.isVisible(this.textModel, cursorPosition, reader));
		return filteredCompletions;
	});

	// We use a semantic id to keep the same inline completion selected even if the provider reorders the completions.
	private _selectedInlineCompletionId: string | undefined = undefined;
	private readonly _selectedInlineCompletionIdChangeSignal = observableSignal('selectedCompletionIdChanged');

	public readonly selectedInlineCompletionIndex = derived<number>('selectedCachedCompletionIndex', (reader) => {
		this._selectedInlineCompletionIdChangeSignal.read(reader);
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		const idx = this._selectedInlineCompletionId === undefined
			? -1
			: filteredCompletions.findIndex(v => v.semanticId === this._selectedInlineCompletionId);
		if (idx === -1) {
			// Reset the selection so that the selection does not jump back when it appears again
			this._selectedInlineCompletionId = undefined;
			return 0;
		}
		return idx;
	});

	public readonly selectedInlineCompletion = derived<InlineCompletionWithUpdatedRange | undefined>('selectedCachedCompletion', (reader) => {
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		const idx = this.selectedInlineCompletionIndex.read(reader);
		return filteredCompletions[idx];
	});

	public readonly lastTriggerKind = this._source.inlineCompletions.map(v => v?.request.context.triggerKind);

	public readonly inlineCompletionsCount = derived<number | undefined>('selectedInlineCompletionsCount', reader => {
		if (this.lastTriggerKind.read(reader) === InlineCompletionTriggerKind.Explicit) {
			return this._filteredInlineCompletionItems.read(reader).length;
		} else {
			return undefined;
		}
	});

	public readonly ghostTextAndCompletion = derived('ghostText', (reader) => {
		const model = this.textModel;

		const suggestItem = this.selectedSuggestItem.read(reader);
		if (suggestItem) {
			const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(reader);
			const candidateInlineCompletions = suggestWidgetInlineCompletions
				? suggestWidgetInlineCompletions.inlineCompletions
				: [this.selectedInlineCompletion.read(reader)].filter(isDefined);

			const suggestCompletion = suggestItem.toSingleTextEdit().removeCommonPrefix(model);

			const augmentedCompletion = mapFind(candidateInlineCompletions, completion => {
				let r = completion.toSingleTextEdit(reader);
				r = r.removeCommonPrefix(model, Range.fromPositions(r.range.getStartPosition(), suggestItem.range.getEndPosition()));
				return r.augments(suggestCompletion) ? { edit: r, completion } : undefined;
			});

			const isSuggestionPreviewEnabled = this._suggestPreviewEnabled.read(reader);
			if (!isSuggestionPreviewEnabled && !augmentedCompletion) {
				return undefined;
			}

			const edit = augmentedCompletion?.edit ?? suggestCompletion;
			const editPreviewLength = augmentedCompletion ? augmentedCompletion.edit.text.length - suggestCompletion.text.length : 0;

			const mode = this._suggestPreviewMode.read(reader);
			const cursor = this.cursorPosition.read(reader);
			const newGhostText = edit.computeGhostText(model, mode, cursor, editPreviewLength);

			// Show an invisible ghost text to reserve space
			const ghostText = newGhostText ?? new GhostText(edit.range.endLineNumber, []);
			return { ghostText, completion: augmentedCompletion?.completion };
		} else {
			if (!this._isActive.read(reader)) { return undefined; }
			const item = this.selectedInlineCompletion.read(reader);
			if (!item) { return undefined; }

			const replacement = item.toSingleTextEdit(reader);
			const mode = this._inlineSuggestMode.read(reader);
			const cursor = this.cursorPosition.read(reader);
			const ghostText = replacement.computeGhostText(model, mode, cursor);
			return ghostText ? { ghostText, completion: item } : undefined;
		}
	});

	public readonly ghostText = derived('ghostText', (reader) => {
		const v = this.ghostTextAndCompletion.read(reader);
		if (!v) { return undefined; }
		return v.ghostText;
	});

	public async triggerExplicitly(): Promise<void> {
		await this._update(undefined, InlineCompletionTriggerKind.Explicit);
	}

	private async deltaIndex(delta: 1 | -1): Promise<void> {
		await this.triggerExplicitly();

		this._isNavigatingCurrentInlineCompletion = true;
		try {
			const completions = this._filteredInlineCompletionItems.get() || [];
			if (completions.length > 0) {
				const newIdx = (this.selectedInlineCompletionIndex.get() + delta + completions.length) % completions.length;
				this._selectedInlineCompletionId = completions[newIdx].semanticId;
			} else {
				this._selectedInlineCompletionId = undefined;
			}
			this._selectedInlineCompletionIdChangeSignal.trigger(undefined);
		} finally {
			this._isNavigatingCurrentInlineCompletion = false;
		}
	}

	public async next(): Promise<void> {
		await this.deltaIndex(1);
	}

	public async previous(): Promise<void> {
		await this.deltaIndex(-1);
	}

	public accept(editor: ICodeEditor): void {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}

		const ghostText = this.ghostText.get();
		const completion = this.selectedInlineCompletion.get()?.toInlineCompletion(undefined);
		if (!ghostText || !completion) {
			return;
		}

		editor.pushUndoStop();
		if (completion.snippetInfo) {
			editor.executeEdits(
				'inlineSuggestion.accept',
				[
					EditOperation.replaceMove(completion.range, ''),
					...completion.additionalTextEdits
				]
			);
			editor.setPosition(completion.snippetInfo.range.getStartPosition());
			SnippetController2.get(editor)?.insert(completion.snippetInfo.snippet, { undoStopBefore: false });
		} else {
			editor.executeEdits(
				'inlineSuggestion.accept',
				[
					EditOperation.replaceMove(completion.range, completion.insertText),
					...completion.additionalTextEdits
				]
			);
		}

		if (completion.command) {
			this._commandService
				.executeCommand(completion.command.id, ...(completion.command.arguments || []))
				.finally(() => {
					transaction(tx => {
						this._source.clear(tx);
					});
				})
				.then(undefined, onUnexpectedExternalError);
		} else {
			transaction(tx => {
				this._source.clear(tx);
			});
		}
	}

	public acceptNextWord(editor: ICodeEditor): void {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}

		const ghostText = this.ghostText.get();
		const completion = this.selectedInlineCompletion.get()?.toInlineCompletion(undefined);
		if (!ghostText || !completion) {
			return;
		}

		if (completion.snippetInfo || completion.filterText !== completion.insertText) {
			// not in WYSIWYG mode, partial commit might change completion, thus it is not supported
			this.accept(editor);
			return;
		}

		if (ghostText.parts.length === 0) {
			return;
		}
		const firstPart = ghostText.parts[0];
		const position = new Position(ghostText.lineNumber, firstPart.column);

		const line = firstPart.lines.join('\n');
		const langId = this.textModel.getLanguageIdAtPosition(ghostText.lineNumber, 1);
		const config = this._languageConfigurationService.getLanguageConfiguration(langId);
		const wordRegExp = new RegExp(config.wordDefinition.source, config.wordDefinition.flags.replace('g', ''));

		const m1 = line.match(wordRegExp);
		let acceptUntilIndexExclusive = 0;
		if (m1 && m1.index !== undefined) {
			if (m1.index === 0) {
				acceptUntilIndexExclusive = m1[0].length;
			} else {
				acceptUntilIndexExclusive = m1.index;
			}
		} else {
			acceptUntilIndexExclusive = line.length;
		}

		const wsRegExp = /\s+/g;
		const m2 = wsRegExp.exec(line);
		if (m2 && m2.index !== undefined) {
			if (m2.index + m2[0].length < acceptUntilIndexExclusive) {
				acceptUntilIndexExclusive = m2.index + m2[0].length;
			}
		}

		if (acceptUntilIndexExclusive === line.length && ghostText.parts.length === 1) {
			this.accept(editor);
			return;
		}

		const partialText = line.substring(0, acceptUntilIndexExclusive);

		this._isAcceptingPartialWord = true;
		try {
			editor.pushUndoStop();
			editor.executeEdits('inlineSuggestion.accept', [
				EditOperation.replace(Range.fromPositions(position), partialText),
			]);
			const length = lengthOfText(partialText);
			editor.setPosition(addPositions(position, length));
		} finally {
			this._isAcceptingPartialWord = false;
		}

		if (completion.source.provider.handlePartialAccept) {
			const acceptedRange = Range.fromPositions(completion.range.getStartPosition(), addPositions(position, lengthOfText(partialText)));
			// This assumes that the inline completion and the model use the same EOL style.
			const text = editor.getModel()!.getValueInRange(acceptedRange, EndOfLinePreference.LF);
			completion.source.provider.handlePartialAccept(
				completion.source.inlineCompletions,
				completion.sourceInlineCompletion,
				text.length,
			);
		}
	}
}
