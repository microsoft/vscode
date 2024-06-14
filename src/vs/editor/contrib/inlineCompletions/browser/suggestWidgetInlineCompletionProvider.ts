/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareBy, numberComparator } from 'vs/base/common/arrays';
import { findFirstMax } from 'vs/base/common/arraysFind';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { SingleTextEdit } from 'vs/editor/common/core/textEdit';
import { CompletionItemInsertTextRule, CompletionItemKind, SelectedSuggestionInfo } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { singleTextEditAugments, singleTextRemoveCommonPrefix } from 'vs/editor/contrib/inlineCompletions/browser/singleTextEdit';
import { SnippetParser } from 'vs/editor/contrib/snippet/browser/snippetParser';
import { SnippetSession } from 'vs/editor/contrib/snippet/browser/snippetSession';
import { CompletionItem } from 'vs/editor/contrib/suggest/browser/suggest';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';

export class SuggestWidgetAdaptor extends Disposable {
	private isSuggestWidgetVisible: boolean = false;
	private isShiftKeyPressed = false;
	private _isActive = false;
	private _currentSuggestItemInfo: SuggestItemInfo | undefined = undefined;
	public get selectedItem(): SuggestItemInfo | undefined {
		return this._currentSuggestItemInfo;
	}
	private _onDidSelectedItemChange = this._register(new Emitter<void>());
	public readonly onDidSelectedItemChange: Event<void> = this._onDidSelectedItemChange.event;

	constructor(
		private readonly editor: ICodeEditor,
		private readonly suggestControllerPreselector: () => SingleTextEdit | undefined,
		private readonly onWillAccept: (item: SuggestItemInfo) => void,
	) {
		super();

		// See the command acceptAlternativeSelectedSuggestion that is bound to shift+tab
		this._register(editor.onKeyDown(e => {
			if (e.shiftKey && !this.isShiftKeyPressed) {
				this.isShiftKeyPressed = true;
				this.update(this._isActive);
			}
		}));
		this._register(editor.onKeyUp(e => {
			if (e.shiftKey && this.isShiftKeyPressed) {
				this.isShiftKeyPressed = false;
				this.update(this._isActive);
			}
		}));

		const suggestController = SuggestController.get(this.editor);
		if (suggestController) {
			this._register(suggestController.registerSelector({
				priority: 100,
				select: (model, pos, suggestItems) => {
					const textModel = this.editor.getModel();
					if (!textModel) {
						// Should not happen
						return -1;
					}

					const i = this.suggestControllerPreselector();
					const itemToPreselect = i ? singleTextRemoveCommonPrefix(i, textModel) : undefined;
					if (!itemToPreselect) {
						return -1;
					}
					const position = Position.lift(pos);

					const candidates = suggestItems
						.map((suggestItem, index) => {
							const suggestItemInfo = SuggestItemInfo.fromSuggestion(suggestController, textModel, position, suggestItem, this.isShiftKeyPressed);
							const suggestItemTextEdit = singleTextRemoveCommonPrefix(suggestItemInfo.toSingleTextEdit(), textModel);
							const valid = singleTextEditAugments(itemToPreselect, suggestItemTextEdit);
							return { index, valid, prefixLength: suggestItemTextEdit.text.length, suggestItem };
						})
						.filter(item => item && item.valid && item.prefixLength > 0);

					const result = findFirstMax(
						candidates,
						compareBy(s => s!.prefixLength, numberComparator)
					);
					return result ? result.index : - 1;
				}
			}));

			let isBoundToSuggestWidget = false;
			const bindToSuggestWidget = () => {
				if (isBoundToSuggestWidget) {
					return;
				}
				isBoundToSuggestWidget = true;

				this._register(suggestController.widget.value.onDidShow(() => {
					this.isSuggestWidgetVisible = true;
					this.update(true);
				}));
				this._register(suggestController.widget.value.onDidHide(() => {
					this.isSuggestWidgetVisible = false;
					this.update(false);
				}));
				this._register(suggestController.widget.value.onDidFocus(() => {
					this.isSuggestWidgetVisible = true;
					this.update(true);
				}));
			};

			this._register(Event.once(suggestController.model.onDidTrigger)(e => {
				bindToSuggestWidget();
			}));

			this._register(suggestController.onWillInsertSuggestItem(e => {
				const position = this.editor.getPosition();
				const model = this.editor.getModel();
				if (!position || !model) { return undefined; }

				const suggestItemInfo = SuggestItemInfo.fromSuggestion(
					suggestController,
					model,
					position,
					e.item,
					this.isShiftKeyPressed
				);

				this.onWillAccept(suggestItemInfo);
			}));
		}
		this.update(this._isActive);
	}

