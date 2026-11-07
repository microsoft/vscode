/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getDynamicAuthProviderQuickPickItem, getResourceFromProviderId } from '../../browser/actions/manageDynamicAuthenticationProvidersAction.js';
import { DynamicAuthenticationProviderInfo } from '../../../../services/authentication/common/authentication.js';

suite('manageDynamicAuthenticationProvidersAction', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getResourceFromProviderId', () => {
		test('extracts resource when providerId starts with authorizationServer and space', () => {
			const resource = getResourceFromProviderId('https://auth.example.com https://api.example.com/mcp', 'https://auth.example.com');
			assert.strictEqual(resource, 'https://api.example.com/mcp');
		});

		test('extracts resource from providerId with space when authorizationServer differs', () => {
			const resource = getResourceFromProviderId('server1 https://api.example.com/mcp', 'server2');
			assert.strictEqual(resource, 'https://api.example.com/mcp');
		});

		test('returns undefined when providerId has no space', () => {
			const resource = getResourceFromProviderId('single_token_provider', 'https://auth.example.com');
			assert.strictEqual(resource, undefined);
		});

		test('handles multiple spaces properly by slicing after authorizationServer', () => {
			const resource = getResourceFromProviderId('https://auth.example.com resource with spaces', 'https://auth.example.com');
			assert.strictEqual(resource, 'resource with spaces');
		});
	});

	suite('getDynamicAuthProviderQuickPickItem', () => {
		test('formats quickpick item with resource in description and clientId in detail', () => {
			const provider: DynamicAuthenticationProviderInfo = {
				providerId: 'https://auth.example.com https://api.example.com/mcp',
				authorizationServer: 'https://auth.example.com',
				clientId: 'client-123',
				label: 'auth.example.com'
			};

			const item = getDynamicAuthProviderQuickPickItem(provider);
			assert.strictEqual(item.label, 'auth.example.com');
			assert.strictEqual(item.description, 'https://api.example.com/mcp');
			assert.ok(item.detail?.includes('client-123'));
			assert.strictEqual(item.provider, provider);
		});

		test('formats quickpick item with clientId in description when resource is absent', () => {
			const provider: DynamicAuthenticationProviderInfo = {
				providerId: 'auth_provider_no_resource',
				authorizationServer: 'https://auth.example.com',
				clientId: 'client-456',
				label: 'auth.example.com'
			};

			const item = getDynamicAuthProviderQuickPickItem(provider);
			assert.strictEqual(item.label, 'auth.example.com');
			assert.ok(item.description?.includes('client-456'));
			assert.strictEqual(item.detail, undefined);
			assert.strictEqual(item.provider, provider);
		});
	});
});
