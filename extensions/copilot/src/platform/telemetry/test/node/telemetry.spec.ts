/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, Mock, suite, test, vi } from 'vitest';
import type { TelemetryLogger } from 'vscode';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { IDomainService } from '../../../endpoint/common/domainService';
import { IEnvService } from '../../../env/common/envService';
import { createPlatformServices, ITestingServicesAccessor } from '../../../test/node/services';
import { BaseGHTelemetrySender } from '../../common/ghTelemetrySender';
import { BaseMsftTelemetrySender, ITelemetryReporter } from '../../common/msftTelemetrySender';
import { ITelemetryUserConfig, TelemetryTrustedValue } from '../../common/telemetry';

suite('Microsoft Telemetry Sender', function () {
	let mockExternalReporter: ITelemetryReporter;
	let mockInternalReporter: ITelemetryReporter;
	let mockTokenStore: ICopilotTokenStore;
	let mockToken: CopilotToken;
	let sender: BaseMsftTelemetrySender;

	beforeEach(() => {
		mockExternalReporter = {
			sendRawTelemetryEvent: vi.fn(),
			sendTelemetryEvent: vi.fn(),
			sendTelemetryErrorEvent: vi.fn(),
			dispose: vi.fn(),
		};

		mockInternalReporter = {
			sendRawTelemetryEvent: vi.fn(),
			sendTelemetryEvent: vi.fn(),
			sendTelemetryErrorEvent: vi.fn(),
			dispose: vi.fn(),
		};

		mockToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'tid=testTid',
			sku: 'testSku',
			expires_at: 9999999999,
			refresh_in: 180000,
			// Make the token part of the GH org so it works for internal people
			organization_list: ['4535c7beffc844b46bb1ed4aa04d759a'],
			isVscodeTeamMember: true,
			username: 'testUser',
			copilot_plan: 'unknown',
		}));

		mockTokenStore = {
			_serviceBrand: undefined,
			copilotToken: mockToken,
			onDidStoreUpdate: vi.fn((callback) => {
				callback();
				return { dispose: vi.fn() };
			}),
		};

		const mockReporterFactory = (internal: boolean) => {
			if (internal) {
				return mockInternalReporter;
			} else {
				return mockExternalReporter;
			}
		};
		sender = new BaseMsftTelemetrySender(mockTokenStore, mockReporterFactory);
	});

	afterEach(() => {
		sender.dispose();
	});

	test('should send telemetry event', () => {
		sender.sendTelemetryEvent('testEvent', { foo: 'bar' });

		expect(mockExternalReporter.sendTelemetryEvent).toHaveBeenCalledOnce();
		expect(mockExternalReporter.sendTelemetryEvent).toHaveBeenCalledWith(
			'testEvent',
			{ foo: 'bar', 'common.tid': 'testTid', 'common.sku': 'testSku' },
			{ 'common.internal': 1 },
		);
	});

	test('should send telemetry error event', () => {
		sender.sendTelemetryErrorEvent('testErrorEvent', { stack: 'testStack' }, { statusCode: 502 });

		expect(mockExternalReporter.sendTelemetryErrorEvent).toHaveBeenCalledOnce();
		expect(mockExternalReporter.sendTelemetryErrorEvent).toHaveBeenCalledWith(
			'testErrorEvent',
			{ stack: 'testStack', 'common.tid': 'testTid', 'common.sku': 'testSku' },
			{ statusCode: 502, 'common.internal': 1 },
		);
	});

	test('should send internal telemetry event', () => {
		sender.sendInternalTelemetryEvent('testInternalEvent', { foo: 'bar' }, { 'testMeasure': 1 });

		expect(mockInternalReporter.sendRawTelemetryEvent).toHaveBeenCalledTimes(2);
		expect(mockInternalReporter.sendRawTelemetryEvent).toHaveBeenCalledWith(
			'testInternalEvent',
			{ foo: 'bar', 'common.tid': 'testTid', 'common.userName': 'testUser' },
			{ 'common.isVscodeTeamMember': 1, 'testMeasure': 1 },
		);
	});

	test('should dispose reporters', () => {
		sender.dispose();

		expect(mockExternalReporter.dispose).toHaveBeenCalledOnce();
		expect(mockInternalReporter.dispose).toHaveBeenCalledOnce();
	});

});

