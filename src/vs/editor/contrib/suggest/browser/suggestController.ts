/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KbExpr } from 'vs/platform/keybinding/common/keybinding';
import { ICommonCodeEditor, IEditorContribution, KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import { EditorBrowserRegistry } from 'vs/editor/browser/editorBrowserExtensions';
import { CodeSnippet, getSnippetController } from 'vs/editor/contrib/snippet/common/snippet';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { withCodeEditorFromCommandHandler } from 'vs/editor/common/config/config';
import { Context as SuggestContext, provideSuggestionItems } from 'vs/editor/contrib/suggest/common/suggest';
import { CompletionModel } from '../common/completionModel';
import { SuggestWidget } from './suggestWidget';

export class SuggestController implements IEditorContribution {

	private static ID: string = 'editor.contrib.suggestController';

	static getController(editor: ICommonCodeEditor): SuggestController {
		return <SuggestController>editor.getContribution(SuggestController.ID);
	}

	private widget: SuggestWidget;
	private toDispose: IDisposable[] = [];

	private disposeOnTrigger: IDisposable[] = [];

	constructor(
		private editor: ICommonCodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.widget = instantiationService.createInstance(SuggestWidget, this.editor);
		this.toDispose.push(this.widget, { dispose: () => this.widget = null });


	}

	getId(): string {
		return SuggestController.ID;
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	trigger(auto: boolean): TPromise<any> {

		this.disposeOnTrigger = dispose(this.disposeOnTrigger);

		this.widget.showTriggered(auto);

		const model = this.editor.getModel();
		const position = this.editor.getPosition();
		const leadingLineContent = model.getLineContent(position.lineNumber).substr(0, position.column - 1);

		return provideSuggestionItems(model, position).then(items => {

			const completionModel = new CompletionModel(items, leadingLineContent, this.editor.getPosition().column - position.column);
			this.widget.showSuggestions(completionModel);

			this.disposeOnTrigger.push(this.editor.onDidChangeCursorSelection(e => {

				if (!e.selection.isEmpty()
					|| e.source !== 'keyboard'
					|| this.editor.getPosition().lineNumber !== position.lineNumber
					|| this.editor.getPosition().column < position.column
				) {
					this.hideSuggestWidget();
					return;
				}

				// update
				completionModel.lineContext = {
					leadingLineContent: model.getLineContent(this.editor.getPosition().lineNumber).substr(0, this.editor.getPosition().column - 1),
					characterCountDelta: this.editor.getPosition().column - position.column
				};
				this.widget.showSuggestions(completionModel);
			}));

			this.disposeOnTrigger.push(this.widget.onDidAccept(e => {
				this.hideSuggestWidget();
				const {codeSnippet, overwriteBefore, overwriteAfter} = e.suggestion;
				getSnippetController(this.editor).run(new CodeSnippet(codeSnippet), overwriteBefore + this.editor.getPosition().column - position.column, overwriteAfter);
			}));

			this.disposeOnTrigger.push(this.widget.onDidHide(() => {
				this.disposeOnTrigger = dispose(this.disposeOnTrigger);
			}));

		});
	}

	acceptSelectedSuggestion(): void {
		if (this.widget) {
			this.widget.acceptSelectedSuggestion();
		}
	}

	hideSuggestWidget(): void {
		if (this.widget) {
			this.widget.cancelDetailsOrWidget();
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

const weight = CommonEditorRegistry.commandWeight(90);

function handler(id: string, fn: (controller: SuggestController) => void) {
	return accessor => withCodeEditorFromCommandHandler(id, accessor, editor => {
		fn(SuggestController.getController(editor));
	});
}

KeybindingsRegistry.registerCommandDesc({
	id: 'acceptSelectedSuggestion',
	handler: handler('acceptSelectedSuggestion', c => c.acceptSelectedSuggestion()),
	weight,
	when: KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS), KbExpr.has(SuggestContext.Visible)),
	primary: KeyCode.Tab
});

KeybindingsRegistry.registerCommandDesc({
	id: 'acceptSelectedSuggestionOnEnter',
	handler: handler('acceptSelectedSuggestionOnEnter', c => c.acceptSelectedSuggestion()),
	weight,
	when: KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS), KbExpr.has(SuggestContext.Visible), KbExpr.has('config.editor.acceptSuggestionOnEnter')),
	primary: KeyCode.Enter
});

KeybindingsRegistry.registerCommandDesc({
	id: 'hideSuggestWidget',
	handler: handler('hideSuggestWidget', c => c.hideSuggestWidget()),
	weight,
	when: KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS), KbExpr.has(SuggestContext.Visible)),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape]
});

KeybindingsRegistry.registerCommandDesc({
	id: 'selectNextSuggestion',
	handler: handler('selectNextSuggestion', c => c.selectNextSuggestion()),
	weight,
	when: KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS), KbExpr.has(SuggestContext.Visible), KbExpr.has(SuggestContext.MultipleSuggestions)),
	primary: KeyCode.DownArrow,
	secondary: [KeyMod.Alt | KeyCode.DownArrow],
	mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.Alt | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KEY_N] }
});

KeybindingsRegistry.registerCommandDesc({
	id: 'selectNextPageSuggestion',
	handler: handler('selectNextPageSuggestion', c => c.selectNextPageSuggestion()),
	weight,
	when: KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS), KbExpr.has(SuggestContext.Visible), KbExpr.has(SuggestContext.MultipleSuggestions)),
	primary: KeyCode.PageDown,
	secondary: [KeyMod.Alt | KeyCode.PageDown]
});

KeybindingsRegistry.registerCommandDesc({
	id: 'selectPrevSuggestion',
	handler: handler('selectPrevSuggestion', c => c.selectPrevSuggestion()),
	weight,
	when: KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS), KbExpr.has(SuggestContext.Visible), KbExpr.has(SuggestContext.MultipleSuggestions)),
	primary: KeyCode.UpArrow,
	secondary: [KeyMod.Alt | KeyCode.UpArrow],
	mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.Alt | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KEY_P] }
});

KeybindingsRegistry.registerCommandDesc({
	id: 'selectPrevPageSuggestion',
	handler: handler('selectPrevPageSuggestion', c => c.selectPrevPageSuggestion()),
	weight,
	when: KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS), KbExpr.has(SuggestContext.Visible), KbExpr.has(SuggestContext.MultipleSuggestions)),
	primary: KeyCode.PageUp,
	secondary: [KeyMod.Alt | KeyCode.PageUp]
});

KeybindingsRegistry.registerCommandDesc({
	id: 'toggleSuggestionDetails',
	handler: handler('toggleSuggestionDetails', c => c.toggleSuggestionDetails()),
	weight,
	when: KbExpr.and(KbExpr.has(KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS), KbExpr.has(SuggestContext.Visible)),
	primary: KeyMod.CtrlCmd | KeyCode.Space,
	mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
});

EditorBrowserRegistry.registerEditorContribution(SuggestController);
