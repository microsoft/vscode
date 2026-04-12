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
import { isBash, isZsh } from '../../runInTerminalHelpers.js';
/**
 * Rewriter that prepends a space to commands to prevent them from being added to shell history for
 * certain shells. This depends on $VSCODE_PREVENT_SHELL_HISTORY being handled in shell integration
 * scripts to set `HISTCONTROL=ignorespace` (bash) or `HIST_IGNORE_SPACE` (zsh) env vars. The
 * prepended space is harmless so we don't try to remove it if shell integration isn't functional.
 */
let CommandLinePreventHistoryRewriter = class CommandLinePreventHistoryRewriter extends Disposable {
    constructor(_configurationService) {
        super();
        this._configurationService = _configurationService;
    }
    rewrite(options) {
        const preventShellHistory = this._configurationService.getValue("chat.tools.terminal.preventShellHistory" /* TerminalChatAgentToolsSettingId.PreventShellHistory */) === true;
        if (!preventShellHistory) {
            return undefined;
        }
        // Only bash and zsh use space prefix to exclude from history
        if (isBash(options.shell, options.os) || isZsh(options.shell, options.os)) {
            return {
                rewritten: ` ${options.commandLine}`,
                reasoning: 'Prepended with a space to exclude from shell history'
            };
        }
        return undefined;
    }
};
CommandLinePreventHistoryRewriter = __decorate([
    __param(0, IConfigurationService)
], CommandLinePreventHistoryRewriter);
export { CommandLinePreventHistoryRewriter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVQcmV2ZW50SGlzdG9yeVJld3JpdGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVSZXdyaXRlci9jb21tYW5kTGluZVByZXZlbnRIaXN0b3J5UmV3cml0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFJOUQ7Ozs7O0dBS0c7QUFDSSxJQUFNLGlDQUFpQyxHQUF2QyxNQUFNLGlDQUFrQyxTQUFRLFVBQVU7SUFDaEUsWUFDeUMscUJBQTRDO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBRmdDLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7SUFHckYsQ0FBQztJQUVELE9BQU8sQ0FBQyxPQUFvQztRQUMzQyxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLHFHQUFxRCxLQUFLLElBQUksQ0FBQztRQUM5SCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUMxQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsNkRBQTZEO1FBQzdELElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1lBQzNFLE9BQU87Z0JBQ04sU0FBUyxFQUFFLElBQUksT0FBTyxDQUFDLFdBQVcsRUFBRTtnQkFDcEMsU0FBUyxFQUFFLHNEQUFzRDthQUNqRSxDQUFDO1FBQ0gsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7Q0FDRCxDQUFBO0FBckJZLGlDQUFpQztJQUUzQyxXQUFBLHFCQUFxQixDQUFBO0dBRlgsaUNBQWlDLENBcUI3QyJ9