suite('GitHub Telemetry Sender', function () {
	let accessor: ITestingServicesAccessor;
	let sender: BaseGHTelemetrySender;
	let mockLogger: TelemetryLogger;
	let mockTokenStore: ICopilotTokenStore;
	let mockToken: CopilotToken;
	let mockEnhancedLogger: TelemetryLogger;

	// These are all common properties & measurements that the telemetry sender will add to every event
	const commonTelemetryData = {
		properties: {
			copilot_build: new TelemetryTrustedValue('1'),
			copilot_buildType: new TelemetryTrustedValue('dev'),
			copilot_trackingId: new TelemetryTrustedValue('testId'),
			editor_plugin_version: new TelemetryTrustedValue('simulation-tests-plugin/2'),
			client_machineid: new TelemetryTrustedValue('test-machine'),
			client_sessionid: new TelemetryTrustedValue('test-session'),
			common_extname: new TelemetryTrustedValue('simulation-tests-plugin'),
			common_extversion: new TelemetryTrustedValue('2'),
		},
		measurements: {},
	};

	beforeEach(() => {
		accessor = createPlatformServices().createTestingAccessor();

		mockToken = new CopilotToken(createTestExtendedTokenInfo({
			token: 'rt=1;tid=test',
			sku: 'testSku',
			expires_at: 9999999999,
			refresh_in: 180000,
			// Make the token part of the GH org so it works for internal people
			organization_list: ['4535c7beffc844b46bb1ed4aa04d759a'],
			isVscodeTeamMember: true,
			username: 'testUser',
			copilot_plan: 'unknown',
		}));

		mockTokenStore = {
			_serviceBrand: undefined,
			copilotToken: mockToken,
			onDidStoreUpdate: vi.fn((callback) => {
				callback();
				return { dispose: vi.fn() };
			}),
		};

		mockLogger = {
			isUsageEnabled: true,
			isErrorsEnabled: true,
			logUsage: vi.fn(),
			logError: vi.fn(),
			onDidChangeEnableStates: vi.fn((callback) => {
				callback();
				return { dispose: vi.fn() };
			}),
			dispose: vi.fn()
		};

		mockEnhancedLogger = {
			isUsageEnabled: true,
			isErrorsEnabled: true,
			logUsage: vi.fn(),
			logError: vi.fn(),
			onDidChangeEnableStates: vi.fn((callback) => {
				callback();
				return { dispose: vi.fn() };
			}),
			dispose: vi.fn()
		};

		const telemetryConfig: ITelemetryUserConfig = {
			_serviceBrand: undefined,
			optedIn: true,
			organizationsList: undefined,
			enterpriseList: undefined,
			trackingId: 'testId'
		};
		const mockLoggerFactory = (enhanced: boolean) => {
			if (enhanced) {
				return mockEnhancedLogger;
			} else {
				return mockLogger;
			}
		};
		sender = new BaseGHTelemetrySender(
			mockTokenStore,
			mockLoggerFactory,
			accessor.get(IConfigurationService),
			telemetryConfig,
			accessor.get(IEnvService),
			accessor.get(IDomainService),
		);
	});

	afterEach(() => {
		accessor.dispose();
		sender.dispose();
	});

	test('should send telemetry event', () => {
		sender.sendTelemetryEvent('testEvent', { foo: 'bar' }, { 'testMeasure': 2 });
		expect(mockLogger.logUsage).toHaveBeenCalledOnce();
		const lastCall = (mockLogger.logUsage as Mock).mock.lastCall;
		expect(lastCall).toBeDefined();
		expect(mockLogger.logUsage).toHaveBeenCalledWith(
			'testEvent',
			{
				properties: {
					...commonTelemetryData.properties,
					unique_id: new TelemetryTrustedValue(lastCall![1].properties.unique_id.value),
					copilot_version: new TelemetryTrustedValue(lastCall![1].properties.copilot_version.value),
					editor_version: new TelemetryTrustedValue(lastCall![1].properties.editor_version.value),
					common_vscodeversion: new TelemetryTrustedValue(lastCall![1].properties.common_vscodeversion.value),
					foo: new TelemetryTrustedValue('bar'),
				},
				measurements: {
					...commonTelemetryData.measurements,
					timeSinceIssuedMs: lastCall![1].measurements.timeSinceIssuedMs,
					'testMeasure': 2,
				}
			}
		);
	});

	test('should send telemetry error event', () => {
		sender.sendTelemetryErrorEvent('testErrorEvent', { stack: 'testStack' }, { statusCode: 502 });
		expect(mockLogger.logError).toHaveBeenCalledOnce();
		const lastCall = (mockLogger.logError as Mock).mock.lastCall;
		expect(lastCall).toBeDefined();
		expect(mockLogger.logError).toHaveBeenCalledWith(
			'testErrorEvent',
			{
				properties: {
					...commonTelemetryData.properties,
					unique_id: new TelemetryTrustedValue(lastCall![1].properties.unique_id.value),
					copilot_version: new TelemetryTrustedValue(lastCall![1].properties.copilot_version.value),
					editor_version: new TelemetryTrustedValue(lastCall![1].properties.editor_version.value),
					common_vscodeversion: new TelemetryTrustedValue(lastCall![1].properties.common_vscodeversion.value),
					stack: new TelemetryTrustedValue('testStack'),
				},
				measurements: {
					...commonTelemetryData.measurements,
					timeSinceIssuedMs: lastCall![1].measurements.timeSinceIssuedMs,
					statusCode: 502,
				}
			}
		);
	});

	test('should send enhanced telemetry event', () => {
		sender.sendEnhancedTelemetryEvent('testEnhancedEvent', { foo: 'bar' }, { 'testMeasure': 2 });
		expect(mockEnhancedLogger.logUsage).toHaveBeenCalledOnce();
		const lastCall = (mockEnhancedLogger.logUsage as Mock).mock.lastCall;
		expect(lastCall).toBeDefined();
		expect(mockEnhancedLogger.logUsage).toHaveBeenCalledWith(
			'testEnhancedEvent',
			{
				properties: {
					...commonTelemetryData.properties,
					unique_id: new TelemetryTrustedValue(lastCall![1].properties.unique_id.value),
					copilot_version: new TelemetryTrustedValue(lastCall![1].properties.copilot_version.value),
					editor_version: new TelemetryTrustedValue(lastCall![1].properties.editor_version.value),
					common_vscodeversion: new TelemetryTrustedValue(lastCall![1].properties.common_vscodeversion.value),
					foo: new TelemetryTrustedValue('bar'),
				},
				measurements: {
					...commonTelemetryData.measurements,
					timeSinceIssuedMs: lastCall![1].measurements.timeSinceIssuedMs,
					'testMeasure': 2,
				}
			}
		);
	});

	test('should send enhanced telemetry error event', () => {
		sender.sendEnhancedTelemetryErrorEvent('testEnhancedErrorEvent', { stack: 'testStack' }, { statusCode: 502 });
		expect(mockEnhancedLogger.logError).toHaveBeenCalledOnce();
		const lastCall = (mockEnhancedLogger.logError as Mock).mock.lastCall;
		expect(lastCall).toBeDefined();
		expect(mockEnhancedLogger.logError).toHaveBeenCalledWith(
			'testEnhancedErrorEvent',
			{
				properties: {
					...commonTelemetryData.properties,
					unique_id: new TelemetryTrustedValue(lastCall![1].properties.unique_id.value),
					copilot_version: new TelemetryTrustedValue(lastCall![1].properties.copilot_version.value),
					editor_version: new TelemetryTrustedValue(lastCall![1].properties.editor_version.value),
					common_vscodeversion: new TelemetryTrustedValue(lastCall![1].properties.common_vscodeversion.value),
					stack: new TelemetryTrustedValue('testStack'),
				},
				measurements: {
					...commonTelemetryData.measurements,
					timeSinceIssuedMs: lastCall![1].measurements.timeSinceIssuedMs,
					statusCode: 502,
				}
			}
		);
	});

	test('should send exception telemetry', () => {
		const error = new Error('testError');
		sender.sendExceptionTelemetry(error, 'testOrigin');
		expect(mockLogger.logUsage).toHaveBeenCalledOnce();
		expect(mockEnhancedLogger.logError).toHaveBeenCalledOnce();
	});

	test('should dispose loggers and disposables', () => {
		sender.dispose();
		expect(mockLogger.dispose).toHaveBeenCalledOnce();
		expect(mockEnhancedLogger.dispose).toHaveBeenCalledOnce();
	});
});
