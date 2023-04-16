/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize } from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { findInFilesCommand } from 'vs/workbench/contrib/search/browser/searchActionsFind';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveInstanceAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { TerminalFindWidget } from 'vs/workbench/contrib/terminalContrib/find/browser/terminalFindWidget';

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

registerActiveInstanceAction({
	id: TerminalCommandId.FindFocus,
	title: { value: localize('workbench.action.terminal.focusFind', "Focus Find"), original: 'Focus Find' },
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.KeyF,
		when: ContextKeyExpr.or(TerminalContextKeys.findFocus, TerminalContextKeys.focus),
		weight: KeybindingWeight.WorkbenchContrib
	},
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (activeInstance, c, accessor) => {
		getFindWidget(activeInstance, accessor)?.reveal();
	}
});

registerActiveInstanceAction({
	id: TerminalCommandId.FindHide,
	title: { value: localize('workbench.action.terminal.hideFind', "Hide Find"), original: 'Hide Find' },
	keybinding: {
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape],
		when: ContextKeyExpr.and(TerminalContextKeys.focus, TerminalContextKeys.findVisible),
		weight: KeybindingWeight.WorkbenchContrib
	},
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (activeInstance, c, accessor) => {
		getFindWidget(activeInstance, accessor)?.hide();
	}
});

registerActiveInstanceAction({
	id: TerminalCommandId.ToggleFindRegex,
	title: { value: localize('workbench.action.terminal.toggleFindRegex', "Toggle Find Using Regex"), original: 'Toggle Find Using Regex' },
	keybinding: {
		primary: KeyMod.Alt | KeyCode.KeyR,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR },
		when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
		weight: KeybindingWeight.WorkbenchContrib
	},
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (activeInstance, c, accessor) => {
		const state = getFindWidget(activeInstance, accessor)?.state;
		if (state) {
			state.change({ matchCase: !state.isRegex }, false);
		}
	}
});

registerActiveInstanceAction({
	id: TerminalCommandId.ToggleFindWholeWord,
	title: { value: localize('workbench.action.terminal.toggleFindWholeWord', "Toggle Find Using Whole Word"), original: 'Toggle Find Using Whole Word' },
	keybinding: {
		primary: KeyMod.Alt | KeyCode.KeyW,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyW },
		when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
		weight: KeybindingWeight.WorkbenchContrib
	},
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (activeInstance, c, accessor) => {
		const state = getFindWidget(activeInstance, accessor)?.state;
		if (state) {
			state.change({ matchCase: !state.wholeWord }, false);
		}
	}
});

registerActiveInstanceAction({
	id: TerminalCommandId.ToggleFindCaseSensitive,
	title: { value: localize('workbench.action.terminal.toggleFindCaseSensitive', "Toggle Find Using Case Sensitive"), original: 'Toggle Find Using Case Sensitive' },
	keybinding: {
		primary: KeyMod.Alt | KeyCode.KeyC,
		mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyC },
		when: ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.findFocus),
		weight: KeybindingWeight.WorkbenchContrib
	},
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (activeInstance, c, accessor) => {
		const state = getFindWidget(activeInstance, accessor)?.state;
		if (state) {
			state.change({ matchCase: !state.matchCase }, false);
		}
	}
});

registerActiveInstanceAction({
	id: TerminalCommandId.FindNext,
	title: { value: localize('workbench.action.terminal.findNext', "Find Next"), original: 'Find Next' },
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
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (activeInstance, c, accessor) => {
		const widget = getFindWidget(activeInstance, accessor);
		if (widget) {
			widget.show();
			widget.find(false);
		}
	}
});

registerActiveInstanceAction({
	id: TerminalCommandId.FindPrevious,
	title: { value: localize('workbench.action.terminal.findPrevious', "Find Previous"), original: 'Find Previous' },
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
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (activeInstance, c, accessor) => {
		const widget = getFindWidget(activeInstance, accessor);
		if (widget) {
			widget.show();
			widget.find(true);
		}
	}
});

// Global workspace file search
registerActiveInstanceAction({
	id: TerminalCommandId.SearchWorkspace,
	title: { value: localize('workbench.action.terminal.searchWorkspace', "Search Workspace"), original: 'Search Workspace' },
	keybinding: [
		{
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF,
			when: ContextKeyExpr.and(TerminalContextKeys.processSupported, TerminalContextKeys.focus, TerminalContextKeys.textSelected),
			weight: KeybindingWeight.WorkbenchContrib + 50
		}
	],
	run: (activeInstance, c, accessor) => findInFilesCommand(accessor, { query: activeInstance.selection })
});
