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
var ToolTerminalCreator_1;
import { DeferredPromise, disposableTimeout, raceTimeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { hasKey, isNumber, isObject, isString } from '../../../../../base/common/types.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { getShellIntegrationTimeout } from '../../../terminal/common/terminalEnvironment.js';
import { isBash, isFish, isPowerShell, isZsh } from './runInTerminalHelpers.js';
var ShellLaunchType;
(function (ShellLaunchType) {
    ShellLaunchType[ShellLaunchType["Unknown"] = 0] = "Unknown";
    ShellLaunchType[ShellLaunchType["Default"] = 1] = "Default";
    ShellLaunchType[ShellLaunchType["Fallback"] = 2] = "Fallback";
})(ShellLaunchType || (ShellLaunchType = {}));
export var ShellIntegrationQuality;
(function (ShellIntegrationQuality) {
    ShellIntegrationQuality["None"] = "none";
    ShellIntegrationQuality["Basic"] = "basic";
    ShellIntegrationQuality["Rich"] = "rich";
})(ShellIntegrationQuality || (ShellIntegrationQuality = {}));
let ToolTerminalCreator = class ToolTerminalCreator {
    static { ToolTerminalCreator_1 = this; }
    /**
     * The shell preference cached for the lifetime of the window. This allows skipping previous
     * shell approaches that failed in previous runs to save time.
     */
    static { this._lastSuccessfulShell = 0 /* ShellLaunchType.Unknown */; }
    constructor(_configurationService, _logService, _terminalService) {
        this._configurationService = _configurationService;
        this._logService = _logService;
        this._terminalService = _terminalService;
    }
    async createTerminal(shellOrProfile, os, token) {
        const instance = await this._createCopilotTerminal(shellOrProfile, os);
        const toolTerminal = {
            instance,
            shellIntegrationQuality: "none" /* ShellIntegrationQuality.None */,
        };
        let processReadyTimestamp = 0;
        // Ensure the shell process launches successfully
        const initResult = await Promise.any([
            instance.processReady.then(() => processReadyTimestamp = Date.now()),
            Event.toPromise(instance.onExit),
        ]);
        if (!isNumber(initResult) && isObject(initResult) && hasKey(initResult, { message: true })) {
            throw new Error(initResult.message);
        }
        // Wait for shell integration when the fallback case has not been hit or when shell
        // integration injection is enabled. Note that it's possible for the fallback case to happen
        // and then for SI to activate again later in the session.
        const siInjectionEnabled = this._configurationService.getValue("terminal.integrated.shellIntegration.enabled" /* TerminalSettingId.ShellIntegrationEnabled */) === true;
        // Get the configurable timeout to wait for shell integration
        const waitTime = getShellIntegrationTimeout(this._configurationService, siInjectionEnabled, instance.hasRemoteAuthority, processReadyTimestamp);
        if (ToolTerminalCreator_1._lastSuccessfulShell !== 2 /* ShellLaunchType.Fallback */ ||
            siInjectionEnabled) {
            this._logService.info(`ToolTerminalCreator#createTerminal: Waiting ${waitTime}ms for shell integration`);
            const shellIntegrationQuality = await this._waitForShellIntegration(instance, waitTime);
            if (token.isCancellationRequested) {
                instance.dispose();
                throw new CancellationError();
            }
            // If SI is rich, wait for the prompt state to change. This prevents an issue with pwsh
            // in particular where shell startup can swallow `\r` input events, preventing the
            // command from executing.
            if (shellIntegrationQuality === "rich" /* ShellIntegrationQuality.Rich */) {
                const commandDetection = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
                if (commandDetection?.promptInputModel.state === 0 /* PromptInputState.Unknown */) {
                    this._logService.info(`ToolTerminalCreator#createTerminal: Waiting up to 2s for PromptInputModel state to change`);
                    const didStart = await raceTimeout(Event.toPromise(commandDetection.onCommandStarted), 2000);
                    if (!didStart) {
                        this._logService.info(`ToolTerminalCreator#createTerminal: PromptInputModel state did not change within timeout`);
                    }
                }
            }
            if (shellIntegrationQuality !== "none" /* ShellIntegrationQuality.None */) {
                ToolTerminalCreator_1._lastSuccessfulShell = 1 /* ShellLaunchType.Default */;
                toolTerminal.shellIntegrationQuality = shellIntegrationQuality;
                return toolTerminal;
            }
        }
        else {
            this._logService.info(`ToolTerminalCreator#createTerminal: Skipping wait for shell integration - last successful launch type ${ToolTerminalCreator_1._lastSuccessfulShell}`);
        }
        // Fallback case: No shell integration in default profile
        ToolTerminalCreator_1._lastSuccessfulShell = 2 /* ShellLaunchType.Fallback */;
        return toolTerminal;
    }
    /**
     * Synchronously update shell integration quality based on the terminal instance's current
     * capabilities. This is a defensive change to avoid no shell integration being sticky
     * https://github.com/microsoft/vscode/issues/260880
     *
     * Only upgrade quality just in case.
     */
    refreshShellIntegrationQuality(toolTerminal) {
        const commandDetection = toolTerminal.instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
        if (commandDetection) {
            if (toolTerminal.shellIntegrationQuality === "none" /* ShellIntegrationQuality.None */ ||
                toolTerminal.shellIntegrationQuality === "basic" /* ShellIntegrationQuality.Basic */) {
                toolTerminal.shellIntegrationQuality = commandDetection.hasRichCommandDetection ? "rich" /* ShellIntegrationQuality.Rich */ : "basic" /* ShellIntegrationQuality.Basic */;
            }
        }
    }
    _createCopilotTerminal(shellOrProfile, os) {
        const shellPath = isString(shellOrProfile) ? shellOrProfile : shellOrProfile.path;
        const env = {
            // Avoid making `git diff` interactive when called from copilot
            GIT_PAGER: 'cat',
            // Prevent git from opening an editor for merge commits
            GIT_MERGE_AUTOEDIT: 'no',
            // Prevent git from opening an editor (e.g. for commit --amend, rebase -i).
            // `:` is a POSIX shell built-in no-op (returns 0), works cross-platform
            // since git always invokes the editor via `sh -c`.
            GIT_EDITOR: ':',
        };
        const preventShellHistory = this._configurationService.getValue("chat.tools.terminal.preventShellHistory" /* TerminalChatAgentToolsSettingId.PreventShellHistory */) === true;
        if (preventShellHistory) {
            // Check if the shell supports history exclusion via shell integration scripts
            if (isBash(shellPath, os) ||
                isZsh(shellPath, os) ||
                isFish(shellPath, os) ||
                isPowerShell(shellPath, os)) {
                env['VSCODE_PREVENT_SHELL_HISTORY'] = '1';
            }
        }
        const config = {
            icon: ThemeIcon.fromId(Codicon.chatSparkle.id),
            hideFromUser: true,
            forcePersist: true,
            env,
        };
        if (isString(shellOrProfile)) {
            config.executable = shellOrProfile;
        }
        else {
            config.executable = shellOrProfile.path;
            config.args = shellOrProfile.args;
            config.icon = shellOrProfile.icon ?? config.icon;
            config.color = shellOrProfile.color;
            config.env = {
                ...config.env,
                ...shellOrProfile.env
            };
        }
        return this._terminalService.createTerminal({ config });
    }
    _waitForShellIntegration(instance, timeoutMs) {
        const store = new DisposableStore();
        const result = new DeferredPromise();
        const siNoneTimer = store.add(new MutableDisposable());
        siNoneTimer.value = disposableTimeout(() => {
            this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Timed out ${timeoutMs}ms, using no SI`);
            result.complete("none" /* ShellIntegrationQuality.None */);
        }, timeoutMs);
        if (instance.capabilities.get(2 /* TerminalCapability.CommandDetection */)?.hasRichCommandDetection) {
            // Rich command detection is available immediately.
            siNoneTimer.clear();
            this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Rich SI available immediately`);
            result.complete("rich" /* ShellIntegrationQuality.Rich */);
        }
        else {
            const onSetRichCommandDetection = store.add(this._terminalService.createOnInstanceCapabilityEvent(2 /* TerminalCapability.CommandDetection */, e => e.onSetRichCommandDetection));
            store.add(onSetRichCommandDetection.event((e) => {
                if (e.instance !== instance) {
                    return;
                }
                siNoneTimer.clear();
                // Rich command detection becomes available some time after the terminal is created.
                this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Rich SI available eventually`);
                result.complete("rich" /* ShellIntegrationQuality.Rich */);
            }));
            const commandDetection = instance.capabilities.get(2 /* TerminalCapability.CommandDetection */);
            if (commandDetection) {
                siNoneTimer.clear();
                // When SI lights up, allow up to 200ms for the rich command
                // detection sequence to come in before declaring it as basic shell integration.
                store.add(disposableTimeout(() => {
                    this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Timed out 200ms, using basic SI`);
                    result.complete("basic" /* ShellIntegrationQuality.Basic */);
                }, 200));
            }
            else {
                store.add(instance.capabilities.onDidAddCommandDetectionCapability(e => {
                    siNoneTimer.clear();
                    // When command detection lights up, allow up to 200ms for the rich command
                    // detection sequence to come in before declaring it as basic shell
                    // integration.
                    store.add(disposableTimeout(() => {
                        this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Timed out 200ms, using basic SI (via listener)`);
                        result.complete("basic" /* ShellIntegrationQuality.Basic */);
                    }, 200));
                }));
            }
        }
        result.p.finally(() => {
            this._logService.info(`ToolTerminalCreator#_waitForShellIntegration: Promise complete, disposing store`);
            store.dispose();
        });
        return result.p;
    }
};
ToolTerminalCreator = ToolTerminalCreator_1 = __decorate([
    __param(0, IConfigurationService),
    __param(1, ITerminalLogService),
    __param(2, ITerminalService)
], ToolTerminalCreator);
export { ToolTerminalCreator };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9vbFRlcm1pbmFsQ3JlYXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xUZXJtaW5hbENyZWF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFdEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFN0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMzRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUd0RyxPQUFPLEVBQUUsbUJBQW1CLEVBQWdFLE1BQU0scURBQXFELENBQUM7QUFDeEosT0FBTyxFQUFFLGdCQUFnQixFQUEwQixNQUFNLHVDQUF1QyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRTdGLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUVoRixJQUFXLGVBSVY7QUFKRCxXQUFXLGVBQWU7SUFD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