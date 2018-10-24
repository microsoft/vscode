/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { alert } from 'vs/base/browser/ui/aria/aria';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution, ScrollType, Handler } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CompletionItemProvider, CompletionItemInsertTextRule } from 'vs/editor/common/modes';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { SnippetParser } from 'vs/editor/contrib/snippet/snippetParser';
import { SuggestMemories } from 'vs/editor/contrib/suggest/suggestMemory';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ICompletionItem } from './completionModel';
import { Context as SuggestContext, ISuggestionItem } from './suggest';
import { SuggestAlternatives } from './suggestAlternatives';
import { State, SuggestModel } from './suggestModel';
import { ISelectedSuggestion, SuggestWidget } from './suggestWidget';
import { WordContextKey } from 'vs/editor/contrib/suggest/wordContextKey';
import { once, anyEvent } from 'vs/base/common/event';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { IdleValue } from 'vs/base/common/async';

class AcceptOnCharacterOracle {

	private _disposables: IDisposable[] = [];

	private _activeAcceptCharacters = new Set<string>();
	private _activeItem: ISelectedSuggestion;

	constructor(editor: ICodeEditor, widget: SuggestWidget, accept: (selected: ISelectedSuggestion) => any) {

		this._disposables.push(widget.onDidShow(() => this._onItem(widget.getFocusedItem())));
		this._disposables.push(widget.onDidFocus(this._onItem, this));
		this._disposables.push(widget.onDidHide(this.reset, this));

		this._disposables.push(editor.onWillType(text => {
			if (this._activeItem) {
				const ch = text[text.length - 1];
				if (this._activeAcceptCharacters.has(ch) && editor.getConfiguration().contribInfo.acceptSuggestionOnCommitCharacter) {
					accept(this._activeItem);
				}
			}
		}));
	}

	private _onItem(selected: ISelectedSuggestion): void {
		if (!selected || isFalsyOrEmpty(selected.item.suggestion.commitCharacters)) {
			this.reset();
			return;
		}
		this._activeItem = selected;
		this._activeAcceptCharacters.clear();
		for (const ch of selected.item.suggestion.commitCharacters) {
			if (ch.length > 0) {
				this._activeAcceptCharacters.add(ch[0]);
			}
		}
	}

	reset(): void {
		this._activeItem = undefined;
	}

	dispose() {
		dispose(this._disposables);
	}
}

export class SuggestController implements IEditorContribution {

	private static readonly ID: string = 'editor.contrib.suggestController';

	public static get(editor: ICodeEditor): SuggestController {
		return editor.getContribution<SuggestController>(SuggestController.ID);
	}

	private _model: SuggestModel;
	private _widget: SuggestWidget;
	private readonly _memory: IdleValue<SuggestMemories>;
	private readonly _alternatives: IdleValue<SuggestAlternatives>;
	private _toDispose: IDisposable[] = [];

	private readonly _sticky = false; // for development purposes only

	constructor(
		private _editor: ICodeEditor,
		@IEditorWorkerService editorWorker: IEditorWorkerService,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		this._model = new SuggestModel(this._editor, editorWorker);
		this._memory = new IdleValue(() => {
			let res = _instantiationService.createInstance(SuggestMemories, this._editor);
			this._toDispose.push(res);
			return res;
		});

		this._alternatives = new IdleValue(() => {
			let res = new SuggestAlternatives(this._editor, this._contextKeyService);
			this._toDispose.push(res);
			return res;
		});

		this._toDispose.push(_instantiationService.createInstance(WordContextKey, _editor));

		this._toDispose.push(this._model.onDidTrigger(e => {
			if (!this._widget) {
				this._createSuggestWidget();
			}
			this._widget.showTriggered(e.auto, e.shy ? 250 : 50);
		}));
		this._toDispose.push(this._model.onDidSuggest(e => {
			if (!e.shy) {
				let index = this._memory.getValue().select(this._editor.getModel(), this._editor.getPosition(), e.completionModel.items);
				this._widget.showSuggestions(e.completionModel, index, e.isFrozen, e.auto);
			}
		}));
		this._toDispose.push(this._model.onDidCancel(e => {
			if (this._widget && !e.retrigger) {
				this._widget.hideWidget();
			}
		}));
		this._toDispose.push(this._editor.onDidBlurEditorText(() => {
			if (!this._sticky) {
				this._model.cancel();
			}
		}));

		// Manage the acceptSuggestionsOnEnter context key
		let acceptSuggestionsOnEnter = SuggestContext.AcceptSuggestionsOnEnter.bindTo(_contextKeyService);
		let updateFromConfig = () => {
			const { acceptSuggestionOnEnter } = this._editor.getConfiguration().contribInfo;
			acceptSuggestionsOnEnter.set(acceptSuggestionOnEnter === 'on' || acceptSuggestionOnEnter === 'smart');
		};
		this._toDispose.push(this._editor.onDidChangeConfiguration((e) => updateFromConfig()));
		updateFromConfig();
	}

