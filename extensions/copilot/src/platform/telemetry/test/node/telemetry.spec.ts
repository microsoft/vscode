/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, Mock, suite, test, vi } from 'vitest';
import type { TelemetryLogger } from 'vscode';
import * as zlib from 'zlib';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { CopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { IConfigurationService } from '../../../configuration/common/configurationService';
import { IDomainService } from '../../../endpoint/common/domainService';
import { IEnvService } from '../../../env/common/envService';
import { createPlatformServices, ITestingServicesAccessor } from '../../../test/node/services';
import { BaseGHTelemetrySender } from '../../common/ghTelemetrySender';
import { BaseMsftTelemetrySender, ITelemetryReporter } from '../../common/msftTelemetrySender';
import { ITelemetryUserConfig, multiplexProperties, TelemetryTrustedValue } from '../../common/telemetry';

const gzipBase64 = async (value: string): Promise<string> => zlib.gzipSync(Buffer.from(value, 'utf8')).toString('base64');
const gunzipFromBase64 = (value: string): string => zlib.gunzipSync(Buffer.from(value, 'base64')).toString('utf8');

function joinCompressedChunks(chunks: { [key: string]: string }, base: string): string {
	let out = chunks[base] ?? '';
	for (let index = 2; chunks[`${base}_${index}`] !== undefined; index++) {
		out += chunks[`${base}_${index}`];
	}
	return out;
}

function pseudoRandomString(length: number): string {
	let seed = 0x2545f491;
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let out = '';
	for (let i = 0; i < length; i++) {
		seed ^= seed << 13;
		seed ^= seed >>> 17;
		seed ^= seed << 5;
		seed >>>= 0;
		out += chars[seed % chars.length];
	}
	return out;
}

const internalOrganizations = [
	{ name: 'GitHub', organization: '4535c7beffc844b46bb1ed4aa04d759a' },
	{ name: 'Microsoft 1', organization: 'a5db0bcaae94032fe715fb34a5e4bce2' },
	{ name: 'Microsoft 2', organization: '7184f66dfcee98cb5f08a1cb936d5225' },
	{ name: 'Microsoft 3', organization: '1cb18ac6eedd49b43d74a1c5beb0b955' },
	{ name: 'Microsoft 4', organization: 'ea9395b9a9248c05ee6847cbd24355ed' },
];

function createInternalToken(organization: string): CopilotToken {
	return new CopilotToken(createTestExtendedTokenInfo({
		token: `rt=1;tid=${organization}`,
		organization_list: [organization],
	}));
}

suite('Microsoft Telemetry Sender', function () {
	let mockExternalReporter: ITelemetryReporter;
	let mockInternalReporter: ITelemetryReporter;
	let mockTokenStore: CopilotTokenStore;
	let mockToken: CopilotToken;
	let mockReporterFactory: Mock<(internal: boolean) => ITelemetryReporter>;
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

		mockTokenStore = new CopilotTokenStore();
		mockTokenStore.copilotToken = mockToken;

		mockReporterFactory = vi.fn((internal: boolean) => {
			if (internal) {
				return mockInternalReporter;
			} else {
				return mockExternalReporter;
			}
		});
		sender = new BaseMsftTelemetrySender(mockTokenStore, mockReporterFactory);
	});

	afterEach(() => {
		sender.dispose();
		mockTokenStore.dispose();
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

	test.each(internalOrganizations)('should not create or send restricted telemetry for $name members', ({ organization }) => {
		mockTokenStore.copilotToken = createInternalToken(organization);
		sender.sendInternalTelemetryEvent('testInternalEvent', { prompt: 'user code' });

		expect({
			reportersCreated: mockReporterFactory.mock.calls,
			restrictedSends: vi.mocked(mockInternalReporter.sendRawTelemetryEvent).mock.calls,
			standardSends: vi.mocked(mockExternalReporter.sendTelemetryEvent).mock.calls,
			rawStandardSends: vi.mocked(mockExternalReporter.sendRawTelemetryEvent).mock.calls,
		}).toEqual({
			reportersCreated: [[false]],
			restrictedSends: [],
			standardSends: [],
			rawStandardSends: [],
		});
	});

	test('should not send restricted telemetry after switching to an external user or signing out', () => {
		mockTokenStore.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ token: 'rt=1;tid=external', organization_list: [] }));
		sender.sendInternalTelemetryEvent('external', { prompt: 'user code' });
		mockTokenStore.copilotToken = undefined;
		sender.sendInternalTelemetryEvent('signedOut', { prompt: 'user code' });

		expect(mockReporterFactory.mock.calls).toEqual([[false]]);
		expect(mockInternalReporter.sendRawTelemetryEvent).not.toHaveBeenCalled();
		expect(mockExternalReporter.sendTelemetryEvent).not.toHaveBeenCalled();
		expect(mockExternalReporter.sendRawTelemetryEvent).not.toHaveBeenCalled();
	});

	test('should dispose reporters', () => {
		sender.dispose();

		expect(mockExternalReporter.dispose).toHaveBeenCalledOnce();
		expect(mockInternalReporter.dispose).not.toHaveBeenCalled();
	});

});

