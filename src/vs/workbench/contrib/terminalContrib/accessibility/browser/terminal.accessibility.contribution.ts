/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { localize2 } from '../../../../../nls.js';
import { AccessibleViewProviderId, IAccessibleViewService, NavigationType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ITerminalCommand, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ICurrentPartialCommand } from '../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { accessibleViewCurrentProviderId, accessibleViewIsShown } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityHelpAction, AccessibleViewAction } from '../../../accessibility/browser/accessibleViewActions.js';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution, type ITerminalContributionContext } from '../../../terminal/browser/terminalExtensions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalAccessibilityCommandId } from '../common/terminal.accessibility.js';
import { TerminalAccessibilitySettingId } from '../common/terminalAccessibilityConfiguration.js';
import { BufferContentTracker } from './bufferContentTracker.js';
import { TerminalAccessibilityHelpProvider } from './terminalAccessibilityHelp.js';
import { ICommandWithEditorLine, TerminalAccessibleBufferProvider } from './terminalAccessibleBufferProvider.js';
import { TextAreaSyncAddon } from './textAreaSyncAddon.js';

// #region Terminal Contributions

class TextAreaSyncContribution extends DisposableStore implements ITerminalContribution {
	static readonly ID = 'terminal.textAreaSync';
	static get(instance: ITerminalInstance): TextAreaSyncContribution | null {
		return instance.getContribution<TextAreaSyncContribution>(TextAreaSyncContribution.ID);
	}
	private _addon: TextAreaSyncAddon | undefined;
	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
	}
	layout(xterm: IXtermTerminal & { raw: Terminal }): void {
		if (this._addon) {
			return;
		}
		this._addon = this.add(this._instantiationService.createInstance(TextAreaSyncAddon, this._ctx.instance.capabilities));
		xterm.raw.loadAddon(this._addon);
		this._addon.activate(xterm.raw);
	}
}
registerTerminalContribution(TextAreaSyncContribution.ID, TextAreaSyncContribution);

