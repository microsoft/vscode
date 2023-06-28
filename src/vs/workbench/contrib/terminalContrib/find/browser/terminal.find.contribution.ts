/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDimension } from 'vs/base/browser/dom';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { findInFilesCommand } from 'vs/workbench/contrib/search/browser/searchActionsFind';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveInstanceAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { TerminalFindWidget } from 'vs/workbench/contrib/terminalContrib/find/browser/terminalFindWidget';
import { Terminal as RawXtermTerminal } from 'xterm';

class TerminalFindContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.find';

	static get(instance: ITerminalInstance): TerminalFindContribution | null {
		return instance.getContribution<TerminalFindContribution>(TerminalFindContribution.ID);
	}

	private _findWidget: Lazy<TerminalFindWidget>;
	private _lastLayoutDimensions: IDimension | undefined;

	get findWidget(): TerminalFindWidget { return this._findWidget.value; }

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITerminalService terminalService: ITerminalService
	) {
		super();

		this._findWidget = new Lazy(() => {
			const findWidget = instantiationService.createInstance(TerminalFindWidget, this._instance);

			// Track focus and set state so we can force the scroll bar to be visible
			findWidget.focusTracker.onDidFocus(() => {
				this._instance.forceScrollbarVisibility();
				terminalService.setActiveInstance(this._instance);
			});
			findWidget.focusTracker.onDidBlur(() => {
				this._instance.resetScrollbarVisibility();
			});

			this._instance.domElement.appendChild(findWidget.getDomNode());
			if (this._lastLayoutDimensions) {
				findWidget.layout(this._lastLayoutDimensions.width);
			}

			return findWidget;
		});
	}

	layout(xterm: IXtermTerminal & { raw: RawXtermTerminal }, dimension: IDimension): void {
		this._lastLayoutDimensions = dimension;
		this._findWidget.rawValue?.layout(dimension.width);
	}

	xtermReady(xterm: IXtermTerminal & { raw: RawXtermTerminal }): void {
		this._register(xterm.onDidChangeFindResults(() => this._findWidget.rawValue?.updateResultCount()));
	}

	override dispose() {
		super.dispose();
		this._findWidget.rawValue?.dispose();
	}

}
registerTerminalContribution(TerminalFindContribution.ID, TerminalFindContribution);

registerActiveInstanceAction({
	id: TerminalCommandId.FindFocus,
	title: { value: localize('workbench.action.terminal.focusFind', "Focus Find"), original: 'Focus Find' },
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.KeyF,
		when: ContextKeyExpr.or(TerminalContextKeys.findFocus, TerminalContextKeys.focus),
		weight: KeybindingWeight.WorkbenchContrib
	},
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	run: (activeInstance) => {
		TerminalFindContribution.get(activeInstance)?.findWidget.reveal();
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
	run: (activeInstance) => {
		TerminalFindContribution.get(activeInstance)?.findWidget.hide();
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
	run: (activeInstance) => {
		const state = TerminalFindContribution.get(activeInstance)?.findWidget.state;
		state?.change({ matchCase: !state.isRegex }, false);
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
	run: (activeInstance) => {
		const state = TerminalFindContribution.get(activeInstance)?.findWidget.state;
		state?.change({ matchCase: !state.wholeWord }, false);
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
	run: (activeInstance) => {
		const state = TerminalFindContribution.get(activeInstance)?.findWidget.state;
		state?.change({ matchCase: !state.matchCase }, false);
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
	run: (activeInstance) => {
		const widget = TerminalFindContribution.get(activeInstance)?.findWidget;
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
	run: (activeInstance) => {
		const widget = TerminalFindContribution.get(activeInstance)?.findWidget;
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
