/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { onUnexpectedError } from 'vs/base/common/errors';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { registerEditorAction, registerEditorContribution, ServicesAccessor, EditorAction, EditorCommand, registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { ISuggestSupport } from 'vs/editor/common/modes';
import { SnippetParser } from 'vs/editor/contrib/snippet/snippetParser';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { Context as SuggestContext } from './suggest';
import { SuggestModel, State } from './suggestModel';
import { ICompletionItem } from './completionModel';
import { SuggestWidget, ISelectedSuggestion } from './suggestWidget';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { SuggestMemories } from 'vs/editor/contrib/suggest/suggestMemory';

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
	private _memory: SuggestMemories;
	private _toDispose: IDisposable[] = [];

	constructor(
		private _editor: ICodeEditor,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		this._model = new SuggestModel(this._editor);
		this._memory = _instantiationService.createInstance(SuggestMemories, this._editor.getConfiguration().contribInfo.suggestSelection);

		this._toDispose.push(this._model.onDidTrigger(e => {
			if (!this._widget) {
				this._createSuggestWidget();
			}
			this._widget.showTriggered(e.auto);
		}));
		this._toDispose.push(this._model.onDidSuggest(e => {
			let index = this._memory.select(this._editor.getModel(), this._editor.getPosition(), e.completionModel.items);
			this._widget.showSuggestions(e.completionModel, index, e.isFrozen, e.auto);
		}));
		this._toDispose.push(this._model.onDidCancel(e => {
			if (this._widget && !e.retrigger) {
				this._widget.hideWidget();
			}
		}));

		// Manage the acceptSuggestionsOnEnter context key
		let acceptSuggestionsOnEnter = SuggestContext.AcceptSuggestionsOnEnter.bindTo(_contextKeyService);
		let updateFromConfig = () => {
			const { acceptSuggestionOnEnter, suggestSelection } = this._editor.getConfiguration().contribInfo;
			acceptSuggestionsOnEnter.set(acceptSuggestionOnEnter === 'on' || acceptSuggestionOnEnter === 'smart');
			this._memory.setMode(suggestSelection);
		};
		this._toDispose.push(this._editor.onDidChangeConfiguration((e) => updateFromConfig()));
		updateFromConfig();
	}

	private _createSuggestWidget(): void {

		this._widget = this._instantiationService.createInstance(SuggestWidget, this._editor);
		this._toDispose.push(this._widget.onDidSelect(this._onDidSelectItem, this));

		// Wire up logic to accept a suggestion on certain characters
		const autoAcceptOracle = new AcceptOnCharacterOracle(this._editor, this._widget, item => this._onDidSelectItem(item));
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
			const startColumn = item.position.column - item.suggestion.overwriteBefore;
			const endColumn = position.column;
			let value = true;
			if (
				this._editor.getConfiguration().contribInfo.acceptSuggestionOnEnter === 'smart'
				&& this._model.state === State.Auto
				&& !item.suggestion.command
				&& !item.suggestion.additionalTextEdits
				&& item.suggestion.snippetType !== 'textmate'
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

	protected _onDidSelectItem(event: ISelectedSuggestion): void {
		if (!event || !event.item) {
			this._model.cancel();
			return;
		}

		const { suggestion, position } = event.item;
		const editorColumn = this._editor.getPosition().column;
		const columnDelta = editorColumn - position.column;

		if (Array.isArray(suggestion.additionalTextEdits)) {
			this._editor.pushUndoStop();
			this._editor.executeEdits('suggestController.additionalTextEdits', suggestion.additionalTextEdits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
			this._editor.pushUndoStop();
		}

		// keep item in memory
		this._memory.memorize(this._editor.getModel(), this._editor.getPosition(), event.item);

		let { insertText } = suggestion;
		if (suggestion.snippetType !== 'textmate') {
			insertText = SnippetParser.escape(insertText);
		}

		SnippetController2.get(this._editor).insert(
			insertText,
			suggestion.overwriteBefore + columnDelta,
			suggestion.overwriteAfter
		);

		if (!suggestion.command) {
			// done
			this._model.cancel();

		} else if (suggestion.command.id === TriggerSuggestAction.id) {
			// retigger
			this._model.trigger({ auto: true }, true);

		} else {
			// exec command, done
			this._commandService.executeCommand(suggestion.command.id, ...suggestion.command.arguments).done(undefined, onUnexpectedError);
			this._model.cancel();
		}

		this._alertCompletionItem(event.item);
	}

	private _alertCompletionItem({ suggestion }: ICompletionItem): void {
		let msg = nls.localize('arai.alert.snippet', "Accepting '{0}' did insert the following text: {1}", suggestion.label, suggestion.insertText);
		alert(msg);
	}

	triggerSuggest(onlyFrom?: ISuggestSupport[]): void {
		this._model.trigger({ auto: false }, false, onlyFrom);
		this._editor.revealLine(this._editor.getPosition().lineNumber, ScrollType.Smooth);
		this._editor.focus();
	}

	acceptSelectedSuggestion(): void {
		if (this._widget) {
			const item = this._widget.getFocusedItem();
			this._onDidSelectItem(item);
		}
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
				mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
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

const weight = KeybindingsRegistry.WEIGHT.editorContrib(90);

const SuggestCommand = EditorCommand.bindToContribution<SuggestController>(SuggestController.get);


registerEditorCommand(new SuggestCommand({
	id: 'acceptSelectedSuggestion',
	precondition: SuggestContext.Visible,
	handler: x => x.acceptSelectedSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.Tab
	}
}));

registerEditorCommand(new SuggestCommand({
	id: 'acceptSelectedSuggestionOnEnter',
	precondition: SuggestContext.Visible,
	handler: x => x.acceptSelectedSuggestion(),
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
	handler: c => c.selectLastSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.End
	}
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
	handler: c => c.selectFirstSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.textInputFocus,
		primary: KeyCode.Home
	}
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
