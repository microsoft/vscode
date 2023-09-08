/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mapFindFirst } from 'vs/base/common/arraysFind';
import { BugIndicatingError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ITransaction, autorun, derived, derivedHandleChanges, derivedOpts, recomputeInitiallyAndOnChange, observableSignal, observableValue, subtransaction, transaction } from 'vs/base/common/observable';
import { isDefined } from 'vs/base/common/types';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { InlineCompletionContext, InlineCompletionTriggerKind } from 'vs/editor/common/languages';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { EndOfLinePreference, ITextModel } from 'vs/editor/common/model';
import { IFeatureDebounceInformation } from 'vs/editor/common/services/languageFeatureDebounce';
import { GhostText, GhostTextOrReplacement, ghostTextOrReplacementEquals } from 'vs/editor/contrib/inlineCompletions/browser/ghostText';
import { InlineCompletionWithUpdatedRange, InlineCompletionsSource } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsSource';
import { SingleTextEdit } from 'vs/editor/contrib/inlineCompletions/browser/singleTextEdit';
import { SuggestItemInfo } from 'vs/editor/contrib/inlineCompletions/browser/suggestWidgetInlineCompletionProvider';
import { addPositions, lengthOfText } from 'vs/editor/contrib/inlineCompletions/browser/utils';
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
	private readonly _isActive = observableValue<boolean, InlineCompletionTriggerKind | void>(this, false);
	private readonly _forceUpdate = observableSignal<InlineCompletionTriggerKind>('forceUpdate');

	// We use a semantic id to keep the same inline completion selected even if the provider reorders the completions.
	private readonly _selectedInlineCompletionId = observableValue<string | undefined>(this, undefined);

	private _isAcceptingPartially = false;
	public get isAcceptingPartially() { return this._isAcceptingPartially; }

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

		this._register(recomputeInitiallyAndOnChange(this._fetchInlineCompletions));

		let lastItem: InlineCompletionWithUpdatedRange | undefined = undefined;
		this._register(autorun(reader => {
			/** @description call handleItemDidShow */
			const item = this.state.read(reader);
			const completion = item?.inlineCompletion;
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

	private readonly _preserveCurrentCompletionReasons = new Set([
		VersionIdChangeReason.Redo,
		VersionIdChangeReason.Undo,
		VersionIdChangeReason.AcceptWord,
	]);
	private readonly _fetchInlineCompletions = derivedHandleChanges({
		owner: this,
		createEmptyChangeSummary: () => ({
			preserveCurrentCompletion: false,
			inlineCompletionTriggerKind: InlineCompletionTriggerKind.Automatic
		}),
		handleChange: (ctx, changeSummary) => {
			/** @description fetch inline completions */
			if (ctx.didChange(this.textModelVersionId) && this._preserveCurrentCompletionReasons.has(ctx.change)) {
				changeSummary.preserveCurrentCompletion = true;
			} else if (ctx.didChange(this._forceUpdate)) {
				changeSummary.inlineCompletionTriggerKind = ctx.change;
			}
			return true;
		},
	}, (reader, changeSummary) => {
		this._forceUpdate.read(reader);
		const shouldUpdate = (this._enabled.read(reader) && this.selectedSuggestItem.read(reader)) || this._isActive.read(reader);
		if (!shouldUpdate) {
			this._source.cancelUpdate();
			return undefined;
		}

		this.textModelVersionId.read(reader); // Refetch on text change

		const itemToPreserveCandidate = this.selectedInlineCompletion.get();
		const itemToPreserve = changeSummary.preserveCurrentCompletion || itemToPreserveCandidate?.forwardStable
			? itemToPreserveCandidate : undefined;

		const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.get();
		const suggestItem = this.selectedSuggestItem.read(reader);
		if (suggestWidgetInlineCompletions && !suggestItem) {
			const inlineCompletions = this._source.inlineCompletions.get();
			transaction(tx => {
				/** @description Seed inline completions with (newer) suggest widget inline completions */
				if (inlineCompletions && suggestWidgetInlineCompletions.request.versionId > inlineCompletions.request.versionId) {
					this._source.inlineCompletions.set(suggestWidgetInlineCompletions.clone(), tx);
				}
				this._source.clearSuggestWidgetInlineCompletions(tx);
			});
		}

		const cursorPosition = this.cursorPosition.read(reader);
		const context: InlineCompletionContext = {
			triggerKind: changeSummary.inlineCompletionTriggerKind,
			selectedSuggestionInfo: suggestItem?.toSelectedSuggestionInfo(),
		};
		return this._source.fetch(cursorPosition, context, itemToPreserve);
	});

	public async trigger(tx?: ITransaction): Promise<void> {
		this._isActive.set(true, tx);
		await this._fetchInlineCompletions.get();
	}

	public async triggerExplicitly(tx?: ITransaction): Promise<void> {
		subtransaction(tx, tx => {
			this._isActive.set(true, tx);
			this._forceUpdate.trigger(tx, InlineCompletionTriggerKind.Explicit);
		});
		await this._fetchInlineCompletions.get();
	}

	public stop(tx?: ITransaction): void {
		subtransaction(tx, tx => {
			this._isActive.set(false, tx);
			this._source.clear(tx);
		});
	}

	private readonly _filteredInlineCompletionItems = derived(this, reader => {
		const c = this._source.inlineCompletions.read(reader);
		if (!c) { return []; }
		const cursorPosition = this.cursorPosition.read(reader);
		const filteredCompletions = c.inlineCompletions.filter(c => c.isVisible(this.textModel, cursorPosition, reader));
		return filteredCompletions;
	});

	public readonly selectedInlineCompletionIndex = derived<number>(this, (reader) => {
		const selectedInlineCompletionId = this._selectedInlineCompletionId.read(reader);
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		const idx = this._selectedInlineCompletionId === undefined ? -1
			: filteredCompletions.findIndex(v => v.semanticId === selectedInlineCompletionId);
		if (idx === -1) {
			// Reset the selection so that the selection does not jump back when it appears again
			this._selectedInlineCompletionId.set(undefined, undefined);
			return 0;
		}
		return idx;
	});

	public readonly selectedInlineCompletion = derived<InlineCompletionWithUpdatedRange | undefined>(this, (reader) => {
		const filteredCompletions = this._filteredInlineCompletionItems.read(reader);
		const idx = this.selectedInlineCompletionIndex.read(reader);
		return filteredCompletions[idx];
	});

	public readonly lastTriggerKind: IObservable<InlineCompletionTriggerKind | undefined> = this._source.inlineCompletions.map(
		v => /** @description lastTriggerKind */ v?.request.context.triggerKind
	);

	public readonly inlineCompletionsCount = derived<number | undefined>(this, reader => {
		if (this.lastTriggerKind.read(reader) === InlineCompletionTriggerKind.Explicit) {
			return this._filteredInlineCompletionItems.read(reader).length;
		} else {
			return undefined;
		}
	});

	public readonly state = derivedOpts<{
		suggestItem: SuggestItemInfo | undefined;
		inlineCompletion: InlineCompletionWithUpdatedRange | undefined;
		ghostText: GhostTextOrReplacement;
	} | undefined>({
		owner: this,
		equalityComparer: (a, b) => {
			if (!a || !b) { return a === b; }
			return ghostTextOrReplacementEquals(a.ghostText, b.ghostText)
				&& a.inlineCompletion === b.inlineCompletion
				&& a.suggestItem === b.suggestItem;
		}
	}, (reader) => {
		const model = this.textModel;

		const suggestItem = this.selectedSuggestItem.read(reader);
		if (suggestItem) {
			const suggestCompletion = suggestItem.toSingleTextEdit().removeCommonPrefix(model);
			const augmentedCompletion = this._computeAugmentedCompletion(suggestCompletion, reader);

			const isSuggestionPreviewEnabled = this._suggestPreviewEnabled.read(reader);
			if (!isSuggestionPreviewEnabled && !augmentedCompletion) { return undefined; }

			const edit = augmentedCompletion?.edit ?? suggestCompletion;
			const editPreviewLength = augmentedCompletion ? augmentedCompletion.edit.text.length - suggestCompletion.text.length : 0;

			const mode = this._suggestPreviewMode.read(reader);
			const cursor = this.cursorPosition.read(reader);
			const newGhostText = edit.computeGhostText(model, mode, cursor, editPreviewLength);

			// Show an invisible ghost text to reserve space
			const ghostText = newGhostText ?? new GhostText(edit.range.endLineNumber, []);
			return { ghostText, inlineCompletion: augmentedCompletion?.completion, suggestItem };
		} else {
			if (!this._isActive.read(reader)) { return undefined; }
			const item = this.selectedInlineCompletion.read(reader);
			if (!item) { return undefined; }

			const replacement = item.toSingleTextEdit(reader);
			const mode = this._inlineSuggestMode.read(reader);
			const cursor = this.cursorPosition.read(reader);
			const ghostText = replacement.computeGhostText(model, mode, cursor);
			return ghostText ? { ghostText, inlineCompletion: item, suggestItem: undefined } : undefined;
		}
	});

	private _computeAugmentedCompletion(suggestCompletion: SingleTextEdit, reader: IReader | undefined) {
		const model = this.textModel;
		const suggestWidgetInlineCompletions = this._source.suggestWidgetInlineCompletions.read(reader);
		const candidateInlineCompletions = suggestWidgetInlineCompletions
			? suggestWidgetInlineCompletions.inlineCompletions
			: [this.selectedInlineCompletion.read(reader)].filter(isDefined);

		const augmentedCompletion = mapFindFirst(candidateInlineCompletions, completion => {
			let r = completion.toSingleTextEdit(reader);
			r = r.removeCommonPrefix(model, Range.fromPositions(r.range.getStartPosition(), suggestCompletion.range.getEndPosition()));
			return r.augments(suggestCompletion) ? { edit: r, completion } : undefined;
		});

		return augmentedCompletion;
	}

	public readonly ghostText = derivedOpts({
		owner: this,
		equalityComparer: ghostTextOrReplacementEquals
	}, reader => {
		const v = this.state.read(reader);
		if (!v) { return undefined; }
		return v.ghostText;
	});

	private async _deltaSelectedInlineCompletionIndex(delta: 1 | -1): Promise<void> {
		await this.triggerExplicitly();

		const completions = this._filteredInlineCompletionItems.get() || [];
		if (completions.length > 0) {
			const newIdx = (this.selectedInlineCompletionIndex.get() + delta + completions.length) % completions.length;
			this._selectedInlineCompletionId.set(completions[newIdx].semanticId, undefined);
		} else {
			this._selectedInlineCompletionId.set(undefined, undefined);
		}
	}

	public async next(): Promise<void> {
		await this._deltaSelectedInlineCompletionIndex(1);
	}

	public async previous(): Promise<void> {
		await this._deltaSelectedInlineCompletionIndex(-1);
	}

	public async accept(editor: ICodeEditor): Promise<void> {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}

		const state = this.state.get();
		if (!state || state.ghostText.isEmpty() || !state.inlineCompletion) {
			return;
		}
		const completion = state.inlineCompletion.toInlineCompletion(undefined);

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
			// Make sure the completion list will not be disposed.
			completion.source.addRef();
		}

		// Reset before invoking the command, since the command might cause a follow up trigger.
		transaction(tx => {
			this._source.clear(tx);
			// Potentially, isActive will get set back to true by the typing or accept inline suggest event
			// if automatic inline suggestions are enabled.
			this._isActive.set(false, tx);
		});

		if (completion.command) {
			await this._commandService
				.executeCommand(completion.command.id, ...(completion.command.arguments || []))
				.then(undefined, onUnexpectedExternalError);
			completion.source.removeRef();
		}
	}

	public async acceptNextWord(editor: ICodeEditor): Promise<void> {
		await this._acceptNext(editor, (pos, text) => {
			const langId = this.textModel.getLanguageIdAtPosition(pos.lineNumber, pos.column);
			const config = this._languageConfigurationService.getLanguageConfiguration(langId);
			const wordRegExp = new RegExp(config.wordDefinition.source, config.wordDefinition.flags.replace('g', ''));

			const m1 = text.match(wordRegExp);
			let acceptUntilIndexExclusive = 0;
			if (m1 && m1.index !== undefined) {
				if (m1.index === 0) {
					acceptUntilIndexExclusive = m1[0].length;
				} else {
					acceptUntilIndexExclusive = m1.index;
				}
			} else {
				acceptUntilIndexExclusive = text.length;
			}

			const wsRegExp = /\s+/g;
			const m2 = wsRegExp.exec(text);
			if (m2 && m2.index !== undefined) {
				if (m2.index + m2[0].length < acceptUntilIndexExclusive) {
					acceptUntilIndexExclusive = m2.index + m2[0].length;
				}
			}
			return acceptUntilIndexExclusive;
		});
	}

	public async acceptNextLine(editor: ICodeEditor): Promise<void> {
		await this._acceptNext(editor, (pos, text) => {
			const m = text.match(/\n/);
			if (m && m.index !== undefined) {
				return m.index + 1;
			}
			return text.length;
		});
	}

	private async _acceptNext(editor: ICodeEditor, getAcceptUntilIndex: (position: Position, text: string) => number): Promise<void> {
		if (editor.getModel() !== this.textModel) {
			throw new BugIndicatingError();
		}

		const state = this.state.get();
		if (!state || state.ghostText.isEmpty() || !state.inlineCompletion) {
			return;
		}
		const ghostText = state.ghostText;
		const completion = state.inlineCompletion.toInlineCompletion(undefined);

		if (completion.snippetInfo || completion.filterText !== completion.insertText) {
			// not in WYSIWYG mode, partial commit might change completion, thus it is not supported
			await this.accept(editor);
			return;
		}

		const firstPart = ghostText.parts[0];
		const position = new Position(ghostText.lineNumber, firstPart.column);
		const line = firstPart.lines.join('\n');
		const acceptUntilIndexExclusive = getAcceptUntilIndex(position, line);

		if (acceptUntilIndexExclusive === line.length && ghostText.parts.length === 1) {
			this.accept(editor);
			return;
		}

		const partialText = line.substring(0, acceptUntilIndexExclusive);

		this._isAcceptingPartially = true;
		try {
			editor.pushUndoStop();
			editor.executeEdits('inlineSuggestion.accept', [
				EditOperation.replace(Range.fromPositions(position), partialText),
			]);
			const length = lengthOfText(partialText);
			editor.setPosition(addPositions(position, length));
		} finally {
			this._isAcceptingPartially = false;
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

	public handleSuggestAccepted(item: SuggestItemInfo) {
		const itemEdit = item.toSingleTextEdit().removeCommonPrefix(this.textModel);
		const augmentedCompletion = this._computeAugmentedCompletion(itemEdit, undefined);
		if (!augmentedCompletion) { return; }

		const inlineCompletion = augmentedCompletion.completion.inlineCompletion;
		inlineCompletion.source.provider.handlePartialAccept?.(
			inlineCompletion.source.inlineCompletions,
			inlineCompletion.sourceInlineCompletion,
			itemEdit.text.length,
		);
	}
}
