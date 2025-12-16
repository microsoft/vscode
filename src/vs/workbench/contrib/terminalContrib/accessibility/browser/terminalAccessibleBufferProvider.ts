/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IAccessibleViewContentProvider, AccessibleViewProviderId, IAccessibleViewOptions, AccessibleViewType, IAccessibleViewSymbol } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TerminalCapability, ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ICurrentPartialCommand, isFullTerminalCommand } from '../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { BufferContentTracker } from './bufferContentTracker.js';
import { TerminalAccessibilitySettingId } from '../common/terminalAccessibilityConfiguration.js';

export class TerminalAccessibleBufferProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.Terminal;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.View, language: 'terminal', id: AccessibleViewProviderId.Terminal };
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Terminal;

	private _focusedInstance: ITerminalInstance | undefined;

	private readonly _onDidRequestClearProvider = new Emitter<AccessibleViewProviderId>();
	readonly onDidRequestClearLastProvider = this._onDidRequestClearProvider.event;

	constructor(
		private readonly _instance: Pick<ITerminalInstance, 'onDidExecuteText' | 'focus' | 'shellType' | 'capabilities' | 'onDidRequestFocus' | 'resource' | 'onDisposed'>,
		private _bufferTracker: BufferContentTracker,
		customHelp: () => string,
		@IConfigurationService configurationService: IConfigurationService,
		@ITerminalService terminalService: ITerminalService,
	) {
		super();
		this.options.customHelp = customHelp;
		this.options.position = configurationService.getValue(TerminalAccessibilitySettingId.AccessibleViewPreserveCursorPosition) ? 'initial-bottom' : 'bottom';
		this._register(this._instance.onDisposed(() => this._onDidRequestClearProvider.fire(AccessibleViewProviderId.Terminal)));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalAccessibilitySettingId.AccessibleViewPreserveCursorPosition)) {
				this.options.position = configurationService.getValue(TerminalAccessibilitySettingId.AccessibleViewPreserveCursorPosition) ? 'initial-bottom' : 'bottom';
			}
		}));
		this._focusedInstance = terminalService.activeInstance;
		this._register(terminalService.onDidChangeActiveInstance(() => {
			if (terminalService.activeInstance && this._focusedInstance?.instanceId !== terminalService.activeInstance?.instanceId) {
				this._onDidRequestClearProvider.fire(AccessibleViewProviderId.Terminal);
				this._focusedInstance = terminalService.activeInstance;
			}
		}));
	}

	onClose() {
		this._instance.focus();
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
			if (lineNumber === undefined) {
				continue;
			}
			result.push({ command, lineNumber, exitCode: command.exitCode });
		}
		if (currentCommand) {
			const lineNumber = this._getEditorLineForCommand(currentCommand);
			if (lineNumber !== undefined) {
				result.push({ command: currentCommand, lineNumber });
			}
		}
		return result;
	}
	private _getEditorLineForCommand(command: ITerminalCommand | ICurrentPartialCommand): number | undefined {
		let line: number | undefined;
		if (isFullTerminalCommand(command)) {
			line = command.marker?.line;
		} else {
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
export interface ICommandWithEditorLine { command: ITerminalCommand | ICurrentPartialCommand; lineNumber: number; exitCode?: number }

