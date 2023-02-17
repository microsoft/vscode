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
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
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
				condition: ContextKeyExpr.equals('config.editor.stickyScroll.enabled', true),
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

const weight = KeybindingWeight.EditorContrib + 1000;

export class FocusStickyScroll extends Action2 {

	constructor() {
		super({
			id: 'editor.action.focusStickyScroll',
			title: {
				value: localize('focusStickyScroll', "Toggle Focus Sticky Scroll"),
				mnemonicTitle: localize({ key: 'mifocusStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Toggle Focus Sticky Scroll"),
				original: 'Toggle Focus Sticky Scroll',
			},
			precondition: ContextKeyExpr.has('config.editor.stickyScroll.enabled'),
			menu: [
				{ id: MenuId.CommandPalette },
			],
			keybinding: {
				weight: weight,
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

export class SelectNextStickyScrollLine extends Action2 {
	constructor() {
		super({
			id: 'editor.action.selectNextStickyScrollLine',
			title: {
				value: localize('selectNextStickyScrollLine.title', "Select next sticky scroll line"),
				original: 'Select next sticky scroll line'
			},
			precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
			keybinding: {
				weight,
				primary: KeyCode.DownArrow
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const stickyScrollFocusService = accessor.get(IStickyScrollFocusService);
		stickyScrollFocusService.focusNext();
	}
}

export class SelectPreviousStickyScrollLine extends Action2 {
	constructor() {
		super({
			id: 'editor.action.selectPreviousStickyScrollLine',
			title: {
				value: localize('selectPreviousStickyScrollLine.title', "Select previous sticky scroll line"),
				original: 'Select previous sticky scroll line'
			},
			precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
			keybinding: {
				weight,
				primary: KeyCode.UpArrow
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const stickyScrollFocusService = accessor.get(IStickyScrollFocusService);
		stickyScrollFocusService.focusPrevious();
	}
}

export class GoToStickyScrollLine extends Action2 {
	constructor() {
		super({
			id: 'editor.action.goToFocusedStickyScrollLine',
			title: {
				value: localize('goToFocusedStickyScrollLine.title', "Go to focused sticky scroll line"),
				original: 'Go to focused sticky scroll line'
			},
			precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
			keybinding: {
				weight,
				primary: KeyCode.LeftArrow
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const stickyScrollFocusService = accessor.get(IStickyScrollFocusService);
		stickyScrollFocusService.goToFocused();
	}
}


export class CancelFocusStickyScroll extends Action2 {
	constructor() {
		super({
			id: 'editor.action.cancelFocusStickyScroll',
			title: {
				value: localize('cancelFocusStickyScroll.title', "Cancel focus sticky scroll"),
				original: 'Cancel focus sticky scroll'
			},
			precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
			keybinding: {
				weight,
				primary: KeyCode.LeftArrow
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const stickyScrollFocusService = accessor.get(IStickyScrollFocusService);
		stickyScrollFocusService.cancelFocus();
	}
}
