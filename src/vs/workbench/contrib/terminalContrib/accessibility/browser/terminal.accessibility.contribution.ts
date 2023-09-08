/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/model';
import { localize } from 'vs/nls';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from 'vs/platform/accessibility/common/accessibility';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ICurrentPartialCommand } from 'vs/platform/terminal/common/capabilities/commandDetectionCapability';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId, accessibleViewCurrentProviderId, accessibleViewIsShown } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { AccessibleViewType, IAccessibleContentProvider, IAccessibleViewOptions, IAccessibleViewService, IAccessibleViewSymbol, NavigationType } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibilityHelpAction, AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { ITerminalContribution, ITerminalInstance, ITerminalService, IXtermTerminal } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerTerminalAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalWidgetManager } from 'vs/workbench/contrib/terminal/browser/widgets/widgetManager';
import { ITerminalProcessManager, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { BufferContentTracker } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/bufferContentTracker';
import { TerminalAccessibleContentProvider } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/terminalAccessibilityHelp';
import { TextAreaSyncAddon } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/textAreaSyncAddon';
import type { Terminal } from 'xterm';
import { Position } from 'vs/editor/common/core/position';

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


export class TerminalAccessibleBufferProvider extends DisposableStore implements IAccessibleContentProvider {
	options: IAccessibleViewOptions = { type: AccessibleViewType.View };
	verbositySettingKey = AccessibilityVerbositySettingId.Terminal;
	private _xterm: IXtermTerminal & { raw: Terminal } | undefined;
	constructor(
		private readonly _instance: Pick<ITerminalInstance, 'onDidRunText' | 'focus' | 'shellType' | 'capabilities' | 'onDidRequestFocus' | 'resource'>,
		private _bufferTracker: BufferContentTracker,
		@IModelService _modelService: IModelService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@ITerminalService _terminalService: ITerminalService,
		@IConfigurationService configurationService: IConfigurationService,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService
	) {
		super();
		this.add(_instance.onDidRunText(() => {
			const focusAfterRun = configurationService.getValue(TerminalSettingId.FocusAfterRun);
			if (focusAfterRun === 'terminal') {
				_instance.focus(true);
			} else if (focusAfterRun === 'accessible-buffer') {
				_accessibleViewService.show(this);
			}
		}));
		this.registerListeners();
	}

	onClose() {
		this._instance.focus();
	}
	registerListeners(): void {
		if (!this._xterm) {
			return;
		}
		this._xterm.raw.onWriteParsed(async () => {
			if (this._xterm!.raw.buffer.active.baseY === 0) {
				this.provideContent();
				this._accessibleViewService.show(this);
			}
		});
		const onRequestUpdateEditor = Event.latch(this._xterm.raw.onScroll);
		this.add(onRequestUpdateEditor(() => this._accessibleViewService.show(this)));
	}

	provideContent(): string {
		this._bufferTracker.update();
		return this._bufferTracker.lines.join('\n');
	}

	getSymbols(): IAccessibleViewSymbol[] {
		const commands = this._getCommandsWithEditorLine() ?? [];
		const symbols: IAccessibleViewSymbol[] = [];
		for (const command of commands) {
			const label = command.command.command;
			if (label) {
				symbols.push({
					label,
					lineNumber: command.lineNumber
				});
			}
		}
		return symbols;
	}

	private _getCommandsWithEditorLine(): ICommandWithEditorLine[] | undefined {
		const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
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
			result.push({ command, lineNumber });
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
interface ICommandWithEditorLine { command: ITerminalCommand | ICurrentPartialCommand; lineNumber: number }


export class TerminalAccessibleViewContribution extends Disposable implements ITerminalContribution {
	static readonly ID = 'terminal.accessibleBufferProvider';
	static get(instance: ITerminalInstance): TerminalAccessibleViewContribution | null {
		return instance.getContribution<TerminalAccessibleViewContribution>(TerminalAccessibleViewContribution.ID);
	}
	private _bufferTracker: BufferContentTracker | undefined;
	private _xterm: Pick<IXtermTerminal, 'shellIntegration' | 'getFont'> & { raw: Terminal } | undefined;
	constructor(
		private readonly _instance: ITerminalInstance,
		processManager: ITerminalProcessManager,
		widgetManager: TerminalWidgetManager,
		@IAccessibleViewService private readonly _accessibleViewService: IAccessibleViewService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
		this._register(AccessibleViewAction.addImplementation(90, 'terminal', () => {
			if (this._terminalService.activeInstance !== this._instance) {
				return false;
			}
			this.show();
			return true;
		}, TerminalContextKeys.focus));
	}
	xtermReady(xterm: IXtermTerminal & { raw: Terminal }): void {
		const addon = this._instantiationService.createInstance(TextAreaSyncAddon, this._instance.capabilities);
		xterm.raw.loadAddon(addon);
		addon.activate(xterm.raw);
		this._xterm = xterm;
	}
	show(): void {
		if (!this._xterm) {
			return;
		}
		if (!this._bufferTracker) {
			this._bufferTracker = this._instantiationService.createInstance(BufferContentTracker, this._xterm);
		}
		this._accessibleViewService.show(this._instantiationService.createInstance(TerminalAccessibleBufferProvider, this._instance, this._bufferTracker));
		// wait for the render to happen so that the line count is correct and
		// the cursor is at the bottom of the buffer
		setTimeout(() => {
			const lastPosition = this._accessibleViewService.getLastPosition();
			if (lastPosition) {
				this._accessibleViewService.setPosition(lastPosition, true);
			}
		}, 50);
	}
	navigateToCommand(type: NavigationType): void {
		const currentLine = this._accessibleViewService.getPosition()?.lineNumber || this._accessibleViewService.getLastPosition()?.lineNumber;
		const commands = this._getCommandsWithEditorLine();
		if (!commands?.length || !currentLine) {
			return;
		}

		const filteredCommands = type === NavigationType.Previous ? commands.filter(c => c.lineNumber < currentLine).sort((a, b) => b.lineNumber - a.lineNumber) : commands.filter(c => c.lineNumber > currentLine).sort((a, b) => a.lineNumber - b.lineNumber);
		if (!filteredCommands.length) {
			return;
		}
		this._accessibleViewService.setPosition(new Position(filteredCommands[0].lineNumber, 1), true);
	}

	private _getCommandsWithEditorLine(): ICommandWithEditorLine[] | undefined {
		const capability = this._instance.capabilities.get(TerminalCapability.CommandDetection);
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
			result.push({ command, lineNumber });
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
			accessibleViewService.show(instantiationService.createInstance(TerminalAccessibleContentProvider, instance, terminal));
		}, ContextKeyExpr.or(TerminalContextKeys.focus, ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal)))));
	}
}
registerTerminalContribution(TerminalAccessibilityHelpContribution.ID, TerminalAccessibilityHelpContribution);