	private _createSuggestWidget(): void {

		this._widget = this._instantiationService.createInstance(SuggestWidget, this._editor);
		this._toDispose.push(this._widget.onDidSelect(item => this._onDidSelectItem(item, false, true), this));

		// Wire up logic to accept a suggestion on certain characters
		const autoAcceptOracle = new AcceptOnCharacterOracle(this._editor, this._widget, item => this._onDidSelectItem(item, false, true));
		this._toDispose.push(
			autoAcceptOracle,
			this._model.onDidSuggest(e => {
				if (e.completionModel.items.length === 0) {
					autoAcceptOracle.reset();
				}
			})
		);

		let makesTextEdit = SuggestContext.MakesTextEdit.bindTo(this._contextKeyService);
		this._toDispose.push(this._widget.onDidFocus(({ item }) => {

			const position = this._editor.getPosition();
			const startColumn = item.suggestion.range.startColumn;
			const endColumn = position.column;
			let value = true;
			if (
				this._editor.getConfiguration().contribInfo.acceptSuggestionOnEnter === 'smart'
				&& this._model.state === State.Auto
				&& !item.suggestion.command
				&& !item.suggestion.additionalTextEdits
				&& !(item.suggestion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet)
				&& endColumn - startColumn === item.suggestion.insertText.length
			) {
				const oldText = this._editor.getModel().getValueInRange({
					startLineNumber: position.lineNumber,
					startColumn,
					endLineNumber: position.lineNumber,
					endColumn
				});
				value = oldText !== item.suggestion.insertText;
			}
			makesTextEdit.set(value);
		}));
		this._toDispose.push({
			dispose() { makesTextEdit.reset(); }
		});
	}

	getId(): string {
		return SuggestController.ID;
	}

	dispose(): void {
		this._toDispose = dispose(this._toDispose);
		if (this._widget) {
			this._widget.dispose();
			this._widget = null;
		}
		if (this._model) {
			this._model.dispose();
			this._model = null;
		}
	}

