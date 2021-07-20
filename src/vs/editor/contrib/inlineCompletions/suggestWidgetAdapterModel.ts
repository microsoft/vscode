/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CompletionItemInsertTextRule } from 'vs/editor/common/modes';
import { BaseGhostTextWidgetModel, GhostText } from 'vs/editor/contrib/inlineCompletions/ghostText';
import { inlineCompletionToGhostText, NormalizedInlineCompletion } from 'vs/editor/contrib/inlineCompletions/inlineCompletionsModel';
import { SnippetParser } from 'vs/editor/contrib/snippet/snippetParser';
import { SnippetSession } from 'vs/editor/contrib/snippet/snippetSession';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { ISelectedSuggestion } from 'vs/editor/contrib/suggest/suggestWidget';

export class SuggestWidgetAdapterModel extends BaseGhostTextWidgetModel {
	private isSuggestWidgetVisible: boolean = false;
	private currentGhostText: GhostText | undefined = undefined;
	private _isActive: boolean = false;
	private isShiftKeyPressed = false;
	private currentCompletion: NormalizedInlineCompletion | undefined;

	public override minReservedLineCount: number = 0;

	public get isActive() { return this._isActive; }

	// This delay fixes an suggest widget issue when typing "." immediately restarts the suggestion session.
	private setInactiveDelayed = this._register(new RunOnceScheduler(() => {
		if (!this.isSuggestWidgetVisible) {
			if (this.isActive) {
				this._isActive = false;
				this.onDidChangeEmitter.fire();
			}
		}
	}, 100));

	constructor(
		editor: IActiveCodeEditor
	) {
		super(editor);

		const suggestController = SuggestController.get(this.editor);
		if (suggestController) {
			let isBoundToSuggestWidget = false;
			const bindToSuggestWidget = () => {
				if (isBoundToSuggestWidget) {
					return;
				}
				isBoundToSuggestWidget = true;

				this._register(suggestController.widget.value.onDidShow(() => {
					this.isSuggestWidgetVisible = true;
					this._isActive = true;
					this.updateFromSuggestion();
				}));
				this._register(suggestController.widget.value.onDidHide(() => {
					this.isSuggestWidgetVisible = false;
					this.setInactiveDelayed.schedule();
					this.minReservedLineCount = 0;
					this.updateFromSuggestion();
				}));
				this._register(suggestController.widget.value.onDidFocus(() => {
					this.isSuggestWidgetVisible = true;
					this._isActive = true;
					this.updateFromSuggestion();
				}));
			};

			this._register(Event.once(suggestController.model.onDidTrigger)(e => {
				bindToSuggestWidget();
			}));
		}
		this.updateFromSuggestion();

		this._register(this.editor.onDidChangeCursorPosition((e) => {
			if (this.isSuggestionPreviewEnabled()) {
				this.update();
			}
		}));

		this._register(toDisposable(() => {
			const suggestController = SuggestController.get(this.editor);
			if (suggestController) {
				suggestController.stopForceRenderingAbove();
			}
		}));

		// See the command acceptAlternativeSelectedSuggestion that is bound to shift+tab
		this._register(editor.onKeyDown(e => {
			if (e.shiftKey && !this.isShiftKeyPressed) {
				this.isShiftKeyPressed = true;
				this.updateFromSuggestion();
			}
		}));
		this._register(editor.onKeyUp(e => {
			if (e.shiftKey && this.isShiftKeyPressed) {
				this.isShiftKeyPressed = false;
				this.updateFromSuggestion();
			}
		}));
	}

	public override setExpanded(expanded: boolean): void {
		super.setExpanded(expanded);
		this.updateFromSuggestion();
	}

	private isSuggestionPreviewEnabled(): boolean {
		const suggestOptions = this.editor.getOption(EditorOption.suggest);
		return suggestOptions.preview;
	}

	private updateFromSuggestion(): void {
		const suggestController = SuggestController.get(this.editor);
		if (!suggestController) {
			this.setCurrentInlineCompletion(undefined);
			return;
		}
		if (!this.isSuggestWidgetVisible) {
			this.setCurrentInlineCompletion(undefined);
			return;
		}
		const focusedItem = suggestController.widget.value.getFocusedItem();
		if (!focusedItem) {
			this.setCurrentInlineCompletion(undefined);
			return;
		}

		// TODO: item.isResolved
		this.setCurrentInlineCompletion(
			getInlineCompletion(
				suggestController,
				this.editor.getPosition(),
				focusedItem,
				this.isShiftKeyPressed
			)
		);
	}

	private setCurrentInlineCompletion(completion: NormalizedInlineCompletion | undefined): void {
		this.currentCompletion = completion;
		this.update();
	}

	private update(): void {
		const completion = this.currentCompletion;
		const mode = this.editor.getOptions().get(EditorOption.suggest).previewMode;

		this.setGhostText(
			completion
				? (
					inlineCompletionToGhostText(completion, this.editor.getModel(), mode, this.editor.getPosition()) ||
					// Show an invisible ghost text to reserve space
					new GhostText(completion.range.endLineNumber, [], this.minReservedLineCount)
				)
				: undefined
		);
	}

	private setGhostText(newGhostText: GhostText | undefined): void {
		if (GhostText.equals(this.currentGhostText, newGhostText)) {
			return;
		}

		this.currentGhostText = newGhostText;

		if (this.currentGhostText && this.expanded) {
			this.minReservedLineCount = Math.max(this.minReservedLineCount, ...this.currentGhostText.parts.map(p => p.lines.length - 1));
		}

		const suggestController = SuggestController.get(this.editor);
		if (suggestController) {
			if (this.minReservedLineCount >= 1 && this.isSuggestionPreviewEnabled()) {
				suggestController.forceRenderingAbove();
			} else {
				suggestController.stopForceRenderingAbove();
			}
		}

		this.onDidChangeEmitter.fire();
	}

	public override get ghostText(): GhostText | undefined {
		return this.isSuggestionPreviewEnabled()
			? this.currentGhostText
			: undefined;
	}
}

function getInlineCompletion(suggestController: SuggestController, position: Position, suggestion: ISelectedSuggestion, toggleMode: boolean): NormalizedInlineCompletion {
	const item = suggestion.item;

	if (Array.isArray(item.completion.additionalTextEdits)) {
		// cannot represent additional text edits
		return {
			text: '',
			range: Range.fromPositions(position, position),
		};
	}

	let { insertText } = item.completion;
	if (item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet) {
		const snippet = new SnippetParser().parse(insertText);
		const model = suggestController.editor.getModel()!;
		SnippetSession.adjustWhitespace(
			model, position, snippet,
			true,
			true
		);
		insertText = snippet.toString();
	}

	const info = suggestController.getOverwriteInfo(item, toggleMode);
	return {
		text: insertText,
		range: Range.fromPositions(
			position.delta(0, -info.overwriteBefore),
			position.delta(0, Math.max(info.overwriteAfter, 0))
		),
	};
}
