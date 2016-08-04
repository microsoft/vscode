/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KbExpr } from 'vs/platform/keybinding/common/keybinding';
import { ICommonCodeEditor, IEditorContribution, EditorContextKeys } from 'vs/editor/common/editorCommon';
import { ServicesAccessor, EditorAction, EditorCommand, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ISuggestSupport, SuggestRegistry } from 'vs/editor/common/modes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorBrowserRegistry } from 'vs/editor/browser/editorBrowserExtensions';
import { getSnippetController } from 'vs/editor/contrib/snippet/common/snippet';
import { Context as SuggestContext } from 'vs/editor/contrib/suggest/common/suggest';
import { SuggestModel } from '../common/suggestModel';
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
				this.triggerSuggest(ch, triggerCharacters[ch]);
			}));
		});
	}

	triggerSuggest(triggerCharacter?: string, groups?: ISuggestSupport[][]): void {
		this.model.trigger(false, triggerCharacter, false, groups);
		this.editor.focus();
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

	constructor() {
		super(
			'editor.action.triggerSuggest',
			nls.localize('suggest.trigger.label', "Trigger Suggest"),
			'Trigger Suggest',
			true
		);

		this.kbOpts = {
			kbExpr: EditorContextKeys.TextFocus,
			primary: KeyMod.CtrlCmd | KeyCode.Space,
			mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
		};
	}

	public supported(accessor:ServicesAccessor, editor:ICommonCodeEditor): boolean {
		if (!super.supported(accessor, editor)) {
			return false;
		}
		return SuggestRegistry.has(editor.getModel());
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		SuggestController.getController(editor).triggerSuggest();
	}
}

CommonEditorRegistry.registerEditorAction(new TriggerSuggestAction());

const weight = CommonEditorRegistry.commandWeight(90);

const SuggestCommand = EditorCommand.bindToContribution(
	SuggestController.getController, {
		weight: weight,
		kbExpr: KbExpr.and(EditorContextKeys.TextFocus, SuggestContext.Visible)
	}
);
const MultipleSuggestionsCommand = EditorCommand.bindToContribution(
	SuggestController.getController, {
		weight: weight,
		kbExpr: KbExpr.and(EditorContextKeys.TextFocus, SuggestContext.Visible, SuggestContext.MultipleSuggestions)
	}
);
const AcceptSuggestionsOnEnterCommand = EditorCommand.bindToContribution(
	SuggestController.getController, {
		weight: weight,
		kbExpr: KbExpr.and(EditorContextKeys.TextFocus, SuggestContext.Visible, KbExpr.has('config.editor.acceptSuggestionOnEnter'))
	}
);

CommonEditorRegistry.registerEditorCommand2(new SuggestCommand(
	'acceptSelectedSuggestion',
	x => x.acceptSelectedSuggestion(),
	{
		primary: KeyCode.Tab
	}
));

CommonEditorRegistry.registerEditorCommand2(new AcceptSuggestionsOnEnterCommand(
	'acceptSelectedSuggestionOnEnter',
	x => x.acceptSelectedSuggestion(),
	{
		primary: KeyCode.Enter
	}
));

CommonEditorRegistry.registerEditorCommand2(new SuggestCommand(
	'hideSuggestWidget',
	x => x.cancelSuggestWidget(),
	{
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape]
	}
));

CommonEditorRegistry.registerEditorCommand2(new MultipleSuggestionsCommand(
	'selectNextSuggestion',
	c => c.selectNextSuggestion(),
	{
		primary: KeyCode.DownArrow,
		secondary: [KeyMod.Alt | KeyCode.DownArrow],
		mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.Alt | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KEY_N] }
	}
));

CommonEditorRegistry.registerEditorCommand2(new MultipleSuggestionsCommand(
	'selectNextPageSuggestion',
	c => c.selectNextPageSuggestion(),
	{
		primary: KeyCode.PageDown,
		secondary: [KeyMod.Alt | KeyCode.PageDown]
	}
));

CommonEditorRegistry.registerEditorCommand2(new MultipleSuggestionsCommand(
	'selectPrevSuggestion',
	c => c.selectPrevSuggestion(),
	{
		primary: KeyCode.UpArrow,
		secondary: [KeyMod.Alt | KeyCode.UpArrow],
		mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.Alt | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KEY_P] }
	}
));

CommonEditorRegistry.registerEditorCommand2(new MultipleSuggestionsCommand(
	'selectPrevPageSuggestion',
	c => c.selectPrevPageSuggestion(),
	{
		primary: KeyCode.PageUp,
		secondary: [KeyMod.Alt | KeyCode.PageUp]
	}
));

CommonEditorRegistry.registerEditorCommand2(new SuggestCommand(
	'toggleSuggestionDetails',
	x => x.toggleSuggestionDetails(),
	{
		primary: KeyMod.CtrlCmd | KeyCode.Space,
		mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
	}
));

EditorBrowserRegistry.registerEditorContribution(SuggestController);
