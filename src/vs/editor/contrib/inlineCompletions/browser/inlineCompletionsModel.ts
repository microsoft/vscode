/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFind } from 'vs/base/common/arrays';
import { BugIndicatingError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ITransaction, autorunHandleChanges, derived, observableSignal, observableValue, transaction } from 'vs/base/common/observable';
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
	private readonly _source = this._register(this._instantiationService.createInstance(InlineCompletionsSource, this.textModel, this._debounceValue));
	private readonly _isActive = observableValue('isActive', false);

	private _isAcceptingPartialWord = false;
	public get isAcceptingPartialWord() { return this._isAcceptingPartialWord; }

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
	}

	private async _update(reader: IReader | undefined, triggerKind: InlineCompletionTriggerKind, preserveCurrentCompletion: boolean = false): Promise<void> {
		preserveCurrentCompletion = preserveCurrentCompletion || (this.currentInlineCompletion.get()?.inlineCompletion.source.inlineCompletions.enableForwardStability ?? false);

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
			preserveCurrentCompletion ? this.currentInlineCompletion.get() : undefined
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

		const versionId = this.textModelVersionId.read(reader);
		const inlineCompletions = c.getInlineCompletions(versionId);

		const model = this.textModel;
		const cursorPosition = model.validatePosition(this.cursorPosition.read(reader));
		const filteredCompletions = inlineCompletions.filter(c => c.isVisible(model, cursorPosition));
		return filteredCompletions;
	});

	// We use a semantic id to track the selection even if the cache changes.
	private _currentInlineCompletionId: string | undefined = undefined;
	private readonly _selectedCompletionIdChanged = observableSignal('selectedCompletionIdChanged');

	public readonly currentInlineCompletionIndex = derived<number>('currentCachedCompletionIndex', (reader) => {
		this._selectedCompletionIdChanged.read(reader);

		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		if (!this._currentInlineCompletionId || filteredCompletions.length === 0) {
			return 0;
		}

		const idx = filteredCompletions.findIndex(v => v.semanticId === this._currentInlineCompletionId);
		if (idx === -1) {
			// Reset the selection so that the selection does not jump back when it appears again
			this._currentInlineCompletionId = undefined;
			return 0;
		}
		return idx;
	});

	public readonly currentInlineCompletion = derived<InlineCompletionWithUpdatedRange | undefined>('currentCachedCompletion', (reader) => {
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		const idx = this.currentInlineCompletionIndex.read(reader);
		return filteredCompletions[idx];
	});

	public readonly lastTriggerKind = this._source.inlineCompletions.map(v => v?.request.context.triggerKind);

	public readonly inlineCompletionsCount = derived<number | undefined>('currentInlineCompletionsCount', reader => {
		if (this.lastTriggerKind.read(reader) === InlineCompletionTriggerKind.Explicit) {
			return this._filteredInlineCompletionItems.read(reader).length;
		} else {
			return undefined;
		}
	});

	public readonly ghostText = derived('ghostText', (reader) => {
		const versionId = this.textModelVersionId.read(reader);
		const model = this.textModel;

		const suggestItem = this.selectedSuggestItem.read(reader);
		if (suggestItem) {
			const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(reader);
			const candidateInlineCompletion = suggestWidgetInlineCompletions
				? suggestWidgetInlineCompletions.getInlineCompletions(versionId)
				: [this.currentInlineCompletion.read(reader)].filter(isDefined);

			const suggestCompletion = suggestItem.toSingleTextEdit().removeCommonPrefix(model);

			const augmentedCompletion = mapFind(candidateInlineCompletion, c => {
				let r = c.toSingleTextEdit();
				r = r.removeCommonPrefix(model, Range.fromPositions(r.range.getStartPosition(), suggestItem.range.getEndPosition()));
				return r.augments(suggestCompletion) ? r : undefined;
			});

			const isSuggestionPreviewEnabled = this._suggestPreviewEnabled.read(reader);
			if (!isSuggestionPreviewEnabled && !augmentedCompletion) {
				return undefined;
			}

			const edit = augmentedCompletion ?? suggestCompletion;
			const editPreviewLength = augmentedCompletion ? augmentedCompletion.text.length - suggestCompletion.text.length : 0;

			const mode = this._suggestPreviewMode.read(reader);
			const cursor = this.cursorPosition.read(reader);
			const newGhostText = edit.computeGhostText(model, mode, cursor, editPreviewLength);

			// Show an invisible ghost text to reserve space
			return newGhostText ?? new GhostText(edit.range.endLineNumber, [], 0);
		} else {
			if (!this._isActive.read(reader)) { return undefined; }
			const item = this.currentInlineCompletion.read(reader);
			if (!item) { return undefined; }

			const replacement = item.toSingleTextEdit();
			const mode = this._inlineSuggestMode.read(reader);
			const cursor = this.cursorPosition.read(reader);
			return replacement.computeGhostText(model, mode, cursor);
		}
	});

	public async next(): Promise<void> {
		await this.triggerExplicitly();

		const completions = this._filteredInlineCompletionItems.get() || [];
		if (completions.length > 0) {
			const newIdx = (this.currentInlineCompletionIndex.get() + 1) % completions.length;
			this._currentInlineCompletionId = completions[newIdx].semanticId;
		} else {
			this._currentInlineCompletionId = undefined;
		}
		this._selectedCompletionIdChanged.trigger(undefined);
	}

	public async previous(): Promise<void> {
		await this.triggerExplicitly();

		const completions = this._filteredInlineCompletionItems.get() || [];
		if (completions.length > 0) {
			const newIdx = (this.currentInlineCompletionIndex.get() + completions.length - 1) % completions.length;
			this._currentInlineCompletionId = completions[newIdx].semanticId;
		} else {
			this._currentInlineCompletionId = undefined;
		}
		this._selectedCompletionIdChanged.trigger(undefined);
	}

	public async triggerExplicitly(): Promise<void> {
		await this._update(undefined, InlineCompletionTriggerKind.Explicit);
	}

	public accept(editor: ICodeEditor): void {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}

		const ghostText = this.ghostText.get();
		const completion = this.currentInlineCompletion.get()?.toInlineCompletion();
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
		const completion = this.currentInlineCompletion.get()?.toInlineCompletion();
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