export class TerminalAccessibleViewContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.accessibleBufferProvider';
	static get(instance: ITerminalInstance): TerminalAccessibleViewContribution | null {
		return instance.getContribution<TerminalAccessibleViewContribution>(TerminalAccessibleViewContribution.ID);
	}
	private _bufferTracker: BufferContentTracker | undefined;
	private _bufferProvider: TerminalAccessibleBufferProvider | undefined;
	private _xterm: Pick<IXtermTerminal, 'shellIntegration' | 'getFont'> & { raw: Terminal } | undefined;
	private readonly _onDidRunCommand: MutableDisposable<IDisposable> = new MutableDisposable();

	constructor(
		private readonly _ctx: ITerminalContributionContext,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
		this._register(AccessibleViewAction.addImplementation(90, 'terminal', () => {
			if (this._terminalService.activeInstance !== this._ctx.instance) {
				return false;
			}
			this.show();
			return true;
		}, TerminalContextKeys.focus));
		this._register(this._ctx.instance.onDidExecuteText(() => {
			const focusAfterRun = _configurationService.getValue(TerminalSettingId.FocusAfterRun);
			if (focusAfterRun === 'terminal') {
				this._ctx.instance.focus(true);
			} else if (focusAfterRun === 'accessible-buffer') {
				this.show();
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution)) {
				this._updateCommandExecutedListener();
			}
		}));
		this._register(this._ctx.instance.capabilities.onDidAddCapability(e => {
			if (e.capability.type === TerminalCapability.CommandDetection) {
				this._updateCommandExecutedListener();
			}
		}));
	}

	xtermReady(xterm: IXtermTerminal & { raw: Terminal }): void {
		const addon = this._instantiationService.createInstance(TextAreaSyncAddon, this._ctx.instance.capabilities);
		xterm.raw.loadAddon(addon);
		addon.activate(xterm.raw);
		this._xterm = xterm;
		this._register(this._xterm.raw.onWriteParsed(async () => {
			if (this._terminalService.activeInstance !== this._ctx.instance) {
				return;
			}
			if (this._isTerminalAccessibleViewOpen() && this._xterm!.raw.buffer.active.baseY === 0) {
				this.show();
			}
		}));

		const onRequestUpdateEditor = Event.latch(this._xterm.raw.onScroll);
		this._register(onRequestUpdateEditor(() => {
			if (this._terminalService.activeInstance !== this._ctx.instance) {
				return;
			}
			if (this._isTerminalAccessibleViewOpen()) {
				this.show();
			}
		}));
	}

	private _updateCommandExecutedListener(): void {
		if (!this._ctx.instance.capabilities.has(TerminalCapability.CommandDetection)) {
			return;
		}
		if (!this._configurationService.getValue(TerminalAccessibilitySettingId.AccessibleViewFocusOnCommandExecution)) {
			this._onDidRunCommand.clear();
			return;
		} else if (this._onDidRunCommand.value) {
			return;
		}

		const capability = this._ctx.instance.capabilities.get(TerminalCapability.CommandDetection)!;
		this._onDidRunCommand.value = this._register(capability.onCommandExecuted(() => {
			if (this._ctx.instance.hasFocus) {
				this.show();
			}
		}));
	}

	private _isTerminalAccessibleViewOpen(): boolean {
		return accessibleViewCurrentProviderId.getValue(this._contextKeyService) === AccessibleViewProviderId.Terminal;
	}

	show(): void {
		if (!this._xterm) {
			return;
		}
		if (!this._bufferTracker) {
			this._bufferTracker = this._register(this._instantiationService.createInstance(BufferContentTracker, this._xterm));
		}
		if (!this._bufferProvider) {
			this._bufferProvider = this._register(this._instantiationService.createInstance(TerminalAccessibleBufferProvider, this._ctx.instance, this._bufferTracker, () => {
				return this._register(this._instantiationService.createInstance(TerminalAccessibilityHelpProvider, this._ctx.instance, this._xterm!)).provideContent();
			}));
		}
		const position = this._configurationService.getValue(TerminalAccessibilitySettingId.AccessibleViewPreserveCursorPosition) ? this._accessibleViewService.getPosition(AccessibleViewProviderId.Terminal) : undefined;
		this._accessibleViewService.show(this._bufferProvider, position);
	}
	navigateToCommand(type: NavigationType): void {
		const currentLine = this._accessibleViewService.getPosition(AccessibleViewProviderId.Terminal)?.lineNumber;
		const commands = this._getCommandsWithEditorLine();
		if (!commands?.length || !currentLine) {
			return;
		}

		const filteredCommands = type === NavigationType.Previous ? commands.filter(c => c.lineNumber < currentLine).sort((a, b) => b.lineNumber - a.lineNumber) : commands.filter(c => c.lineNumber > currentLine).sort((a, b) => a.lineNumber - b.lineNumber);
		if (!filteredCommands.length) {
			return;
		}
		const command = filteredCommands[0];
		const commandLine = command.command.command;
		if (!isWindows && commandLine) {
			this._accessibleViewService.setPosition(new Position(command.lineNumber, 1), true);
			alert(commandLine);
		} else {
			this._accessibleViewService.setPosition(new Position(command.lineNumber, 1), true, true);
		}

		if (command.exitCode) {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandFailed);
		} else {
			this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandSucceeded);
		}
	}

	private _getCommandsWithEditorLine(): ICommandWithEditorLine[] | undefined {
		const capability = this._ctx.instance.capabilities.get(TerminalCapability.CommandDetection);
		const commands = capability?.commands;
		const currentCommand = capability?.currentCommand;
		if (!commands?.length) {
			return;
		}
		const result: ICommandWithEditorLine[] = [];
		for (const command of commands) {
			const lineNumber = this._getEditorLineForCommand(command);
			if (!lineNumber) {
				continue;
			}
			result.push({ command, lineNumber, exitCode: command.exitCode });
		}
		if (currentCommand) {
			const lineNumber = this._getEditorLineForCommand(currentCommand);
			if (!!lineNumber) {
				result.push({ command: currentCommand, lineNumber });
			}
		}
		return result;
	}

	private _getEditorLineForCommand(command: ITerminalCommand | ICurrentPartialCommand): number | undefined {
		if (!this._bufferTracker) {
			return;
		}
		let line: number | undefined;
		if ('marker' in command) {
			line = command.marker?.line;
		} else if ('commandStartMarker' in command) {
			line = command.commandStartMarker?.line;
		}
		if (line === undefined || line < 0) {
			return;
		}
		line = this._bufferTracker.bufferToEditorLineMapping.get(line);
		if (line === undefined) {
			return;
		}
		return line + 1;
	}

}
registerTerminalContribution(TerminalAccessibleViewContribution.ID, TerminalAccessibleViewContribution);

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
			accessibleViewService.show(instantiationService.createInstance(TerminalAccessibilityHelpProvider, instance, terminal));
		}, ContextKeyExpr.or(TerminalContextKeys.focus, ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal)))));
	}
}
registerTerminalContribution(TerminalAccessibilityHelpContribution.ID, TerminalAccessibilityHelpContribution);