	protected _onDidSelectItem(event: ISelectedSuggestion, keepAlternativeSuggestions: boolean, undoStops: boolean): void {
		if (!event || !event.item) {
			this._alternatives.getValue().reset();
			this._model.cancel();
			return;
		}

		const model = this._editor.getModel();
		const modelVersionNow = model.getAlternativeVersionId();
		const { suggestion, position } = event.item;
		const editorColumn = this._editor.getPosition().column;
		const columnDelta = editorColumn - position.column;

		// pushing undo stops *before* additional text edits and
		// *after* the main edit
		if (undoStops) {
			this._editor.pushUndoStop();
		}

		if (Array.isArray(suggestion.additionalTextEdits)) {
			this._editor.executeEdits('suggestController.additionalTextEdits', suggestion.additionalTextEdits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
		}

		// keep item in memory
		this._memory.getValue().memorize(model, this._editor.getPosition(), event.item);

		let { insertText } = suggestion;
		if (!(suggestion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet)) {
			insertText = SnippetParser.escape(insertText);
		}

		const overwriteBefore = position.column - suggestion.range.startColumn;
		const overwriteAfter = suggestion.range.endColumn - position.column;

		SnippetController2.get(this._editor).insert(
			insertText,
			overwriteBefore + columnDelta,
			overwriteAfter,
			false, false,
			!(suggestion.insertTextRules & CompletionItemInsertTextRule.KeepWhitespace)
		);

		if (undoStops) {
			this._editor.pushUndoStop();
		}

		if (!suggestion.command) {
			// done
			this._model.cancel();

		} else if (suggestion.command.id === TriggerSuggestAction.id) {
			// retigger
			this._model.trigger({ auto: true }, true);

		} else {
			// exec command, done
			this._commandService.executeCommand(suggestion.command.id, ...suggestion.command.arguments).then(undefined, onUnexpectedError);
			this._model.cancel();
		}

		if (keepAlternativeSuggestions) {
			this._alternatives.getValue().set(event, next => {
				// this is not so pretty. when inserting the 'next'
				// suggestion we undo until we are at the state at
				// which we were before inserting the previous suggestion...
				while (model.canUndo()) {
					if (modelVersionNow !== model.getAlternativeVersionId()) {
						model.undo();
					}
					this._onDidSelectItem(next, false, false);
					break;
				}
			});
		}

		this._alertCompletionItem(event.item);
	}

	private _alertCompletionItem({ suggestion }: ICompletionItem): void {
		let msg = nls.localize('arai.alert.snippet', "Accepting '{0}' did insert the following text: {1}", suggestion.label, suggestion.insertText);
		alert(msg);
	}

	triggerSuggest(onlyFrom?: CompletionItemProvider[]): void {
		this._model.trigger({ auto: false }, false, onlyFrom);
		this._editor.revealLine(this._editor.getPosition().lineNumber, ScrollType.Smooth);
		this._editor.focus();
	}

	triggerSuggestAndAcceptBest(defaultTypeText: string): void {

		const positionNow = this._editor.getPosition();

		const fallback = () => {
			if (positionNow.equals(this._editor.getPosition())) {
				this._editor.trigger('suggest', Handler.Type, { text: defaultTypeText });
			}
		};

		const makesTextEdit = (item: ISuggestionItem): boolean => {
			if (item.suggestion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet || item.suggestion.additionalTextEdits) {
				// snippet, other editor -> makes edit
				return true;
			}
			const position = this._editor.getPosition();
			const startColumn = item.suggestion.range.startColumn;
			const endColumn = position.column;
			if (endColumn - startColumn !== item.suggestion.insertText.length) {
				// unequal lengths -> makes edit
				return true;
			}
			const textNow = this._editor.getModel().getValueInRange({
				startLineNumber: position.lineNumber,
				startColumn,
				endLineNumber: position.lineNumber,
				endColumn
			});
			// unequal text -> makes edit
			return textNow !== item.suggestion.insertText;
		};

		once(this._model.onDidTrigger)(_ => {
			// wait for trigger because only then the cancel-event is trustworthy
			let listener: IDisposable[] = [];

			anyEvent<any>(this._model.onDidTrigger, this._model.onDidCancel)(() => {
				// retrigger or cancel -> try to type default text
				dispose(listener);
				fallback();
			}, undefined, listener);

			this._model.onDidSuggest(({ completionModel }) => {
				dispose(listener);
				if (completionModel.items.length === 0) {
					fallback();
					return;
				}
				const index = this._memory.getValue().select(this._editor.getModel(), this._editor.getPosition(), completionModel.items);
				const item = completionModel.items[index];
				if (!makesTextEdit(item)) {
					fallback();
					return;
				}
				this._editor.pushUndoStop();
				this._onDidSelectItem({ index, item, model: completionModel }, true, false);

			}, undefined, listener);
		});

		this._model.trigger({ auto: false, shy: true });
		this._editor.revealLine(positionNow.lineNumber, ScrollType.Smooth);
		this._editor.focus();
	}

	acceptSelectedSuggestion(keepAlternativeSuggestions?: boolean): void {
		if (this._widget) {
			const item = this._widget.getFocusedItem();
			this._onDidSelectItem(item, keepAlternativeSuggestions, true);
		}
	}

	acceptNextSuggestion() {
		this._alternatives.getValue().next();
	}

	acceptPrevSuggestion() {
		this._alternatives.getValue().prev();
	}

	cancelSuggestWidget(): void {
		if (this._widget) {
			this._model.cancel();
			this._widget.hideWidget();
		}
	}

	selectNextSuggestion(): void {
		if (this._widget) {
			this._widget.selectNext();
		}
	}

	selectNextPageSuggestion(): void {
		if (this._widget) {
			this._widget.selectNextPage();
		}
	}

	selectLastSuggestion(): void {
		if (this._widget) {
			this._widget.selectLast();
		}
	}

	selectPrevSuggestion(): void {
		if (this._widget) {
			this._widget.selectPrevious();
		}
	}

	selectPrevPageSuggestion(): void {
		if (this._widget) {
			this._widget.selectPreviousPage();
		}
	}

	selectFirstSuggestion(): void {
		if (this._widget) {
			this._widget.selectFirst();
		}
	}

	toggleSuggestionDetails(): void {
		if (this._widget) {
			this._widget.toggleDetails();
		}
	}

	toggleSuggestionFocus(): void {
		if (this._widget) {
			this._widget.toggleDetailsFocus();
		}
	}
}

export class TriggerSuggestAction extends EditorAction {

