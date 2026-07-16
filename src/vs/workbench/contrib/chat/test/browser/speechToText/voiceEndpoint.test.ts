/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { addWebSocketAuthToken, getTranscriptionWebSocketUrl, getVoiceWebSocketUrl } from '../../../browser/voiceClient/voiceEndpoint.js';

suite('Voice endpoint', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const productService: IProductService = {
		_serviceBrand: undefined,
		...product,
		voiceWsUrl: 'wss://voice.test/voice-code/api/v1/realtime/voice',
	};

	test('derives transcription URL from the default Voice endpoint', () => {
		const configurationService = new TestConfigurationService();

		assert.deepStrictEqual({
			voice: getVoiceWebSocketUrl(configurationService, productService),
			transcription: getTranscriptionWebSocketUrl(configurationService, productService),
		}, {
			voice: 'wss://voice.test/voice-code/api/v1/realtime/voice',
			transcription: 'wss://voice.test/voice-code/api/v1/realtime/transcription',
		});
	});

	test('uses the configured endpoint and preserves query parameters', () => {
		const configurationService = new TestConfigurationService({
			'agents.voice.backendUrl': 'ws://localhost:8000/api/v1/realtime/voice?environment=dev',
		});

		assert.strictEqual(
			getTranscriptionWebSocketUrl(configurationService, productService),
			'ws://localhost:8000/api/v1/realtime/transcription?environment=dev',
		);
	});

	test('rejects an unexpected Voice endpoint path', () => {
		const configurationService = new TestConfigurationService({
			'agents.voice.backendUrl': 'ws://localhost:8000/api/v1/other',
		});

		assert.strictEqual(getTranscriptionWebSocketUrl(configurationService, productService), '');
	});

	test('adds the GitHub token without discarding existing query parameters', () => {
		assert.strictEqual(
			addWebSocketAuthToken('wss://voice.test/realtime/transcription?environment=dev', 'token +/=?'),
			'wss://voice.test/realtime/transcription?environment=dev&token=token+%2B%2F%3D%3F',
		);
	});
});
