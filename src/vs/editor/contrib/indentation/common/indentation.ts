/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import {TPromise} from 'vs/base/common/winjs.base';
import {ICommonCodeEditor} from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorAction, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IndentationToSpacesCommand, IndentationToTabsCommand} from 'vs/editor/contrib/indentation/common/indentationCommands';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IModelService} from 'vs/editor/common/services/modelService';

export class IndentationToSpacesAction extends EditorAction {
	static ID = 'editor.action.indentationToSpaces';

	constructor() {
		super(
			IndentationToSpacesAction.ID,
			nls.localize('indentationToSpaces', "Convert Indentation to Spaces"),
			'Convert Indentation to Spaces',
			true
		);
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		let model = editor.getModel();
		if (!model) {
			return;
		}
		let modelOpts = model.getOptions();
		const command = new IndentationToSpacesCommand(editor.getSelection(), modelOpts.tabSize);
		editor.executeCommands(this.id, [command]);
		model.updateOptions({
			insertSpaces: true
		});
	}
}

export class IndentationToTabsAction extends EditorAction {
	static ID = 'editor.action.indentationToTabs';

	constructor() {
		super(
			IndentationToTabsAction.ID,
			nls.localize('indentationToTabs', "Convert Indentation to Tabs"),
			'Convert Indentation to Tabs',
			true
		);
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		let model = editor.getModel();
		if (!model) {
			return;
		}
		let modelOpts = model.getOptions();
		const command = new IndentationToTabsCommand(editor.getSelection(), modelOpts.tabSize);
		editor.executeCommands(this.id, [command]);
		model.updateOptions({
			insertSpaces: false
		});
	}
}

export class ChangeIndentationSizeAction extends EditorAction {

	constructor(id: string, label: string, alias: string, private insertSpaces: boolean) {
		super(id, label, alias, false);
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): TPromise<void> {
		const quickOpenService = accessor.get(IQuickOpenService);
		const modelService = accessor.get(IModelService);

		let model = editor.getModel();
		if (!model) {
			return;
		}

		let creationOpts = modelService.getCreationOptions();
		const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
			id: n.toString(),
			label: n.toString(),
			// add description for tabSize value set in the configuration
			description: n === creationOpts.tabSize ? nls.localize('configuredTabSize', "Configured Tab Size") : null
		}));

		// auto focus the tabSize set for the current editor
		const autoFocusIndex = Math.min(model.getOptions().tabSize - 1, 7);

		return TPromise.timeout(50 /* quick open is sensitive to being opened so soon after another */).then(() =>
			quickOpenService.pick(picks, { placeHolder: nls.localize({key: 'selectTabWidth', comment: ['Tab corresponds to the tab key'] }, "Select Tab Size for Current File"), autoFocus: { autoFocusIndex } }).then(pick => {
				if (pick) {
					model.updateOptions({
						tabSize: parseInt(pick.label, 10),
						insertSpaces: this.insertSpaces
					});
				}
			})
		);
	}
}

export class IndentUsingTabs extends ChangeIndentationSizeAction {

	static ID = 'editor.action.indentUsingTabs';

	constructor() {
		super(
			IndentUsingTabs.ID,
			nls.localize('indentUsingTabs', "Indent Using Tabs"),
			'Indent Using Tabs',
			false
		);
	}
}

export class IndentUsingSpaces extends ChangeIndentationSizeAction {

	static ID = 'editor.action.indentUsingSpaces';

	constructor() {
		super(
			IndentUsingSpaces.ID,
			nls.localize('indentUsingSpaces', "Indent Using Spaces"),
			'Indent Using Spaces',
			true
		);
	}
}

export class DetectIndentation extends EditorAction {

	static ID = 'editor.action.detectIndentation';

	constructor() {
		super(
			DetectIndentation.ID,
			nls.localize('detectIndentation', "Detect Indentation from Content"),
			'Detect Indentation from Content',
			false
		);
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		const modelService = accessor.get(IModelService);

		let model = editor.getModel();
		if (!model) {
			return;
		}

		let creationOpts = modelService.getCreationOptions();
		model.detectIndentation(creationOpts.insertSpaces, creationOpts.tabSize);
	}
}

export class ToggleRenderWhitespaceAction extends EditorAction {

	constructor() {
		super(
			'editor.action.toggleRenderWhitespace',
			nls.localize('toggleRenderWhitespace', "Toggle Render Whitespace"),
			'Toggle Render Whitespace',
			false
		);
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		editor.updateOptions({
			renderWhitespace: !editor.getConfiguration().viewInfo.renderWhitespace
		});
	}
}

export class ToggleRenderControlCharacterAction extends EditorAction {

	constructor() {
		super(
			'editor.action.toggleRenderControlCharacter',
			nls.localize('toggleRenderControlCharacters', "Toggle Control Characters"),
			'Toggle Render Control Characters',
			false
		);
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		editor.updateOptions({
			renderControlCharacters: !editor.getConfiguration().viewInfo.renderControlCharacters
		});
	}
}

// register actions
CommonEditorRegistry.registerEditorAction(new IndentationToSpacesAction());
CommonEditorRegistry.registerEditorAction(new IndentationToTabsAction());
CommonEditorRegistry.registerEditorAction(new IndentUsingSpaces());
CommonEditorRegistry.registerEditorAction(new IndentUsingTabs());
CommonEditorRegistry.registerEditorAction(new DetectIndentation());
CommonEditorRegistry.registerEditorAction(new ToggleRenderWhitespaceAction());
CommonEditorRegistry.registerEditorAction(new ToggleRenderControlCharacterAction());
