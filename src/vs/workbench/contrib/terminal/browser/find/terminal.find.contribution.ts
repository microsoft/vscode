/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';

const category = terminalStrings.actionCategory;

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.FindFocus,
			title: { value: localize('workbench.action.terminal.focusFind', "Focus Find"), original: 'Focus Find' },
			f1: true,
			category,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyCode.KeyF,
				when: ContextKeyExpr.or(TerminalContextKeys.findFocus, TerminalContextKeys.focus),
				weight: KeybindingWeight.WorkbenchContrib
			},
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(ITerminalService).activeInstance?.findWidget.value.reveal();
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.FindHide,
			title: { value: localize('workbench.action.terminal.hideFind', "Hide Find"), original: 'Hide Find' },
			f1: true,
			category,
			keybinding: {
				primary: KeyCode.Escape,
				secondary: [KeyMod.Shift | KeyCode.Escape],
				when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.findVisible),
				weight: KeybindingWeight.WorkbenchContrib
			},
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
		});
	}
	run(accessor: ServicesAccessor) {
		accessor.get(ITerminalService).activeInstance?.findWidget.value.hide();
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.ToggleFindRegex,
			title: { value: localize('workbench.action.terminal.toggleFindRegex', "Toggle Find Using Regex"), original: 'Toggle Find Using Regex' },
			f1: true,
			category,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.KeyR,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR },
				when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
				weight: KeybindingWeight.WorkbenchContrib
			},
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
		});
	}
	run(accessor: ServicesAccessor) {
		const terminalService = accessor.get(ITerminalService);
		const state = terminalService.activeInstance?.findWidget.value.findState;
		state?.change({ isRegex: !state.isRegex }, false);
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.ToggleFindWholeWord,
			title: { value: localize('workbench.action.terminal.toggleFindWholeWord', "Toggle Find Using Whole Word"), original: 'Toggle Find Using Whole Word' },
			f1: true,
			category,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.KeyW,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyW },
				when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
				weight: KeybindingWeight.WorkbenchContrib
			},
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
		});
	}
	run(accessor: ServicesAccessor) {
		const terminalService = accessor.get(ITerminalService);
		const state = terminalService.activeInstance?.findWidget.value.findState;
		state?.change({ wholeWord: !state.wholeWord }, false);
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.ToggleFindCaseSensitive,
			title: { value: localize('workbench.action.terminal.toggleFindCaseSensitive', "Toggle Find Using Case Sensitive"), original: 'Toggle Find Using Case Sensitive' },
			f1: true,
			category,
			keybinding: {
				primary: KeyMod.Alt | KeyCode.KeyC,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC },
				when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
				weight: KeybindingWeight.WorkbenchContrib
			},
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
		});
	}
	run(accessor: ServicesAccessor) {
		const terminalService = accessor.get(ITerminalService);
		const state = terminalService.activeInstance?.findWidget.value.findState;
		state?.change({ matchCase: !state.matchCase }, false);
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.FindNext,
			title: { value: localize('workbench.action.terminal.findNext', "Find Next"), original: 'Find Next' },
			f1: true,
			category,
			keybinding: [
				{
					primary: KeyCode.F3,
					mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG, secondary: [KeyCode.F3] },
					when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
					weight: KeybindingWeight.WorkbenchContrib
				},
				{
					primary: KeyMod.Shift | KeyCode.Enter,
					when: TerminalContextKeys.findInputFocus,
					weight: KeybindingWeight.WorkbenchContrib
				}
			],
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
		});
	}
	run(accessor: ServicesAccessor) {
		const terminalService = accessor.get(ITerminalService);
		const findWidget = terminalService.activeInstance?.findWidget.value;
		if (findWidget) {
			findWidget.show();
			findWidget.find(false);
		}
	}
});
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.FindPrevious,
			title: { value: localize('workbench.action.terminal.findPrevious', "Find Previous"), original: 'Find Previous' },
			f1: true,
			category,
			keybinding: [
				{
					primary: KeyMod.Shift | KeyCode.F3,
					mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG, secondary: [KeyMod.Shift | KeyCode.F3] },
					when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
					weight: KeybindingWeight.WorkbenchContrib
				},
				{
					primary: KeyCode.Enter,
					when: TerminalContextKeys.findInputFocus,
					weight: KeybindingWeight.WorkbenchContrib
				}
			],
			precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated)
		});
	}
	run(accessor: ServicesAccessor) {
		const terminalService = accessor.get(ITerminalService);
		const findWidget = terminalService.activeInstance?.findWidget.value;
		if (findWidget) {
			findWidget.show();
			findWidget.find(true);
		}
	}
});
