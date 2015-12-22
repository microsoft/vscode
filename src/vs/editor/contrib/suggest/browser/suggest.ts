/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as Lifecycle from 'vs/base/common/lifecycle';
import * as Snippet from 'vs/editor/contrib/snippet/common/snippet';
import { SuggestWidget } from './suggestWidget';
import { SuggestModel } from './suggestModel';
import * as Errors from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorBrowserRegistry } from 'vs/editor/browser/editorBrowserExtensions';
import { CommonEditorRegistry, ContextKey, EditorActionDescriptor } from 'vs/editor/common/editorCommonExtensions';
import { EditorAction } from 'vs/editor/common/editorAction';
import * as EditorBrowser from 'vs/editor/browser/editorBrowser';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import * as Modes from 'vs/editor/common/modes';
import { IKeybindingService, IKeybindingContextKey } from 'vs/platform/keybinding/common/keybindingService';
import { SuggestRegistry, ACCEPT_SELECTED_SUGGESTION_CMD, CONTEXT_SUGGEST_WIDGET_VISIBLE } from 'vs/editor/contrib/suggest/common/suggest';
import { IInstantiationService, INullService } from 'vs/platform/instantiation/common/instantiation';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';

export class SuggestController implements EditorCommon.IEditorContribution {
	static ID: string = 'editor.contrib.suggestController';

	static getSuggestController(editor: EditorCommon.ICommonCodeEditor): SuggestController {
		return <SuggestController>editor.getContribution(SuggestController.ID);
	}

	private model: SuggestModel;
	private widget: SuggestWidget;
	private triggerCharacterListeners: Function[];
	private suggestWidgetVisible: IKeybindingContextKey<boolean>;
	private toDispose: Lifecycle.IDisposable[];

	constructor(
		private editor: EditorBrowser.ICodeEditor,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this.suggestWidgetVisible = keybindingService.createKey(CONTEXT_SUGGEST_WIDGET_VISIBLE, false);
		this.model = new SuggestModel(this.editor);
		this.widget = instantiationService.createInstance(SuggestWidget, this.editor, this.model);

		this.triggerCharacterListeners = [];

		this.toDispose = [];
		this.toDispose.push(this.widget.onDidVisibilityChange(visible => visible ? this.suggestWidgetVisible.set(true) : this.suggestWidgetVisible.reset()));
		this.toDispose.push(editor.addListener2(EditorCommon.EventType.ConfigurationChanged, () => this.update()));
		this.toDispose.push(editor.addListener2(EditorCommon.EventType.ModelChanged, () => this.update()));
		this.toDispose.push(editor.addListener2(EditorCommon.EventType.ModelModeChanged, () => this.update()));
		this.toDispose.push(editor.addListener2(EditorCommon.EventType.ModelModeSupportChanged, (e: EditorCommon.IModeSupportChangedEvent) => {
			if (e.suggestSupport) {
				this.update();
			}
		}));
		this.toDispose.push(SuggestRegistry.onDidChange(this.update, this));

		this.toDispose.push(this.model.onDidAccept(e => Snippet.get(this.editor).run(e.snippet, e.overwriteBefore, e.overwriteAfter)));

		this.update();
	}

	public getId(): string {
		return SuggestController.ID;
	}

