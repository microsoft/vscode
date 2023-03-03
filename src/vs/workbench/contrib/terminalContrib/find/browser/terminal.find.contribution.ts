/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { findInFilesCommand, IFindInFilesArgs } from 'vs/workbench/contrib/search/browser/searchActionsFind';
import { TerminalFindWidget } from 'vs/workbench/contrib/terminalContrib/find/browser/terminalFindWidget';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { terminalStrings } from 'vs/workbench/contrib/terminal/common/terminalStrings';

const findWidgets: Map<ITerminalInstance, TerminalFindWidget> = new Map();

function getFindWidget(instance: ITerminalInstance | undefined, accessor: ServicesAccessor): TerminalFindWidget | undefined {
	if (instance === undefined) {
		return undefined;
	}
	let result = findWidgets.get(instance);
	if (!result) {
		const terminalService = accessor.get(ITerminalService);
		const widget = accessor.get(IInstantiationService).createInstance(TerminalFindWidget, instance);

		// Track focus and set state so we can force the scroll bar to be visible
		let focusState = false;
		widget.focusTracker.onDidFocus(() => {
			focusState = true;
			instance.forceScrollbarVisibility();
			terminalService.setActiveInstance(instance);
		});
		widget.focusTracker.onDidBlur(() => {
			focusState = false;
			instance.resetScrollbarVisibility();
		});

		// Attach the find widget and listen for layout
		instance.registerChildElement({
			element: widget.getDomNode(),
			layout: dimension => widget.layout(dimension.width),
			xtermReady: xterm => {
				xterm.onDidChangeFindResults(() => widget.updateResultCount());
			}
		});

		// Cache the widget while the instance exists, dispose it when the terminal is disposed
		instance.onDisposed(e => {
			const focusTerminal = focusState;
			widget?.dispose();
			findWidgets.delete(e);
			if (focusTerminal) {
				instance.focus();
			}
		});

		findWidgets.set(instance, widget);
		result = widget;
	}
	return result;
}

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
		getFindWidget(accessor.get(ITerminalService).activeInstance, accessor)?.reveal();
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
		getFindWidget(accessor.get(ITerminalService).activeInstance, accessor)?.hide();
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
		const state = getFindWidget(accessor.get(ITerminalService).activeInstance, accessor)?.state;
		if (state) {
			state.change({ matchCase: !state.isRegex }, false);
		}
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
		const state = getFindWidget(accessor.get(ITerminalService).activeInstance, accessor)?.state;
		if (state) {
			state.change({ matchCase: !state.wholeWord }, false);
		}
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
		const state = getFindWidget(accessor.get(ITerminalService).activeInstance, accessor)?.state;
		if (state) {
			state.change({ matchCase: !state.matchCase }, false);
		}
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
		const widget = getFindWidget(accessor.get(ITerminalService).activeInstance, accessor);
		if (widget) {
			widget.show();
			widget.find(false);
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
		const widget = getFindWidget(accessor.get(ITerminalService).activeInstance, accessor);
		if (widget) {
			widget.show();
			widget.find(true);
		}
	}
});

// Global workspace file search
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: TerminalCommandId.SearchWorkspace,
			title: { value: localize('workbench.action.terminal.searchWorkspace', "Search Workspace"), original: 'Search Workspace' },
			f1: true,
			category,
			keybinding: [
				{
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
					when: ContextKeyExpr.and(TerminalContextKeys.processSupported, TerminalContextKeys.focus, TerminalContextKeys.textSelected),
					weight: KeybindingWeight.WorkbenchContrib + 50
				}
			],
			precondition: TerminalContextKeys.processSupported
		});
	}
	run(accessor: ServicesAccessor) {
		const query = accessor.get(ITerminalService).activeInstance?.selection;
		findInFilesCommand(accessor, { query } as IFindInFilesArgs);
	}
});
