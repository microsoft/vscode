/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IRequestService } from '../../../request/common/request.js';
import { AgentHostMcpOAuthMetadataService } from '../../common/agentHostMcpOAuthMetadataService.js';

suite('AgentHostMcpOAuthMetadataService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const resource = 'https://mcp.example.com/v1/mcp';
	const origin = 'https://mcp.example.com';
	const authorizationMetadata = {
		issuer: origin,
		authorization_endpoint: `${origin}/v1/authorize`,
		token_endpoint: `${origin}/v1/token`,
		registration_endpoint: `${origin}/v1/register`,
	};

	function createService(responses: Record<string, { status: number; body: object | string }>) {
		const requests: { url: string | undefined; headers: object | undefined }[] = [];
		const service = new AgentHostMcpOAuthMetadataService(new class extends mock<IRequestService>() {
			override async request(options: Parameters<IRequestService['request']>[0]) {
				requests.push({ url: options.url, headers: options.headers });
				const response = responses[options.url ?? ''] ?? { status: 404, body: '' };
				return {
					res: { headers: {}, statusCode: response.status },
					stream: bufferToStream(VSBuffer.fromString(typeof response.body === 'string' ? response.body : JSON.stringify(response.body))),
				};
			}
		}());
		return { service, requests };
	}

	test('discovers legacy origin metadata without guessing endpoints or sending credentials', async () => {
		const { service, requests } = createService({
			[`${origin}/.well-known/oauth-authorization-server`]: { status: 200, body: authorizationMetadata },
		});
		const resolved = await service.resolveResource(resource);
		const metadata = await service.fetch(resolved.authorization_servers![0]);
		assert.deepStrictEqual({ resolved, metadata, requests }, {
			resolved: { resource, authorization_servers: [origin] },
			metadata: { metadata: authorizationMetadata, discoveryUrl: `${origin}/.well-known/oauth-authorization-server` },
			requests: [
				`${origin}/.well-known/oauth-protected-resource/v1/mcp`,
				`${origin}/.well-known/oauth-protected-resource`,
				`${origin}/.well-known/oauth-authorization-server`,
			].map(url => ({ url, headers: { Accept: 'application/json' } })),
		});
	});

	test('honors modern protected resource metadata and its advertised issuer', async () => {
		const protectedResource = { resource, authorization_servers: ['https://identity.example/tenant'], scopes_supported: ['read'] };
		const { service, requests } = createService({
			[`${origin}/.well-known/oauth-protected-resource/v1/mcp`]: { status: 200, body: protectedResource },
		});
		assert.deepStrictEqual({ resource: await service.resolveResource(resource), requests }, {
			resource: protectedResource,
			requests: [{ url: `${origin}/.well-known/oauth-protected-resource/v1/mcp`, headers: { Accept: 'application/json' } }],
		});
	});

	for (const [name, body] of [
		['invalid JSON', '{'],
		['invalid metadata', {}],
		['mismatched resource', { resource: 'https://other.example', authorization_servers: [origin] }],
		['missing issuers', { resource }],
		['empty issuers', { resource, authorization_servers: [] }],
		['invalid issuers', { resource, authorization_servers: [42] }],
	] as const) {
		test(`does not fall back to legacy discovery after successful PRM with ${name}`, async () => {
			const { service } = createService({
				[`${origin}/.well-known/oauth-protected-resource/v1/mcp`]: { status: 200, body },
			});
			await assert.rejects(() => service.resolveResource(resource));
		});
	}

	for (const [name, body] of [
		['mismatched issuer', { ...authorizationMetadata, issuer: 'https://other.example' }],
		['invalid issuer', { ...authorizationMetadata, issuer: 42 }],
		['invalid endpoint', { ...authorizationMetadata, token_endpoint: 'not-a-url' }],
		['missing endpoints', { issuer: origin }],
		['invalid JSON', '{'],
		['missing metadata', {}],
	] as const) {
		test(`rejects authorization server metadata with ${name}`, async () => {
			const { service } = createService({
				[`${origin}/.well-known/oauth-authorization-server`]: { status: 200, body },
			});
			await assert.rejects(() => service.fetch(origin));
		});
	}

	test('fails when authorization server discovery is unavailable', async () => {
		const { service } = createService({});
		await assert.rejects(() => service.fetch(origin));
	});
});
