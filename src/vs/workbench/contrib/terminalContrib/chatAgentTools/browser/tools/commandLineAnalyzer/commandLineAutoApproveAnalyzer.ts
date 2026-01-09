/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../../../../base/common/arrays.js';
import { createCommandUri, MarkdownString, type IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import type { SingleOrMany } from '../../../../../../../base/common/types.js';
import { localize } from '../../../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalChatService } from '../../../../../terminal/browser/terminal.js';
import { IStorageService, StorageScope } from '../../../../../../../platform/storage/common/storage.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { ChatConfiguration } from '../../../../../chat/common/constants.js';
import type { ToolConfirmationAction } from '../../../../../chat/common/tools/languageModelToolsService.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { dedupeRules, generateAutoApproveActions, isPowerShell } from '../../runInTerminalHelpers.js';
import type { RunInTerminalToolTelemetry } from '../../runInTerminalToolTelemetry.js';
import { type TreeSitterCommandParser } from '../../treeSitterCommandParser.js';
import { type ICommandLineAnalyzer, type ICommandLineAnalyzerOptions, type ICommandLineAnalyzerResult, type IAutoApproveRule, isAutoApproveRule, isNpmScriptAutoApproveRule } from './commandLineAnalyzer.js';
import { TerminalChatCommandId } from '../../../../chat/browser/terminalChat.js';
import { CommandLineAutoApprover, type ICommandApprovalResultWithReason } from './autoApprove/commandLineAutoApprover.js';

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

export class CommandLineAutoApproveAnalyzer extends Disposable implements ICommandLineAnalyzer {
	private readonly _commandLineAutoApprover: CommandLineAutoApprover;

	constructor(
		private readonly _treeSitterCommandParser: TreeSitterCommandParser,
		private readonly _telemetry: RunInTerminalToolTelemetry,
		private readonly _log: (message: string, ...args: unknown[]) => void,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
	) {
		super();
		this._commandLineAutoApprover = this._register(instantiationService.createInstance(CommandLineAutoApprover));
	}

	async analyze(options: ICommandLineAnalyzerOptions): Promise<ICommandLineAnalyzerResult> {
		if (options.chatSessionId && this._terminalChatService.hasChatSessionAutoApproval(options.chatSessionId)) {
			this._log('Session has auto approval enabled, auto approving command');
			const disableUri = createCommandUri(TerminalChatCommandId.DisableSessionAutoApproval, options.chatSessionId);
			const mdTrustSettings = {
				isTrusted: {
					enabledCommands: [TerminalChatCommandId.DisableSessionAutoApproval]
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

		let subCommands: string[] | undefined;
		try {
			subCommands = await this._treeSitterCommandParser.extractSubCommands(options.treeSitterLanguage, trimmedCommandLine);
			this._log(`Parsed sub-commands via ${options.treeSitterLanguage} grammar`, subCommands);
		} catch (e) {
			console.error(e);
			this._log(`Failed to parse sub-commands via ${options.treeSitterLanguage} grammar`);
		}

		let isAutoApproved = false;
		let autoApproveInfo: IMarkdownString | undefined;
		let customActions: ToolConfirmationAction[] | undefined;

		if (!subCommands) {
			return {
				isAutoApproveAllowed: false,
				disclaimers: [],
			};
		}

		const subCommandResults = await Promise.all(subCommands.map(e => this._commandLineAutoApprover.isCommandAutoApproved(e, options.shell, options.os, options.cwd, options.chatSessionId)));
		const commandLineResult = this._commandLineAutoApprover.isCommandLineAutoApproved(trimmedCommandLine, options.chatSessionId);
		const autoApproveReasons: string[] = [
			...subCommandResults.map(e => e.reason),
			commandLineResult.reason,
		];

		let isDenied = false;
		let autoApproveReason: 'subCommand' | 'commandLine' | undefined;
		let autoApproveDefault: boolean | undefined;

		const deniedSubCommandResult = subCommandResults.find(e => e.result === 'denied');
		if (deniedSubCommandResult) {
			this._log('Sub-command DENIED auto approval');
			isDenied = true;
			autoApproveDefault = isAutoApproveRule(deniedSubCommandResult.rule) ? deniedSubCommandResult.rule.isDefaultRule : undefined;
			autoApproveReason = 'subCommand';
		} else if (commandLineResult.result === 'denied') {
			this._log('Command line DENIED auto approval');
			isDenied = true;
			autoApproveDefault = isAutoApproveRule(commandLineResult.rule) ? commandLineResult.rule.isDefaultRule : undefined;
			autoApproveReason = 'commandLine';
		} else {
			if (subCommandResults.every(e => e.result === 'approved')) {
				this._log('All sub-commands auto-approved');
				isAutoApproved = true;
				autoApproveReason = 'subCommand';
				autoApproveDefault = subCommandResults.every(e => isAutoApproveRule(e.rule) && e.rule.isDefaultRule);
			} else {
				this._log('All sub-commands NOT auto-approved');
				if (commandLineResult.result === 'approved') {
					this._log('Command line auto-approved');
					autoApproveReason = 'commandLine';
					isAutoApproved = true;
					autoApproveDefault = isAutoApproveRule(commandLineResult.rule) ? commandLineResult.rule.isDefaultRule : undefined;
				} else {
					this._log('Command line NOT auto-approved');
				}
			}
		}

		// Log detailed auto approval reasoning
		for (const reason of autoApproveReasons) {
			this._log(`- ${reason}`);
		}

		// Apply auto approval or force it off depending on enablement/opt-in state
		const isAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
		const isAutoApproveWarningAccepted = this._storageService.getBoolean(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION, false);
		if (isAutoApproveEnabled && isAutoApproved) {
			autoApproveInfo = this._createAutoApproveInfo(
				isAutoApproved,
				isDenied,
				autoApproveReason,
				subCommandResults,
				commandLineResult,
			);
		} else {
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
		const disclaimers: (string | IMarkdownString)[] = [];
		const subCommandsLowerFirstWordOnly = subCommands.map(command => command.split(' ')[0].toLowerCase());
		if (!isAutoApproved && (
			subCommandsLowerFirstWordOnly.some(command => promptInjectionWarningCommandsLower.includes(command)) ||
			(isPowerShell(options.shell, options.os) && subCommandsLowerFirstWordOnly.some(command => promptInjectionWarningCommandsLowerPwshOnly.includes(command)))
		)) {
			disclaimers.push(localize('runInTerminal.promptInjectionDisclaimer', 'Web content may contain malicious code or attempt prompt injection attacks.'));
		}

		// Add denial reason to disclaimers when auto-approve is enabled but command was denied by a rule
		if (isAutoApproveEnabled && isDenied) {
			const denialInfo = this._createAutoApproveInfo(
				isAutoApproved,
				isDenied,
				autoApproveReason,
				subCommandResults,
				commandLineResult,
			);
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

	private _createAutoApproveInfo(
		isAutoApproved: boolean,
		isDenied: boolean,
		autoApproveReason: 'subCommand' | 'commandLine' | undefined,
		subCommandResults: ICommandApprovalResultWithReason[],
		commandLineResult: ICommandApprovalResultWithReason,
	): IMarkdownString | undefined {
		const formatRuleLinks = (result: SingleOrMany<ICommandApprovalResultWithReason>): string => {
			return asArray(result)
				.filter((e): e is ICommandApprovalResultWithReason & { rule: IAutoApproveRule } =>
					isAutoApproveRule(e.rule))
				.map(e => {
					// Session rules cannot be actioned currently so no link
					const escapedSourceText = e.rule.sourceText.replaceAll('$', '\\$');
					if (e.rule.sourceTarget === 'session') {
						return localize('autoApproveRule.sessionIndicator', '{0} (session)', `\`${escapedSourceText}\``);
					}
					const settingsUri = createCommandUri(TerminalChatCommandId.OpenTerminalSettingsLink, e.rule.sourceTarget);
					const tooltip = localize('ruleTooltip', 'View rule in settings');
					let label = escapedSourceText;
					switch (e.rule?.sourceTarget) {
						case ConfigurationTarget.DEFAULT:
							label = `${label} (default)`;
							break;
						case ConfigurationTarget.USER:
						case ConfigurationTarget.USER_LOCAL:
							label = `${label} (user)`;
							break;
						case ConfigurationTarget.USER_REMOTE:
							label = `${label} (remote)`;
							break;
						case ConfigurationTarget.WORKSPACE:
						case ConfigurationTarget.WORKSPACE_FOLDER:
							label = `${label} (workspace)`;
							break;
					}
					return `[\`${label}\`](${settingsUri.toString()} "${tooltip}")`;
				}).join(', ');
		};

		const mdTrustSettings = {
			isTrusted: {
				enabledCommands: [TerminalChatCommandId.OpenTerminalSettingsLink]
			}
		};

		const config = this._configurationService.inspect<boolean | Record<string, boolean>>(ChatConfiguration.GlobalAutoApprove);
		const isGlobalAutoApproved = config?.value ?? config.defaultValue;
		if (isGlobalAutoApproved) {
			const settingsUri = createCommandUri(TerminalChatCommandId.OpenTerminalSettingsLink, 'global');
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
					} else if (uniqueRules.length > 1) {
						return new MarkdownString(localize('autoApprove.rules', 'Auto approved by rules {0}', formatRuleLinks(uniqueRules)), mdTrustSettings);
					}
					break;
				}
			}
		} else if (isDenied) {
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
					} else if (uniqueRules.length > 1) {
						return new MarkdownString(localize('autoApproveDenied.rules', 'Auto approval denied by rules {0}', formatRuleLinks(uniqueRules)), mdTrustSettings);
					}
					break;
				}
			}
		}

		return undefined;
	}
}
