/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IRequestContext, IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { CopilotConnectorsMarketplaceSource, CopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { CustomizationMarketplaceMediaType } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';

function catalogResponse(status: 'available' | 'connected', names = ['mail']): unknown {
	return {
		plugins: names.map(name => ({
			name,
			metadata: {
				displayName: `${name} connector`,
				description: `Connect ${name}`,
				tags: ['productivity'],
				capabilities: ['Search'],
				representativeQueries: [`Search ${name}`],
				iconUrl: `https://example.com/${name}.png`,
				documentationUrl: `https://example.com/${name}`,
			},
			connection: {
				status,
				protectedResourceMetadataUrl: `https://example.com/${name}/oauth`,
				scopes: ['write:plugin_gateway_connections'],
			},
			mcpServers: {
				mcpServers: {
					[`${name}-server`]: { type: 'http', url: `https://example.com/${name}/mcp` },
				},
			},
		})),
	};
}

suite('CopilotConnectorsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(responses: Array<{ readonly status?: number; readonly body?: unknown }>, enabled = true, enterprise = false) {
		const requests: Array<{ readonly type: string | undefined; readonly url: string; readonly data: string | undefined }> = [];
		const requestService = new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions): Promise<IRequestContext> {
				assert.ok(options.url);
				requests.push({ type: options.type, url: options.url, data: options.data });
				const response = responses.shift() ?? {};
				const body = response.body === undefined ? '' : JSON.stringify(response.body);
				return {
					res: { statusCode: response.status ?? 200, headers: {} },
					stream: bufferToStream(VSBuffer.fromString(body)),
				};
			}
		}();
		const account = {
			authenticationProvider: { id: 'github', name: 'GitHub', enterprise },
			accountName: 'octocat',
			sessionId: 'session',
			enterprise,
		};
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override readonly currentDefaultAccount = account;
			override async getDefaultAccount() { return account; }
			override getDefaultAccountAuthenticationProvider() { return account.authenticationProvider; }
		}();
		const authenticationService = new class extends mock<IAuthenticationService>() {
			override async getSessions() {
				return [{
					id: 'session',
					accessToken: 'test-token',
					account: { id: 'account', label: 'octocat' },
					scopes: ['read:user'],
				}];
			}
		}();
		const productService = new class extends mock<IProductService>() {
			override readonly defaultChatAgent = {
				...product.defaultChatAgent,
				mcpConnectorsUrl: 'https://api.github.test/copilot-connectors/api/v1',
			};
		}();
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled]: enabled,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const opened: string[] = [];
		const openerService = new class extends mock<IOpenerService>() {
			override async open(resource: URI) {
				opened.push(resource.toString(true));
				return true;
			}
		}();
		const service = store.add(new CopilotConnectorsService(
			requestService,
			authenticationService,
			defaultAccountService,
			productService,
			configurationService,
			openerService,
			new NullLogService(),
		));
		return { service, requests, opened, configurationService };
	}

	test('validates catalog metadata and exposes an MCP marketplace source', async () => {
		const fixture = createFixture([{ body: catalogResponse('available', ['mail', 'calendar']) }]);
		const source = new CopilotConnectorsMarketplaceSource(fixture.service, fixture.configurationService);

		const first = await source.query({ query: 'connector', mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 1 }, CancellationToken.None);
		const second = await source.query({ query: 'connector', mediaType: CustomizationMarketplaceMediaType.McpServer, pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({
			first: first.items.map(item => ({ identifier: item.identifier, installation: item.installation, publisher: item.publisher })),
			second: second.items.map(item => item.identifier),
			total: first.total,
			nextCursor: first.nextCursor,
			requests: fixture.requests.map(request => request.url),
		}, {
			first: [{ identifier: 'mail', installation: { kind: 'copilotConnector', name: 'mail' }, publisher: 'GitHub Copilot' }],
			second: ['calendar'],
			total: 2,
			nextCursor: '1',
			requests: ['https://api.github.test/copilot-connectors/api/v1/plugins'],
		});
	});

	test('opens consent and waits for the connector to become connected', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('available') },
			{ body: { consent_link: 'https://github.com/settings/copilot/connectors/mail' } },
			{ body: catalogResponse('connected') },
		]);

		await fixture.service.connect('mail', CancellationToken.None);

		assert.deepStrictEqual({
			requests: fixture.requests,
			opened: fixture.opened,
			connected: fixture.service.connectedMcpServers.map(server => ({
				connector: server.connector.name,
				serverName: server.serverName,
			})),
		}, {
			requests: [{
				type: 'GET',
				url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
				data: undefined,
			}, {
				type: 'PUT',
				url: 'https://api.github.test/copilot-connectors/api/v1/connectors/managed/mail/connection',
				data: '{"client_source":"VS_CODE"}',
			}, {
				type: 'GET',
				url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
				data: undefined,
			}],
			opened: ['https://github.com/settings/copilot/connectors/mail'],
			connected: [{ connector: 'mail', serverName: 'mail-server' }],
		});
	});

	test('disconnects a connector and refreshes its state', async () => {
		const fixture = createFixture([
			{ body: catalogResponse('connected') },
			{ status: 204 },
			{ body: catalogResponse('available') },
		]);
		await fixture.service.getConnectors(CancellationToken.None);

		await fixture.service.disconnect('mail', CancellationToken.None);

		assert.deepStrictEqual({
			requests: fixture.requests.map(request => ({ type: request.type, url: request.url })),
			status: fixture.service.connectors[0]?.connectionStatus,
		}, {
			requests: [{
				type: 'GET',
				url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
			}, {
				type: 'DELETE',
				url: 'https://api.github.test/copilot-connectors/api/v1/connectors/managed/mail/connection',
			}, {
				type: 'GET',
				url: 'https://api.github.test/copilot-connectors/api/v1/plugins',
			}],
			status: 'not_connected',
		});
	});

	test('does not initialize or request connectors while the experiment is disabled', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }], false);

		const connectors = await fixture.service.getConnectors(CancellationToken.None);

		assert.deepStrictEqual({ connectors, requests: fixture.requests }, { connectors: [], requests: [] });
	});

	test('does not send a GitHub Enterprise token to the dotcom connectors endpoint', async () => {
		const fixture = createFixture([{ body: catalogResponse('connected') }], true, true);

		const connectors = await fixture.service.getConnectors(CancellationToken.None);

		assert.deepStrictEqual({ connectors, requests: fixture.requests }, { connectors: [], requests: [] });
	});
});