suite('GitHub Telemetry Sender', function () {
	let accessor: ITestingServicesAccessor;
	let sender: BaseGHTelemetrySender;
	let mockLogger: TelemetryLogger;
	let mockTokenStore: CopilotTokenStore;
	let mockToken: CopilotToken;
	let mockEnhancedLogger: TelemetryLogger;
	let mockLoggerFactory: Mock<(enhanced: boolean) => TelemetryLogger>;

	// These are all common properties & measurements that the telemetry sender will add to every event
	const commonTelemetryData = {
		properties: {
			copilot_build: new TelemetryTrustedValue('1'),
			copilot_buildType: new TelemetryTrustedValue(!!process.env.BUILD_SOURCEVERSION ? 'prod' : 'dev'),
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
			organization_list: [],
			isVscodeTeamMember: false,
			username: 'testUser',
			copilot_plan: 'unknown',
		}));

		mockTokenStore = new CopilotTokenStore();
		mockTokenStore.copilotToken = mockToken;

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

		mockLoggerFactory = vi.fn((enhanced: boolean) => enhanced ? mockEnhancedLogger : mockLogger);
		sender = createSender();
	});

	function createSender(): BaseGHTelemetrySender {
		const telemetryConfig: ITelemetryUserConfig = {
			_serviceBrand: undefined,
			optedIn: true,
			organizationsList: undefined,
			enterpriseList: undefined,
			trackingId: 'testId'
		};
		return new BaseGHTelemetrySender(
			mockTokenStore,
			mockLoggerFactory,
			accessor.get(IConfigurationService),
			telemetryConfig,
			accessor.get(IEnvService),
			accessor.get(IDomainService),
		);
	}

	afterEach(() => {
		accessor.dispose();
		sender.dispose();
		mockTokenStore.dispose();
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

	test.each(internalOrganizations)('should not create restricted loggers for $name members at startup', ({ organization }) => {
		sender.dispose();
		mockTokenStore.copilotToken = createInternalToken(organization);
		vi.clearAllMocks();
		sender = createSender();

		sender.sendEnhancedTelemetryEvent('restrictedEvent', { prompt: 'user code' });
		sender.sendEnhancedTelemetryErrorEvent('restrictedError', { prompt: 'user code' });
		sender.sendExceptionTelemetry(new Error('user code'), 'testOrigin');
		sender.sendTelemetryEvent('standardEvent');
		sender.sendTelemetryErrorEvent('standardError');

		expect({
			loggersCreated: mockLoggerFactory.mock.calls,
			restrictedEvents: vi.mocked(mockEnhancedLogger.logUsage).mock.calls,
			restrictedErrors: vi.mocked(mockEnhancedLogger.logError).mock.calls,
			standardEvents: vi.mocked(mockLogger.logUsage).mock.calls.map(([name]) => name),
			standardErrors: vi.mocked(mockLogger.logError).mock.calls.map(([name]) => name),
		}).toEqual({
			loggersCreated: [[false]],
			restrictedEvents: [],
			restrictedErrors: [],
			standardEvents: ['exception', 'standardEvent'],
			standardErrors: ['standardError'],
		});
	});

	test.each(internalOrganizations)('should update restricted telemetry eligibility when switching to and from $name', ({ organization }) => {
		mockTokenStore.copilotToken = createInternalToken(organization);
		sender.sendEnhancedTelemetryEvent('internalEvent', { prompt: 'user code' });
		sender.sendEnhancedTelemetryErrorEvent('internalError', { prompt: 'user code' });
		sender.sendExceptionTelemetry(new Error('user code'), 'testOrigin');

		expect(mockEnhancedLogger.dispose).toHaveBeenCalledOnce();
		expect(mockEnhancedLogger.logUsage).not.toHaveBeenCalled();
		expect(mockEnhancedLogger.logError).not.toHaveBeenCalled();

		mockTokenStore.copilotToken = mockToken;
		sender.sendEnhancedTelemetryEvent('externalEvent');
		sender.sendEnhancedTelemetryErrorEvent('externalError');

		expect(vi.mocked(mockEnhancedLogger.logUsage).mock.calls.map(([name]) => name)).toEqual(['externalEvent']);
		expect(vi.mocked(mockEnhancedLogger.logError).mock.calls.map(([name]) => name)).toEqual(['externalError']);
	});

	test.each(['rt=0;tid=external', 'tid=external', undefined])('should stop restricted telemetry without opt-in or a token (%s)', token => {
		mockTokenStore.copilotToken = token ? new CopilotToken(createTestExtendedTokenInfo({ token, organization_list: [] })) : undefined;
		sender.sendEnhancedTelemetryEvent('restrictedEvent', { prompt: 'user code' });
		sender.sendEnhancedTelemetryErrorEvent('restrictedError', { prompt: 'user code' });
		sender.sendExceptionTelemetry(new Error('user code'), 'testOrigin');

		expect(mockEnhancedLogger.dispose).toHaveBeenCalledOnce();
		expect(mockEnhancedLogger.logUsage).not.toHaveBeenCalled();
		expect(mockEnhancedLogger.logError).not.toHaveBeenCalled();
		expect(mockLogger.logUsage).toHaveBeenCalledOnce();
	});

	test('should dispose loggers and disposables', () => {
		sender.dispose();
		expect(mockLogger.dispose).toHaveBeenCalledOnce();
		expect(mockEnhancedLogger.dispose).toHaveBeenCalledOnce();
	});
});

