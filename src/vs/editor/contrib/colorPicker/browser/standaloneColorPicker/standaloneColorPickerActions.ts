/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { EditorAction, EditorAction2, ServicesAccessor } from '../../../../browser/editorExtensions.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../common/editorContextKeys.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { StandaloneColorPickerController } from './standaloneColorPickerController.js';

export class ShowOrFocusStandaloneColorPicker extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.action.showOrFocusStandaloneColorPicker',
			title: {
				...localize2('showOrFocusStandaloneColorPicker', "Show or Focus Standalone Color Picker"),
				mnemonicTitle: localize({ key: 'mishowOrFocusStandaloneColorPicker', comment: ['&& denotes a mnemonic'] }, "&&Show or Focus Standalone Color Picker"),
			},
			precondition: undefined,
			menu: [
				{ id: MenuId.CommandPalette },
			],
			metadata: {
				description: localize2('showOrFocusStandaloneColorPickerDescription', "Show or focus a standalone color picker which uses the default color provider. It displays hex/rgb/hsl colors."),
			}
		});
	}
	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		StandaloneColorPickerController.get(editor)?.showOrFocus();
	}
}

export class HideStandaloneColorPicker extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.hideColorPicker',
			label: localize2({
				key: 'hideColorPicker',
				comment: [
					'Action that hides the color picker'
				]
			}, "Hide the Color Picker"),
			precondition: EditorContextKeys.standaloneColorPickerVisible.isEqualTo(true),
			kbOpts: {
				primary: KeyCode.Escape,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: localize2('hideColorPickerDescription', "Hide the standalone color picker."),
			}
		});
	}
	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		StandaloneColorPickerController.get(editor)?.hide();
	}
}

export class InsertColorWithStandaloneColorPicker extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.insertColorWithStandaloneColorPicker',
			label: localize2({
				key: 'insertColorWithStandaloneColorPicker',
				comment: [
					'Action that inserts color with standalone color picker'
				]
			}, "Insert Color with Standalone Color Picker"),
			precondition: EditorContextKeys.standaloneColorPickerFocused.isEqualTo(true),
			kbOpts: {
				primary: KeyCode.Enter,
				weight: KeybindingWeight.EditorContrib
			},
			metadata: {
				description: localize2('insertColorWithStandaloneColorPickerDescription', "Insert hex/rgb/hsl colors with the focused standalone color picker."),
			}
		});
	}
	public run(_accessor: ServicesAccessor, editor: ICodeEditor): void {
		StandaloneColorPickerController.get(editor)?.insertColor();
	}
}
