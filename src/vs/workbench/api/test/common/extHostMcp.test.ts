/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostMcpService } from '../../common/extHostMcp.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IExtHostRpcService } from '../../common/extHostRpcService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';

suite('ExtHostMcpService - Authorization Server Metadata Discovery', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let sandbox: sinon.SinonSandbox;
	let fetchStub: sinon.SinonStub;
	let extHostMcpService: ExtHostMcpService;

	setup(() => {
		sandbox = sinon.createSandbox();
		fetchStub = sandbox.stub(globalThis, 'fetch');

		const mockRpcService = mock<IExtHostRpcService>();
		mockRpcService.getProxy.returns({} as any);

		const mockLogService = mock<ILogService>();
		const mockInitDataService = mock<IExtHostInitDataService>();

		extHostMcpService = new ExtHostMcpService(
			mockRpcService,
			mockLogService,
			mockInitDataService
		);
	});

	teardown(() => {
		sandbox.restore();
	});

	test('should try all three discovery URLs in correct order for issuer with path', async () => {
		const issuerUrl = 'https://auth.example.com/tenant1';
		const mockMetadata = {
			issuer: 'https://auth.example.com/tenant1',
			response_types_supported: ['code']
		};

		// First call (OAuth with path insertion) fails
		fetchStub.onCall(0).resolves({
			status: 404,
			json: async () => ({})
		} as Response);

		// Second call (OpenID with path insertion) succeeds
		fetchStub.onCall(1).resolves({
			status: 200,
			json: async () => mockMetadata
		} as Response);

		// Call the private method through any to test the implementation
		const result = await (extHostMcpService as any)._getAuthorizationServerMetadata(issuerUrl, {});

		// Verify the correct number of calls and order
		assert.strictEqual(fetchStub.callCount, 2);

		// Verify first call: OAuth 2.0 Authorization Server Metadata with path insertion
		const firstCall = fetchStub.getCall(0);
		assert.strictEqual(firstCall.args[0], 'https://auth.example.com/.well-known/oauth-authorization-server/tenant1');

		// Verify second call: OpenID Connect Discovery with path insertion
		const secondCall = fetchStub.getCall(1);
		assert.strictEqual(secondCall.args[0], 'https://auth.example.com/.well-known/openid-configuration/tenant1');

		assert.deepStrictEqual(result, mockMetadata);
	});

	test('should try all three discovery URLs when first two fail for issuer with path', async () => {
		const issuerUrl = 'https://auth.example.com/tenant1';
		const mockMetadata = {
			issuer: 'https://auth.example.com/tenant1',
			response_types_supported: ['code']
		};

		// First call (OAuth with path insertion) fails
		fetchStub.onCall(0).resolves({
			status: 404,
			json: async () => ({})
		} as Response);

		// Second call (OpenID with path insertion) fails
		fetchStub.onCall(1).resolves({
			status: 404,
			json: async () => ({})
		} as Response);

		// Third call (OpenID with path appending) succeeds
		fetchStub.onCall(2).resolves({
			status: 200,
			json: async () => mockMetadata
		} as Response);

		const result = await (extHostMcpService as any)._getAuthorizationServerMetadata(issuerUrl, {});

		// Verify all three calls were made
		assert.strictEqual(fetchStub.callCount, 3);

		// Verify first call: OAuth 2.0 Authorization Server Metadata with path insertion
		const firstCall = fetchStub.getCall(0);
		assert.strictEqual(firstCall.args[0], 'https://auth.example.com/.well-known/oauth-authorization-server/tenant1');

		// Verify second call: OpenID Connect Discovery with path insertion
		const secondCall = fetchStub.getCall(1);
		assert.strictEqual(secondCall.args[0], 'https://auth.example.com/.well-known/openid-configuration/tenant1');

		// Verify third call: OpenID Connect Discovery 1.0 path appending
		const thirdCall = fetchStub.getCall(2);
		assert.strictEqual(thirdCall.args[0], 'https://auth.example.com/tenant1/.well-known/openid-configuration');

		assert.deepStrictEqual(result, mockMetadata);
	});

	test('should work correctly for issuer without path components', async () => {
		const issuerUrl = 'https://auth.example.com';
		const mockMetadata = {
			issuer: 'https://auth.example.com',
			response_types_supported: ['code']
		};

		// First call (OAuth without path) succeeds
		fetchStub.onCall(0).resolves({
			status: 200,
			json: async () => mockMetadata
		} as Response);

		const result = await (extHostMcpService as any)._getAuthorizationServerMetadata(issuerUrl, {});

		// Should only make one call
		assert.strictEqual(fetchStub.callCount, 1);

		// Verify call: OAuth 2.0 Authorization Server Metadata
		const firstCall = fetchStub.getCall(0);
		assert.strictEqual(firstCall.args[0], 'https://auth.example.com/.well-known/oauth-authorization-server');

		assert.deepStrictEqual(result, mockMetadata);
	});

	test('should try both discovery URLs for issuer without path when first fails', async () => {
		const issuerUrl = 'https://auth.example.com';
		const mockMetadata = {
			issuer: 'https://auth.example.com',
			response_types_supported: ['code']
		};

		// First call (OAuth) fails
		fetchStub.onCall(0).resolves({
			status: 404,
			json: async () => ({})
		} as Response);

		// Second call (OpenID with path insertion - same as no path for root URL) fails
		fetchStub.onCall(1).resolves({
			status: 404,
			json: async () => ({})
		} as Response);

		// Third call (OpenID with path appending) succeeds
		fetchStub.onCall(2).resolves({
			status: 200,
			json: async () => mockMetadata
		} as Response);

		const result = await (extHostMcpService as any)._getAuthorizationServerMetadata(issuerUrl, {});

		// Should make three calls
		assert.strictEqual(fetchStub.callCount, 3);

		// Verify first call: OAuth 2.0 Authorization Server Metadata
		const firstCall = fetchStub.getCall(0);
		assert.strictEqual(firstCall.args[0], 'https://auth.example.com/.well-known/oauth-authorization-server');

		// Verify second call: OpenID Connect Discovery with path insertion (same as root for no-path URLs)
		const secondCall = fetchStub.getCall(1);
		assert.strictEqual(secondCall.args[0], 'https://auth.example.com/.well-known/openid-configuration');

		// Verify third call: OpenID Connect Discovery 1.0 path appending
		const thirdCall = fetchStub.getCall(2);
		assert.strictEqual(thirdCall.args[0], 'https://auth.example.com/.well-known/openid-configuration');

		assert.deepStrictEqual(result, mockMetadata);
	});

	test('should throw error when all discovery attempts fail', async () => {
		const issuerUrl = 'https://auth.example.com/tenant1';

		// All calls fail
		fetchStub.resolves({
			status: 404,
			text: async () => 'Not Found'
		} as Response);

		await assert.rejects(
			async () => await (extHostMcpService as any)._getAuthorizationServerMetadata(issuerUrl, {}),
			/Failed to fetch authorization server metadata: 404/
		);

		// Should have tried all three methods
		assert.strictEqual(fetchStub.callCount, 3);
	});

	test('should include correct headers in all requests', async () => {
		const issuerUrl = 'https://auth.example.com/tenant1';
		const additionalHeaders = { 'Custom-Header': 'test-value' };
		const mockMetadata = {
			issuer: 'https://auth.example.com/tenant1',
			response_types_supported: ['code']
		};

		// Second call succeeds
		fetchStub.onCall(0).resolves({ status: 404 } as Response);
		fetchStub.onCall(1).resolves({
			status: 200,
			json: async () => mockMetadata
		} as Response);

		await (extHostMcpService as any)._getAuthorizationServerMetadata(issuerUrl, additionalHeaders);

		// Verify headers in both calls
		const firstCallOptions = fetchStub.getCall(0).args[1];
		assert.strictEqual(firstCallOptions.headers['Custom-Header'], 'test-value');
		assert.strictEqual(firstCallOptions.headers['Accept'], 'application/json');
		assert.strictEqual(firstCallOptions.headers['MCP-Protocol-Version'], '2025-06-18');

		const secondCallOptions = fetchStub.getCall(1).args[1];
		assert.strictEqual(secondCallOptions.headers['Custom-Header'], 'test-value');
		assert.strictEqual(secondCallOptions.headers['Accept'], 'application/json');
		assert.strictEqual(secondCallOptions.headers['MCP-Protocol-Version'], '2025-06-18');
	});
});