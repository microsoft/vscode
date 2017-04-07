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
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ICommonCodeEditor, IEditorContribution, EditorContextKeys, ModeContextKeys } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction, EditorCommand, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Range } from 'vs/editor/common/core/range';
import { CodeSnippet } from 'vs/editor/contrib/snippet/common/snippet';
import { SnippetController } from 'vs/editor/contrib/snippet/common/snippetController';
import { Context as SuggestContext } from './suggest';
import { SuggestModel } from './suggestModel';
import { ICompletionItem } from './completionModel';
import { SuggestWidget } from './suggestWidget';

class AcceptOnCharacterOracle {

	private _disposables: IDisposable[] = [];

	private _activeAcceptCharacters = new Set<string>();
	private _activeItem: ICompletionItem;

	constructor(editor: ICodeEditor, widget: SuggestWidget, accept: (item: ICompletionItem) => any) {

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

	private _onItem(item: ICompletionItem): void {
		if (!item || isFalsyOrEmpty(item.suggestion.commitCharacters)) {
			this.reset();
			return;
		}
		this._activeItem = item;
		this._activeAcceptCharacters.clear();
		for (const ch of item.suggestion.commitCharacters) {
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

@editorContribution
export class SuggestController implements IEditorContribution {
	private static ID: string = 'editor.contrib.suggestController';

	public static get(editor: ICommonCodeEditor): SuggestController {
		return editor.getContribution<SuggestController>(SuggestController.ID);
	}

	private model: SuggestModel;
	private widget: SuggestWidget;
	private toDispose: IDisposable[] = [];

	constructor(
		private editor: ICodeEditor,
		@ICommandService private commandService: ICommandService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.model = new SuggestModel(this.editor);
		this.toDispose.push(this.model.onDidTrigger(e => this.widget.showTriggered(e.auto)));
		this.toDispose.push(this.model.onDidSuggest(e => this.widget.showSuggestions(e.completionModel, e.isFrozen, e.auto)));
		this.toDispose.push(this.model.onDidCancel(e => !e.retrigger && this.widget.hideWidget()));

		// Manage the acceptSuggestionsOnEnter context key
		let acceptSuggestionsOnEnter = SuggestContext.AcceptSuggestionsOnEnter.bindTo(contextKeyService);
		let updateFromConfig = () => {
			acceptSuggestionsOnEnter.set(this.editor.getConfiguration().contribInfo.acceptSuggestionOnEnter);
		};
		this.toDispose.push(this.editor.onDidChangeConfiguration((e) => updateFromConfig()));
		updateFromConfig();

		this.widget = instantiationService.createInstance(SuggestWidget, this.editor);
		this.toDispose.push(this.widget.onDidSelect(this.onDidSelectItem, this));

		// Wire up logic to accept a suggestion on certain characters
		const autoAcceptOracle = new AcceptOnCharacterOracle(editor, this.widget, item => this.onDidSelectItem(item));
		this.toDispose.push(
			autoAcceptOracle,
			this.model.onDidSuggest(e => {
				if (e.completionModel.items.length === 0) {
					autoAcceptOracle.reset();
				}
			})
		);

		let makesTextEdit = SuggestContext.MakesTextEdit.bindTo(contextKeyService);
		this.toDispose.push(this.widget.onDidFocus(item => {

			const position = this.editor.getPosition();
			const startColumn = item.position.column - item.suggestion.overwriteBefore;
			const endColumn = position.column;
			let value = true;
			if (endColumn - startColumn === item.suggestion.insertText.length) {
				const oldText = this.editor.getModel().getValueInRange({
					startLineNumber: position.lineNumber,
					startColumn,
					endLineNumber: position.lineNumber,
					endColumn
				});
				value = oldText !== item.suggestion.insertText;
			}
			makesTextEdit.set(value);
		}));
		this.toDispose.push({
			dispose() { makesTextEdit.reset(); }
		});
	}

	getId(): string {
		return SuggestController.ID;
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
		if (this.widget) {
			this.widget.dispose();
			this.widget = null;
		}
		if (this.model) {
			this.model.dispose();
			this.model = null;
		}
	}

	private onDidSelectItem(item: ICompletionItem): void {
		if (item) {
			const { suggestion, position } = item;
			const columnDelta = this.editor.getPosition().column - position.column;

			if (Array.isArray(suggestion.additionalTextEdits)) {
				this.editor.pushUndoStop();
				this.editor.executeEdits('suggestController.additionalTextEdits', suggestion.additionalTextEdits.map(edit => EditOperation.replace(Range.lift(edit.range), edit.text)));
				this.editor.pushUndoStop();
			}

			if (suggestion.snippetType === 'textmate') {
				SnippetController.get(this.editor).insertSnippet(
					suggestion.insertText,
					suggestion.overwriteBefore + columnDelta,
					suggestion.overwriteAfter);
			} else {
				SnippetController.get(this.editor).run(
					CodeSnippet.fromInternal(suggestion.insertText),
					suggestion.overwriteBefore + columnDelta,
					suggestion.overwriteAfter
				);
			}

			if (suggestion.command) {
				this.commandService.executeCommand(suggestion.command.id, ...suggestion.command.arguments).done(undefined, onUnexpectedError);
			}

			this.telemetryService.publicLog('suggestSnippetInsert', { ...this.editor.getTelemetryData(), suggestionType: suggestion.type });
		}

		this.model.cancel();
	}

	triggerSuggest(): void {
		this.model.trigger(false, false);
		this.editor.revealLine(this.editor.getPosition().lineNumber);
		this.editor.focus();
	}

	acceptSelectedSuggestion(): void {
		if (this.widget) {
			const item = this.widget.getFocusedItem();
			this.onDidSelectItem(item);
		}
	}

	cancelSuggestWidget(): void {
		if (this.widget) {
			this.model.cancel();
			this.widget.hideDetailsOrHideWidget();
		}
	}

	selectNextSuggestion(): void {
		if (this.widget) {
			this.widget.selectNext();
		}
	}

	selectNextPageSuggestion(): void {
		if (this.widget) {
			this.widget.selectNextPage();
		}
	}

	selectPrevSuggestion(): void {
		if (this.widget) {
			this.widget.selectPrevious();
		}
	}

	selectPrevPageSuggestion(): void {
		if (this.widget) {
			this.widget.selectPreviousPage();
		}
	}

	toggleSuggestionDetails(): void {
		if (this.widget) {
			this.widget.toggleDetails();
		}
	}
}

@editorAction
export class TriggerSuggestAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.triggerSuggest',
			label: nls.localize('suggest.trigger.label', "Trigger Suggest"),
			alias: 'Trigger Suggest',
			precondition: ContextKeyExpr.and(EditorContextKeys.Writable, ModeContextKeys.hasCompletionItemProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.Space,
				mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const controller = SuggestController.get(editor);

		if (!controller) {
			return;
		}

		controller.triggerSuggest();
	}
}

const weight = CommonEditorRegistry.commandWeight(90);

const SuggestCommand = EditorCommand.bindToContribution<SuggestController>(SuggestController.get);


CommonEditorRegistry.registerEditorCommand(new SuggestCommand({
	id: 'acceptSelectedSuggestion',
	precondition: SuggestContext.Visible,
	handler: x => x.acceptSelectedSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Tab
	}
}));

CommonEditorRegistry.registerEditorCommand(new SuggestCommand({
	id: 'acceptSelectedSuggestionOnEnter',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MakesTextEdit),
	handler: x => x.acceptSelectedSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: ContextKeyExpr.and(EditorContextKeys.TextFocus, SuggestContext.AcceptSuggestionsOnEnter),
		primary: KeyCode.Enter
	}
}));