	private update(newActive: boolean): void {
		const newInlineCompletion = this.getSuggestItemInfo();

		if (this._isActive !== newActive || !suggestItemInfoEquals(this._currentSuggestItemInfo, newInlineCompletion)) {
			this._isActive = newActive;
			this._currentSuggestItemInfo = newInlineCompletion;

			this._onDidSelectedItemChange.fire();
		}
	}

	private getSuggestItemInfo(): SuggestItemInfo | undefined {
		const suggestController = SuggestController.get(this.editor);
		if (!suggestController || !this.isSuggestWidgetVisible) {
			return undefined;
		}

		const focusedItem = suggestController.widget.value.getFocusedItem();
		const position = this.editor.getPosition();
		const model = this.editor.getModel();

		if (!focusedItem || !position || !model) {
			return undefined;
		}

		return SuggestItemInfo.fromSuggestion(
			suggestController,
			model,
			position,
			focusedItem.item,
			this.isShiftKeyPressed
		);
	}

	public stopForceRenderingAbove(): void {
		const suggestController = SuggestController.get(this.editor);
		suggestController?.stopForceRenderingAbove();
	}

	public forceRenderingAbove(): void {
		const suggestController = SuggestController.get(this.editor);
		suggestController?.forceRenderingAbove();
	}
}

export class SuggestItemInfo {
	public static fromSuggestion(suggestController: SuggestController, model: ITextModel, position: Position, item: CompletionItem, toggleMode: boolean): SuggestItemInfo {
		let { insertText } = item.completion;
		let isSnippetText = false;
		if (item.completion.insertTextRules! & CompletionItemInsertTextRule.InsertAsSnippet) {
			const snippet = new SnippetParser().parse(insertText);

			if (snippet.children.length < 100) {
				// Adjust whitespace is expensive.
				SnippetSession.adjustWhitespace(model, position, true, snippet);
			}

			insertText = snippet.toString();
			isSnippetText = true;
		}

		const info = suggestController.getOverwriteInfo(item, toggleMode);

		return new SuggestItemInfo(
			Range.fromPositions(
				position.delta(0, -info.overwriteBefore),
				position.delta(0, Math.max(info.overwriteAfter, 0))
			),
			insertText,
			item.completion.kind,
			isSnippetText,
		);
	}

	private constructor(
		public readonly range: Range,
		public readonly insertText: string,
		public readonly completionItemKind: CompletionItemKind,
		public readonly isSnippetText: boolean,
	) { }

	public equals(other: SuggestItemInfo): boolean {
		return this.range.equalsRange(other.range)
			&& this.insertText === other.insertText
			&& this.completionItemKind === other.completionItemKind
			&& this.isSnippetText === other.isSnippetText;
	}

	public toSelectedSuggestionInfo(): SelectedSuggestionInfo {
		return new SelectedSuggestionInfo(this.range, this.insertText, this.completionItemKind, this.isSnippetText);
	}

	public toSingleTextEdit(): SingleTextEdit {
		return new SingleTextEdit(this.range, this.insertText);
	}
}

function suggestItemInfoEquals(a: SuggestItemInfo | undefined, b: SuggestItemInfo | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b) {
		return false;
	}
	return a.equals(b);
}
