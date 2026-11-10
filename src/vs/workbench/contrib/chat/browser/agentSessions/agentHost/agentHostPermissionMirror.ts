/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../../base/common/async.js';
import { TERMINAL_AUTO_APPROVE_SETTING_ID, URL_AUTO_APPROVE_SETTING_ID } from '../../../../../../platform/agentHost/common/agentHostSchema.js';
import { webFetchRuleToUrlPattern } from '../../../../../../platform/agentHost/common/permissionRules.js';
import { shellRuleToTerminalRule } from '../../../../../../platform/agentHost/common/terminalPermissionRules.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { type IUrlApprovalSettings } from '../../../../../../platform/url/common/urlApprovalPatterns.js';

const settingsWrites = new Sequencer();

/** Mirrors local host URL and terminal grants into user settings without widening response approvals. */
export function mirrorAgentHostGrants(configurationService: IConfigurationService, rules: readonly string[]): Promise<void> {
	const patterns = rules.flatMap(rule => {
		const pattern = webFetchRuleToUrlPattern(rule);
		return pattern === undefined ? [] : [pattern];
	});
	const terminalRules = rules.flatMap(rule => {
		const terminalRule = shellRuleToTerminalRule(rule);
		return terminalRule ? [terminalRule] : [];
	});
	if (patterns.length === 0 && terminalRules.length === 0) {
		return Promise.resolve();
	}
	return settingsWrites.queue(async () => {
		if (patterns.length > 0) {
			const approvals = { ...configurationService.inspect<Record<string, boolean | IUrlApprovalSettings>>(URL_AUTO_APPROVE_SETTING_ID)?.userValue };
			for (const pattern of patterns) {
				const existing = approvals[pattern];
				const approveResponse = typeof existing === 'boolean' ? existing : existing?.approveResponse;
				approvals[pattern] = approveResponse
					? true
					: { approveRequest: true, approveResponse: false };
			}
			await configurationService.updateValue(URL_AUTO_APPROVE_SETTING_ID, approvals, ConfigurationTarget.USER);
		}
		if (terminalRules.length > 0) {
			const approvals = { ...configurationService.inspect<Record<string, boolean | null | { approve: boolean; matchCommandLine?: boolean }>>(TERMINAL_AUTO_APPROVE_SETTING_ID)?.userValue };
			for (const { key, value } of terminalRules) {
				approvals[key] = value;
			}
			await configurationService.updateValue(TERMINAL_AUTO_APPROVE_SETTING_ID, approvals, ConfigurationTarget.USER);
		}
	});
}
