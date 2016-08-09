/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import {TPromise} from 'vs/base/common/winjs.base';
import {ICommonCodeEditor, EditorContextKeys} from 'vs/editor/common/editorCommon';
import {editorAction, ServicesAccessor, IActionOptions, EditorAction} from 'vs/editor/common/editorCommonExtensions';
import {IndentationToSpacesCommand, IndentationToTabsCommand} from 'vs/editor/contrib/indentation/common/indentationCommands';
import {IQuickOpenService} from 'vs/workbench/services/quickopen/common/quickOpenService';
import {IModelService} from 'vs/editor/common/services/modelService';

@editorAction
export class IndentationToSpacesAction extends EditorAction {
	public static ID = 'editor.action.indentationToSpaces';

	constructor() {
		super({
			id: IndentationToSpacesAction.ID,
			label: nls.localize('indentationToSpaces', "Convert Indentation to Spaces"),
			alias: 'Convert Indentation to Spaces',
			precondition: EditorContextKeys.Writable
		});
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

@editorAction
export class IndentationToTabsAction extends EditorAction {
	public static ID = 'editor.action.indentationToTabs';

	constructor() {
		super({
			id: IndentationToTabsAction.ID,
			label: nls.localize('indentationToTabs', "Convert Indentation to Tabs"),
			alias: 'Convert Indentation to Tabs',
			precondition: EditorContextKeys.Writable
		});
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

	constructor(private insertSpaces: boolean, opts: IActionOptions) {
		super(opts);
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

@editorAction
export class IndentUsingTabs extends ChangeIndentationSizeAction {

	public static ID = 'editor.action.indentUsingTabs';

	constructor() {
		super(false, {
			id: IndentUsingTabs.ID,
			label: nls.localize('indentUsingTabs', "Indent Using Tabs"),
			alias: 'Indent Using Tabs',
			precondition: null
		});
	}
}

@editorAction
export class IndentUsingSpaces extends ChangeIndentationSizeAction {

	public static ID = 'editor.action.indentUsingSpaces';

	constructor() {
		super(true, {
			id: IndentUsingSpaces.ID,
			label: nls.localize('indentUsingSpaces', "Indent Using Spaces"),
			alias: 'Indent Using Spaces',
			precondition: null
		});
	}
}

@editorAction
export class DetectIndentation extends EditorAction {

	public static ID = 'editor.action.detectIndentation';

	constructor() {
		super({
			id: DetectIndentation.ID,
			label: nls.localize('detectIndentation', "Detect Indentation from Content"),
			alias: 'Detect Indentation from Content',
			precondition: null
		});
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

@editorAction
export class ToggleRenderWhitespaceAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleRenderWhitespace',
			label: nls.localize('toggleRenderWhitespace', "Toggle Render Whitespace"),
			alias: 'Toggle Render Whitespace',
			precondition: null
		});
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		editor.updateOptions({
			renderWhitespace: !editor.getConfiguration().viewInfo.renderWhitespace
		});
	}
}

@editorAction
export class ToggleRenderControlCharacterAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.toggleRenderControlCharacter',
			label: nls.localize('toggleRenderControlCharacters', "Toggle Control Characters"),
			alias: 'Toggle Render Control Characters',
			precondition: null
		});
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): void {
		editor.updateOptions({
			renderControlCharacters: !editor.getConfiguration().viewInfo.renderControlCharacters
		});
	}
}
