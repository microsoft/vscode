/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import { type IAgentHostAuthTokenChangeEvent, type IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostMcpConnectorsService } from '../../node/agentHostMcpConnectorsService.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

class RecordingLogService extends NullLogService {
	readonly warnings: string[] = [];

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push([message, ...args].join(' '));
	}
}

class TestAuthenticationService extends Disposable implements IAgentHostAuthenticationService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeAuthToken = this._register(new Emitter<IAgentHostAuthTokenChangeEvent>());
	readonly onDidChangeAuthToken = this._onDidChangeAuthToken.event;

	constructor(private _token: string | undefined) {
		super();
	}

	getAuthToken(): string | undefined {
		return this._token;
	}

	setToken(token: string | undefined): void {
		this._token = token;
		this._onDidChangeAuthToken.fire({
			resource: 'https://api.github.com',
			scopes: ['read:user', 'user:email'],
			token,
		});
	}
}

function connectedPluginsResponse(token = 'mail'): unknown {
	return {
		plugins: [{
			name: 'mail-plugin',
			metadata: { displayName: 'Work IQ Mail' },
			connection: {
				status: 'connected',
				protectedResourceMetadataUrl: 'https://api.github.com/.well-known/oauth-protected-resource/mail',
				scopes: ['write:plugin_gateway_connections'],
			},
			mcpServers: {
				mcpServers: {
					mail: { type: 'http', url: `https://api.github.com/connectors/${token}/mcp` },
				},
			},
		}],
	};
}

suite('AgentHostMcpConnectorsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('fetches connected MCP servers, revalidates by ETag, and isolates a rotated token', async () => {
		const requests: Array<{ readonly url: string; readonly headers: Record<string, string> }> = [];
		const responses = [
			new Response(JSON.stringify(connectedPluginsResponse()), { status: 200, headers: { etag: 'W/"catalog-1"' } }),
			new Response(null, { status: 304 }),
			new Response(JSON.stringify(connectedPluginsResponse('rotated')), { status: 200, headers: { etag: 'W/"catalog-2"' } }),
		];
		const authenticationService = disposables.add(new TestAuthenticationService('token-a'));
		const service = disposables.add(new AgentHostMcpConnectorsService(
			async (input, init) => {
				requests.push({ url: String(input), headers: init?.headers as Record<string, string> });
				return responses.shift()!;
			},
			'https://connectors.example.test/api/v1/',
			authenticationService,
			createTestGitHubEndpointService(),
			new NullLogService(),
		));

		const first = await service.getConnectors();
		const revalidated = await service.refresh();
		authenticationService.setToken('token-b');
		const rotated = await service.getConnectors();

		assert.deepStrictEqual({
			first,
			revalidated,
			rotated,
			requests,
		}, {
			first: [{
				pluginName: 'mail-plugin',
				displayName: 'Work IQ Mail',
				serverName: 'mail',
				configuration: {
					type: McpServerType.REMOTE,
					url: 'https://api.github.com/connectors/mail/mcp',
					headers: { Authorization: 'Bearer token-a' },
				},
				protectedResourceMetadataUrl: 'https://api.github.com/.well-known/oauth-protected-resource/mail',
				scopes: ['write:plugin_gateway_connections'],
			}],
			revalidated: first,
			rotated: [{
				pluginName: 'mail-plugin',
				displayName: 'Work IQ Mail',
				serverName: 'mail',
				configuration: {
					type: McpServerType.REMOTE,
					url: 'https://api.github.com/connectors/rotated/mcp',
					headers: { Authorization: 'Bearer token-b' },
				},
				protectedResourceMetadataUrl: 'https://api.github.com/.well-known/oauth-protected-resource/mail',
				scopes: ['write:plugin_gateway_connections'],
			}],
			requests: [{
				url: 'https://connectors.example.test/api/v1/plugins/connected',
				headers: { Accept: 'application/json', Authorization: 'Bearer token-a' },
			}, {
				url: 'https://connectors.example.test/api/v1/plugins/connected',
				headers: { Accept: 'application/json', Authorization: 'Bearer token-a', 'If-None-Match': 'W/"catalog-1"' },
			}, {
				url: 'https://connectors.example.test/api/v1/plugins/connected',
				headers: { Accept: 'application/json', Authorization: 'Bearer token-b' },
			}],
		});
	});

	test('does not retain an ETag from a no-store response', async () => {
		const validators: Array<string | undefined> = [];
		const authenticationService = disposables.add(new TestAuthenticationService('token'));
		const service = disposables.add(new AgentHostMcpConnectorsService(
			async (_input, init) => {
				validators.push((init?.headers as Record<string, string>)['If-None-Match']);
				return new Response(JSON.stringify(connectedPluginsResponse()), {
					status: 200,
					headers: { etag: 'W/"private"', 'cache-control': 'private, no-store' },
				});
			},
			'https://connectors.example.test/api/v1',
			authenticationService,
			createTestGitHubEndpointService(),
			new NullLogService(),
		));

		await service.getConnectors();
		await service.refresh();

		assert.deepStrictEqual(validators, [undefined, undefined]);
	});

	test('handles repeated 304 responses without a cached representation', async () => {
		let requestCount = 0;
		const logService = new RecordingLogService();
		const authenticationService = disposables.add(new TestAuthenticationService('token'));
		const service = disposables.add(new AgentHostMcpConnectorsService(
			async () => {
				requestCount++;
				return new Response(null, { status: 304 });
			},
			'https://connectors.example.test/api/v1',
			authenticationService,
			createTestGitHubEndpointService(),
			logService,
		));

		assert.deepStrictEqual({
			connectors: await service.getConnectors(),
			requestCount,
			warnings: logService.warnings,
		}, {
			connectors: [],
			requestCount: 2,
			warnings: ['[AgentHostMcpConnectorsService] Connected plugins returned 304 without a cached representation'],
		});
	});

	test('keeps the first plugin when connector server names collide', async () => {
		const logService = new RecordingLogService();
		const authenticationService = disposables.add(new TestAuthenticationService('token'));
		const service = disposables.add(new AgentHostMcpConnectorsService(
			async () => new Response(JSON.stringify({
				plugins: [{
					name: 'first-plugin',
					connection: { status: 'connected' },
					mcpServers: { mcpServers: { shared: { type: 'http', url: 'https://first.example.test/mcp' } } },
				}, {
					name: 'second-plugin',
					connection: { status: 'connected' },
					mcpServers: { mcpServers: { shared: { type: 'http', url: 'https://second.example.test/mcp' } } },
				}],
			}), { status: 200 }),
			'https://connectors.example.test/api/v1',
			authenticationService,
			createTestGitHubEndpointService(),
			logService,
		));

		assert.deepStrictEqual({
			connectors: await service.getConnectors(),
			warnings: logService.warnings,
		}, {
			connectors: [{
				pluginName: 'first-plugin',
				displayName: 'first-plugin',
				serverName: 'shared',
				configuration: {
					type: McpServerType.REMOTE,
					url: 'https://first.example.test/mcp',
					headers: { Authorization: 'Bearer token' },
				},
				scopes: [],
			}],
			warnings: [`[AgentHostMcpConnectorsService] Ignoring duplicate MCP server 'shared' from plugin 'second-plugin'; plugin 'first-plugin' already owns that name`],
		});
	});

	test('fails closed for disconnected, malformed, and non-HTTP entries', async () => {
		const authenticationService = disposables.add(new TestAuthenticationService('token'));
		const service = disposables.add(new AgentHostMcpConnectorsService(
			async () => new Response(JSON.stringify({
				plugins: [{
					name: 'disconnected',
					connection: { status: 'pending' },
					mcpServers: { mcpServers: { pending: { type: 'http', url: 'https://example.test/mcp' } } },
				}, {
					name: 'invalid',
					connection: { status: 'connected' },
					mcpServers: {
						mcpServers: {
							stdio: { type: 'stdio', url: 'https://example.test/mcp' },
							file: { type: 'http', url: 'file:///tmp/mcp' },
						}
					},
				}],
			}), { status: 200 }),
			'https://connectors.example.test/api/v1',
			authenticationService,
			createTestGitHubEndpointService(),
			new NullLogService(),
		));

		assert.deepStrictEqual(await service.getConnectors(), []);
	});

	test('does not request the catalog without a GitHub OAuth token', async () => {
		let requestCount = 0;
		const authenticationService = disposables.add(new TestAuthenticationService(undefined));
		const service = disposables.add(new AgentHostMcpConnectorsService(
			async () => {
				requestCount++;
				return new Response(JSON.stringify(connectedPluginsResponse()), { status: 200 });
			},
			'https://connectors.example.test/api/v1',
			authenticationService,
			createTestGitHubEndpointService(),
			new NullLogService(),
		));

		assert.deepStrictEqual({ connectors: await service.getConnectors(), requestCount }, { connectors: [], requestCount: 0 });
	});

	test('does not request the catalog when the product endpoint is not configured', async () => {
		let requestCount = 0;
		const authenticationService = disposables.add(new TestAuthenticationService('token'));
		const service = disposables.add(new AgentHostMcpConnectorsService(
			async () => {
				requestCount++;
				return new Response(JSON.stringify(connectedPluginsResponse()), { status: 200 });
			},
			undefined,
			authenticationService,
			createTestGitHubEndpointService(),
			new NullLogService(),
		));

		assert.deepStrictEqual({ connectors: await service.getConnectors(), requestCount }, { connectors: [], requestCount: 0 });
	});

	test('does not send a GHES token to the configured dotcom connector endpoint', async () => {
		let requestCount = 0;
		const authenticationService = disposables.add(new TestAuthenticationService('token'));
		const service = disposables.add(new AgentHostMcpConnectorsService(
			async () => {
				requestCount++;
				return new Response(JSON.stringify(connectedPluginsResponse()), { status: 200 });
			},
			'https://api.github.com/copilot-connectors/api/v1',
			authenticationService,
			createTestGitHubEndpointService('https://github.example.com'),
			new NullLogService(),
		));

		assert.deepStrictEqual({ connectors: await service.getConnectors(), requestCount }, { connectors: [], requestCount: 0 });
	});
});
