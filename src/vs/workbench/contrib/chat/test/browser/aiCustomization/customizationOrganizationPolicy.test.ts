/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { mcpAllowedServersConfig } from '../../../../../../platform/mcp/common/mcpManagement.js';
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
import { getCustomizationOrganizationRestriction } from '../../../browser/aiCustomization/customizationOrganizationPolicy.js';
import { AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';

suite('customizationOrganizationPolicy', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function restrictions(values: { readonly policy?: Record<string, unknown>; readonly user?: Record<string, unknown> }) {
		const configurationService: Pick<IConfigurationService, 'inspect'> = {
			inspect: <T>(key: string) => ({ policyValue: values.policy?.[key], userValue: values.user?.[key], value: values.policy?.[key] ?? values.user?.[key] }) as IConfigurationValue<T>,
		};
		return Object.fromEntries([
			AICustomizationManagementSection.Skills,
			AICustomizationManagementSection.Agents,
			AICustomizationManagementSection.Instructions,
			AICustomizationManagementSection.Hooks,
			AICustomizationManagementSection.McpServers,
			AICustomizationManagementSection.Plugins,
		].map(section => [section, getCustomizationOrganizationRestriction(configurationService, section)]));
	}

	test('derives section restrictions from organization policy only', () => {
		const allowlist = [{ serverName: 'approved' }];
		assert.deepStrictEqual({
			none: restrictions({}),
			userSettingsOnly: restrictions({ user: { [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG]: true, [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG]: true, [mcpAllowedServersConfig]: allowlist } }),
			pluginOnly: restrictions({ policy: { [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG]: true, [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG]: true } }),
			managedHooksOverPluginOnly: restrictions({ policy: { [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG]: true, [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG]: true } }),
			managedMcpOverAllowlist: restrictions({ policy: { [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG]: true, [mcpAllowedServersConfig]: allowlist } }),
			emptyAllowlist: restrictions({ policy: { [mcpAllowedServersConfig]: [] } }),
		}, {
			none: { skills: undefined, agents: undefined, instructions: undefined, hooks: undefined, mcpServers: undefined, plugins: undefined },
			userSettingsOnly: { skills: undefined, agents: undefined, instructions: undefined, hooks: undefined, mcpServers: undefined, plugins: undefined },
			pluginOnly: { skills: 'pluginOnly', agents: 'pluginOnly', instructions: 'pluginOnly', hooks: 'pluginOnly', mcpServers: 'pluginOnly', plugins: undefined },
			managedHooksOverPluginOnly: { skills: 'pluginOnly', agents: 'pluginOnly', instructions: 'pluginOnly', hooks: 'organizationOnly', mcpServers: 'pluginOnly', plugins: undefined },
			managedMcpOverAllowlist: { skills: undefined, agents: undefined, instructions: undefined, hooks: undefined, mcpServers: 'organizationOnly', plugins: undefined },
			emptyAllowlist: { skills: undefined, agents: undefined, instructions: undefined, hooks: undefined, mcpServers: 'allowlist', plugins: undefined },
		});
	});
});