	static readonly id = 'editor.action.triggerSuggest';

	constructor() {
		super({
			id: TriggerSuggestAction.id,
			label: nls.localize('suggest.trigger.label', "Trigger Suggest"),
			alias: 'Trigger Suggest',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCompletionItemProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.textInputFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Space,
				mac: { primary: KeyMod.WinCtrl | KeyCode.Space },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const controller = SuggestController.get(editor);

		if (!controller) {
			return;
		}

		controller.triggerSuggest();
	}
}

registerEditorContribution(SuggestController);
registerEditorAction(TriggerSuggestAction);

const weight = KeybindingWeight.EditorContrib + 90;

const SuggestCommand = EditorCommand.bindToContribution<SuggestController>(SuggestController.get);


registerEditorCommand(new SuggestCommand({
	id: 'acceptSelectedSuggestion',
	precondition: SuggestContext.Visible,
	handler: x => x.acceptSelectedSuggestion(true),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.Tab
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'acceptSelectedSuggestionOnEnter',
	precondition: SuggestContext.Visible,
	handler: x => x.acceptSelectedSuggestion(false),
	kbOpts: {
		weight: weight,
		kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, SuggestContext.AcceptSuggestionsOnEnter, SuggestContext.MakesTextEdit),
		primary: KeyCode.Enter
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'hideSuggestWidget',
	precondition: SuggestContext.Visible,
	handler: x => x.cancelSuggestWidget(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectNextSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectNextSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.DownArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
		mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KEY_N] }
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectNextPageSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectNextPageSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.PageDown,
		secondary: [KeyMod.CtrlCmd | KeyCode.PageDown]
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectLastSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectLastSuggestion()
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectPrevSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectPrevSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.UpArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
		mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KEY_P] }
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectPrevPageSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectPrevPageSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.PageUp,
		secondary: [KeyMod.CtrlCmd | KeyCode.PageUp]
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'selectFirstSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectFirstSuggestion()
}));

registerEditorCommand(new SuggestCommand({
	id: 'toggleSuggestionDetails',
	precondition: SuggestContext.Visible,
	handler: x => x.toggleSuggestionDetails(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyMod.CtrlCmd | KeyCode.Space,
		mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'toggleSuggestionFocus',
	precondition: SuggestContext.Visible,
	handler: x => x.toggleSuggestionFocus(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Space,
		mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Space }
	}
}));

//#region tab completions

registerEditorCommand(new SuggestCommand({
	id: 'insertBestCompletion',
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.equals('config.editor.tabCompletion', 'on'),
		WordContextKey.AtEnd,
		SuggestContext.Visible.toNegated(),
		SuggestAlternatives.OtherSuggestions.toNegated(),
		SnippetController2.InSnippetMode.toNegated()
	),
	handler: x => x.triggerSuggestAndAcceptBest('\t'),//todo@joh fallback/default configurable?
	kbOpts: {
		weight,
		primary: KeyCode.Tab
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'insertNextSuggestion',
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.equals('config.editor.tabCompletion', 'on'),
		SuggestAlternatives.OtherSuggestions,
		SuggestContext.Visible.toNegated(),
		SnippetController2.InSnippetMode.toNegated()
	),
	handler: x => x.acceptNextSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.Tab
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'insertPrevSuggestion',
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.equals('config.editor.tabCompletion', 'on'),
		SuggestAlternatives.OtherSuggestions,
		SuggestContext.Visible.toNegated(),
		SnippetController2.InSnippetMode.toNegated()
	),
	handler: x => x.acceptPrevSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyMod.Shift | KeyCode.Tab
	}
}));