CommonEditorRegistry.registerEditorCommand(new SuggestCommand({
	id: 'hideSuggestWidget',
	precondition: SuggestContext.Visible,
	handler: x => x.cancelSuggestWidget(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));

CommonEditorRegistry.registerEditorCommand(new SuggestCommand({
	id: 'selectNextSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectNextSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.DownArrow,
		secondary: [KeyMod.Alt | KeyCode.DownArrow],
		mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.Alt | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KEY_N] }
	}
}));

CommonEditorRegistry.registerEditorCommand(new SuggestCommand({
	id: 'selectNextPageSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectNextPageSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.PageDown,
		secondary: [KeyMod.Alt | KeyCode.PageDown]
	}
}));

CommonEditorRegistry.registerEditorCommand(new SuggestCommand({
	id: 'selectPrevSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectPrevSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.UpArrow,
		secondary: [KeyMod.Alt | KeyCode.UpArrow],
		mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.Alt | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KEY_P] }
	}
}));

CommonEditorRegistry.registerEditorCommand(new SuggestCommand({
	id: 'selectPrevPageSuggestion',
	precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.MultipleSuggestions),
	handler: c => c.selectPrevPageSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyCode.PageUp,
		secondary: [KeyMod.Alt | KeyCode.PageUp]
	}
}));

CommonEditorRegistry.registerEditorCommand(new SuggestCommand({
	id: 'toggleSuggestionDetails',
	precondition: SuggestContext.Visible,
	handler: x => x.toggleSuggestionDetails(),
	kbOpts: {
		weight: weight,
		kbExpr: EditorContextKeys.TextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.Space,
		mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
	}
}));
