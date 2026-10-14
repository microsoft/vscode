/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { PolicyName } from '../../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AbstractPolicyService, PolicyValue, PolicyValueSource } from '../../../../../platform/policy/common/policy.js';
import { PolicyTelemetryContribution } from '../../browser/policyTelemetry.contribution.js';

class TestPolicyService extends AbstractPolicyService {

	setPolicy(name: PolicyName, value: PolicyValue, source?: PolicyValueSource): void {
		const type = typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : 'boolean';
		this.policyDefinitions[name] = { type };
		this.updatePolicyValue(name, value, source);
	}

	removePolicy(name: PolicyName): void {
		this.updatePolicyValue(name, undefined);
	}

	fireChange(): void {
		this._onDidChange.fire([]);
	}

	protected async _updatePolicyDefinitions(): Promise<void> { }
}

const POLICY_SOURCE_FIELDS = {
	toolsEligibleForAutoApprovalSource: 'ChatToolsEligibleForAutoApproval',
	toolsTerminalEnableAutoApproveSource: 'ChatToolsTerminalEnableAutoApprove',
	mcpAccessSource: 'ChatMCP',
	allowedMcpServersSource: 'ChatAllowedMcpServers',
	deniedMcpServersSource: 'ChatDeniedMcpServers',
	allowManagedMcpServersOnlySource: 'ChatAllowManagedMcpServersOnly',
	mcpEnterpriseManagedAuthIdpSource: 'McpEnterpriseManagedAuthIdp',
	pluginsEnabledSource: 'ChatPluginsEnabled',
	enabledPluginsSource: 'ChatEnabledPlugins',
	extraMarketplacesSource: 'ChatExtraMarketplaces',
	strictMarketplacesSource: 'ChatStrictMarketplaces',
	strictPluginOnlyCustomizationSource: 'ChatStrictPluginOnlyCustomization',
	hooksSource: 'ChatHooks',
	allowManagedHooksOnlySource: 'ChatAllowManagedHooksOnly',
	agentModeSource: 'ChatAgentMode',
	otelEnabledSource: 'CopilotOtelEnabled',
	otelProtocolSource: 'CopilotOtelProtocol',
	otelCaptureIdentitySource: 'CopilotOtelCaptureIdentity',
	otelHeadersSource: 'CopilotOtelHeaders',
	agentNetworkFilterSource: 'ChatAgentNetworkFilter',
	agentAllowedNetworkDomainsSource: 'ChatAgentAllowedNetworkDomains',
	agentDeniedNetworkDomainsSource: 'ChatAgentDeniedNetworkDomains',
};

const EMPTY_EVENT = {
	devicePolicyCount: 0,
	nativeMdmPolicyCount: 0,
	serverManagedSettingsPolicyCount: 0,
	fileManagedSettingsPolicyCount: 0,
	mixedManagedSettingsPolicyCount: 0,
	accountPolicyCount: 0,
	accountGatePolicyCount: 0,
	defaultModelSet: false,
	toolsAutoApproveSet: false,
	enabledPluginsSet: false,
	extraMarketplacesSet: false,
	strictMarketplacesSet: false,
	approvedOrgsSet: false,
	otelSet: false,
	telemetryLevelSet: false,
	enableFeedbackSet: false,
	defaultModelForcedToAuto: false,
	toolsAutoApproveForcedOff: false,
	strictMarketplacesLockdown: false,
	otelForcedEnabled: false,
	telemetryLevel: undefined,
	...Object.fromEntries(Object.keys(POLICY_SOURCE_FIELDS).map(field => [field, 'none'])),
};

