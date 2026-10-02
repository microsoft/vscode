/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationValue } from '../../../configuration/common/configuration.js';
import { Extensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { AgentNetworkDomainSettingId } from '../../../networkFilter/common/settings.js';
import { Registry } from '../../../registry/common/platform.js';
import { AgentSandboxSettingId } from '../../../sandbox/common/settings.js';
import { getAgentHostPolicyGapImpact, getAgentHostPolicyGaps } from '../../common/agentHostPolicyReadiness.js';
import { agentHostPolicySupport } from '../../common/agentHostPolicySupport.js';

suite('AgentHostPolicyReadiness', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		sinon.stub(Registry.as<IConfigurationRegistry>(Extensions.Configuration), 'getPolicyConfigurations')
			.returns(new Map(Object.keys(agentHostPolicySupport).map(name => [name, name])));
	});
	teardown(() => sinon.restore());

	function configuration(policies: Record<string, unknown>, settings: Record<string, unknown> = {}) {
		const service = new TestConfigurationService({ ...policies, ...settings });
		store.add(service.onDidChangeConfigurationEmitter);
		sinon.stub(service, 'inspect').callsFake(<T>(key: string): IConfigurationValue<T> => ({
			value: service.getValue<T>(key),
			userValue: service.getValue<T>(key),
			policyValue: policies[key] as T | undefined,
		}));
		return service;
	}

	test('only applied enterprise requirements are reported', () => {
		assert.deepStrictEqual([
			getAgentHostPolicyGaps(configuration({})),
			getAgentHostPolicyGaps(configuration({}, { ChatMCP: 'none' })),
			getAgentHostPolicyGaps(configuration({ ChatToolsAutoApprove: false, UpdateMode: 'none' })),
			getAgentHostPolicyGaps(configuration({ ChatAllowedMcpServers: [], ChatMCP: 'none' })),
		], [[], [], [], [
			{ policyName: 'ChatAllowedMcpServers', settingId: 'ChatAllowedMcpServers', status: 'partial' },
			{ policyName: 'ChatMCP', settingId: 'ChatMCP', status: 'partial' },
		]]);
	});

	test('known permissive values are not reported as gaps', () => {
		assert.deepStrictEqual(getAgentHostPolicyGaps(configuration({
			ChatMCP: 'all',
			ChatAgentMode: true,
			ChatToolsTerminalEnableAutoApprove: true,
			ChatAgentSandboxEnabled: 'off',
			ChatAgentSandboxAllowAutoApprove: true,
			ChatPluginsEnabled: true,
			ChatHooks: true,
			CopilotOtelEnabled: true,
			ChatAllowManagedMcpServersOnly: false,
			ChatAllowManagedHooksOnly: false,
			ChatStrictPluginOnlyCustomization: false,
			ChatToolsEligibleForAutoApproval: { tool: true },
			ChatAllowedMcpServers: null,
			ChatDeniedMcpServers: [],
			ChatStrictMarketplaces: null,
			ChatEnabledPlugins: {},
			ChatExtraMarketplaces: {},
			CopilotOtelHeaders: {},
			McpEnterpriseManagedAuthIdp: {},
		})), []);
	});

	test('restrictive values and required functionality are covered for each gap', () => {
		const policies = {
			ChatMCP: 'registry',
			ChatAgentMode: false,
			ChatToolsTerminalEnableAutoApprove: false,
			ChatAgentSandboxEnabled: 'on',
			ChatAgentSandboxAllowAutoApprove: false,
			ChatPluginsEnabled: false,
			ChatHooks: false,
			CopilotOtelCaptureIdentity: false,
			CopilotOtelEnabled: false,
			CopilotOtelProtocol: 'otlp-http',
			ChatAllowManagedMcpServersOnly: true,
			ChatAllowManagedHooksOnly: true,
			ChatStrictPluginOnlyCustomization: true,
			ChatToolsEligibleForAutoApproval: { tool: false },
			ChatAllowedMcpServers: [],
			ChatDeniedMcpServers: [{ serverName: 'blocked' }],
			ChatStrictMarketplaces: [],
			ChatEnabledPlugins: { required: true },
			ChatExtraMarketplaces: { required: 'owner/repository' },
			CopilotOtelHeaders: { authorization: 'test-placeholder' },
			McpEnterpriseManagedAuthIdp: { issuer: 'https://example.invalid' },
			ChatAgentNetworkFilter: true,
			ChatAgentAllowedNetworkDomains: [],
			ChatAgentDeniedNetworkDomains: [],
		};
		assert.deepStrictEqual(
			getAgentHostPolicyGaps(configuration(policies, { [AgentNetworkDomainSettingId.NetworkFilter]: true })).map(gap => gap.policyName).sort(),
			Object.keys(policies).sort(),
		);
	});

	test('network lists are inactive when both filtering and sandboxing are off', () => {
		assert.deepStrictEqual(getAgentHostPolicyGaps(configuration({
			ChatAgentNetworkFilter: false,
			ChatAgentAllowedNetworkDomains: ['example.invalid'],
			ChatAgentDeniedNetworkDomains: ['blocked.invalid'],
		}, { [AgentNetworkDomainSettingId.NetworkFilter]: false })), []);
	});

	test('domain policies still apply to sandboxing independently of URL filtering', () => {
		for (const enabled of ['on', true]) {
			const service = configuration({
				ChatAgentNetworkFilter: false,
				ChatAgentAllowedNetworkDomains: ['example.invalid'],
				ChatAgentDeniedNetworkDomains: ['blocked.invalid'],
			}, {
				[AgentNetworkDomainSettingId.NetworkFilter]: false,
				[AgentSandboxSettingId.AgentSandboxEnabled]: enabled,
			});
			assert.deepStrictEqual(getAgentHostPolicyGaps(service).map(gap => gap.policyName),
				['ChatAgentAllowedNetworkDomains', 'ChatAgentDeniedNetworkDomains']);
		}
	});

	test('empty sandbox domain lists and legacy disabled sandbox values add no requirement', () => {
		assert.deepStrictEqual(getAgentHostPolicyGaps(configuration({
			ChatAgentSandboxEnabled: false,
			ChatAgentAllowedNetworkDomains: [],
			ChatAgentDeniedNetworkDomains: [],
		}, {
			[AgentNetworkDomainSettingId.NetworkFilter]: false,
			[AgentSandboxSettingId.AgentSandboxEnabled]: 'on',
		})), []);
	});

	test('merged sandbox and identity fixes retain only lifecycle and runtime verification concerns', () => {
		const service = configuration({ ChatAgentSandboxEnabled: 'on', CopilotOtelCaptureIdentity: true });
		assert.deepStrictEqual(getAgentHostPolicyGaps(service).map(gap => ({
			policyName: gap.policyName,
			status: gap.status,
			impact: getAgentHostPolicyGapImpact(gap.policyName),
		})), [
			{
				policyName: 'ChatAgentSandboxEnabled',
				status: 'partial',
				impact: 'Policy-required sandboxing blocks direct session Off overrides on supported platforms. Verify delayed policy loading and loss/reapplication of the last client\'s requirement across disconnect-grace expiry.',
			},
			{
				policyName: 'CopilotOtelCaptureIdentity',
				status: 'partial',
				impact: 'The Agent Host pipeline honors identity capture and suppression. Authenticated runtime account attribution still requires a runtime update and end-to-end verification; direct runtime exports use their own identity controls.',
			},
		]);
	});

	test('both identity capture and suppression retain runtime-path verification', () => {
		for (const value of [true, false]) {
			assert.deepStrictEqual(getAgentHostPolicyGaps(configuration({ CopilotOtelCaptureIdentity: value })), [
				{ policyName: 'CopilotOtelCaptureIdentity', settingId: 'CopilotOtelCaptureIdentity', status: 'partial' },
			]);
		}
	});

	test('shared editor controls and out-of-scope provider gates are not reported as Copilot gaps', () => {
		assert.deepStrictEqual(getAgentHostPolicyGaps(configuration({
			AgentsVoice: false,
			DictationEnabled: false,
			DictationLLMCleanup: false,
			DictationModel: 'model',
			AllowedExtensions: {},
			ExtensionsAutoUpdate: false,
			ExtensionsAutoUpdateDelay: 24,
			ExtensionGalleryAuthProvider: 'provider',
			ExtensionGalleryServiceUrl: 'https://example.invalid',
			McpGalleryServiceUrl: 'https://example.invalid',
			EnableFeedback: false,
			UpdateMode: 'none',
			Claude3PIntegration: false,
			Codex3PIntegration: false,
		})), []);
	});

	test('policy removal and permissive updates take effect without caching', () => {
		const policies: Record<string, unknown> = { ChatMCP: 'none' };
		const service = configuration(policies);
		const states = [getAgentHostPolicyGaps(service).map(gap => gap.policyName)];
		policies.ChatMCP = 'all';
		states.push(getAgentHostPolicyGaps(service).map(gap => gap.policyName));
		policies.ChatMCP = 'none';
		states.push(getAgentHostPolicyGaps(service).map(gap => gap.policyName));
		delete policies.ChatMCP;
		states.push(getAgentHostPolicyGaps(service).map(gap => gap.policyName));
		assert.deepStrictEqual(states, [['ChatMCP'], [], ['ChatMCP'], []]);
	});

	test('resolving inventory coverage removes the diagnostic gap', () => {
		const service = configuration({ ChatMCP: 'none' });
		assert.deepStrictEqual(getAgentHostPolicyGaps(service).map(gap => gap.policyName), ['ChatMCP']);
		sinon.stub(agentHostPolicySupport, 'ChatMCP').value({ status: 'enforced' });
		assert.deepStrictEqual(getAgentHostPolicyGaps(service), []);
	});
});
