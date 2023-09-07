/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IQuickPick, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { TerminalSettingId, terminalTabFocusModeContextKey } from 'vs/platform/terminal/common/terminal';
import { IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityHelpAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { TerminalAccessibleContentProvider } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/terminalAccessibilityHelp';
import { AccessibleBufferWidget, NavigationType } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/terminalAccessibleBuffer';
import { TextAreaSyncAddon } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/textAreaSyncAddon';
import type { Terminal } from 'xterm';


class TextAreaSyncContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.textAreaSync';
	static get(instance: ITerminalInstance): TextAreaSyncContribution | null {
		return instance.getContribution<TextAreaSyncContribution>(TextAreaSyncContribution.ID);
	}
	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
	}
	xtermReady(xterm: IXtermTerminal & { raw: Terminal }): void {
		const addon = this._instantiationService.createInstance(TextAreaSyncAddon, this._instance.capabilities);
		xterm.raw.loadAddon(addon);
		addon.activate(xterm.raw);
	}
}
registerTerminalContribution(TextAreaSyncContribution.ID, TextAreaSyncContribution);

class AccessibleBufferContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.accessible-buffer';
	private _xterm: IXtermTerminal & { raw: Terminal } | undefined;
	static get(instance: ITerminalInstance): AccessibleBufferContribution | null {
		return instance.getContribution<AccessibleBufferContribution>(AccessibleBufferContribution.ID);
	}
	private _accessibleBufferWidget: AccessibleBufferWidget | undefined;

	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();
		this.add(_instance.onDidRunText(() => {
			const focusAfterRun = configurationService.getValue(TerminalSettingId.FocusAfterRun);
			if (focusAfterRun === 'terminal') {
				_instance.focus(true);
			} else if (focusAfterRun === 'accessible-buffer') {
				this.show();
			}
		}));
	}
	layout(xterm: IXtermTerminal & { raw: Terminal }): void {
		this._xterm = xterm;
	}
	async show(): Promise<void> {
		if (!this._xterm) {
			return;
		}
		if (!this._accessibleBufferWidget) {
			this._accessibleBufferWidget = this.add(this._instantiationService.createInstance(AccessibleBufferWidget, this._instance, this._xterm));
		}
		await this._accessibleBufferWidget.show();
	}

	async createCommandQuickPick(): Promise<IQuickPick<IQuickPickItem> | undefined> {
		return this._accessibleBufferWidget?.createQuickPick();
	}

	navigateToCommand(type: NavigationType): void {
		return this._accessibleBufferWidget?.navigateToCommand(type);
	}
	hide(): void {
		this._accessibleBufferWidget?.hide();
	}
}
registerTerminalContribution(AccessibleBufferContribution.ID, AccessibleBufferContribution);

export class TerminalAccessibilityHelpContribution extends Disposable {
	static ID: 'terminalAccessibilityHelpContribution';
	constructor() {
		super();

		this._register(AccessibilityHelpAction.addImplementation(105, 'terminal', async accessor => {
			const instantiationService = accessor.get(IInstantiationService);
			const terminalService = accessor.get(ITerminalService);
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const instance = await terminalService.getActiveOrCreateInstance();
			await terminalService.revealActiveTerminal();
			const terminal = instance?.xterm;
			if (!terminal) {
				return;
			}
			accessibleViewService.show(instantiationService.createInstance(TerminalAccessibleContentProvider, instance, terminal));
		}, ContextKeyExpr.or(TerminalContextKeys.focus, TerminalContextKeys.accessibleBufferFocus)));
	}
}
registerTerminalContribution(TerminalAccessibilityHelpContribution.ID, TerminalAccessibilityHelpContribution);

registerTerminalAction({
	id: TerminalCommandId.FocusAccessibleBuffer,
	title: { value: localize('workbench.action.terminal.focusAccessibleBuffer', 'Focus Accessible Buffer'), original: 'Focus Accessible Buffer' },
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	keybinding: [
		{
			primary: KeyMod.Alt | KeyCode.F2,
			secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
			linux: {
				primary: KeyMod.Alt | KeyCode.F2 | KeyMod.Shift,
				secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
			},
			weight: KeybindingWeight.WorkbenchContrib,
			when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.focus, ContextKeyExpr.or(terminalTabFocusModeContextKey, TerminalContextKeys.accessibleBufferFocus.negate()))
		}
	],
	run: async (c) => {
		const instance = await c.service.getActiveOrCreateInstance();
		await c.service.revealActiveTerminal();
		if (!instance) {
			return;
		}
		await AccessibleBufferContribution.get(instance)?.show();
	}
});

registerTerminalAction({
	id: TerminalCommandId.NavigateAccessibleBuffer,
	title: { value: localize('workbench.action.terminal.navigateAccessibleBuffer', 'Navigate Accessible Buffer'), original: 'Navigate Accessible Buffer' },
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	keybinding: [
		{
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG,
			weight: KeybindingWeight.WorkbenchContrib + 2,
			when: TerminalContextKeys.accessibleBufferFocus
		}
	],
	run: async (c) => {
		const instance = await c.service.getActiveOrCreateInstance();
		await c.service.revealActiveTerminal();
		if (!instance) {
			return;
		}
		const quickPick = await AccessibleBufferContribution.get(instance)?.createCommandQuickPick();
		quickPick?.show();
	}
});

registerTerminalAction({
	id: TerminalCommandId.AccessibleBufferGoToNextCommand,
	title: { value: localize('workbench.action.terminal.accessibleBufferGoToNextCommand', 'Accessible Buffer Go to Next Command'), original: 'Accessible Buffer Go to Next Command' },
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated, TerminalContextKeys.accessibleBufferFocus),
	keybinding: [
		{
			primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
			when: ContextKeyExpr.and(TerminalContextKeys.accessibleBufferFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			weight: KeybindingWeight.WorkbenchContrib + 2
		},
		{
			primary: KeyMod.Alt | KeyCode.DownArrow,
			when: ContextKeyExpr.and(TerminalContextKeys.accessibleBufferFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
			weight: KeybindingWeight.WorkbenchContrib + 2
		}
	],
	run: async (c) => {
		const instance = await c.service.getActiveOrCreateInstance();
		await c.service.revealActiveTerminal();
		if (!instance) {
			return;
		}
		await AccessibleBufferContribution.get(instance)?.navigateToCommand(NavigationType.Next);
	}
});


registerTerminalAction({
	id: TerminalCommandId.AccessibleBufferGoToPreviousCommand,
	title: { value: localize('workbench.action.terminal.accessibleBufferGoToPreviousCommand', 'Accessible Buffer Go to Previous Command'), original: 'Accessible Buffer Go to Previous Command' },
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), TerminalContextKeys.accessibleBufferFocus),
	keybinding: [
		{
			primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
			when: ContextKeyExpr.and(TerminalContextKeys.accessibleBufferFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
			weight: KeybindingWeight.WorkbenchContrib + 2
		},
		{
			primary: KeyMod.Alt | KeyCode.UpArrow,
			when: ContextKeyExpr.and(TerminalContextKeys.accessibleBufferFocus, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
			weight: KeybindingWeight.WorkbenchContrib + 2
		}
	],
	run: async (c) => {
		const instance = await c.service.getActiveOrCreateInstance();
		await c.service.revealActiveTerminal();
		if (!instance) {
			return;
		}
		await AccessibleBufferContribution.get(instance)?.navigateToCommand(NavigationType.Previous);
	}
});