	public dispose(): void {
		this.toDispose = Lifecycle.disposeAll(this.toDispose);
		this.triggerCharacterListeners = Lifecycle.cAll(this.triggerCharacterListeners);

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

		this.triggerCharacterListeners = Lifecycle.cAll(this.triggerCharacterListeners);

		if (this.editor.getConfiguration().readOnly
			|| !this.editor.getModel()
			|| !this.editor.getConfiguration().suggestOnTriggerCharacters) {

			return;
		}

		let groups = SuggestRegistry.orderedGroups(this.editor.getModel());
		if (groups.length === 0) {
			return;
		}

		let triggerCharacters: { [ch: string]: Modes.ISuggestSupport[][] } = Object.create(null);

		groups.forEach(group => {

			let groupTriggerCharacters: { [ch: string]: Modes.ISuggestSupport[] } = Object.create(null);

			group.forEach(support => {
				let localTriggerCharacters = support.getTriggerCharacters();
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

	private triggerCharacterHandler(character: string, groups: Modes.ISuggestSupport[][]): void {
		const position = this.editor.getPosition();
		const lineContext = this.editor.getModel().getLineContext(position.lineNumber);

		groups = groups.map(supports => {
			return supports.filter(support => support.shouldAutotriggerSuggest(lineContext, position.column - 1, character));
		});

		if (groups.length > 0) {
			this.triggerSuggest(character, groups).done(null, Errors.onUnexpectedError);
		}
	}

	public triggerSuggest(triggerCharacter?: string, groups?: Modes.ISuggestSupport[][]): TPromise<boolean> {
		this.model.trigger(false, triggerCharacter, false, groups);
		this.editor.focus();

		return TPromise.as(false);
	}

	public acceptSelectedSuggestion(): void {
		if (this.widget) {
			this.widget.acceptSelectedSuggestion();
		}
	}

	public hideSuggestWidget(): void {
		if (this.widget) {
			this.widget.cancel();
		}
	}

	public selectNextSuggestion(): void {
		if (this.widget) {
			this.widget.selectNext();
		}
	}

	public selectNextPageSuggestion(): void {
		if (this.widget) {
			this.widget.selectNextPage();
		}
	}

	public selectPrevSuggestion(): void {
		if (this.widget) {
			this.widget.selectPrevious();
		}
	}

	public selectPrevPageSuggestion(): void {
		if (this.widget) {
			this.widget.selectPreviousPage();
		}
	}
}

export class TriggerSuggestAction extends EditorAction {

	static ID: string = 'editor.action.triggerSuggest';

	constructor(descriptor: EditorCommon.IEditorActionDescriptorData, editor: EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor);
	}

	public isSupported(): boolean {
		return SuggestRegistry.has(this.editor.getModel()) && !this.editor.getConfiguration().readOnly;
	}

	public run(): TPromise<boolean> {
		return SuggestController.getSuggestController(this.editor).triggerSuggest();
	}
}

const weight = CommonEditorRegistry.commandWeight(90);

// register action
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(TriggerSuggestAction, TriggerSuggestAction.ID, nls.localize('suggest.trigger.label', "Trigger Suggest"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.Space,
	mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
}));
CommonEditorRegistry.registerEditorCommand(ACCEPT_SELECTED_SUGGESTION_CMD, weight, { primary: KeyCode.Enter, secondary: [KeyCode.Tab] }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	const controller = SuggestController.getSuggestController(editor);
	controller.acceptSelectedSuggestion();
});
CommonEditorRegistry.registerEditorCommand('hideSuggestWidget', weight, { primary: KeyCode.Escape }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	const controller = SuggestController.getSuggestController(editor);
	controller.hideSuggestWidget();
});
CommonEditorRegistry.registerEditorCommand('selectNextSuggestion', weight, { primary: KeyCode.DownArrow }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	const controller = SuggestController.getSuggestController(editor);
	controller.selectNextSuggestion();
});
CommonEditorRegistry.registerEditorCommand('selectNextPageSuggestion', weight, { primary: KeyCode.PageDown }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	const controller = SuggestController.getSuggestController(editor);
	controller.selectNextPageSuggestion();
});
CommonEditorRegistry.registerEditorCommand('selectPrevSuggestion', weight, { primary: KeyCode.UpArrow }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	const controller = SuggestController.getSuggestController(editor);
	controller.selectPrevSuggestion();
});
CommonEditorRegistry.registerEditorCommand('selectPrevPageSuggestion', weight, { primary: KeyCode.PageUp }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	const controller = SuggestController.getSuggestController(editor);
	controller.selectPrevPageSuggestion();
});
EditorBrowserRegistry.registerEditorContribution(SuggestController);
