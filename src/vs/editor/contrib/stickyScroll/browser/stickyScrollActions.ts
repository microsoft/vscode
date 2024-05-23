/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorAction2, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize, localize2 } from 'vs/nls';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { StickyScrollController } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollController';

export class ToggleStickyScroll extends Action2 {

	constructor() {
		super({
			id: 'editor.action.toggleStickyScroll',
			title: {
				...localize2('toggleEditorStickyScroll', "Toggle Editor Sticky Scroll"),
				mnemonicTitle: localize({ key: 'mitoggleStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Toggle Editor Sticky Scroll"),
			},
			metadata: {
				description: localize2('toggleEditorStickyScroll.description', "Toggle/enable the editor sticky scroll which shows the nested scopes at the top of the viewport"),
			},
			category: Categories.View,
			toggled: {
				condition: ContextKeyExpr.equals('config.editor.stickyScroll.enabled', true),
				title: localize('stickyScroll', "Sticky Scroll"),
				mnemonicTitle: localize({ key: 'miStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Sticky Scroll"),
			},
			menu: [
				{ id: MenuId.CommandPalette },
				{ id: MenuId.MenubarAppearanceMenu, group: '4_editor', order: 3 },
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

const weight = KeybindingWeight.EditorContrib;

export class FocusStickyScroll extends EditorAction2 {

	constructor() {
		super({
			id: 'editor.action.focusStickyScroll',
			title: {
				...localize2('focusStickyScroll', "Focus on the editor sticky scroll"),
				mnemonicTitle: localize({ key: 'mifocusStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Focus Sticky Scroll"),
			},
			precondition: ContextKeyExpr.and(ContextKeyExpr.has('config.editor.stickyScroll.enabled'), EditorContextKeys.stickyScrollVisible),
			menu: [
				{ id: MenuId.CommandPalette },
			]
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		StickyScrollController.get(editor)?.focus();
	}
}

export class SelectNextStickyScrollLine extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.action.selectNextStickyScrollLine',
			title: localize2('selectNextStickyScrollLine.title', "Select the next editor sticky scroll line"),
			precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
			keybinding: {
				weight,
				primary: KeyCode.DownArrow
			}
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		StickyScrollController.get(editor)?.focusNext();
	}
}

export class SelectPreviousStickyScrollLine extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.action.selectPreviousStickyScrollLine',
			title: localize2('selectPreviousStickyScrollLine.title', "Select the previous sticky scroll line"),
			precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
			keybinding: {
				weight,
				primary: KeyCode.UpArrow
			}
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		StickyScrollController.get(editor)?.focusPrevious();
	}
}

export class GoToStickyScrollLine extends EditorAction2 {
	constructor() {
		super({
			id: 'editor.action.goToFocusedStickyScrollLine',
			title: localize2('goToFocusedStickyScrollLine.title', "Go to the focused sticky scroll line"),
			precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
			keybinding: {
				weight,
				primary: KeyCode.Enter
			}
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		StickyScrollController.get(editor)?.goToFocused();
	}
}

export class SelectEditor extends EditorAction2 {

	constructor() {
		super({
			id: 'editor.action.selectEditor',
			title: localize2('selectEditor.title', "Select Editor"),
			precondition: EditorContextKeys.stickyScrollFocused.isEqualTo(true),
			keybinding: {
				weight,
				primary: KeyCode.Escape
			}
		});
	}

	runEditorCommand(_accessor: ServicesAccessor, editor: ICodeEditor) {
		StickyScrollController.get(editor)?.selectEditor();
	}
}
