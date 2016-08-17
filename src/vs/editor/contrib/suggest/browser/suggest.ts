/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { forEach } from 'vs/base/common/collections';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommonCodeEditor, IEditorContribution, EditorContextKeys, ModeContextKeys } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction, EditorCommand, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ISuggestSupport, SuggestRegistry } from 'vs/editor/common/modes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorBrowserRegistry } from 'vs/editor/browser/editorBrowserExtensions';
import { getSnippetController } from 'vs/editor/contrib/snippet/common/snippet';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/common/suggest';
import { SuggestModel } from '../common/suggestModel';
import { CompletionItem } from '../common/completionModel';
import { SuggestWidget } from './suggestWidget';

export class SuggestController implements IEditorContribution {
	private static ID: string = 'editor.contrib.suggestController';

	static getController(editor: ICommonCodeEditor): SuggestController {
		return <SuggestController>editor.getContribution(SuggestController.ID);
	}

	private model: SuggestModel;
	private widget: SuggestWidget;
	private triggerCharacterListeners: IDisposable[];
	private toDispose: IDisposable[] = [];

	constructor(
		private editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.model = new SuggestModel(this.editor);
		this.widget = instantiationService.createInstance(SuggestWidget, this.editor);

		this.toDispose.push(this.model.onDidTrigger(e => this.widget.showTriggered(e)));
		this.toDispose.push(this.model.onDidSuggest(e => this.widget.showSuggestions(e)));
		this.toDispose.push(this.model.onDidCancel(e => this.widget.showDidCancel(e)));

		this.toDispose.push(this.widget.onDidSelect(this.onDidSelectItem, this));

		this.triggerCharacterListeners = [];

		this.toDispose.push(editor.onDidChangeConfiguration(() => this.update()));
		this.toDispose.push(editor.onDidChangeModel(() => this.update()));
		this.toDispose.push(editor.onDidChangeModelMode(() => this.update()));
		this.toDispose.push(SuggestRegistry.onDidChange(this.update, this));

		this.toDispose.push(this.model.onDidAccept(e => getSnippetController(this.editor).run(e.snippet, e.overwriteBefore, e.overwriteAfter)));

		this.update();
	}

	getId(): string {
		return SuggestController.ID;
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
		this.triggerCharacterListeners = dispose(this.triggerCharacterListeners);

		if (this.widget) {
			this.widget.dispose();
			this.widget = null;
		}
		if (this.model) {
			this.model.dispose();
			this.model = null;
		}
	}

	private onDidSelectItem(item: CompletionItem): void {
		if (!item) {
			this.model.cancel();
			return;
		}
		const {overwriteBefore, overwriteAfter} = item.suggestion;
		this.model.accept(item.suggestion, overwriteBefore, overwriteAfter);
	}

	private update(): void {

		this.triggerCharacterListeners = dispose(this.triggerCharacterListeners);

		if (this.editor.getConfiguration().readOnly
			|| !this.editor.getModel()
			|| !this.editor.getConfiguration().contribInfo.suggestOnTriggerCharacters) {

			return;
		}

		const supportsByTriggerCharacter: { [ch: string]: ISuggestSupport[] } = Object.create(null);
		for (const support of SuggestRegistry.all(this.editor.getModel())) {
			if (isFalsyOrEmpty(support.triggerCharacters)) {
				continue;
			}
			for (const ch of support.triggerCharacters) {
				const array = supportsByTriggerCharacter[ch];
				if (!array) {
					supportsByTriggerCharacter[ch] = [support];
				} else {
					array.push(support);
				}
			}
		}

		forEach(supportsByTriggerCharacter, entry => {
			this.triggerCharacterListeners.push(this.editor.addTypingListener(entry.key, () => {
				this.model.trigger(true, false, entry.value);
			}));
		});
	}

	triggerSuggest(): void {
		this.model.trigger(false, false);
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
			this.widget.cancel();
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

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		SuggestController.getController(editor).triggerSuggest();
	}
}

const weight = CommonEditorRegistry.commandWeight(90);

const SuggestCommand = EditorCommand.bindToContribution<SuggestController>(SuggestController.getController);


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
	precondition: SuggestContext.Visible,
	handler: x => x.acceptSelectedSuggestion(),
	kbOpts: {
		weight: weight,
		kbExpr: ContextKeyExpr.and(EditorContextKeys.TextFocus, ContextKeyExpr.has('config.editor.acceptSuggestionOnEnter')),
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

EditorBrowserRegistry.registerEditorContribution(SuggestController);