// #endregion

// #region Actions

class FocusAccessibleBufferAction extends Action2 {
	constructor() {
		super({
			id: TerminalAccessibilityCommandId.FocusAccessibleBuffer,
			title: localize2('workbench.action.terminal.focusAccessibleBuffer', "Focus Accessible Terminal View"),
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
					when: ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, TerminalContextKeys.focus)
				}
			]
		});
	}
	override async run(accessor: ServicesAccessor, ...args: any[]): Promise<void> {
		const terminalService = accessor.get(ITerminalService);
		const terminal = await terminalService.getActiveOrCreateInstance();
		if (!terminal?.xterm) {
			return;
		}
		TerminalAccessibleViewContribution.get(terminal)?.show();
	}
}
registerAction2(FocusAccessibleBufferAction);

registerTerminalAction({
	id: TerminalAccessibilityCommandId.AccessibleBufferGoToNextCommand,
	title: localize2('workbench.action.terminal.accessibleBufferGoToNextCommand', "Accessible Buffer Go to Next Command"),
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated, ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
	keybinding: [
		{
			primary: KeyMod.Alt | KeyCode.DownArrow,
			when: ContextKeyExpr.and(ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
			weight: KeybindingWeight.WorkbenchContrib + 2
		}
	],
	run: async (c) => {
		const instance = c.service.activeInstance;
		if (!instance) {
			return;
		}
		TerminalAccessibleViewContribution.get(instance)?.navigateToCommand(NavigationType.Next);
	}
});

registerTerminalAction({
	id: TerminalAccessibilityCommandId.AccessibleBufferGoToPreviousCommand,
	title: localize2('workbench.action.terminal.accessibleBufferGoToPreviousCommand', "Accessible Buffer Go to Previous Command"),
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
	keybinding: [
		{
			primary: KeyMod.Alt | KeyCode.UpArrow,
			when: ContextKeyExpr.and(ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
			weight: KeybindingWeight.WorkbenchContrib + 2
		}
	],
	run: async (c) => {
		const instance = c.service.activeInstance;
		if (!instance) {
			return;
		}
		TerminalAccessibleViewContribution.get(instance)?.navigateToCommand(NavigationType.Previous);
	}
});

registerTerminalAction({
	id: TerminalAccessibilityCommandId.ScrollToBottomAccessibleView,
	title: localize2('workbench.action.terminal.scrollToBottomAccessibleView', 'Scroll to Accessible View Bottom'),
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.End,
		linux: { primary: KeyMod.Shift | KeyCode.End },
		when: accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal),
		weight: KeybindingWeight.WorkbenchContrib
	},
	run: (c, accessor) => {
		const accessibleViewService = accessor.get(IAccessibleViewService);
		const lastPosition = accessibleViewService.getLastPosition();
		if (!lastPosition) {
			return;
		}
		accessibleViewService.setPosition(lastPosition, true);
	}
});

registerTerminalAction({
	id: TerminalAccessibilityCommandId.ScrollToTopAccessibleView,
	title: localize2('workbench.action.terminal.scrollToTopAccessibleView', 'Scroll to Accessible View Top'),
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.Home,
		linux: { primary: KeyMod.Shift | KeyCode.Home },
		when: accessibleViewCurrentProviderId.isEqualTo(AccessibleViewProviderId.Terminal),
		weight: KeybindingWeight.WorkbenchContrib
	},
	run: (c, accessor) => accessor.get(IAccessibleViewService)?.setPosition(new Position(1, 1), true)
});

// #endregion
