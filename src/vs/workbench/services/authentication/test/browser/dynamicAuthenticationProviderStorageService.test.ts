/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { DynamicAuthenticationProviderStorageService } from '../../browser/dynamicAuthenticationProviderStorageService.js';

suite('DynamicAuthenticationProviderStorageService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('moves a matching legacy registration and tokens to a client-scoped provider', async () => {
		const storageService = disposables.add(new TestStorageService());
		const secretStorageService = new TestSecretStorageService();
		const service = disposables.add(new DynamicAuthenticationProviderStorageService(
			storageService,
			secretStorageService,
			disposables.add(new NullLogService()),
		));
		const legacyProviderId = 'https://auth.example.com/ https://mcp.example.com';
		const scopedProviderId = `${legacyProviderId} clientId=client-a`;
		const tokens = [{
			access_token: 'access-token',
			token_type: 'Bearer',
			refresh_token: 'refresh-token',
			created_at: 1,
		}];

		await service.storeClientRegistration(legacyProviderId, 'https://auth.example.com/', 'client-a', 'client-secret', 'Example');
		await service.setSessionsForDynamicAuthProvider(legacyProviderId, 'client-a', tokens);

		assert.strictEqual(await service.migrateDynamicProvider(legacyProviderId, scopedProviderId, 'client-a'), true);
		assert.deepStrictEqual(await service.getClientRegistration(scopedProviderId), {
			clientId: 'client-a',
			clientSecret: 'client-secret',
		});
		assert.deepStrictEqual(await service.getSessionsForDynamicAuthProvider(scopedProviderId, 'client-a'), tokens);
		assert.strictEqual(await service.getClientRegistration(legacyProviderId), undefined);
		assert.strictEqual(await service.getSessionsForDynamicAuthProvider(legacyProviderId, 'client-a'), undefined);
		assert.deepStrictEqual(service.getInteractedProviders().map(provider => provider.providerId), [scopedProviderId]);
	});
});
