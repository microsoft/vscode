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
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { isPowerShell } from '../../runInTerminalHelpers.js';
/**
 * Wraps background terminal commands so their processes survive VS Code shutdown.
 *
 * On POSIX (bash/zsh/fish), uses `nohup <command> &` to ignore SIGHUP and
 * detach from the terminal's process group.
 *
 * On Windows (PowerShell), uses `Start-Process` to create a process outside
 * the terminal's process tree.
 *
 * Gated behind the {@link TerminalChatAgentToolsSettingId.DetachBackgroundProcesses} setting
 * (default off) to avoid orphaned processes in normal usage.
 */
let CommandLineBackgroundDetachRewriter = class CommandLineBackgroundDetachRewriter extends Disposable {
    constructor(_configurationService) {
        super();
        this._configurationService = _configurationService;
    }
    rewrite(options) {
        if (!options.isBackground) {
            return undefined;
        }
        if (!this._configurationService.getValue("chat.tools.terminal.detachBackgroundProcesses" /* TerminalChatAgentToolsSettingId.DetachBackgroundProcesses */)) {
            return undefined;
        }
        if (options.os === 1 /* OperatingSystem.Windows */) {
            return this._rewriteForPowerShell(options);
        }
        return this._rewriteForPosix(options);
    }
    _rewriteForPosix(options) {
        return {
            rewritten: `nohup ${options.commandLine} &`,
            reasoning: 'Wrapped background command with nohup to survive terminal shutdown',
            forDisplay: options.commandLine,
        };
    }
    _rewriteForPowerShell(options) {
        if (!isPowerShell(options.shell, options.os)) {
            return undefined;
        }
        // Escape double quotes for PowerShell string
        const escapedCommand = options.commandLine.replace(/"/g, '\\"');
        return {
            rewritten: `Start-Process -WindowStyle Hidden -FilePath "${options.shell}" -ArgumentList "-NoProfile", "-Command", "${escapedCommand}"`,
            reasoning: 'Wrapped background command with Start-Process to survive terminal shutdown',
            forDisplay: options.commandLine,
        };
    }
};
CommandLineBackgroundDetachRewriter = __decorate([
    __param(0, IConfigurationService)
], CommandLineBackgroundDetachRewriter);
export { CommandLineBackgroundDetachRewriter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9jb21tYW5kTGluZVJld3JpdGVyL2NvbW1hbmRMaW5lQmFja2dyb3VuZERldGFjaFJld3JpdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUUzRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxRUFBcUUsQ0FBQztBQUU1RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFHN0Q7Ozs7Ozs7Ozs7O0dBV0c7QUFDSSxJQUFNLG1DQUFtQyxHQUF6QyxNQUFNLG1DQUFvQyxTQUFRLFVBQVU7SUFDbEUsWUFDeUMscUJBQTRDO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBRmdDLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7SUFHckYsQ0FBQztJQUVELE9BQU8sQ0FBQyxPQUFvQztRQUMzQyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQzNCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsaUhBQTJELEVBQUUsQ0FBQztZQUNyRyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxPQUFPLENBQUMsRUFBRSxvQ0FBNEIsRUFBRSxDQUFDO1lBQzVDLE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzVDLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBRU8sZ0JBQWdCLENBQUMsT0FBb0M7UUFDNUQsT0FBTztZQUNOLFNBQVMsRUFBRSxTQUFTLE9BQU8sQ0FBQyxXQUFXLElBQUk7WUFDM0MsU0FBUyxFQUFFLG9FQUFvRTtZQUMvRSxVQUFVLEVBQUUsT0FBTyxDQUFDLFdBQVc7U0FDL0IsQ0FBQztJQUNILENBQUM7SUFFTyxxQkFBcUIsQ0FBQyxPQUFvQztRQUNqRSxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDOUMsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUVELDZDQUE2QztRQUM3QyxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFaEUsT0FBTztZQUNOLFNBQVMsRUFBRSxnREFBZ0QsT0FBTyxDQUFDLEtBQUssOENBQThDLGNBQWMsR0FBRztZQUN2SSxTQUFTLEVBQUUsNEVBQTRFO1lBQ3ZGLFVBQVUsRUFBRSxPQUFPLENBQUMsV0FBVztTQUMvQixDQUFDO0lBQ0gsQ0FBQztDQUNELENBQUE7QUE3Q1ksbUNBQW1DO0lBRTdDLFdBQUEscUJBQXFCLENBQUE7R0FGWCxtQ0FBbUMsQ0E2Qy9DIn0=