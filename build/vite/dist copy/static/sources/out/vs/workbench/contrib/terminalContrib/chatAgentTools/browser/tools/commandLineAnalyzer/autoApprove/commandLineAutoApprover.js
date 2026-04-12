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
import { structuralEquals } from '../../../../../../../../base/common/equals.js';
import { Disposable } from '../../../../../../../../base/common/lifecycle.js';
import { escapeRegExpCharacters, regExpLeadsToEndlessLoop } from '../../../../../../../../base/common/strings.js';
import { isObject } from '../../../../../../../../base/common/types.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalChatService } from '../../../../../../terminal/browser/terminal.js';
import { isPowerShell } from '../../../runInTerminalHelpers.js';
import { NpmScriptAutoApprover } from './npmScriptAutoApprover.js';
const neverMatchRegex = /(?!.*)/;
const transientEnvVarRegex = /^[A-Z_][A-Z0-9_]*=/i;
let CommandLineAutoApprover = class CommandLineAutoApprover extends Disposable {
    constructor(_configurationService, instantiationService, _terminalChatService) {
        super();
        this._configurationService = _configurationService;
        this._terminalChatService = _terminalChatService;
        this._denyListRules = [];
        this._allowListRules = [];
        this._allowListCommandLineRules = [];
        this._denyListCommandLineRules = [];
        this._npmScriptAutoApprover = this._register(instantiationService.createInstance(NpmScriptAutoApprover));
        this.updateConfiguration();
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */) ||
                e.affectsConfiguration("chat.tools.terminal.ignoreDefaultAutoApproveRules" /* TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules */) ||
                e.affectsConfiguration("chat.agent.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible */)) {
                this.updateConfiguration();
            }
        }));
    }
    updateConfiguration() {
        let configValue = this._configurationService.getValue("chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */);
        const configInspectValue = this._configurationService.inspect("chat.tools.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.AutoApprove */);
        const deprecatedValue = this._configurationService.getValue("chat.agent.terminal.autoApprove" /* TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible */);
        if (deprecatedValue && typeof deprecatedValue === 'object' && configValue && typeof configValue === 'object') {
            configValue = {
                ...configValue,
                ...deprecatedValue
            };
        }
        const { denyListRules, allowListRules, allowListCommandLineRules, denyListCommandLineRules } = this._mapAutoApproveConfigToRules(configValue, configInspectValue);
        this._allowListRules = allowListRules;
        this._denyListRules = denyListRules;
        this._allowListCommandLineRules = allowListCommandLineRules;
        this._denyListCommandLineRules = denyListCommandLineRules;
    }
    async isCommandAutoApproved(command, shell, os, cwd, chatSessionResource) {
        // Check if the command has a transient environment variable assignment prefix which we
        // always deny for now as it can easily lead to execute other commands
        if (transientEnvVarRegex.test(command)) {
            return {
                result: 'denied',
                reason: `Command '${command}' is denied because it contains transient environment variables`
            };
        }
        // Check the config deny list to see if this command requires explicit approval
        for (const rule of this._denyListRules) {
            if (this._commandMatchesRule(rule, command, shell, os)) {
                return {
                    result: 'denied',
                    rule,
                    reason: `Command '${command}' is denied by deny list rule: ${rule.sourceText}`
                };
            }
        }
        // Check session allow rules (session deny rules can't exist)
        for (const rule of this._getSessionRules(chatSessionResource).allowListRules) {
            if (this._commandMatchesRule(rule, command, shell, os)) {
                return {
                    result: 'approved',
                    rule,
                    reason: `Command '${command}' is approved by session allow list rule: ${rule.sourceText}`
                };
            }
        }
        // Check the config allow list to see if the command is allowed to run without explicit approval
        for (const rule of this._allowListRules) {
            if (this._commandMatchesRule(rule, command, shell, os)) {
                return {
                    result: 'approved',
                    rule,
                    reason: `Command '${command}' is approved by allow list rule: ${rule.sourceText}`
                };
            }
        }
        // Check if this is an npm/yarn/pnpm script defined in package.json
        const npmScriptResult = await this._npmScriptAutoApprover.isCommandAutoApproved(command, cwd);
        if (npmScriptResult.isAutoApproved) {
            return {
                result: 'approved',
                rule: { type: 'npmScript', npmScriptResult },
                reason: `Command '${command}' is approved as npm script '${npmScriptResult.scriptName}' is defined in package.json`
            };
        }
        // TODO: LLM-based auto-approval https://github.com/microsoft/vscode/issues/253267
        // Fallback is always to require approval
        return {
            result: 'noMatch',
            reason: `Command '${command}' has no matching auto approve entries`
        };
    }
    isCommandLineAutoApproved(commandLine, chatSessionResource) {
        // Check the config deny list first to see if this command line requires explicit approval
        for (const rule of this._denyListCommandLineRules) {
            if (rule.regex.test(commandLine)) {
                return {
                    result: 'denied',
                    rule,
                    reason: `Command line '${commandLine}' is denied by deny list rule: ${rule.sourceText}`
                };
            }
        }
        // Check session allow list (session deny rules can't exist)
        for (const rule of this._getSessionRules(chatSessionResource).allowListCommandLineRules) {
            if (rule.regex.test(commandLine)) {
                return {
                    result: 'approved',
                    rule,
                    reason: `Command line '${commandLine}' is approved by session allow list rule: ${rule.sourceText}`
                };
            }
        }
        // Check if the full command line matches any of the config allow list command line regexes
        for (const rule of this._allowListCommandLineRules) {
            if (rule.regex.test(commandLine)) {
                return {
                    result: 'approved',
                    rule,
                    reason: `Command line '${commandLine}' is approved by allow list rule: ${rule.sourceText}`
                };
            }
        }
        return {
            result: 'noMatch',
            reason: `Command line '${commandLine}' has no matching auto approve entries`
        };
    }
    _getSessionRules(chatSessionResource) {
        const denyListRules = [];
        const allowListRules = [];
        const allowListCommandLineRules = [];
        const denyListCommandLineRules = [];
        if (!chatSessionResource) {
            return { denyListRules, allowListRules, allowListCommandLineRules, denyListCommandLineRules };
        }
        const sessionRulesConfig = this._terminalChatService.getSessionAutoApproveRules(chatSessionResource);
        for (const [key, value] of Object.entries(sessionRulesConfig)) {
            if (typeof value === 'boolean') {
                const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
                if (value === true) {
                    allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: 'session', isDefaultRule: false });
                }
                else if (value === false) {
                    denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: 'session', isDefaultRule: false });
                }
            }
            else if (typeof value === 'object' && value !== null) {
                const objectValue = value;
                if (typeof objectValue.approve === 'boolean') {
                    const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
                    if (objectValue.approve === true) {
                        if (objectValue.matchCommandLine === true) {
                            allowListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: 'session', isDefaultRule: false });
                        }
                        else {
                            allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: 'session', isDefaultRule: false });
                        }
                    }
                    else if (objectValue.approve === false) {
                        if (objectValue.matchCommandLine === true) {
                            denyListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: 'session', isDefaultRule: false });
                        }
                        else {
                            denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: 'session', isDefaultRule: false });
                        }
                    }
                }
            }
        }
        return { denyListRules, allowListRules, allowListCommandLineRules, denyListCommandLineRules };
    }
    _commandMatchesRule(rule, command, shell, os) {
        const isPwsh = isPowerShell(shell, os);
        // PowerShell is case insensitive regardless of platform
        if ((isPwsh ? rule.regexCaseInsensitive : rule.regex).test(command)) {
            return true;
        }
        else if (isPwsh && command.startsWith('(')) {
            // Allow ignoring of the leading ( for PowerShell commands as it's a command pattern to
            // operate on the output of a command. For example `(Get-Content README.md) ...`
            if (rule.regexCaseInsensitive.test(command.slice(1))) {
                return true;
            }
        }
        return false;
    }
    _mapAutoApproveConfigToRules(config, configInspectValue) {
        if (!config || typeof config !== 'object') {
            return {
                denyListRules: [],
                allowListRules: [],
                allowListCommandLineRules: [],
                denyListCommandLineRules: []
            };
        }
        const denyListRules = [];
        const allowListRules = [];
        const allowListCommandLineRules = [];
        const denyListCommandLineRules = [];
        const ignoreDefaults = this._configurationService.getValue("chat.tools.terminal.ignoreDefaultAutoApproveRules" /* TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules */) === true;
        for (const [key, value] of Object.entries(config)) {
            const defaultValue = configInspectValue?.default?.value;
            const isDefaultRule = !!(isObject(defaultValue) &&
                Object.prototype.hasOwnProperty.call(defaultValue, key) &&
                structuralEquals(defaultValue[key], value));
            function checkTarget(inspectValue) {
                return (isObject(inspectValue) &&
                    Object.prototype.hasOwnProperty.call(inspectValue, key) &&
                    structuralEquals(inspectValue[key], value));
            }
            const sourceTarget = (checkTarget(configInspectValue.workspaceFolder) ? 6 /* ConfigurationTarget.WORKSPACE_FOLDER */
                : checkTarget(configInspectValue.workspaceValue) ? 5 /* ConfigurationTarget.WORKSPACE */
                    : checkTarget(configInspectValue.userRemoteValue) ? 4 /* ConfigurationTarget.USER_REMOTE */
                        : checkTarget(configInspectValue.userLocalValue) ? 3 /* ConfigurationTarget.USER_LOCAL */
                            : checkTarget(configInspectValue.userValue) ? 2 /* ConfigurationTarget.USER */
                                : checkTarget(configInspectValue.applicationValue) ? 1 /* ConfigurationTarget.APPLICATION */
                                    : 7 /* ConfigurationTarget.DEFAULT */);
            // If default rules are disabled, ignore entries that come from the default config
            if (ignoreDefaults && isDefaultRule && sourceTarget === 7 /* ConfigurationTarget.DEFAULT */) {
                continue;
            }
            if (typeof value === 'boolean') {
                const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
                // IMPORTANT: Only true and false are used, null entries need to be ignored
                if (value === true) {
                    allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
                }
                else if (value === false) {
                    denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
                }
            }
            else if (typeof value === 'object' && value !== null) {
                // Handle object format like { approve: true/false, matchCommandLine: true/false }
                const objectValue = value;
                if (typeof objectValue.approve === 'boolean') {
                    const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
                    if (objectValue.approve === true) {
                        if (objectValue.matchCommandLine === true) {
                            allowListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
                        }
                        else {
                            allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
                        }
                    }
                    else if (objectValue.approve === false) {
                        if (objectValue.matchCommandLine === true) {
                            denyListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
                        }
                        else {
                            denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
                        }
                    }
                }
            }
        }
        return {
            denyListRules,
            allowListRules,
            allowListCommandLineRules,
            denyListCommandLineRules
        };
    }
    _convertAutoApproveEntryToRegex(value) {
        const regex = this._doConvertAutoApproveEntryToRegex(value);
        if (regex.flags.includes('i')) {
            return { regex, regexCaseInsensitive: regex };
        }
        return { regex, regexCaseInsensitive: new RegExp(regex.source, regex.flags + 'i') };
    }
    _doConvertAutoApproveEntryToRegex(value) {
        // If it's wrapped in `/`, it's in regex format and should be converted directly
        // Support all standard JavaScript regex flags: d, g, i, m, s, u, v, y
        const regexMatch = value.match(/^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/);
        const regexPattern = regexMatch?.groups?.pattern;
        if (regexPattern) {
            let flags = regexMatch.groups?.flags;
            // Remove global flag as it changes how the regex state works which we need to handle
            // internally
            if (flags) {
                flags = flags.replaceAll('g', '');
            }
            // Allow .* as users expect this would match everything
            if (regexPattern === '.*') {
                return new RegExp(regexPattern);
            }
            try {
                const regex = new RegExp(regexPattern, flags || undefined);
                if (regExpLeadsToEndlessLoop(regex)) {
                    return neverMatchRegex;
                }
                return regex;
            }
            catch (error) {
                return neverMatchRegex;
            }
        }
        // The empty string should be ignored, rather than approve everything
        if (value === '') {
            return neverMatchRegex;
        }
        let sanitizedValue;
        // Match both path separators it if looks like a path
        if (value.includes('/') || value.includes('\\')) {
            // Replace path separators with placeholders first, apply standard sanitization, then
            // apply special path handling
            let pattern = value.replace(/[/\\]/g, '%%PATH_SEP%%');
            pattern = escapeRegExpCharacters(pattern);
            pattern = pattern.replace(/%%PATH_SEP%%*/g, '[/\\\\]');
            sanitizedValue = `^(?:\\.[/\\\\])?${pattern}`;
        }
        // Escape regex special characters for non-path strings
        else {
            sanitizedValue = escapeRegExpCharacters(value);
        }
        // Regular strings should match the start of the command line and be a word boundary
        return new RegExp(`^${sanitizedValue}\\b`);
    }
};
CommandLineAutoApprover = __decorate([
    __param(0, IConfigurationService),
    __param(1, IInstantiationService),
    __param(2, ITerminalChatService)
], CommandLineAutoApprover);
export { CommandLineAutoApprover };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9jb21tYW5kTGluZUFuYWx5emVyL2F1dG9BcHByb3ZlL2NvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUU5RSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFeEUsT0FBTyxFQUF1QixxQkFBcUIsRUFBNEIsTUFBTSx3RUFBd0UsQ0FBQztBQUM5SixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUMvRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUV0RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFaEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFVbkUsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDO0FBQ2pDLE1BQU0sb0JBQW9CLEdBQUcscUJBQXFCLENBQUM7QUFFNUMsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSxVQUFVO0lBT3RELFlBQ3dCLHFCQUE2RCxFQUM3RCxvQkFBMkMsRUFDNUMsb0JBQTJEO1FBRWpGLEtBQUssRUFBRSxDQUFDO1FBSmdDLDBCQUFxQixHQUFyQixx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