/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KbExpr } from 'vs/platform/keybinding/common/keybindingService';
import { EditorAction } from 'vs/editor/common/editorAction';
import { ICommonCodeEditor, IEditorActionDescriptorData, IEditorContribution, KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry, ContextKey, EditorActionDescriptor } from 'vs/editor/common/editorCommonExtensions';
import { ISuggestSupport, SuggestRegistry } from 'vs/editor/common/modes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorBrowserRegistry } from 'vs/editor/browser/editorBrowserExtensions';
import { getSnippetController } from 'vs/editor/contrib/snippet/common/snippet';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/common/suggest';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { withCodeEditorFromCommandHandler } from 'vs/editor/common/config/config';
import { SuggestModel } from './suggestModel';
import { SuggestWidget } from './suggestWidget';

export class SuggestController implements IEditorContribution {
	static ID: string = 'editor.contrib.suggestController';

	static getController(editor: ICommonCodeEditor): SuggestController {
		return <SuggestController>editor.getContribution(SuggestController.ID);
	}

	private model: SuggestModel;
	private widget: SuggestWidget;
	private triggerCharacterListeners: IDisposable[];
	private toDispose: IDisposable[];

	constructor(
		private editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.model = new SuggestModel(this.editor);
		this.widget = instantiationService.createInstance(SuggestWidget, this.editor, this.model);

		this.triggerCharacterListeners = [];

		this.toDispose = [];
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

	private update(): void {

		this.triggerCharacterListeners = dispose(this.triggerCharacterListeners);

		if (this.editor.getConfiguration().readOnly
			|| !this.editor.getModel()
			|| !this.editor.getConfiguration().contribInfo.suggestOnTriggerCharacters) {

			return;
		}

		let groups = SuggestRegistry.orderedGroups(this.editor.getModel());
		if (groups.length === 0) {
			return;
		}

		let triggerCharacters: { [ch: string]: ISuggestSupport[][] } = Object.create(null);

		groups.forEach(group => {

			let groupTriggerCharacters: { [ch: string]: ISuggestSupport[] } = Object.create(null);

			group.forEach(support => {
				let localTriggerCharacters = support.triggerCharacters;
				if (localTriggerCharacters) {
					for (let ch of localTriggerCharacters) {
						let array = groupTriggerCharacters[ch];
						if (array) {
							array.push(support);
						} else {
							array = [support];
							groupTriggerCharacters[ch] = array;
							if (triggerCharacters[ch]) {
								triggerCharacters[ch].push(array);
							} else {
								triggerCharacters[ch] = [array];
							}
						}
					}
				}
			});
		});

		Object.keys(triggerCharacters).forEach(ch => {
			this.triggerCharacterListeners.push(this.editor.addTypingListener(ch, () => {
				this.triggerCharacterHandler(ch, triggerCharacters[ch]);
			}));
		});
	}

	private triggerCharacterHandler(character: string, groups: ISuggestSupport[][]): void {
		groups = groups.map(supports => {
			return supports.filter(support => support.shouldAutotriggerSuggest);
		});

		if (groups.length > 0) {
			this.triggerSuggest(character, groups).done(null, onUnexpectedError);
		}
	}

	triggerSuggest(triggerCharacter?: string, groups?: ISuggestSupport[][]): TPromise<boolean> {
		this.model.trigger(false, triggerCharacter, false, groups);
		this.editor.focus();

		return TPromise.as(false);
	}

	acceptSelectedSuggestion(): void {
		if (this.widget) {
			this.widget.acceptSelectedSuggestion();
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

export class TriggerSuggestAction extends EditorAction {

	static ID: string = 'editor.action.triggerSuggest';

	constructor(descriptor: IEditorActionDescriptorData, editor: ICommonCodeEditor) {
		super(descriptor, editor);
	}

	isSupported(): boolean {
		return SuggestRegistry.has(this.editor.getModel()) && !this.editor.getConfiguration().readOnly;
	}

	run(): TPromise<boolean> {
		return SuggestController.getController(this.editor).triggerSuggest();
	}
}

CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(
	TriggerSuggestAction,
	TriggerSuggestAction.ID,
	nls.localize('suggest.trigger.label', "Trigger Suggest"),
	{
		context: ContextKey.EditorTextFocus,
		primary: KeyMod.CtrlCmd | KeyCode.Space,
		mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
	},
	'Trigger Suggest'
));

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
	handler: handler('hideSuggestWidget', c => c.cancelSuggestWidget()),
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
