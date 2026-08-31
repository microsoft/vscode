/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { MaiSpeechCredentialsService, MAI_SPEECH_ENDPOINT_SETTING } from '../../browser/maiSpeechCredentials.js';

suite('MaiSpeechCredentialsService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const ENDPOINT = 'https://eastus2.tts.speech.microsoft.com';
	const OTHER_ENDPOINT = 'https://westus.tts.speech.microsoft.com';

	function createService(disposables: DisposableStore, endpoint?: string) {
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(MAI_SPEECH_ENDPOINT_SETTING, endpoint ?? '');

		const secretStorageService = disposables.add(new TestSecretStorageService());
		const service = disposables.add(new MaiSpeechCredentialsService(configurationService, secretStorageService, new NullLogService()));

		const setEndpoint = async (value: string) => {
			configurationService.setUserConfiguration(MAI_SPEECH_ENDPOINT_SETTING, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: (key: string) => key === MAI_SPEECH_ENDPOINT_SETTING
			} as never);

			// The refresh the change kicks off is asynchronous.
			await service.resolve();
		};

		return { service, setEndpoint };
	}

	test('a key is only offered to the endpoint it was given for', async () => {
		const disposables = store.add(new DisposableStore());
		const { service, setEndpoint } = createService(disposables, ENDPOINT);

		await service.setKey('secret-for-eastus');
		const forOwnEndpoint = await service.resolve();

		// Changing the endpoint without entering a new key must not hand the
		// existing one to another host, and must not keep claiming to be
		// configured: it would outrank the platform synthesizer and then fail.
		await setEndpoint(OTHER_ENDPOINT);

		assert.deepStrictEqual({
			resolvedForOwnEndpoint: forOwnEndpoint,
			resolvedAfterEndpointChange: await service.resolve(),
			configuredAfterEndpointChange: service.isConfigured
		}, {
			resolvedForOwnEndpoint: { endpoint: ENDPOINT, key: 'secret-for-eastus' },
			resolvedAfterEndpointChange: undefined,
			configuredAfterEndpointChange: false
		});
	});

	test('becomes configured again once a key for the new endpoint is entered', async () => {
		const disposables = store.add(new DisposableStore());
		const { service, setEndpoint } = createService(disposables, ENDPOINT);

		await service.setKey('secret-for-eastus');
		await setEndpoint(OTHER_ENDPOINT);
		await service.setKey('secret-for-westus');

		assert.deepStrictEqual({
			resolved: await service.resolve(),
			configured: service.isConfigured
		}, {
			resolved: { endpoint: OTHER_ENDPOINT, key: 'secret-for-westus' },
			configured: true
		});
	});

	test('is not configured without an endpoint, or over plain http', async () => {
		const disposables = store.add(new DisposableStore());
		const { service, setEndpoint } = createService(disposables, ENDPOINT);

		await service.setKey('secret');
		const withEndpoint = service.isConfigured;

		await setEndpoint('');
		const withoutEndpoint = service.isConfigured;

		await setEndpoint('http://insecure.example.com');
		const overPlainHttp = service.isConfigured;

		await setEndpoint('http://localhost:5000');
		await service.setKey('secret');

		assert.deepStrictEqual({
			withEndpoint,
			withoutEndpoint,
			// The key travels with every request, so it must not leave the machine
			// in the clear; a local service is the exception.
			overPlainHttp,
			overLocalhost: service.isConfigured
		}, {
			withEndpoint: true,
			withoutEndpoint: false,
			overPlainHttp: false,
			overLocalhost: true
		});
	});
});
