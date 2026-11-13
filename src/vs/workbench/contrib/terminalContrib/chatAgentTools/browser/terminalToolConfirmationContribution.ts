/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IQuickInputButton, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { ILanguageModelToolConfirmationContribution, ILanguageModelToolConfirmationContributionQuickTreeItem } from '../../../chat/common/tools/languageModelToolsConfirmationService.js';
import { TerminalChatAgentToolsSettingId } from '../common/terminalChatAgentToolsConfiguration.js';

type TerminalAutoApproveRules = Record<string, boolean | null | { approve: boolean; matchCommandLine?: boolean }>;

const trashButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.trash),
	tooltip: localize('delete', "Delete")
};

/** Contributes user command rules to the tool approval picker. */
export class TerminalToolConfirmationContribution implements ILanguageModelToolConfirmationContribution {
	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IPreferencesService private readonly _preferencesService: IPreferencesService
	) { }

	getManageActions(): ILanguageModelToolConfirmationContributionQuickTreeItem[] {
		const items: ILanguageModelToolConfirmationContributionQuickTreeItem[] = [];

		for (const [command, rule] of Object.entries(this._getUserRules())) {
			if (rule === null) {
				continue;
			}
			const approved = typeof rule === 'boolean' ? rule : rule.approve;
			const description = approved ? localize('autoApproved', "Auto-approved") : localize('requiresApproval', "Requires approval");
			items.push({
				id: `terminal/${command}`,
				label: command,
				description: typeof rule === 'object' && rule.matchCommandLine
					? localize('fullCommandLine', "{0}, full command line", description)
					: description,
				checked: approved,
				buttons: [trashButton],
				onDidChangeChecked: async checked => {
					const rules = this._getUserRules();
					await this._configurationService.updateValue(TerminalChatAgentToolsSettingId.AutoApprove, {
						...rules,
						[command]: typeof rule === 'boolean' ? checked : { ...rule, approve: checked }
					}, ConfigurationTarget.USER);
				},
				onDidTriggerItemButton: async button => {
					if (button !== trashButton) {
						return;
					}
					const rules = { ...this._getUserRules() };
					delete rules[command];
					await this._configurationService.updateValue(TerminalChatAgentToolsSettingId.AutoApprove, rules, ConfigurationTarget.USER);
				}
			});
		}

		items.push({
			pickable: false,
			label: localize('addCommandRule', "Add Command Rule..."),
			onDidOpen: async () => {
				const command = (await this._quickInputService.input({
					prompt: localize('addCommandRulePrompt', "Enter a command prefix to run without approval, e.g. npm test, or a /regex/"),
					validateInput: async value => value.trim() ? undefined : localize('commandRuleRequired', "Enter a command prefix or regular expression.")
				}))?.trim();
				if (!command) {
					return;
				}
				await this._configurationService.updateValue(TerminalChatAgentToolsSettingId.AutoApprove, {
					...this._getUserRules(),
					[command]: true
				}, ConfigurationTarget.USER);
			}
		}, {
			pickable: false,
			label: localize('moreOptions', "More Options..."),
			description: localize('openSettings', "Open settings"),
			closesPicker: true,
			onDidOpen: async () => {
				await this._preferencesService.openUserSettings({ query: TerminalChatAgentToolsSettingId.AutoApprove });
			}
		});

		return items;
	}

	private _getUserRules(): TerminalAutoApproveRules {
		return this._configurationService.inspect<TerminalAutoApproveRules>(TerminalChatAgentToolsSettingId.AutoApprove).userValue ?? {};
	}
}
