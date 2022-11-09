/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { CodeActionWidget } from 'vs/editor/contrib/codeAction/browser/codeActionWidget';
import { TerminalQuickFixWidget } from 'vs/workbench/contrib/terminal/browser/widgets/terminalQuickFixWidget';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

const weight = KeybindingWeight.EditorContrib + 1000;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'hideCodeActionWidget',
			title: {
				value: localize('hideCodeActionWidget.title', "Hide code action widget"),
				original: 'Hide code action widget'
			},
			keybinding: {
				weight,
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape]
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const terminalFocused = accessor.get(IContextKeyService).getContextKeyValue('terminalFocusContextKey');
		if (!terminalFocused && CodeActionWidget.INSTANCE?.isVisible) {
			CodeActionWidget.INSTANCE?.hide();
		} else if (terminalFocused && TerminalQuickFixWidget.INSTANCE?.isVisible) {
			TerminalQuickFixWidget.INSTANCE.hide();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'selectPrevCodeAction',
			title: {
				value: localize('selectPrevCodeAction.title', "Select previous code action"),
				original: 'Select previous code action'
			},
			keybinding: {
				weight,
				primary: KeyCode.UpArrow,
				secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
				mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] },
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const terminalFocused = accessor.get(IContextKeyService).getContextKeyValue('terminalFocusContextKey');
		if (!terminalFocused && CodeActionWidget.INSTANCE?.isVisible) {
			CodeActionWidget.INSTANCE?.focusPrevious();
		} else if (terminalFocused && TerminalQuickFixWidget.INSTANCE?.isVisible) {
			TerminalQuickFixWidget.INSTANCE.focusPrevious();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'selectNextCodeAction',
			title: {
				value: localize('selectNextCodeAction.title', "Select next code action"),
				original: 'Select next code action'
			},
			keybinding: {
				weight,
				primary: KeyCode.DownArrow,
				secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
				mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const terminalFocused = accessor.get(IContextKeyService).getContextKeyValue('terminalFocusContextKey');
		if (!terminalFocused && CodeActionWidget.INSTANCE?.isVisible) {
			CodeActionWidget.INSTANCE?.focusNext();
		} else if (terminalFocused && TerminalQuickFixWidget.INSTANCE?.isVisible) {
			TerminalQuickFixWidget.INSTANCE.focusNext();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'acceptSelectedAction',
			title: {
				value: localize('acceptSelected.title', "Accept selected code action"),
				original: 'Accept selected code action'
			},
			keybinding: {
				weight,
				primary: KeyCode.Enter,
				secondary: [KeyMod.CtrlCmd | KeyCode.Period],
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const terminalFocused = accessor.get(IContextKeyService).getContextKeyValue('terminalFocusContextKey');
		if (!terminalFocused && CodeActionWidget.INSTANCE?.isVisible) {
			CodeActionWidget.INSTANCE?.acceptSelected();
		} else if (terminalFocused && TerminalQuickFixWidget.INSTANCE?.isVisible) {
			TerminalQuickFixWidget.INSTANCE.acceptSelected();
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'previewSelectedAction',
			title: {
				value: localize('previewSelected.title', "Preview selected code action"),
				original: 'Preview selected code action'
			},
			keybinding: {
				weight,
				primary: KeyMod.CtrlCmd | KeyCode.Enter,
			}
		});
	}

	run(accessor: ServicesAccessor): void {
		const terminalFocused = accessor.get(IContextKeyService).getContextKeyValue('terminalFocusContextKey');
		if (!terminalFocused && CodeActionWidget.INSTANCE?.isVisible) {
			CodeActionWidget.INSTANCE?.acceptSelected(true);
		} else if (terminalFocused && TerminalQuickFixWidget.INSTANCE?.isVisible) {
			TerminalQuickFixWidget.INSTANCE.acceptSelected(true);
		}
	}
});

