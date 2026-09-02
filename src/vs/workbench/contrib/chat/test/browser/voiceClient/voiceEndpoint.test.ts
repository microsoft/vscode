/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { addWebSocketAuthToken, getTranscriptionWebSocketUrl, getVoiceWebSocketUrl } from '../../../browser/voiceClient/voiceEndpoint.js';

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

	test('does not send audio or tokens to a non-loopback endpoint override', () => {
		const configurationService = new TestConfigurationService({
			'agents.voice.backendUrl': 'wss://untrusted.example/api/v1/realtime/voice',
		});

		assert.deepStrictEqual({
			voice: getVoiceWebSocketUrl(configurationService, productService),
			transcription: getTranscriptionWebSocketUrl(configurationService, productService),
		}, {
			voice: 'wss://voice.test/voice-code/api/v1/realtime/voice?product=stable',
			transcription: 'wss://voice.test/voice-code/api/v1/realtime/transcription?product=stable',
		});
	});

	test('rejects a product endpoint that is not the Voice sibling', () => {
		const invalidProduct: IProductService = {
			...productService,
			voiceWsUrl: 'wss://voice.test/api/v1/other',
		};

		assert.strictEqual(getTranscriptionWebSocketUrl(new TestConfigurationService(), invalidProduct), '');
	});
});
