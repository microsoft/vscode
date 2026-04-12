/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isFullTerminalCommand } from '../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
let TerminalAccessibleBufferProvider = class TerminalAccessibleBufferProvider extends Disposable {
    constructor(_instance, _bufferTracker, customHelp, configurationService, terminalService) {
        super();
        this._instance = _instance;
        this._bufferTracker = _bufferTracker;
        this.id = "terminal" /* AccessibleViewProviderId.Terminal */;
        this.options = { type: "view" /* AccessibleViewType.View */, language: 'terminal', id: "terminal" /* AccessibleViewProviderId.Terminal */ };
        this.verbositySettingKey = "accessibility.verbosity.terminal" /* AccessibilityVerbositySettingId.Terminal */;
        this._onDidRequestClearProvider = this._register(new Emitter());
        this.onDidRequestClearLastProvider = this._onDidRequestClearProvider.event;
        this.options.customHelp = customHelp;
        this.options.position = configurationService.getValue("terminal.integrated.accessibleViewPreserveCursorPosition" /* TerminalAccessibilitySettingId.AccessibleViewPreserveCursorPosition */) ? 'initial-bottom' : 'bottom';
        this._register(this._instance.onDisposed(() => this._onDidRequestClearProvider.fire("terminal" /* AccessibleViewProviderId.Terminal */)));
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.accessibleViewPreserveCursorPosition" /* TerminalAccessibilitySettingId.AccessibleViewPreserveCursorPosition */)) {
                this.options.position = configurationService.getValue("terminal.integrated.accessibleViewPreserveCursorPosition" /* TerminalAccessibilitySettingId.AccessibleViewPreserveCursorPosition */) ? 'initial-bottom' : 'bottom';
            }
        }));
        this._focusedInstance = terminalService.activeInstance;
        this._register(terminalService.onDidChangeActiveInstance(() => {
            if (terminalService.activeInstance && this._focusedInstance?.instanceId !== terminalService.activeInstance?.instanceId) {
                this._onDidRequestClearProvider.fire("terminal" /* AccessibleViewProviderId.Terminal */);
                this._focusedInstance = terminalService.activeInstance;
            }
        }));
    }
    onClose() {
        this._instance.focus();
    }
    provideContent() {
        this._bufferTracker.update();
        return this._bufferTracker.lines.join('\n');
    }
    getSymbols() {
        const commands = this._getCommandsWithEditorLine() ?? [];
        const symbols = [];
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
    _getCommandsWithEditorLine() {
        const capability = this._instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        const commands = capability?.commands;
        const currentCommand = capability?.currentCommand;
        if (!commands?.length) {
            return;
        }
        const result = [];
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
    _getEditorLineForCommand(command) {
        let line;
        if (isFullTerminalCommand(command)) {
            line = command.marker?.line;
        }
        else {
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
};
TerminalAccessibleBufferProvider = __decorate([
    __param(3, IConfigurationService),
    __param(4, ITerminalService)
], TerminalAccessibleBufferProvider);
export { TerminalAccessibleBufferProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxBY2Nlc3NpYmxlQnVmZmVyUHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvYWNjZXNzaWJpbGl0eS9icm93c2VyL3Rlcm1pbmFsQWNjZXNzaWJsZUJ1ZmZlclByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFckUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFdEcsT0FBTyxFQUEwQixxQkFBcUIsRUFBRSxNQUFNLDBGQUEwRixDQUFDO0FBRXpKLE9BQU8sRUFBcUIsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUlyRixJQUFNLGdDQUFnQyxHQUF0QyxNQUFNLGdDQUFpQyxTQUFRLFVBQVU7SUFVL0QsWUFDa0IsU0FBaUosRUFDMUosY0FBb0MsRUFDNUMsVUFBd0IsRUFDRCxvQkFBMkMsRUFDaEQsZUFBaUM7UUFFbkQsS0FBSyxFQUFFLENBQUM7UUFOUyxjQUFTLEdBQVQsU0FBUyxDQUF3STtRQUMxSixtQkFBYyxHQUFkLGNBQWMsQ0FBc0I7UUFYcEMsT0FBRSxzREFBcUM7UUFDdkMsWUFBTyxHQUEyQixFQUFFLElBQUksc0NBQXlCLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxFQUFFLG9EQUFtQyxFQUFFLENBQUM7UUFDakksd0JBQW1CLHFGQUE0QztRQUl2RCwrQkFBMEIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUE0QixDQUFDLENBQUM7UUFDN0Ysa0NBQTZCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFD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