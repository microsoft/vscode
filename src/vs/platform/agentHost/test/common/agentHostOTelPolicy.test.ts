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
import '../../common/agentHostStarter.config.contribution.js';

suite('Agent Host OTel managed policy registration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class PolicyConfigurationService extends TestConfigurationService {
		constructor(private readonly policyData: IPolicyData) {
			super();
		}

		override inspect<T>(key: string): IConfigurationValue<T> {
			const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
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
		const properties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
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

	test('selects file export for an invalid managed empty file path', () => {
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
});