suite('multiplexProperties compression', function () {
	test('chunks a long value in compressed form only and round-trips', async () => {
		const original = 'x'.repeat(20000); // > 8192 and highly compressible.
		const result = await multiplexProperties({ diffsJSON: original, short: 'hi' }, gzipBase64);

		// The original column carries just the first uncompressed chunk.
		expect(result.diffsJSON).toBe(original.slice(0, 8192));
		// No redundant plain continuation family is produced.
		expect(result.diffsJSON_02).toBeUndefined();
		// First compressed column has no numeric suffix.
		expect(result.diffsJSONChunk).toBeDefined();
		// Round-trips back to the original value.
		expect(gunzipFromBase64(joinCompressedChunks(result as { [key: string]: string }, 'diffsJSONChunk'))).toBe(original);
		// No zero-padded suffixes on the compressed family.
		expect(Object.keys(result).every(key => !/Chunk_0\d$/.test(key))).toBe(true);
		// Short (non-chunked) properties pass through untouched with no compressed family.
		expect(result.short).toBe('hi');
		expect(result.shortChunk).toBeUndefined();
	});

	test('produces no compressed columns for size-triggered fields that were not chunked', async () => {
		const result = await multiplexProperties({ someField: 'small', other: 'x' }, gzipBase64);
		expect(result).toEqual({ someField: 'small', other: 'x' });
	});

	test.each([0, 100, 8192, 8193, 20000])('always compresses a prompt of length %i while preserving its raw prefix', async length => {
		const prompt = 'x'.repeat(length);
		const result = await multiplexProperties({ prompt }, gzipBase64);

		expect(result).toEqual({
			prompt: prompt.slice(0, 8192),
			promptChunk: await gzipBase64(prompt),
		});
	});

	test('always emits a compressed chunk family for known-large fields even when they fit', async () => {
		const result = await multiplexProperties({ diffsJSON: 'small', messagesJson: 'tiny', other: 'x' }, gzipBase64) as { [key: string]: string };

		// Known-large fields are always chunked in compressed form for backend uniformity.
		expect(result.diffsJSONChunk).toBeDefined();
		// messagesJson uses the uppercase-JSON chunk family name expected by the backend.
		expect(result.messagesJSONChunk).toBeDefined();
		expect(result.messagesJsonChunk).toBeUndefined();
		expect(gunzipFromBase64(joinCompressedChunks(result, 'diffsJSONChunk'))).toBe('small');
		expect(gunzipFromBase64(joinCompressedChunks(result, 'messagesJSONChunk'))).toBe('tiny');
		// The original columns still carry the (short) uncompressed value.
		expect(result.diffsJSON).toBe('small');
		expect(result.messagesJson).toBe('tiny');
		// Other short fields are left untouched.
		expect(result.other).toBe('x');
		expect(result.otherChunk).toBeUndefined();
	});

	test('emits the messagesJSONChunk family (with numbered suffixes) for large messagesJson', async () => {
		const original = pseudoRandomString(60000); // Poorly compressible -> compressed base64 > 8192.
		const result = await multiplexProperties({ messagesJson: original }, gzipBase64) as { [key: string]: string };

		// The original column carries just the first uncompressed chunk; no plain continuation family.
		expect(result.messagesJson).toBe(original.slice(0, 8192));
		expect(result.messagesJson_02).toBeUndefined();
		// Compressed family uses the uppercase-JSON name, including numbered suffixes.
		expect(result.messagesJSONChunk).toBeDefined();
		expect(result.messagesJSONChunk_2).toBeDefined();
		expect(result.messagesJsonChunk).toBeUndefined();
		expect(result.messagesJsonChunk_2).toBeUndefined();
		expect(gunzipFromBase64(joinCompressedChunks(result, 'messagesJSONChunk'))).toBe(original);
	});

	test('falls back to the plain continuation family when no compressor is provided', async () => {
		const original = 'x'.repeat(20000);
		const result = await multiplexProperties({ diffsJSON: original });
		expect(result.diffsJSON).toBeDefined();
		expect(result.diffsJSON_02).toBeDefined();
		expect(result.diffsJSONChunk).toBeUndefined();
	});

	test('splits large compressed payloads across multiple non-zero-padded columns', async () => {
		const original = pseudoRandomString(60000); // Poorly compressible -> compressed base64 > 8192.
		const result = await multiplexProperties({ diffsJSON: original }, gzipBase64) as { [key: string]: string };

		// The original column carries just the first uncompressed chunk; no plain continuation family.
		expect(result.diffsJSON).toBe(original.slice(0, 8192));
		expect(result.diffsJSON_02).toBeUndefined();
		expect(result.diffsJSONChunk).toBeDefined();
		expect(result.diffsJSONChunk_2).toBeDefined();
		// Every compressed column stays within the Application Insights per-property limit.
		const chunkValues = Object.keys(result).filter(key => key.startsWith('diffsJSONChunk')).map(key => result[key]);
		expect(chunkValues.every(value => value.length <= 8192)).toBe(true);
		expect(gunzipFromBase64(joinCompressedChunks(result, 'diffsJSONChunk'))).toBe(original);
	});
});
