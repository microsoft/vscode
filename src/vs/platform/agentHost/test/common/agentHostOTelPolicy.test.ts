/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationValue } from '../../../configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../registry/common/platform.js';
import { AgentHostOTelEnabledSettingId, AgentHostOTelEnvVars, AgentHostOTelExporterTypeSettingId, AgentHostOTelOutfileSettingId, buildAgentHostOTelEnv, readAgentHostOTelPolicySettings } from '../../common/agentService.js';
import { getAgentHostPolicyGaps } from '../../common/agentHostPolicyReadiness.js';

suite('Agent Host OTel managed policy registration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	let introducedConfigurations: ReturnType<IConfigurationRegistry['getConfigurations']> = [];
	let excludedPropertiesBeforeImport: ReturnType<IConfigurationRegistry['getExcludedConfigurationProperties']>;
	let policyConfigurationsBeforeImport: ReturnType<IConfigurationRegistry['getPolicyConfigurations']>;

	suiteSetup(async () => {
		const configurationsBeforeImport = new Set(registry.getConfigurations());
		excludedPropertiesBeforeImport = { ...registry.getExcludedConfigurationProperties() };
		policyConfigurationsBeforeImport = new Map(registry.getPolicyConfigurations());
		await import('../../common/agentHostStarter.config.contribution.js');
		introducedConfigurations = registry.getConfigurations().filter(configuration => !configurationsBeforeImport.has(configuration));
	});

	suiteTeardown(() => {
		registry.deregisterConfigurations(introducedConfigurations);

		// Hidden settings are not removed by deregistration unless experimental.
		const excludedProperties = registry.getExcludedConfigurationProperties();
		for (const key of new Set([...Object.keys(excludedProperties), ...Object.keys(excludedPropertiesBeforeImport)])) {
			if (excludedProperties[key] !== excludedPropertiesBeforeImport[key]) {
				const previousProperty = excludedPropertiesBeforeImport[key];
				if (previousProperty === undefined) {
					delete excludedProperties[key];
				} else {
					excludedProperties[key] = previousProperty;
				}
			}
		}

		const policyConfigurations = registry.getPolicyConfigurations();
		for (const policyName of new Set([...policyConfigurations.keys(), ...policyConfigurationsBeforeImport.keys()])) {
			if (policyConfigurations.get(policyName) !== policyConfigurationsBeforeImport.get(policyName)) {
				const previousConfiguration = policyConfigurationsBeforeImport.get(policyName);
				if (previousConfiguration === undefined) {
					policyConfigurations.delete(policyName);
				} else {
					policyConfigurations.set(policyName, previousConfiguration);
				}
			}
		}
	});

	class PolicyConfigurationService extends TestConfigurationService {
		constructor(private readonly policyData: IPolicyData, settings?: Record<string, unknown>) {
			super(settings);
		}

		override inspect<T>(key: string): IConfigurationValue<T> {
			const properties = { ...registry.getConfigurationProperties(), ...registry.getExcludedConfigurationProperties() };
			return {
				...super.inspect<T>(key),
				policyValue: properties[key]?.policy?.value?.(this.policyData) as T | undefined,
			};
		}
	}

	function resolveManagedOTelPolicy(managedSettings: NonNullable<IPolicyData['managedSettings']>) {
		const policyData = { managedSettings } as IPolicyData;
		const configurationService = new PolicyConfigurationService(policyData);
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		return readAgentHostOTelPolicySettings(configurationService);
	}

	function observableEnv(managedSettings: NonNullable<IPolicyData['managedSettings']>) {
		const env = buildAgentHostOTelEnv({}, {}, resolveManagedOTelPolicy(managedSettings));
		return {
			enabled: env[AgentHostOTelEnvVars.Enabled],
			exporterType: env[AgentHostOTelEnvVars.ExporterType],
			endpoint: env[AgentHostOTelEnvVars.OtlpEndpoint],
			protocol: env[AgentHostOTelEnvVars.OtlpProtocol],
			tracesProtocol: env[AgentHostOTelEnvVars.OtlpTracesProtocol],
			metricsProtocol: env[AgentHostOTelEnvVars.OtlpMetricsProtocol],
			filePath: env[AgentHostOTelEnvVars.FilePath],
		};
	}

	test('registers managed file selection callbacks', () => {
		const properties = registry.getConfigurationProperties();
		const filePolicyData = { managedSettings: { 'telemetry.filePath': '/managed/copilot.jsonl', 'telemetry.endpoint': 'https://collector.example', 'telemetry.protocol': 'grpc' } } as IPolicyData;
		const disabledFilePolicyData = { managedSettings: { 'telemetry.filePath': '/managed/copilot.jsonl', 'telemetry.enabled': false } } as IPolicyData;

		assert.deepStrictEqual({
			enabled: properties[AgentHostOTelEnabledSettingId].policy?.value?.(filePolicyData),
			exporterType: properties[AgentHostOTelExporterTypeSettingId].policy?.value?.(filePolicyData),
			outfile: properties[AgentHostOTelOutfileSettingId].policy?.value?.(filePolicyData),
			disabled: properties[AgentHostOTelEnabledSettingId].policy?.value?.(disabledFilePolicyData),
		}, {
			enabled: true,
			exporterType: 'file',
			outfile: '/managed/copilot.jsonl',
			disabled: false,
		});
	});

	test('keeps an endpoint-only managed policy on the collector exporter', () => {
		assert.deepStrictEqual(observableEnv({ 'telemetry.endpoint': 'https://collector.example' }), {
			enabled: undefined,
			exporterType: undefined,
			endpoint: 'https://collector.example',
			protocol: undefined,
			tracesProtocol: undefined,
			metricsProtocol: undefined,
			filePath: '',
		});
	});

	test('keeps a protocol-only managed policy on the collector exporter', () => {
		assert.deepStrictEqual(observableEnv({ 'telemetry.protocol': 'grpc' }), {
			enabled: undefined,
			exporterType: 'otlp-grpc',
			endpoint: undefined,
			protocol: 'grpc',
			tracesProtocol: 'grpc',
			metricsProtocol: 'grpc',
			filePath: '',
		});
	});

	test('suppresses file export for an unknown managed protocol', () => {
		assert.deepStrictEqual(observableEnv({ 'telemetry.protocol': 'unknown' }), {
			enabled: undefined,
			exporterType: undefined,
			endpoint: undefined,
			protocol: 'unknown',
			tracesProtocol: 'unknown',
			metricsProtocol: 'unknown',
			filePath: '',
		});
	});

	test('keeps a combined endpoint and protocol managed policy on the collector exporter', () => {
		assert.deepStrictEqual(observableEnv({ 'telemetry.endpoint': 'https://collector.example', 'telemetry.protocol': 'http/protobuf' }), {
			enabled: undefined,
			exporterType: 'otlp-http',
			endpoint: 'https://collector.example',
			protocol: 'http/protobuf',
			tracesProtocol: 'http/protobuf',
			metricsProtocol: 'http/protobuf',
			filePath: '',
		});
	});

	test('selects file export when managed policy supplies a nonempty file path', () => {
		assert.deepStrictEqual(observableEnv({ 'telemetry.filePath': '/managed/copilot.jsonl', 'telemetry.endpoint': 'https://collector.example', 'telemetry.protocol': 'grpc' }), {
			enabled: 'true',
			exporterType: 'file',
			endpoint: '',
			protocol: '',
			tracesProtocol: '',
			metricsProtocol: '',
			filePath: '/managed/copilot.jsonl',
		});
	});

	test('selects file export for a directly supplied empty managed file path', () => {
		assert.deepStrictEqual(observableEnv({ 'telemetry.filePath': '' }), {
			enabled: 'true',
			exporterType: 'file',
			endpoint: '',
			protocol: '',
			tracesProtocol: '',
			metricsProtocol: '',
			filePath: '',
		});
	});

	test('suppresses all destinations when managed policy explicitly disables telemetry', () => {
		assert.deepStrictEqual(observableEnv({ 'telemetry.enabled': false, 'telemetry.filePath': '/managed/copilot.jsonl', 'telemetry.endpoint': 'https://collector.example', 'telemetry.protocol': 'grpc' }), {
			enabled: 'false',
			exporterType: undefined,
			endpoint: '',
			protocol: '',
			tracesProtocol: '',
			metricsProtocol: '',
			filePath: '',
		});
	});

	test('policy readiness uses real OTel registrations and the managed-file composition', () => {
		const gaps = (managedSettings: NonNullable<IPolicyData['managedSettings']>, settings?: Record<string, unknown>) => {
			const configurationService = new PolicyConfigurationService({ managedSettings } as IPolicyData, settings);
			disposables.add(configurationService.onDidChangeConfigurationEmitter);
			return getAgentHostPolicyGaps(configurationService)
				.filter(gap => gap.policyName === 'CopilotOtelProtocol')
				.map(gap => gap.policyName);
		};

		assert.deepStrictEqual([
			gaps({ 'telemetry.enabled': false, 'telemetry.protocol': 'grpc' }),
			gaps({ 'telemetry.filePath': '/managed/copilot.jsonl' }),
			gaps({ 'telemetry.protocol': 'grpc' }),
			gaps({}),
		], [
			[],
			[],
			['CopilotOtelProtocol'],
			[],
		]);

		const managedSettings: Record<string, string> = {
			'telemetry.filePath': '/managed/copilot.jsonl',
		};
		const configurationService = new PolicyConfigurationService({ managedSettings } as IPolicyData);
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const removalGaps = () => getAgentHostPolicyGaps(configurationService)
			.filter(gap => gap.policyName === 'CopilotOtelProtocol')
			.map(gap => gap.policyName);
		assert.deepStrictEqual([
			removalGaps(),
			(delete managedSettings['telemetry.filePath'], managedSettings['telemetry.protocol'] = 'grpc', removalGaps()),
			(delete managedSettings['telemetry.protocol'], removalGaps()),
		], [
			[],
			['CopilotOtelProtocol'],
			[],
		]);
	});
});
