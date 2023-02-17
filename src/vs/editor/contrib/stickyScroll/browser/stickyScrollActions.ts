/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { localize } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IStickyScrollFocusService } from './stickyScrollServices';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

export class ToggleStickyScroll extends Action2 {

	constructor() {
		super({
			id: 'editor.action.toggleStickyScroll',
			title: {
				value: localize('toggleStickyScroll', "Toggle Sticky Scroll"),
				mnemonicTitle: localize({ key: 'mitoggleStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Toggle Sticky Scroll"),
				original: 'Toggle Sticky Scroll',
			},
			category: Categories.View,
			toggled: {
				condition: EditorContextKeys.stickyScrollEnabled,
				title: localize('stickyScroll', "Sticky Scroll"),
				mnemonicTitle: localize({ key: 'miStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Sticky Scroll"),
			},
			menu: [
				{ id: MenuId.CommandPalette },
				{ id: MenuId.MenubarViewMenu, group: '5_editor', order: 2 },
				{ id: MenuId.StickyScrollContext }
			]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue('editor.stickyScroll.enabled');
		return configurationService.updateValue('editor.stickyScroll.enabled', newValue);
	}
}

export class FocusStickyScroll extends Action2 {

	constructor() {
		super({
			id: 'editor.action.focusStickyScroll',
			title: {
				value: localize('focusStickyScroll', "Focus Sticky Scroll"),
				mnemonicTitle: localize({ key: 'mifocusStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Focus Sticky Scroll"),
				original: 'Focus Sticky Scroll',
			},
			precondition: EditorContextKeys.stickyScrollEnabled.isEqualTo(true),
			menu: [
				{ id: MenuId.CommandPalette },
			],
			keybinding: {
				weight: KeybindingWeight.EditorContrib,
				primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyS
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const stickyScrollFocusService = accessor.get(IStickyScrollFocusService);
		const codeEditorService = accessor.get(ICodeEditorService);
		const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
		stickyScrollFocusService.focus(editor);
	}
}