suite('PolicyTelemetryContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createContribution(policyService: TestPolicyService): { events: { name: string; data: unknown }[]; clock: sinon.SinonFakeTimers } {
		const clock = sinon.useFakeTimers();
		const events: { name: string; data: unknown }[] = [];
		const telemetryService = {
			publicLog2: (name: string, data: unknown) => { events.push({ name, data }); },
		};
		store.add(policyService);
		store.add(new PolicyTelemetryContribution(
			policyService,
			telemetryService as never,
		));
		return { events, clock };
	}

	test('emits an empty applied event at startup when no policies are set', () => {
		const { events, clock } = createContribution(new TestPolicyService());
		clock.tick(500);

		assert.deepStrictEqual(events, [{ name: 'policy.applied', data: EMPTY_EVENT }]);
	});

	test('reports every applied policy and value bucket', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('ChatDefaultModel', 'auto');
		policyService.setPolicy('ChatToolsAutoApprove', false);
		policyService.setPolicy('ChatEnabledPlugins', '[]');
		policyService.setPolicy('ChatExtraMarketplaces', '[]');
		policyService.setPolicy('ChatStrictMarketplaces', '[]');
		policyService.setPolicy('ChatApprovedAccountOrganizations', '[]');
		policyService.setPolicy('CopilotOtelEnabled', true);
		policyService.setPolicy('TelemetryLevel', 'all');
		policyService.setPolicy('EnableFeedback', false);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			devicePolicyCount: 9,
			defaultModelSet: true,
			toolsAutoApproveSet: true,
			enabledPluginsSet: true,
			extraMarketplacesSet: true,
			strictMarketplacesSet: true,
			approvedOrgsSet: true,
			otelSet: true,
			telemetryLevelSet: true,
			enableFeedbackSet: true,
			defaultModelForcedToAuto: true,
			toolsAutoApproveForcedOff: true,
			strictMarketplacesLockdown: true,
			otelForcedEnabled: true,
			telemetryLevel: 'all',
			enabledPluginsSource: PolicyValueSource.Device,
			extraMarketplacesSource: PolicyValueSource.Device,
			strictMarketplacesSource: PolicyValueSource.Device,
			otelEnabledSource: PolicyValueSource.Device,
		});
	});

	test('buckets unexpected values without reporting them', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('ChatStrictMarketplaces', 'not-json');
		policyService.setPolicy('TelemetryLevel', 1);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			devicePolicyCount: 2,
			strictMarketplacesSet: true,
			telemetryLevelSet: true,
			telemetryLevel: 'unknown',
			strictMarketplacesSource: PolicyValueSource.Device,
		});
	});

	test('counts applied policies outside the reported set', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('OtherPolicy', true);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			devicePolicyCount: 1,
		});
	});

	test('partitions every effective policy by source', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('DevicePolicy', true, PolicyValueSource.Device);
		policyService.setPolicy('NativeMdmPolicy', true, PolicyValueSource.NativeMdm);
		policyService.setPolicy('ServerManagedSettingsPolicy', true, PolicyValueSource.ServerManagedSettings);
		policyService.setPolicy('FileManagedSettingsPolicy', true, PolicyValueSource.FileManagedSettings);
		policyService.setPolicy('MixedManagedSettingsPolicy', true, PolicyValueSource.MixedManagedSettings);
		policyService.setPolicy('AccountPolicy', true, PolicyValueSource.Account);
		policyService.setPolicy('AccountGatePolicy', false, PolicyValueSource.AccountGate);
		policyService.setPolicy('UnknownSourcePolicy', true, undefined);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			devicePolicyCount: 2,
			nativeMdmPolicyCount: 1,
			serverManagedSettingsPolicyCount: 1,
			fileManagedSettingsPolicyCount: 1,
			mixedManagedSettingsPolicyCount: 1,
			accountPolicyCount: 1,
			accountGatePolicyCount: 1,
		});
	});

	test('maps each tracked policy to its own source field', () => {
		const policyService = new TestPolicyService();
		const { events, clock } = createContribution(policyService);
		const expected: typeof events = [];

		for (const [field, name] of Object.entries(POLICY_SOURCE_FIELDS)) {
			policyService.setPolicy(name, false, PolicyValueSource.Device);
			policyService.fireChange();
			clock.tick(500);
			expected.push({
				name: 'policy.applied',
				data: {
					...EMPTY_EVENT,
					devicePolicyCount: 1,
					enabledPluginsSet: name === 'ChatEnabledPlugins',
					extraMarketplacesSet: name === 'ChatExtraMarketplaces',
					strictMarketplacesSet: name === 'ChatStrictMarketplaces',
					otelSet: name === 'CopilotOtelEnabled',
					[field]: PolicyValueSource.Device,
				},
			});
			policyService.removePolicy(name);
		}

		assert.deepStrictEqual(events, expected);
	});

	for (const [source, countField] of [
		[PolicyValueSource.Device, 'devicePolicyCount'],
		[PolicyValueSource.NativeMdm, 'nativeMdmPolicyCount'],
		[PolicyValueSource.ServerManagedSettings, 'serverManagedSettingsPolicyCount'],
		[PolicyValueSource.FileManagedSettings, 'fileManagedSettingsPolicyCount'],
		[PolicyValueSource.MixedManagedSettings, 'mixedManagedSettingsPolicyCount'],
		[PolicyValueSource.Account, 'accountPolicyCount'],
		[PolicyValueSource.AccountGate, 'accountGatePolicyCount'],
		[undefined, 'devicePolicyCount'],
	] as const) {
		test(`reports every tracked policy source: ${source ?? 'device fallback'}`, () => {
			const policyService = new TestPolicyService();
			for (const name of Object.values(POLICY_SOURCE_FIELDS)) {
				policyService.setPolicy(name, false, source);
			}
			if (source === undefined) {
				sinon.stub(policyService, 'getPolicyValueSource').returns(undefined);
			}

			const { events, clock } = createContribution(policyService);
			clock.tick(500);

			assert.deepStrictEqual(events, [{
				name: 'policy.applied',
				data: {
					...EMPTY_EVENT,
					[countField]: Object.keys(POLICY_SOURCE_FIELDS).length,
					enabledPluginsSet: true,
					extraMarketplacesSet: true,
					strictMarketplacesSet: true,
					otelSet: true,
					...Object.fromEntries(Object.keys(POLICY_SOURCE_FIELDS).map(field => [field, source ?? PolicyValueSource.Device])),
				},
			}]);
		});
	}

	test('reports policy sources without collecting sensitive values', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('ChatAllowedMcpServers', '[]', PolicyValueSource.Device);
		policyService.setPolicy('CopilotOtelHeaders', '{"Authorization":"sensitive-token"}', PolicyValueSource.ServerManagedSettings);
		policyService.setPolicy('ChatAgentAllowedNetworkDomains', '["sensitive.example"]', PolicyValueSource.NativeMdm);
		policyService.setPolicy('ChatMCP', 'all', PolicyValueSource.Device);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events, [{
			name: 'policy.applied',
			data: {
				...EMPTY_EVENT,
				devicePolicyCount: 2,
				serverManagedSettingsPolicyCount: 1,
				nativeMdmPolicyCount: 1,
				allowedMcpServersSource: PolicyValueSource.Device,
				otelHeadersSource: PolicyValueSource.ServerManagedSettings,
				agentAllowedNetworkDomainsSource: PolicyValueSource.NativeMdm,
				mcpAccessSource: PolicyValueSource.Device,
			},
		}]);
	});

	test('reports source swaps with unchanged counts and values, then policy removal', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('ChatHooks', false, PolicyValueSource.Device);
		policyService.setPolicy('ChatMCP', 'none', PolicyValueSource.ServerManagedSettings);
		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		policyService.setPolicy('ChatHooks', false, PolicyValueSource.ServerManagedSettings);
		policyService.setPolicy('ChatMCP', 'none', PolicyValueSource.Device);
		policyService.fireChange();
		clock.tick(500);
		policyService.fireChange();
		clock.tick(500);

		policyService.removePolicy('ChatHooks');
		policyService.removePolicy('ChatMCP');
		policyService.fireChange();
		clock.tick(500);

		assert.deepStrictEqual(events, [
			{
				name: 'policy.applied',
				data: {
					...EMPTY_EVENT,
					devicePolicyCount: 1,
					serverManagedSettingsPolicyCount: 1,
					hooksSource: PolicyValueSource.Device,
					mcpAccessSource: PolicyValueSource.ServerManagedSettings,
				},
			},
			{
				name: 'policy.applied',
				data: {
					...EMPTY_EVENT,
					devicePolicyCount: 1,
					serverManagedSettingsPolicyCount: 1,
					hooksSource: PolicyValueSource.ServerManagedSettings,
					mcpAccessSource: PolicyValueSource.Device,
				},
			},
			{ name: 'policy.applied', data: EMPTY_EVENT },
		]);
	});

	test('coalesces startup changes and re-emits only when the resolved policy state changes', () => {
		const policyService = new TestPolicyService();
		const { events, clock } = createContribution(policyService);

		policyService.setPolicy('TelemetryLevel', 'off');
		policyService.fireChange();
		clock.tick(500);

		policyService.setPolicy('TelemetryLevel', 'all');
		policyService.fireChange();
		clock.tick(500);
		policyService.fireChange();
		clock.tick(500);

		assert.deepStrictEqual(events, [
			{
				name: 'policy.applied',
				data: {
					...EMPTY_EVENT,
					devicePolicyCount: 1,
					telemetryLevelSet: true,
					telemetryLevel: 'off',
				},
			},
			{
				name: 'policy.applied',
				data: {
					...EMPTY_EVENT,
					devicePolicyCount: 1,
					telemetryLevelSet: true,
					telemetryLevel: 'all',
				},
			},
		]);
	});
});
