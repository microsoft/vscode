/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { AgentsVoiceSettingId } from '../../../../agentsVoice/common/agentsVoice.js';
import { addWebSocketAuthToken, getTranscriptionWebSocketUrl, getVoiceBackendAuthToken, getVoiceWebSocketUrl } from '../../../browser/voiceClient/voiceEndpoint.js';

suite('Voice endpoint', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const productService: IProductService = {
		_serviceBrand: undefined,
		...product,
		voiceWsUrl: 'wss://voice.test/voice-code/api/v1/realtime/voice?product=stable',
	};

	test('derives the transcription sibling from the product Voice endpoint', () => {
		const configurationService = new TestConfigurationService();

		assert.deepStrictEqual({
			voice: getVoiceWebSocketUrl(configurationService, productService),
			transcription: getTranscriptionWebSocketUrl(configurationService, productService),
		}, {
			voice: 'wss://voice.test/voice-code/api/v1/realtime/voice?product=stable',
			transcription: 'wss://voice.test/voice-code/api/v1/realtime/transcription?product=stable',
		});
	});

	test('uses a loopback development endpoint and safely replaces its token', () => {
		const configurationService = new TestConfigurationService({
			'agents.voice.backendUrl': 'ws://localhost:8000/api/v1/realtime/voice?environment=dev&token=stale',
		});

		assert.deepStrictEqual({
			transcription: getTranscriptionWebSocketUrl(configurationService, productService),
			authenticated: addWebSocketAuthToken('ws://localhost:8000/api/v1/realtime/transcription?environment=dev&token=stale', 'token +/=?'),
		}, {
			transcription: 'ws://localhost:8000/api/v1/realtime/transcription?environment=dev&token=stale',
			authenticated: 'ws://localhost:8000/api/v1/realtime/transcription?environment=dev&token=token+%2B%2F%3D%3F',
		});
	});

	test('accepts an IPv6 loopback development endpoint', () => {
		const configurationService = new TestConfigurationService({
			'agents.voice.backendUrl': 'ws://[::1]:8000/api/v1/realtime/voice',
		});

		assert.strictEqual(
			getTranscriptionWebSocketUrl(configurationService, productService),
			'ws://[::1]:8000/api/v1/realtime/transcription',
		);
	});

	test('keeps a remote Voice Mode override out of the transcription client', () => {
		const configurationService = new TestConfigurationService({
			'agents.voice.backendUrl': 'wss://untrusted.example/api/v1/realtime/voice',
		});

		assert.deepStrictEqual({
			voice: getVoiceWebSocketUrl(configurationService, productService),
			transcription: getTranscriptionWebSocketUrl(configurationService, productService),
		}, {
			voice: 'wss://untrusted.example/api/v1/realtime/voice',
			transcription: 'wss://voice.test/voice-code/api/v1/realtime/transcription?product=stable',
		});
	});

	test('ignores a malformed development endpoint override', () => {
		const configurationService = new TestConfigurationService({
			'agents.voice.backendUrl': 42,
		});

		assert.strictEqual(
			getTranscriptionWebSocketUrl(configurationService, productService),
			'wss://voice.test/voice-code/api/v1/realtime/transcription?product=stable',
		);
	});

	test('rejects a product endpoint that is not the Voice sibling', () => {
		const invalidProduct: IProductService = {
			...productService,
			voiceWsUrl: 'wss://voice.test/api/v1/other',
		};

		assert.strictEqual(getTranscriptionWebSocketUrl(new TestConfigurationService(), invalidProduct), '');
	});

	test('uses the GPT Live backend when opted in', () => {
		const configurationService = new TestConfigurationService({
			[AgentsVoiceSettingId.GptLiveEnabled]: true,
		});

		assert.deepStrictEqual({
			voice: getVoiceWebSocketUrl(configurationService, productService),
			transcription: getTranscriptionWebSocketUrl(configurationService, productService),
		}, {
			voice: 'wss://gpt-live-caas.mai.microsoft.com/voice-code/api/v1/realtime/voice',
			transcription: 'wss://gpt-live-caas.mai.microsoft.com/voice-code/api/v1/realtime/transcription',
		});
	});

	test('uses the GPT Live key for websocket auth when opted in', () => {
		const configurationService = new TestConfigurationService({
			[AgentsVoiceSettingId.GptLiveEnabled]: true,
			[AgentsVoiceSettingId.GptLiveApiKey]: '  gpt-live-key  ',
		});

		assert.strictEqual(getVoiceBackendAuthToken(configurationService, 'github-token', 'wss://gpt-live-caas.mai.microsoft.com/voice-code/api/v1/realtime/voice'), 'gpt-live-key');
	});

	test('keeps GitHub auth token when GPT Live is disabled', () => {
		const configurationService = new TestConfigurationService({
			[AgentsVoiceSettingId.GptLiveApiKey]: 'gpt-live-key',
		});

		assert.strictEqual(getVoiceBackendAuthToken(configurationService, 'github-token', 'wss://gpt-live-caas.mai.microsoft.com/voice-code/api/v1/realtime/voice'), 'github-token');
	});

	test('keeps GitHub auth token for explicit voice backend overrides', () => {
		const configurationService = new TestConfigurationService({
			[AgentsVoiceSettingId.GptLiveEnabled]: true,
			[AgentsVoiceSettingId.GptLiveApiKey]: 'gpt-live-key',
			'agents.voice.backendUrl': 'wss://custom.example/api/v1/realtime/voice',
		});

		assert.deepStrictEqual({
			voice: getVoiceWebSocketUrl(configurationService, productService),
			token: getVoiceBackendAuthToken(configurationService, 'github-token', 'wss://custom.example/api/v1/realtime/voice'),
		}, {
			voice: 'wss://custom.example/api/v1/realtime/voice',
			token: 'github-token',
		});
	});
});