class FocusAccessibleBufferAction extends Action2 {
	constructor() {
		super({
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
	id: TerminalCommandId.AccessibleBufferGoToNextCommand,
	title: { value: localize('workbench.action.terminal.accessibleBufferGoToNextCommand', 'Accessible Buffer Go to Next Command'), original: 'Accessible Buffer Go to Next Command' },
	precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated, ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
	keybinding: [
		{
			primary: KeyMod.Alt | KeyCode.DownArrow,
			when: ContextKeyExpr.and(ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
			weight: KeybindingWeight.WorkbenchContrib + 2
		}
	],
	run: async (c) => {
		const instance = await c.service.getActiveOrCreateInstance();
		await c.service.revealActiveTerminal();
		if (!instance) {
			return;
		}
		await TerminalAccessibleViewContribution.get(instance)?.navigateToCommand(NavigationType.Next);
	}
});


registerTerminalAction({
	id: TerminalCommandId.AccessibleBufferGoToPreviousCommand,
	title: { value: localize('workbench.action.terminal.accessibleBufferGoToPreviousCommand', 'Accessible Buffer Go to Previous Command'), original: 'Accessible Buffer Go to Previous Command' },
	precondition: ContextKeyExpr.and(ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated), ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
	keybinding: [
		{
			primary: KeyMod.Alt | KeyCode.UpArrow,
			when: ContextKeyExpr.and(ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, AccessibleViewProviderId.Terminal))),
			weight: KeybindingWeight.WorkbenchContrib + 2
		}
	],
	run: async (c) => {
		const instance = await c.service.getActiveOrCreateInstance();
		await c.service.revealActiveTerminal();
		if (!instance) {
			return;
		}
		await TerminalAccessibleViewContribution.get(instance)?.navigateToCommand(NavigationType.Previous);
	}
});
