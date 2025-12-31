/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asArray } from '../../../../../../../base/common/arrays.js';
import { createCommandUri, MarkdownString, type IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import type { SingleOrMany } from '../../../../../../../base/common/types.js';
import { localize } from '../../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalChatService } from '../../../../../terminal/browser/terminal.js';
import { IStorageService, StorageScope } from '../../../../../../../platform/storage/common/storage.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { ChatConfiguration } from '../../../../../chat/common/constants.js';
import type { ToolConfirmationAction } from '../../../../../chat/common/tools/languageModelToolsService.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { CommandLineAutoApprover, type IAutoApproveRule, type ICommandApprovalResult, type ICommandApprovalResultWithReason } from '../../commandLineAutoApprover.js';
import { dedupeRules, generateAutoApproveActions, isPowerShell } from '../../runInTerminalHelpers.js';
import type { RunInTerminalToolTelemetry } from '../../runInTerminalToolTelemetry.js';
import { type TreeSitterCommandParser } from '../../treeSitterCommandParser.js';
import type { ICommandLineAnalyzer, ICommandLineAnalyzerOptions, ICommandLineAnalyzerResult } from './commandLineAnalyzer.js';
import { TerminalChatCommandId } from '../../../../chat/browser/terminalChat.js';

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

		let subCommands: string[] | undefined;
		try {
			subCommands = await this._treeSitterCommandParser.extractSubCommands(options.treeSitterLanguage, options.commandLine);
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

		const subCommandResults = subCommands.map(e => this._commandLineAutoApprover.isCommandAutoApproved(e, options.shell, options.os));
		const commandLineResult = this._commandLineAutoApprover.isCommandLineAutoApproved(options.commandLine);
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
			autoApproveDefault = deniedSubCommandResult.rule?.isDefaultRule;
			autoApproveReason = 'subCommand';
		} else if (commandLineResult.result === 'denied') {
			this._log('Command line DENIED auto approval');
			isDenied = true;
			autoApproveDefault = commandLineResult.rule?.isDefaultRule;
			autoApproveReason = 'commandLine';
		} else {
			if (subCommandResults.every(e => e.result === 'approved')) {
				this._log('All sub-commands auto-approved');
				autoApproveReason = 'subCommand';
				isAutoApproved = true;
				autoApproveDefault = subCommandResults.every(e => e.rule?.isDefaultRule);
			} else {
				this._log('All sub-commands NOT auto-approved');
				if (commandLineResult.result === 'approved') {
					this._log('Command line auto-approved');
					autoApproveReason = 'commandLine';
					isAutoApproved = true;
					autoApproveDefault = commandLineResult.rule?.isDefaultRule;
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
		const disclaimers: string[] = [];
		const subCommandsLowerFirstWordOnly = subCommands.map(command => command.split(' ')[0].toLowerCase());
		if (!isAutoApproved && (
			subCommandsLowerFirstWordOnly.some(command => promptInjectionWarningCommandsLower.includes(command)) ||
			(isPowerShell(options.shell, options.os) && subCommandsLowerFirstWordOnly.some(command => promptInjectionWarningCommandsLowerPwshOnly.includes(command)))
		)) {
			disclaimers.push(localize('runInTerminal.promptInjectionDisclaimer', 'Web content may contain malicious code or attempt prompt injection attacks.'));
		}

		if (!isAutoApproved && isAutoApproveEnabled) {
			customActions = generateAutoApproveActions(options.commandLine, subCommands, { subCommandResults, commandLineResult });
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
		const formatRuleLinks = (result: SingleOrMany<{ result: ICommandApprovalResult; rule?: IAutoApproveRule; reason: string }>): string => {
			return asArray(result).map(e => {
				const settingsUri = createCommandUri(TerminalChatCommandId.OpenTerminalSettingsLink, e.rule!.sourceTarget);
				return `[\`${e.rule!.sourceText}\`](${settingsUri.toString()} "${localize('ruleTooltip', 'View rule in settings')}")`;
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
					if (commandLineResult.rule) {
						return new MarkdownString(localize('autoApprove.rule', 'Auto approved by rule {0}', formatRuleLinks(commandLineResult)), mdTrustSettings);
					}
					break;
				}
				case 'subCommand': {
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
						return new MarkdownString(localize('autoApproveDenied.rule', 'Auto approval denied by rule {0}', formatRuleLinks(uniqueRules)));
					} else if (uniqueRules.length > 1) {
						return new MarkdownString(localize('autoApproveDenied.rules', 'Auto approval denied by rules {0}', formatRuleLinks(uniqueRules)));
					}
					break;
				}
			}
		}

		return undefined;
	}
}
