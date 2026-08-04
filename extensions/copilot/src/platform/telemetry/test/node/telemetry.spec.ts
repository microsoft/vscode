/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, Mock, suite, test, vi } from 'vitest';
import type { TelemetryLogger } from 'vscode';
import * as zlib from 'zlib';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
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

		expect(mockInternalReporter.sendRawTelemetryEvent).toHaveBeenCalledOnce();
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
