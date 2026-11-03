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
	const entraOrigin = 'https://login.microsoftonline.com';
	const entraAuthority = `${entraOrigin}/organizations/v2.0`;
	const consumerIssuer = `${entraOrigin}/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0`;
	const entraMetadata = {
		issuer: `${entraOrigin}/{tenantid}/v2.0`,
		authorization_endpoint: `${entraOrigin}/organizations/oauth2/v2.0/authorize`,
		token_endpoint: `${entraOrigin}/organizations/oauth2/v2.0/token`,
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

	for (const [tenant, issuer] of [
		['common', entraMetadata.issuer],
		['organizations', entraMetadata.issuer],
		['consumers', entraMetadata.issuer],
		['consumers', consumerIssuer],
	]) {
		for (const trailingSlash of ['', '/']) {
			const authority = `${entraOrigin}/${tenant}/v2.0${trailingSlash}`;
			test(`accepts Entra issuer ${issuer} for ${authority}`, async () => {
				const discoveryUrl = `${entraOrigin}/${tenant}/v2.0/.well-known/openid-configuration`;
				const metadata = {
					...entraMetadata,
					issuer,
					authorization_endpoint: `${entraOrigin}/${tenant}/oauth2/v2.0/authorize`,
					token_endpoint: `${entraOrigin}/${tenant}/oauth2/v2.0/token`,
				};
				const { service } = createService({
					[discoveryUrl]: { status: 200, body: metadata },
				});
				assert.deepStrictEqual(await service.fetch(authority), { metadata, discoveryUrl });
			});
		}
	}

	test('continues to accept an exactly matching Entra issuer', async () => {
		const metadata = { ...entraMetadata, issuer: entraAuthority };
		const discoveryUrl = `${entraAuthority}/.well-known/openid-configuration`;
		const { service } = createService({
			[discoveryUrl]: { status: 200, body: metadata },
		});
		assert.deepStrictEqual(await service.fetch(entraAuthority), { metadata, discoveryUrl });
	});

	for (const [name, authority, issuer] of [
		['non-Entra authority', `${origin}/organizations/v2.0`, `${origin}/{tenantid}/v2.0`],
		['lookalike authority', 'https://login.microsoftonline.com.example/organizations/v2.0', entraMetadata.issuer],
		['untrusted issuer', entraAuthority, 'https://other.example/{tenantid}/v2.0'],
		['concrete tenant authority', `${entraOrigin}/tenant-id/v2.0`, entraMetadata.issuer],
		['different concrete issuer', entraAuthority, `${entraOrigin}/other-tenant/v2.0`],
		['different consumer tenant', `${entraOrigin}/consumers/v2.0`, `${entraOrigin}/other-tenant/v2.0`],
		['consumer tenant for organizations', entraAuthority, consumerIssuer],
		['consumer tenant for common', `${entraOrigin}/common/v2.0`, consumerIssuer],
		['untrusted consumer issuer', `${entraOrigin}/consumers/v2.0`, 'https://other.example/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0'],
		['different placeholder', entraAuthority, `${entraOrigin}/{tenant}/v2.0`],
		['different version', `${entraOrigin}/organizations/v1.0`, entraMetadata.issuer],
		['insecure authority', 'http://login.microsoftonline.com/organizations/v2.0', entraMetadata.issuer],
		['insecure issuer', entraAuthority, 'http://login.microsoftonline.com/{tenantid}/v2.0'],
		['different port', 'https://login.microsoftonline.com:444/organizations/v2.0', entraMetadata.issuer],
		['query in authority', `${entraAuthority}?unexpected=1`, entraMetadata.issuer],
		['query in issuer', entraAuthority, `${entraMetadata.issuer}?unexpected=1`],
		['matching queries', `${entraAuthority}?unexpected=1`, `${entraMetadata.issuer}?unexpected=1`],
		['matching fragments', `${entraAuthority}#unexpected`, `${entraMetadata.issuer}#unexpected`],
		['matching credentials', 'https://user:pass@login.microsoftonline.com/organizations/v2.0', 'https://user:pass@login.microsoftonline.com/{tenantid}/v2.0'],
	]) {
		test(`rejects an Entra issuer exception with ${name}`, async () => {
			const discoveryUrl = new URL('/.well-known/oauth-authorization-server', authority).toString() + new URL(authority).pathname;
			const { service } = createService({
				[discoveryUrl]: { status: 200, body: { ...entraMetadata, issuer } },
			});
			await assert.rejects(() => service.fetch(authority), {
				message: 'MCP authorization server metadata issuer does not match the requested authorization server',
			});
		});
	}

	test('still requires token endpoints for Entra tenant-independent metadata', async () => {
		const { service } = createService({
			[`${entraAuthority}/.well-known/openid-configuration`]: { status: 200, body: { ...entraMetadata, token_endpoint: undefined } },
		});
		await assert.rejects(() => service.fetch(entraAuthority), {
			message: 'MCP authorization server metadata must advertise authorization and token endpoints',
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
