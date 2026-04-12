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
import { asArray } from '../../../../../../../base/common/arrays.js';
import { createCommandUri, MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalChatService } from '../../../../../terminal/browser/terminal.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ChatConfiguration } from '../../../../../chat/common/constants.js';
import { dedupeRules, generateAutoApproveActions, isPowerShell } from '../../runInTerminalHelpers.js';
import { isAutoApproveRule, isNpmScriptAutoApproveRule } from './commandLineAnalyzer.js';
import { CommandLineAutoApprover } from './autoApprove/commandLineAutoApprover.js';
const promptInjectionWarningCommandsLower = [
    'curl',
    'wget',
];
const promptInjectionWarningCommandsLowerPwshOnly = [
    'invoke-restmethod',
    'invoke-webrequest',
    'irm',
    'iwr',
];
let CommandLineAutoApproveAnalyzer = class CommandLineAutoApproveAnalyzer extends Disposable {
    constructor(_treeSitterCommandParser, _telemetry, _log, _configurationService, instantiationService, _storageService, _terminalChatService) {
        super();
        this._treeSitterCommandParser = _treeSitterCommandParser;
        this._telemetry = _telemetry;
        this._log = _log;
        this._configurationService = _configurationService;
        this._storageService = _storageService;
        this._terminalChatService = _terminalChatService;
        this._commandLineAutoApprover = this._register(instantiationService.createInstance(CommandLineAutoApprover));
    }
    async analyze(options) {
        const isAutoApproveEnabledInSettings = this._configurationService.getValue("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */) === true;
        if (isAutoApproveEnabledInSettings && options.chatSessionResource && this._terminalChatService.hasChatSessionAutoApproval(options.chatSessionResource)) {
            this._log('Session has auto approval enabled, auto approving command');
            const disableUri = createCommandUri("workbench.action.terminal.chat.disableSessionAutoApproval" /* TerminalChatCommandId.DisableSessionAutoApproval */, options.chatSessionResource);
            const mdTrustSettings = {
                isTrusted: {
                    enabledCommands: ["workbench.action.terminal.chat.disableSessionAutoApproval" /* TerminalChatCommandId.DisableSessionAutoApproval */]
                }
            };
            return {
                isAutoApproved: true,
                isAutoApproveAllowed: true,
                disclaimers: [],
                autoApproveInfo: new MarkdownString(`${localize('autoApprove.session', 'Auto approved for this session')} ([${localize('autoApprove.session.disable', 'Disable')}](${disableUri.toString()}))`, mdTrustSettings),
            };
        }
        const trimmedCommandLine = options.commandLine.trimStart();
        let subCommands;
        try {
            subCommands = await this._treeSitterCommandParser.extractSubCommands(options.treeSitterLanguage, trimmedCommandLine);
            this._log(`Parsed sub-commands via ${options.treeSitterLanguage} grammar`, subCommands);
        }
        catch (e) {
            console.error(e);
            this._log(`Failed to parse sub-commands via ${options.treeSitterLanguage} grammar`);
        }
        let isAutoApproved = false;
        let autoApproveInfo;
        let customActions;
        if (!subCommands?.length) {
            if (trimmedCommandLine.length === 0) {
                this._log('Command line is empty, auto approving');
                return {
                    isAutoApproved: true,
                    isAutoApproveAllowed: true,
                    disclaimers: [],
                };
            }
            this._log('No sub-commands were parsed, auto approval is not allowed');
            return {
                isAutoApproveAllowed: false,
                disclaimers: [],
            };
        }
        const subCommandResults = await Promise.all(subCommands.map(e => this._commandLineAutoApprover.isCommandAutoApproved(e, options.shell, options.os, options.cwd, options.chatSessionResource)));
        const commandLineResult = this._commandLineAutoApprover.isCommandLineAutoApproved(trimmedCommandLine, options.chatSessionResource);
        const autoApproveReasons = [
            ...subCommandResults.map(e => e.reason),
            commandLineResult.reason,
        ];
        let isDenied = false;
        let autoApproveReason;
        let autoApproveDefault;
        const deniedSubCommandResult = subCommandResults.find(e => e.result === 'denied');
        if (deniedSubCommandResult) {
            this._log('Sub-command DENIED auto approval');
            isDenied = true;
            autoApproveDefault = isAutoApproveRule(deniedSubCommandResult.rule) ? deniedSubCommandResult.rule.isDefaultRule : undefined;
            autoApproveReason = 'subCommand';
        }
        else if (commandLineResult.result === 'denied') {
            this._log('Command line DENIED auto approval');
            isDenied = true;
            autoApproveDefault = isAutoApproveRule(commandLineResult.rule) ? commandLineResult.rule.isDefaultRule : undefined;
            autoApproveReason = 'commandLine';
        }
        else {
            if (subCommandResults.every(e => e.result === 'approved')) {
                this._log('All sub-commands auto-approved');
                isAutoApproved = true;
                autoApproveReason = 'subCommand';
                autoApproveDefault = subCommandResults.every(e => isAutoApproveRule(e.rule) && e.rule.isDefaultRule);
            }
            else {
                this._log('All sub-commands NOT auto-approved');
                if (commandLineResult.result === 'approved') {
                    this._log('Command line auto-approved');
                    autoApproveReason = 'commandLine';
                    isAutoApproved = true;
                    autoApproveDefault = isAutoApproveRule(commandLineResult.rule) ? commandLineResult.rule.isDefaultRule : undefined;
                }
                else {
                    this._log('Command line NOT auto-approved');
                }
            }
        }
        // Log detailed auto approval reasoning
        for (const reason of autoApproveReasons) {
            this._log(`- ${reason}`);
        }
        // Apply auto approval or force it off depending on enablement/opt-in state
        const isAutoApproveEnabled = this._configurationService.getValue("chat.tools.terminal.enableAutoApprove" /* TerminalChatAgentToolsSettingId.EnableAutoApprove */) === true;
        const isAutoApproveWarningAccepted = this._storageService.getBoolean("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted */, -1 /* StorageScope.APPLICATION */, false);
        if (isAutoApproveEnabled && isAutoApproved) {
            autoApproveInfo = this._createAutoApproveInfo(isAutoApproved, isDenied, autoApproveReason, subCommandResults, commandLineResult);
        }
        else {
            isAutoApproved = false;
        }
        // Send telemetry about auto approval process
        this._telemetry.logPrepare({
            terminalToolSessionId: options.terminalToolSessionId,
            subCommands,
            autoApproveAllowed: !isAutoApproveEnabled ? 'off' : isAutoApproveWarningAccepted ? 'allowed' : 'needsOptIn',
            autoApproveResult: isAutoApproved ? 'approved' : isDenied ? 'denied' : 'manual',
            autoApproveReason,
            autoApproveDefault
        });
        // Prompt injection warning for common commands that return content from the web
        const disclaimers = [];
        const subCommandsLowerFirstWordOnly = subCommands.map(command => command.split(' ')[0].toLowerCase());
        if (!isAutoApproved && (subCommandsLowerFirstWordOnly.some(command => promptInjectionWarningCommandsLower.includes(command)) ||
            (isPowerShell(options.shell, options.os) && subCommandsLowerFirstWordOnly.some(command => promptInjectionWarningCommandsLowerPwshOnly.includes(command))))) {
            disclaimers.push(localize('runInTerminal.promptInjectionDisclaimer', 'Web content may contain malicious code or attempt prompt injection attacks.'));
        }
        // Add denial reason to disclaimers when auto-approve is enabled but command was denied by a rule
        if (isAutoApproveEnabled && isDenied) {
            const denialInfo = this._createAutoApproveInfo(isAutoApproved, isDenied, autoApproveReason, subCommandResults, commandLineResult);
            if (denialInfo) {
                disclaimers.push(denialInfo);
            }
        }
        if (!isAutoApproved && isAutoApproveEnabled) {
            customActions = generateAutoApproveActions(trimmedCommandLine, subCommands, { subCommandResults, commandLineResult });
        }
        return {
            isAutoApproved,
            // This is not based on isDenied because we want the user to be able to configure it
            isAutoApproveAllowed: true,
            disclaimers,
            autoApproveInfo,
            customActions,
        };
    }
    _createAutoApproveInfo(isAutoApproved, isDenied, autoApproveReason, subCommandResults, commandLineResult) {
        const formatRuleLinks = (result) => {
            return asArray(result)
                .filter((e) => isAutoApproveRule(e.rule))
                .map(e => {
                // Session rules cannot be actioned currently so no link
                const escapedSourceText = e.rule.sourceText.replaceAll('$', '\\$');
                if (e.rule.sourceTarget === 'session') {
                    return localize('autoApproveRule.sessionIndicator', '{0} (session)', `\`${escapedSourceText}\``);
                }
                const settingsUri = createCommandUri("workbench.action.terminal.chat.openTerminalSettingsLink" /* TerminalChatCommandId.OpenTerminalSettingsLink */, e.rule.sourceTarget);
                const tooltip = localize('ruleTooltip', 'View rule in settings');
                let label = escapedSourceText;
                switch (e.rule?.sourceTarget) {
                    case 7 /* ConfigurationTarget.DEFAULT */:
                        label = `${label} (default)`;
                        break;
                    case 2 /* ConfigurationTarget.USER */:
                    case 3 /* ConfigurationTarget.USER_LOCAL */:
                        label = `${label} (user)`;
                        break;
                    case 4 /* ConfigurationTarget.USER_REMOTE */:
                        label = `${label} (remote)`;
                        break;
                    case 5 /* ConfigurationTarget.WORKSPACE */:
                    case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */:
                        label = `${label} (workspace)`;
                        break;
                }
                return `[\`${label}\`](${settingsUri.toString()} "${tooltip}")`;
            }).join(', ');
        };
        const mdTrustSettings = {
            isTrusted: {
                enabledCommands: ["workbench.action.terminal.chat.openTerminalSettingsLink" /* TerminalChatCommandId.OpenTerminalSettingsLink */]
            }
        };
        const config = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
        const isGlobalAutoApproved = config?.value ?? config.defaultValue;
        if (isGlobalAutoApproved) {
            const settingsUri = createCommandUri("workbench.action.terminal.chat.openTerminalSettingsLink" /* TerminalChatCommandId.OpenTerminalSettingsLink */, 'global');
            return new MarkdownString(`${localize('autoApprove.global', 'Auto approved by setting {0}', `[\`${ChatConfiguration.GlobalAutoApprove}\`](${settingsUri.toString()} "${localize('ruleTooltip.global', 'View settings')}")`)}`, mdTrustSettings);
        }
        if (isAutoApproved) {
            switch (autoApproveReason) {
                case 'commandLine': {
                    if (isAutoApproveRule(commandLineResult.rule)) {
                        return new MarkdownString(localize('autoApprove.rule', 'Auto approved by rule {0}', formatRuleLinks(commandLineResult)), mdTrustSettings);
                    }
                    break;
                }
                case 'subCommand': {
                    // Check if approval came from npm script
                    const npmScriptApproval = subCommandResults.find(e => isNpmScriptAutoApproveRule(e.rule));
                    if (npmScriptApproval && isNpmScriptAutoApproveRule(npmScriptApproval.rule) && npmScriptApproval.rule.npmScriptResult.autoApproveInfo) {
                        return npmScriptApproval.rule.npmScriptResult.autoApproveInfo;
                    }
                    const uniqueRules = dedupeRules(subCommandResults);
                    if (uniqueRules.length === 1) {
                        return new MarkdownString(localize('autoApprove.rule', 'Auto approved by rule {0}', formatRuleLinks(uniqueRules)), mdTrustSettings);
                    }
                    else if (uniqueRules.length > 1) {
                        return new MarkdownString(localize('autoApprove.rules', 'Auto approved by rules {0}', formatRuleLinks(uniqueRules)), mdTrustSettings);
                    }
                    break;
                }
            }
        }
        else if (isDenied) {
            switch (autoApproveReason) {
                case 'commandLine': {
                    if (commandLineResult.rule) {
                        return new MarkdownString(localize('autoApproveDenied.rule', 'Auto approval denied by rule {0}', formatRuleLinks(commandLineResult)), mdTrustSettings);
                    }
                    break;
                }
                case 'subCommand': {
                    const uniqueRules = dedupeRules(subCommandResults.filter(e => e.result === 'denied'));
                    if (uniqueRules.length === 1) {
                        return new MarkdownString(localize('autoApproveDenied.rule', 'Auto approval denied by rule {0}', formatRuleLinks(uniqueRules)), mdTrustSettings);
                    }
                    else if (uniqueRules.length > 1) {
                        return new MarkdownString(localize('autoApproveDenied.rules', 'Auto approval denied by rules {0}', formatRuleLinks(uniqueRules)), mdTrustSettings);
                    }
                    break;
                }
            }
        }
        return undefined;
    }
};
CommandLineAutoApproveAnalyzer = __decorate([
    __param(3, IConfigurationService),
    __param(4, IInstantiationService),
    __param(5, IStorageService),
    __param(6, ITerminalChatService)
], CommandLineAutoApproveAnalyzer);
export { CommandLineAutoApproveAnalyzer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVBdXRvQXBwcm92ZUFuYWx5emVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVBbmFseXplci9jb21tYW5kTGluZUF1dG9BcHByb3ZlQW5hbHl6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxjQUFjLEVBQXdCLE1BQU0saURBQWlELENBQUM7QUFDekgsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBRTNFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQXVCLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDakksT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDNUcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDbkYsT0FBTyxFQUFFLGVBQWUsRUFBZ0IsTUFBTSx5REFBeUQsQ0FBQztBQUV4RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUc1RSxPQUFPLEVBQUUsV0FBVyxFQUFFLDBCQUEwQixFQUFFLFlBQVksRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBR3RHLE9BQU8sRUFBdUgsaUJBQWlCLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUU5TSxPQUFPLEVBQUUsdUJBQXVCLEVBQXlDLE1BQU0sMENBQTBDLENBQUM7QUFFMUgsTUFBTSxtQ0FBbUMsR0FBRztJQUMzQyxNQUFNO0lBQ04sTUFBTTtDQUNOLENBQUM7QUFDRixNQUFNLDJDQUEyQyxHQUFHO0lBQ25ELG1CQUFtQjtJQUNuQixtQkFBbUI7SUFDbkIsS0FBSztJQUNMLEtBQUs7Q0FDTCxDQUFDO0FBRUssSUFBTSw4QkFBOEIsR0FBcEMsTUFBTSw4QkFBK0IsU0FBUSxVQUFVO0lBRzdELFlBQ2tCLHdCQUFpRCxFQUNqRCxVQUFzQyxFQUN0QyxJQUFtRCxFQUM1QixxQkFBNEMsRUFDN0Qsb0JBQTJDLEVBQ2hDLGVBQWdDLEVBQzNCLG9CQUEwQztRQUVqRixLQUFLLEVBQUUsQ0FBQztRQVJTLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBeUI7UUFDakQsZUFBVSxHQUFWLFVBQVUsQ0FBNEI7UUFDdEMsU0FBSSxHQUFKLElBQUksQ0FBK0M7UUFDNUIsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUVsRCxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDM0IseUJBQW9CLEdBQXBCLG9CQUFvQixDQUFzQjtRQUdqRixJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO0lBQzlHLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQW9DO1FBQ2pELE1BQU0sOEJBQThCLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsaUdBQTRELEtBQUssSUFBSSxDQUFDO1FBQ2hKLElBQUksOEJBQThCLElBQUksT0FBTyxDQUFDLG1CQUFtQixJQUFJLElBQUksQ0FBQyxvQkFBb0IsQ0FBQywwQkFBMEIsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDO1lBQ3hKLElBQUksQ0FBQyxJQUFJLENBQUMsMkRBQTJELENBQUMsQ0FBQztZQUN2RSxNQUFNLFVBQVUsR0FBRyxnQkFBZ0IscUhBQW1ELE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO1lBQ25ILE1BQU0sZUFBZSxHQUFHO2dCQUN2QixTQUFTLEVBQUU7b0JBQ1YsZUFBZSxFQUFFLG9IQUFrRDtpQkFDbkU7YUFDRCxDQUFDO1lBQ0YsT0FBTztnQkFDTixjQUFjLEVBQUUsSUFBSTtnQkFDcEIsb0JBQW9CLEVBQUUsSUFBSTtnQkFDMUIsV0FBVyxFQUFFLEVBQUU7Z0JBQ2YsZUFBZSxFQUFFLElBQUksY0FBYyxDQUFDLEdBQUcsUUFBUSxDQUFDLHFCQUFxQixFQUFFLGdDQUFnQyxDQUFDLE1BQU0sUUFBUSxDQUFDLDZCQUE2QixFQUFFLFNBQVMsQ0FBQyxLQUFLLFVBQVUsQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLGVBQWUsQ0FBQzthQUNoTixDQUFDO1FBQ0gsQ0FBQztRQUVELE1BQU0sa0JBQWtCLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUUzRCxJQUFJLFdBQWlDLENBQUM7UUFDdEMsSUFBSSxDQUFDO1lBQ0osV0FBVyxHQUFHLE1BQU0sSUFBSSxDQUFDLHdCQUF3QixDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1lBQ3JILElBQUksQ0FBQyxJQUFJLENBQUMsMkJBQTJCLE9BQU8sQ0FBQyxrQkFBa0IsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3pGLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqQixJQUFJLENBQUMsSUFBSSxDQUFDLG9DQUFvQyxPQUFPLENBQUMsa0JBQWtCLFVBQVUsQ0FBQyxDQUFDO1FBQ3JGLENBQUM7UUFFRCxJQUFJLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDM0IsSUFBSSxlQUE0QyxDQUFDO1FBQ2pELElBQUksYUFBbUQsQ0FBQztRQUV4RCxJQUFJLENBQUMsV0FBVyxFQUFFLE1BQU0sRUFBRSxDQUFDO1lBQzFCLElBQUksa0JBQWtCLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLHVDQUF1QyxDQUFDLENBQUM7Z0JBQ25ELE9BQU87b0JBQ04sY0FBYyxFQUFFLElBQUk7b0JBQ3BCLG9CQUFvQixFQUFFLElBQUk7b0JBQzFCLFdBQVcsRUFBRSxFQUFFO2lCQUNmLENBQUM7WUFDSCxDQUFDO1lBRUQsSUFBSSxDQUFDLElBQUksQ0FBQywyREFBMkQsQ0FBQyxDQUFDO1lBQ3ZFLE9BQU87Z0JBQ04sb0JBQW9CLEVBQUUsS0FBSztnQkFDM0IsV0FBVyxFQUFFLEVBQUU7YUFDZixDQUFDO1FBQ0gsQ0FBQztRQUVELE1BQU0saUJBQWlCLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMscUJBQXFCLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvTCxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyx5QkFBeUIsQ0FBQyxrQkFBa0IsRUFBRSxPQUFPLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNuSSxNQUFNLGtCQUFrQixHQUFhO1lBQ3BDLEdBQUcsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUN2QyxpQkFBaUIsQ0FBQyxNQUFNO1NBQ3hCLENBQUM7UUFFRixJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDckIsSUFBSSxpQkFBMkQsQ0FBQztRQUNoRSxJQUFJLGtCQUF1QyxDQUFDO1FBRTVDLE1BQU0sc0JBQXNCLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQztRQUNsRixJQUFJLHNCQUFzQixFQUFFLENBQUM7WUFDNUIsSUFBSSxDQUFDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1lBQzlDLFFBQVEsR0FBRyxJQUFJLENBQUM7WUFDaEIsa0JBQWtCLEdBQUcsaUJBQWlCLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLHNCQUFzQixDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztZQUM1SCxpQkFBaUIsR0FBRyxZQUFZLENBQUM7UUFDbEMsQ0FBQzthQUFNLElBQUksaUJBQWlCLENBQUMsTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ2xELElBQUksQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQztZQUMvQyxRQUFRLEdBQUcsSUFBSSxDQUFDO1lBQ2hCLGtCQUFrQixHQUFHLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7WUFDbEgsaUJBQWlCLEdBQUcsYUFBYSxDQUFDO1FBQ25DLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxLQUFLLFVBQVUsQ0FBQyxFQUFFLENBQUM7Z0JBQzNELElBQUksQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztnQkFDNUMsY0FBYyxHQUFHLElBQUksQ0FBQztnQkFDdEIsaUJBQWlCLEdBQUcsWUFBWSxDQUFDO2dCQUNqQyxrQkFBa0IsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUN0RyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxDQUFDLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO2dCQUNoRCxJQUFJLGlCQUFpQixDQUFDLE1BQU0sS0FBSyxVQUFVLEVBQUUsQ0FBQztvQkFDN0MsSUFBSSxDQUFDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO29CQUN4QyxpQkFBaUIsR0FBRyxhQUFhLENBQUM7b0JBQ2xDLGNBQWMsR0FBRyxJQUFJLENBQUM7b0JBQ3RCLGtCQUFrQixHQUFHLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7Z0JBQ25ILENBQUM7cUJBQU0sQ0FBQztvQkFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLENBQUM7Z0JBQzdDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELHVDQUF1QztRQUN2QyxLQUFLLE1BQU0sTUFBTSxJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDekMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDMUIsQ0FBQztRQUVELDJFQUEyRTtRQUMzRSxNQUFNLG9CQUFvQixHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLGlHQUFtRCxLQUFLLElBQUksQ0FBQztRQUM3SCxNQUFNLDRCQUE0QixHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsVUFBVSxvS0FBbUcsS0FBSyxDQUFDLENBQUM7UUFDOUssSUFBSSxvQkFBb0IsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUM1QyxlQUFlLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUM1QyxjQUFjLEVBQ2QsUUFBUSxFQUNSLGlCQUFpQixFQUNqQixpQkFBaUIsRUFDakIsaUJBQWlCLENBQ2pCLENBQUM7UUFDSCxDQUFDO2FBQU0sQ0FBQztZQUNQLGNBQWMsR0FBRyxLQUFLLENBQUM7UUFDeEIsQ0FBQztRQUVELDZDQUE2QztRQUM3QyxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQztZQUMxQixxQkFBcUIsRUFBRSxPQUFPLENBQUMscUJBQXFCO1lBQ3BELFdBQVc7WUFDWCxrQkFBa0IsRUFBRSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLDRCQUE0QixDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFlBQVk7WUFDM0csaUJBQWlCLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRO1lBQy9FLGlCQUFpQjtZQUNqQixrQkFBa0I7U0FDbEIsQ0FBQyxDQUFDO1FBRUgsZ0ZBQWdGO1FBQ2hGLE1BQU0sV0FBVyxHQUFpQyxFQUFFLENBQUM7UUFDckQsTUFBTSw2QkFBNkIsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ3RHLElBQUksQ0FBQyxjQUFjLElBQUksQ0FDdEIsNkJBQTZCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsbUNBQW1DLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3BHLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLEVBQUUsQ0FBQyxJQUFJLDZCQUE2QixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLDJDQUEyQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQ3pKLEVBQUUsQ0FBQztZQUNILFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHlDQUF5QyxFQUFFLDZFQUE2RSxDQUFDLENBQUMsQ0FBQztRQUN0SixDQUFDO1FBRUQsaUdBQWlHO1FBQ2pHLElBQUksb0JBQW9CLElBQUksUUFBUSxFQUFFLENBQUM7WUFDdEMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLHNCQUFzQixDQUM3QyxjQUFjLEVBQ2QsUUFBUSxFQUNSLGlCQUFpQixFQUNqQixpQkFBaUIsRUFDakIsaUJBQWlCLENBQ2pCLENBQUM7WUFDRixJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUNoQixXQUFXLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzlCLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxDQUFDLGNBQWMsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1lBQzdDLGFBQWEsR0FBRywwQkFBMEIsQ0FBQyxrQkFBa0IsRUFBRSxXQUFXLEVBQUUsRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDdkgsQ0FBQztRQUVELE9BQU87WUFDTixjQUFjO1lBQ2Qsb0ZBQW9GO1lBQ3BGLG9CQUFvQixFQUFFLElBQUk7WUFDMUIsV0FBVztZQUNYLGVBQWU7WUFDZixhQUFhO1NBQ2IsQ0FBQztJQUNILENBQUM7SUFFTyxzQkFBc0IsQ0FDN0IsY0FBdUIsRUFDdkIsUUFBaUIsRUFDakIsaUJBQTJELEVBQzNELGlCQUFxRCxFQUNyRCxpQkFBbUQ7UUFFbkQsTUFBTSxlQUFlLEdBQUcsQ0FBQyxNQUFzRCxFQUFVLEVBQUU7WUFDMUYsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDO2lCQUNwQixNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQXNFLEVBQUUsQ0FDakYsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2lCQUMxQixHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQ1Isd0RBQXdEO2dCQUN4RCxNQUFNLGlCQUFpQixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ25FLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLEtBQUssU0FBUyxFQUFFLENBQUM7b0JBQ3ZDLE9BQU8sUUFBUSxDQUFDLGtDQUFrQyxFQUFFLGVBQWUsRUFBRSxLQUFLLGlCQUFpQixJQUFJLENBQUMsQ0FBQztnQkFDbEcsQ0FBQztnQkFDRCxNQUFNLFdBQVcsR0FBRyxnQkFBZ0IsaUhBQWlELENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQzFHLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxhQUFhLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztnQkFDakUsSUFBSSxLQUFLLEdBQUcsaUJBQWlCLENBQUM7Z0JBQzlCLFFBQVEsQ0FBQyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUUsQ0FBQztvQkFDOUI7d0JBQ0MsS0FBSyxHQUFHLEdBQUcsS0FBSyxZQUFZLENBQUM7d0JBQzdCLE1BQU07b0JBQ1Asc0NBQThCO29CQUM5Qjt3QkFDQyxLQUFLLEdBQUcsR0FBRyxLQUFLLFNBQVMsQ0FBQzt3QkFDMUIsTUFBTTtvQkFDUDt3QkFDQyxLQUFLLEdBQUcsR0FBRyxLQUFLLFdBQVcsQ0FBQzt3QkFDNUIsTUFBTTtvQkFDUCwyQ0FBbUM7b0JBQ25DO3dCQUNDLEtBQUssR0FBRyxHQUFHLEtBQUssY0FBYyxDQUFDO3dCQUMvQixNQUFNO2dCQUNSLENBQUM7Z0JBQ0QsT0FBTyxNQUFNLEtBQUssT0FBTyxXQUFXLENBQUMsUUFBUSxFQUFFLEtBQUssT0FBTyxJQUFJLENBQUM7WUFDakUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2hCLENBQUMsQ0FBQztRQUVGLE1BQU0sZUFBZSxHQUFHO1lBQ3ZCLFNBQVMsRUFBRTtnQkFDVixlQUFlLEVBQUUsZ0hBQWdEO2FBQ2pFO1NBQ0QsQ0FBQztRQUVGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQW9DLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDMUgsTUFBTSxvQkFBb0IsR0FBRyxNQUFNLEVBQUUsS0FBSyxJQUFJLE1BQU0sQ0FBQyxZQUFZLENBQUM7UUFDbEUsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1lBQzFCLE1BQU0sV0FBVyxHQUFHLGdCQUFnQixpSEFBaUQsUUFBUSxDQUFDLENBQUM7WUFDL0YsT0FBTyxJQUFJLGNBQWMsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLGlCQUFpQixDQUFDLGlCQUFpQixPQUFPLFdBQVcsQ0FBQyxRQUFRLEVBQUUsS0FBSyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsZUFBZSxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDalAsQ0FBQztRQUVELElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsUUFBUSxpQkFBaUIsRUFBRSxDQUFDO2dCQUMzQixLQUFLLGFBQWEsQ0FBQyxDQUFDLENBQUM7b0JBQ3BCLElBQUksaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQzt3QkFDL0MsT0FBTyxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsMkJBQTJCLEVBQUUsZUFBZSxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztvQkFDM0ksQ0FBQztvQkFDRCxNQUFNO2dCQUNQLENBQUM7Z0JBQ0QsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDO29CQUNuQix5Q0FBeUM7b0JBQ3pDLE1BQU0saUJBQWlCLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQzFGLElBQUksaUJBQWlCLElBQUksMEJBQTBCLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxlQUFlLEVBQUUsQ0FBQzt3QkFDdkksT0FBTyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGVBQWUsQ0FBQztvQkFDL0QsQ0FBQztvQkFDRCxNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FBQztvQkFDbkQsSUFBSSxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO3dCQUM5QixPQUFPLElBQUksY0FBYyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSwyQkFBMkIsRUFBRSxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztvQkFDckksQ0FBQzt5QkFBTSxJQUFJLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7d0JBQ25DLE9BQU8sSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLG1CQUFtQixFQUFFLDRCQUE0QixFQUFFLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO29CQUN2SSxDQUFDO29CQUNELE1BQU07Z0JBQ1AsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO2FBQU0sSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNyQixRQUFRLGlCQUFpQixFQUFFLENBQUM7Z0JBQzNCLEtBQUssYUFBYSxDQUFDLENBQUMsQ0FBQztvQkFDcEIsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQzt3QkFDNUIsT0FBTyxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsa0NBQWtDLEVBQUUsZUFBZSxDQUFDLGlCQUFpQixDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztvQkFDeEosQ0FBQztvQkFDRCxNQUFNO2dCQUNQLENBQUM7Z0JBQ0QsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDO29CQUNuQixNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsaUJBQWlCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUN0RixJQUFJLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7d0JBQzlCLE9BQU8sSUFBSSxjQUFjLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLGtDQUFrQyxFQUFFLGVBQWUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO29CQUNsSixDQUFDO3lCQUFNLElBQUksV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQzt3QkFDbkMsT0FBTyxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsbUNBQW1DLEVBQUUsZUFBZSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEVBQUUsZUFBZSxDQUFDLENBQUM7b0JBQ3BKLENBQUM7b0JBQ0QsTUFBTTtnQkFDUCxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0NBQ0QsQ0FBQTtBQWpSWSw4QkFBOEI7SUFPeEMsV0FBQSxxQkFBcUIsQ0FBQTtJQUNyQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxvQkFBb0IsQ0FBQTtHQVZWLDhCQUE4QixDQWlSMUMifQ==