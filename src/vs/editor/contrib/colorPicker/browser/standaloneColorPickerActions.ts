/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { KeyChord, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { StandaloneColorPickerController } from 'vs/editor/contrib/colorPicker/browser/standaloneColorPickerWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import 'vs/css!./colorPicker';

class ShowOrFocusStandaloneColorPicker extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.showOrFocusStandaloneColorPicker',
			label: localize({
				key: 'showOrFocusStandaloneColorPicker',
				comment: [
					'Action that shows the standalone color picker or focuses on it'
				]
			}, "Show or Focus the Color Picker"),
			alias: 'Show or Focus the Color Picker',
			precondition: undefined,
			kbOpts: {
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyP),
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		console.log('inside of showing or focusing the color picker');
		StandaloneColorPickerController.get(editor)?.showOrFocus();
	}
}

registerEditorAction(ShowOrFocusStandaloneColorPicker);

class HideStandaloneColorPicker extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.hideColorPicker',
			label: localize({
				key: 'hideColorPicker',
				comment: [
					'Action that hides the color picker'
				]
			}, "Hide the Color Picker"),
			alias: 'Hide the Color Picker',
			precondition: EditorContextKeys.standaloneColorPickerVisible.isEqualTo(true),
			kbOpts: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		console.log('inside of hide of color picker');
		StandaloneColorPickerController.get(editor)?.hide();
	}
}

class InsertColorFromStandaloneColorPicker extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertColorFromStandaloneColorPicker',
			label: localize({
				key: 'insertColorFromStandaloneColorPicker',
				comment: [
					'Action that inserts color from standalone color picker'
				]
			}, "Insert Color from Standalone Color Picker"),
			alias: 'Insert Color from Standalone Color Picker',
			precondition: EditorContextKeys.standaloneColorPickerFocused.isEqualTo(true),
			kbOpts: {
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		console.log('inside of update editor of color picker');
		StandaloneColorPickerController.get(editor)?.updateEditor();
	}
}

registerEditorAction(HideStandaloneColorPicker);
registerEditorAction(InsertColorFromStandaloneColorPicker);
