/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Lifecycle = require('vs/base/common/lifecycle');
import Snippet = require('vs/editor/contrib/snippet/common/snippet');
import SuggestWidget = require('./suggestWidget');
import SuggestModel = require('./suggestModel');
import Errors = require('vs/base/common/errors');
import {TPromise} from 'vs/base/common/winjs.base';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import EventEmitter = require('vs/base/common/eventEmitter');
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {SuggestRegistry, ACCEPT_SELECTED_SUGGESTION_CMD, CONTEXT_SUGGEST_WIDGET_VISIBLE} from 'vs/editor/contrib/suggest/common/suggest';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

export class SuggestController implements EditorCommon.IEditorContribution {
	static ID = 'editor.contrib.suggestController';

	static getSuggestController(editor:EditorCommon.ICommonCodeEditor): SuggestController {
		return <SuggestController>editor.getContribution(SuggestController.ID);
	}

	private editor:EditorBrowser.ICodeEditor;
	private model:SuggestModel.SuggestModel;
	private suggestWidget: SuggestWidget.SuggestWidget;
	private toDispose: Lifecycle.IDisposable[];

	private triggerCharacterListeners: Function[];
	private suggestWidgetVisible: IKeybindingContextKey<boolean>;

	constructor(editor:EditorBrowser.ICodeEditor, @IKeybindingService keybindingService: IKeybindingService, @ITelemetryService telemetryService: ITelemetryService) {
		this.editor = editor;
		this.suggestWidgetVisible = keybindingService.createKey(CONTEXT_SUGGEST_WIDGET_VISIBLE, false);

		this.model = new SuggestModel.SuggestModel(this.editor, (snippet:Snippet.CodeSnippet, overwriteBefore:number, overwriteAfter:number) => {
			Snippet.get(this.editor).run(snippet, overwriteBefore, overwriteAfter);
		});

		this.suggestWidget = new SuggestWidget.SuggestWidget(this.editor, telemetryService, keybindingService, () => {
			this.suggestWidgetVisible.set(true);
		}, () => {
			this.suggestWidgetVisible.reset();
		});
		this.suggestWidget.setModel(this.model);

		this.triggerCharacterListeners = [];

		this.toDispose = [];
		this.toDispose.push(editor.addListener2(EditorCommon.EventType.ConfigurationChanged, () => this.update()));
		this.toDispose.push(editor.addListener2(EditorCommon.EventType.ModelChanged, () => this.update()));
		this.toDispose.push(editor.addListener2(EditorCommon.EventType.ModelModeChanged, () => this.update()));
		this.toDispose.push(editor.addListener2(EditorCommon.EventType.ModelModeSupportChanged, (e: EditorCommon.IModeSupportChangedEvent) => {
			if (e.suggestSupport) {
				this.update();
			}
		}));
		this.toDispose.push(SuggestRegistry.onDidChange(this.update, this));

		this.update();
	}

	public getId(): string {
		return SuggestController.ID;
	}

	public dispose(): void {
		this.toDispose = Lifecycle.disposeAll(this.toDispose);
		this.triggerCharacterListeners = Lifecycle.cAll(this.triggerCharacterListeners);

		if (this.suggestWidget) {
			this.suggestWidget.destroy();
			this.suggestWidget = null;
		}
		if (this.model) {
			this.model.destroy();
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
		var position = this.editor.getPosition();
		var lineContext = this.editor.getModel().getLineContext(position.lineNumber);
		var mode: Modes.IMode = this.editor.getModel().getMode();

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
		if (this.suggestWidget) {
			this.suggestWidget.acceptSelectedSuggestion();
		}
	}

	public hideSuggestWidget(): void {
		if (this.suggestWidget) {
			this.suggestWidget.cancel();
		}
	}

	public selectNextSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectNext();
		}
	}

	public selectNextPageSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectNextPage();
		}
	}

	public selectPrevSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectPrevious();
		}
	}

	public selectPrevPageSuggestion(): void {
		if (this.suggestWidget) {
			this.suggestWidget.selectPreviousPage();
		}
	}
}

export class TriggerSuggestAction extends EditorAction {

	static ID = 'editor.action.triggerSuggest';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor);
	}

	public isSupported(): boolean {
		return SuggestRegistry.has(this.editor.getModel()) && !this.editor.getConfiguration().readOnly;
	}

	public run():TPromise<boolean> {
		return SuggestController.getSuggestController(this.editor).triggerSuggest();
	}
}

var weight = CommonEditorRegistry.commandWeight(90);

// register action
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(TriggerSuggestAction, TriggerSuggestAction.ID, nls.localize('suggest.trigger.label', "Trigger Suggest"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.Space,
	mac: { primary: KeyMod.WinCtrl | KeyCode.Space }
}));
CommonEditorRegistry.registerEditorCommand(ACCEPT_SELECTED_SUGGESTION_CMD, weight, { primary: KeyCode.Enter, secondary:[KeyCode.Tab] }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	var controller = SuggestController.getSuggestController(editor);
	controller.acceptSelectedSuggestion();
});
CommonEditorRegistry.registerEditorCommand('hideSuggestWidget', weight, { primary: KeyCode.Escape }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	var controller = SuggestController.getSuggestController(editor);
	controller.hideSuggestWidget();
});
CommonEditorRegistry.registerEditorCommand('selectNextSuggestion', weight, { primary: KeyCode.DownArrow }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	var controller = SuggestController.getSuggestController(editor);
	controller.selectNextSuggestion();
});
CommonEditorRegistry.registerEditorCommand('selectNextPageSuggestion', weight, { primary: KeyCode.PageDown }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	var controller = SuggestController.getSuggestController(editor);
	controller.selectNextPageSuggestion();
});
CommonEditorRegistry.registerEditorCommand('selectPrevSuggestion', weight, { primary: KeyCode.UpArrow }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	var controller = SuggestController.getSuggestController(editor);
	controller.selectPrevSuggestion();
});
CommonEditorRegistry.registerEditorCommand('selectPrevPageSuggestion', weight, { primary: KeyCode.PageUp }, true, CONTEXT_SUGGEST_WIDGET_VISIBLE, (ctx, editor, args) => {
	var controller = SuggestController.getSuggestController(editor);
	controller.selectPrevPageSuggestion();
});
EditorBrowserRegistry.registerEditorContribution(SuggestController);
