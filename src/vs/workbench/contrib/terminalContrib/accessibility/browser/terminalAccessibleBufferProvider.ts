/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/model';
import { IAccessibleViewContentProvider, AccessibleViewProviderId, IAccessibleViewOptions, AccessibleViewType, IAccessibleViewSymbol } from 'vs/platform/accessibility/browser/accessibleView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { TerminalCapability, ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ICurrentPartialCommand } from 'vs/platform/terminal/common/capabilities/commandDetection/terminalCommand';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { BufferContentTracker } from 'vs/workbench/contrib/terminalContrib/accessibility/browser/bufferContentTracker';
import { TerminalAccessibilitySettingId } from 'vs/workbench/contrib/terminalContrib/accessibility/common/terminalAccessibilityConfiguration';

export class TerminalAccessibleBufferProvider extends Disposable implements IAccessibleViewContentProvider {
	id = AccessibleViewProviderId.Terminal;
	options: IAccessibleViewOptions = { type: AccessibleViewType.View, language: 'terminal', id: AccessibleViewProviderId.Terminal };
	verbositySettingKey = AccessibilityVerbositySettingId.Terminal;
	private readonly _onDidRequestClearProvider = new Emitter<AccessibleViewProviderId>();
	readonly onDidRequestClearLastProvider = this._onDidRequestClearProvider.event;
	private _focusedInstance: ITerminalInstance | undefined;
	constructor(
		private readonly _instance: Pick<ITerminalInstance, 'onDidExecuteText' | 'focus' | 'shellType' | 'capabilities' | 'onDidRequestFocus' | 'resource' | 'onDisposed'>,
		private _bufferTracker: BufferContentTracker,
		customHelp: () => string,
		@IModelService _modelService: IModelService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@ITerminalService _terminalService: ITerminalService
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
		this._focusedInstance = _terminalService.activeInstance;
		this._register(_terminalService.onDidChangeActiveInstance(() => {
			if (_terminalService.activeInstance && this._focusedInstance?.instanceId !== _terminalService.activeInstance?.instanceId) {
				this._onDidRequestClearProvider.fire(AccessibleViewProviderId.Terminal);
				this._focusedInstance = _terminalService.activeInstance;
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
export interface ICommandWithEditorLine { command: ITerminalCommand | ICurrentPartialCommand; lineNumber: number; exitCode?: number }

