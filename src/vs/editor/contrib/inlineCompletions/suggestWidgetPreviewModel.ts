/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createCancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { MutableDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { InlineCompletionTriggerKind, SelectedSuggestionInfo } from 'vs/editor/common/modes';
import { SharedInlineCompletionCache } from 'vs/editor/contrib/inlineCompletions/ghostTextModel';
import { BaseGhostTextWidgetModel, GhostText } from './ghostText';
import { minimizeInlineCompletion, provideInlineCompletions, UpdateOperation } from './inlineCompletionsModel';
import { inlineCompletionToGhostText, NormalizedInlineCompletion } from './inlineCompletionToGhostText';
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
	) {
		super(editor);

		this._register(this.suggestionInlineCompletionSource.onDidChange(() => {
			this.updateCacheSoon.schedule();

			const suggestWidgetState = this.suggestionInlineCompletionSource.state;
			if (!suggestWidgetState) {
				this.minReservedLineCount = 0;
			}

			const newGhostText = this.ghostText;
			if (newGhostText) {
				this.minReservedLineCount = Math.max(this.minReservedLineCount, sum(newGhostText.parts.map(p => p.lines.length - 1)));
			}

			if (this.minReservedLineCount >= 1 && this.isSuggestionPreviewEnabled()) {
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
			if (this.isSuggestionPreviewEnabled()) {
				this.minReservedLineCount = 0;
				this.updateCacheSoon.schedule();
				this.onDidChangeEmitter.fire();
			}
		}));

		this._register(toDisposable(() => this.suggestionInlineCompletionSource.stopForceRenderingAbove()));
	}

	private isSuggestionPreviewEnabled(): boolean {
		const suggestOptions = this.editor.getOption(EditorOption.suggest);
		return suggestOptions.preview;
	}

	private async updateCache() {
		const state = this.suggestionInlineCompletionSource.state;
		if (!state || !state.selectedItemAsInlineCompletion) {
			return;
		}

		const info: SelectedSuggestionInfo = {
			text: state.selectedItemAsInlineCompletion.text,
			range: state.selectedItemAsInlineCompletion.range,
		};

		const position = this.editor.getPosition();

		const promise = createCancelablePromise(async token => {
			let result;
			try {
				result = await provideInlineCompletions(position,
					this.editor.getModel(),
					{ triggerKind: InlineCompletionTriggerKind.Automatic, selectedSuggestionInfo: info },
					token
				);
			} catch (e) {
				onUnexpectedError(e);
				return;
			}
			if (token.isCancellationRequested) {
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
		if (!this.isSuggestionPreviewEnabled()) {
			return undefined;
		}

		const suggestWidgetState = this.suggestionInlineCompletionSource.state;

		const originalInlineCompletion = minimizeInlineCompletion(this.editor.getModel()!, suggestWidgetState?.selectedItemAsInlineCompletion);
		const augmentedCompletion = minimizeInlineCompletion(this.editor.getModel()!, this.cache.value?.completions[0]?.toLiveInlineCompletion());

		const finalCompletion =
			augmentedCompletion
				&& originalInlineCompletion
				&& augmentedCompletion.text.startsWith(originalInlineCompletion.text)
				&& augmentedCompletion.range.equalsRange(originalInlineCompletion.range)
				? augmentedCompletion : (originalInlineCompletion || augmentedCompletion);

		const inlineCompletionPreviewLength = originalInlineCompletion ? (finalCompletion?.text.length || 0) - (originalInlineCompletion.text.length) : 0;

		const toGhostText = (completion: NormalizedInlineCompletion | undefined): GhostText | undefined => {
			const mode = this.editor.getOptions().get(EditorOption.suggest).previewMode;
			return completion
				? (
					inlineCompletionToGhostText(completion, this.editor.getModel(), mode, this.editor.getPosition(), inlineCompletionPreviewLength) ||
					// Show an invisible ghost text to reserve space
					new GhostText(completion.range.endLineNumber, [], this.minReservedLineCount)
				)
				: undefined;
		};

		const newGhostText = toGhostText(finalCompletion);

		return newGhostText;
	}
}

function sum(arr: number[]): number {
	return arr.reduce((a, b) => a + b, 0);
}
