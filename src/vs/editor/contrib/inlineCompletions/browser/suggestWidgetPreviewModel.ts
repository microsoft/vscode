/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createCancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { CompletionItemKind, InlineCompletionTriggerKind, SelectedSuggestionInfo } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { SharedInlineCompletionCache } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextModel';
import { BaseGhostTextWidgetModel, GhostText } from './ghostText';
import { provideInlineCompletions, TrackedInlineCompletions, UpdateOperation } from './inlineCompletionsModel';
import { inlineCompletionToGhostText, minimizeInlineCompletion, NormalizedInlineCompletion } from './inlineCompletionToGhostText';
import { SuggestWidgetInlineCompletionProvider } from './suggestWidgetInlineCompletionProvider';

export class SuggestWidgetPreviewModel extends BaseGhostTextWidgetModel {
	private readonly suggestionInlineCompletionSource = this._register(
		new SuggestWidgetInlineCompletionProvider(
			this.editor,
			// Use the first cache item (if any) as preselection.
			() => this.cache.value?.completions[0]?.toLiveInlineCompletion()
		)
	);
	private readonly updateOperation = this._register(new MutableDisposable<UpdateOperation>());
	private readonly updateCacheSoon = this._register(new RunOnceScheduler(() => this.updateCache(), 50));

	public override minReservedLineCount: number = 0;

	public get isActive(): boolean {
		return this.suggestionInlineCompletionSource.state !== undefined;
	}

	constructor(
		editor: IActiveCodeEditor,
		private readonly cache: SharedInlineCompletionCache,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		super(editor);

		this._register(this.suggestionInlineCompletionSource.onDidChange(() => {
			if (!this.editor.hasModel()) {
				// onDidChange might be called when calling setModel on the editor, before we are disposed.
				return;
			}

			this.updateCacheSoon.schedule();

			const suggestWidgetState = this.suggestionInlineCompletionSource.state;
			if (!suggestWidgetState) {
				this.minReservedLineCount = 0;
			}

			const newGhostText = this.ghostText;
			if (newGhostText) {
				this.minReservedLineCount = Math.max(this.minReservedLineCount, sum(newGhostText.parts.map(p => p.lines.length - 1)));
			}

			if (this.minReservedLineCount >= 1) {
				this.suggestionInlineCompletionSource.forceRenderingAbove();
			} else {
				this.suggestionInlineCompletionSource.stopForceRenderingAbove();
			}
			this.onDidChangeEmitter.fire();
		}));

		this._register(this.cache.onDidChange(() => {
			this.onDidChangeEmitter.fire();
		}));

		this._register(this.editor.onDidChangeCursorPosition((e) => {
			this.minReservedLineCount = 0;
			this.updateCacheSoon.schedule();
			this.onDidChangeEmitter.fire();
		}));

		this._register(toDisposable(() => this.suggestionInlineCompletionSource.stopForceRenderingAbove()));
	}

	private isSuggestionPreviewEnabled(): boolean {
		const suggestOptions = this.editor.getOption(EditorOption.suggest);
		return suggestOptions.preview;
	}

	private async updateCache() {
		const state = this.suggestionInlineCompletionSource.state;
		if (!state || !state.selectedItem) {
			return;
		}

		const info: SelectedSuggestionInfo = {
			text: state.selectedItem.normalizedInlineCompletion.insertText,
			range: state.selectedItem.normalizedInlineCompletion.range,
			isSnippetText: state.selectedItem.isSnippetText,
			completionKind: state.selectedItem.completionItemKind,
		};

		const position = this.editor.getPosition();

		if (
			state.selectedItem.isSnippetText ||
			state.selectedItem.completionItemKind === CompletionItemKind.Snippet ||
			state.selectedItem.completionItemKind === CompletionItemKind.File ||
			state.selectedItem.completionItemKind === CompletionItemKind.Folder
		) {
			// Don't ask providers for these types of suggestions.
			this.cache.clear();
			return;
		}

		const promise = createCancelablePromise(async token => {
			let result: TrackedInlineCompletions;
			try {
				result = await provideInlineCompletions(this.languageFeaturesService.inlineCompletionsProvider, position,
					this.editor.getModel(),
					{ triggerKind: InlineCompletionTriggerKind.Automatic, selectedSuggestionInfo: info },
					token
				);
			} catch (e) {
				onUnexpectedError(e);
				return;
			}
			if (token.isCancellationRequested) {
				result.dispose();
				return;
			}
			this.cache.setValue(
				this.editor,
				result,
				InlineCompletionTriggerKind.Automatic
			);
			this.onDidChangeEmitter.fire();
		});
		const operation = new UpdateOperation(promise, InlineCompletionTriggerKind.Automatic);
		this.updateOperation.value = operation;
		await promise;
		if (this.updateOperation.value === operation) {
			this.updateOperation.clear();
		}
	}

	public override get ghostText(): GhostText | undefined {
		const isSuggestionPreviewEnabled = this.isSuggestionPreviewEnabled();
		const model = this.editor.getModel();
		const augmentedCompletion = minimizeInlineCompletion(model, this.cache.value?.completions[0]?.toLiveInlineCompletion());

		const suggestWidgetState = this.suggestionInlineCompletionSource.state;
		const suggestInlineCompletion = minimizeInlineCompletion(model, suggestWidgetState?.selectedItem?.normalizedInlineCompletion);

		const isAugmentedCompletionValid = augmentedCompletion
			&& suggestInlineCompletion
			&& augmentedCompletion.insertText.startsWith(suggestInlineCompletion.insertText)
			&& augmentedCompletion.range.equalsRange(suggestInlineCompletion.range);

		if (!isSuggestionPreviewEnabled && !isAugmentedCompletionValid) {
			return undefined;
		}

		// If the augmented completion is not valid and there is no suggest inline completion, we still show the augmented completion.
		const finalCompletion = isAugmentedCompletionValid ? augmentedCompletion : (suggestInlineCompletion || augmentedCompletion);

		const inlineCompletionPreviewLength = isAugmentedCompletionValid ? finalCompletion!.insertText.length - suggestInlineCompletion.insertText.length : 0;
		const newGhostText = this.toGhostText(finalCompletion, inlineCompletionPreviewLength);

		return newGhostText;
	}

	private toGhostText(completion: NormalizedInlineCompletion | undefined, inlineCompletionPreviewLength: number): GhostText | undefined {
		const mode = this.editor.getOptions().get(EditorOption.suggest).previewMode;
		return completion
			? (
				inlineCompletionToGhostText(completion, this.editor.getModel(), mode, this.editor.getPosition(), inlineCompletionPreviewLength) ||
				// Show an invisible ghost text to reserve space
				new GhostText(completion.range.endLineNumber, [], this.minReservedLineCount)
			)
			: undefined;
	}
}

function sum(arr: number[]): number {
	return arr.reduce((a, b) => a + b, 0);
}
