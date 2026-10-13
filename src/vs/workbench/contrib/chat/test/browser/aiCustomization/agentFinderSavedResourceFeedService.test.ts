/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { IDefaultAccount } from '../../../../../../base/common/defaultAccount.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IRequestContext, IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType, ICustomizationMarketplaceEntry } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { AuthenticationSession, IAuthenticationService } from '../../../../../services/authentication/common/authentication.js';
import { AgentFinderSavedResourceFeedService } from '../../../browser/aiCustomization/agentFinderSavedResourceFeedService.js';

const skill = {
	identifier: 'urn:air:github.com:pbakaus:impeccable:impeccable',
	displayName: 'Impeccable Design Tool',
	type: 'application/agent-skills+md',
	mediaType: 'application/agent-skills+md',
	url: 'https://github.com/pbakaus/impeccable/tree/d631a8827f99414d2b6daba4ef08b7f8701751d7/plugin/skills/impeccable',
	description: 'Improves frontend interfaces.',
	tags: ['design'],
	capabilities: ['review interfaces'],
	representativeQueries: ['review this interface'],
};

const mcp = {
	identifier: 'urn:air:registry.modelcontextprotocol.io:com.figma.mcp:mcp',
	displayName: 'Figma MCP Server',
	type: 'application/mcp-server+json',
	mediaType: 'application/mcp-server+json',
	url: 'https://api.mcp.github.com/v0.1/servers/com.figma.mcp%2Fmcp/versions/1.0.3',
	description: 'Connects Figma design context.',
	version: '1.0.3',
};

const plugin = {
	identifier: 'urn:air:github.com:microsoft:foundry-dev-tools:microsoft-foundry',
	displayName: 'Microsoft Foundry Canvas',
	type: 'application/vnd.github.copilot-plugin',
	mediaType: 'application/vnd.github.copilot-plugin',
	url: 'https://github.com/microsoft/foundry-dev-tools/tree/d008a24518109b4253189942c3ff268cc327a8d5/microsoft-foundry',
	description: 'Designs and manages hosted agents.',
	version: '1.0.14',
};

const account: IDefaultAccount = {
	authenticationProvider: { id: 'github', name: 'GitHub', enterprise: false },
	accountName: 'octocat',
	sessionId: 'session',
	enterprise: false,
};

const authenticationSession: AuthenticationSession = {
	id: account.sessionId,
	accessToken: 'test-token',
	account: { id: 'account', label: account.accountName },
	scopes: ['repo'],
};

class TestRequestService implements IRequestService {
	declare readonly _serviceBrand: undefined;
	readonly onDidCompleteRequest = Event.None;
	readonly requests: IRequestOptions[] = [];

	constructor(private readonly respond: (options: IRequestOptions, token: CancellationToken) => Promise<IRequestContext>) { }

	request(options: IRequestOptions, token: CancellationToken): Promise<IRequestContext> {
		this.requests.push(options);
		return this.respond(options, token);
	}

	async resolveProxy() { return undefined; }
	async lookupAuthorization() { return undefined; }
	async lookupKerberosAuthorization() { return undefined; }
	async loadCertificates() { return []; }
}

function response(body: unknown, statusCode = 200): IRequestContext {
	return {
		res: { statusCode, headers: {} },
		stream: bufferToStream(VSBuffer.fromString(JSON.stringify(body))),
	};
}

function resourceSnapshot(resource: ICustomizationMarketplaceEntry) {
	return {
		...resource,
		url: resource.url?.toString(true),
		repository: resource.repository?.toString(true),
		readmeUri: resource.readmeUri?.toString(true),
		icon: URI.isUri(resource.icon)
			? resource.icon.toString(true)
			: resource.icon && { light: resource.icon.light.toString(true), dark: resource.icon.dark.toString(true) },
		publisherUrl: resource.publisherUrl?.toString(true),
	};
}

suite('AgentFinderSavedResourceFeedService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(
		respond: (options: IRequestOptions, token: CancellationToken) => Promise<IRequestContext>,
		currentAccount: IDefaultAccount | null = account,
		sessions: readonly AuthenticationSession[] = [authenticationSession],
	) {
		const requestService = new TestRequestService(respond);
		const authenticationService = new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = Event.None;
			override async getSessions(..._args: Parameters<IAuthenticationService['getSessions']>) { return sessions; }
		}();
		const defaultAccountService = new class extends mock<IDefaultAccountService>() {
			override readonly onDidChangeDefaultAccount = Event.None;
			override readonly currentDefaultAccount = currentAccount;
			override async getDefaultAccount() { return this.currentDefaultAccount; }
			override async signIn() { return this.currentDefaultAccount; }
		}();
		const productService = new class extends mock<IProductService>() {
			override readonly defaultChatAgent = new class extends mock<NonNullable<IProductService['defaultChatAgent']>>() {
				override readonly agentFinderCustomizationFeedIds = {
					editorsPicks: 'feed_editors',
					planBuildAndShip: 'feed_plan',
					connectYourWork: 'feed_connect',
				};
			}();
		}();
		const service = store.add(new AgentFinderSavedResourceFeedService(
			requestService,
			authenticationService,
			defaultAccountService,
			productService,
			new NullLogService(),
		));
		return { service, requestService };
	}

	test('preserves available resource order and normalizes supported feed metadata', async () => {
		const { service, requestService } = createService(async () => response({
			id: 'feed_editors',
			name: 'Editor’s picks',
			version: 3,
			entries: [
				{ identifier: skill.identifier, status: 'available', resource: skill },
				{ identifier: 'unavailable', status: 'unavailable' },
				{ identifier: mcp.identifier, status: 'available', resource: mcp },
				{ identifier: 'filtered', status: 'filtered' },
				{ identifier: plugin.identifier, status: 'available', resource: plugin },
				{
					identifier: 'unsupported',
					status: 'available',
					resource: {
						identifier: 'unsupported',
						displayName: 'Unsupported',
						type: 'application/example',
						mediaType: 'application/example',
					},
				},
			],
		}));
		const results = await service.getFeeds(['feed_editors'], CancellationToken.None);

		assert.deepStrictEqual({
			feedIds: service.feedIds,
			results: results.map(result => result.feed ? { ...result, feed: { ...result.feed, items: result.feed.items.map(resourceSnapshot) } } : result),
			requests: requestService.requests,
		}, {
			feedIds: {
				editorsPicks: 'feed_editors',
				planBuildAndShip: 'feed_plan',
				connectYourWork: 'feed_connect',
			},
			results: [{
				id: 'feed_editors',
				feed: {
					id: 'feed_editors',
					name: 'Editor’s picks',
					version: 3,
					items: [{
						identifier: skill.identifier,
						displayName: skill.displayName,
						mediaType: CustomizationMarketplaceMediaType.Skill,
						description: skill.description,
						tags: skill.tags,
						capabilities: skill.capabilities,
						representativeQueries: skill.representativeQueries,
						url: skill.url,
						externalUrl: skill.url,
						repository: 'https://github.com/pbakaus/impeccable',
						readmeUri: undefined,
						icon: 'https://github.com/pbakaus.png?size=64',
						publisher: 'pbakaus',
						publisherUrl: 'https://github.com/pbakaus',
						version: undefined,
						installation: {
							kind: 'skill',
							repository: 'pbakaus/impeccable',
							ref: 'd631a8827f99414d2b6daba4ef08b7f8701751d7',
							path: 'plugin/skills/impeccable',
						},
					}, {
						identifier: mcp.identifier,
						displayName: mcp.displayName,
						mediaType: CustomizationMarketplaceMediaType.McpServer,
						description: mcp.description,
						tags: [],
						capabilities: [],
						representativeQueries: [],
						url: 'https://api.mcp.github.com/v0.1/servers/com.figma.mcp/mcp/versions/1.0.3',
						externalUrl: mcp.url,
						repository: undefined,
						readmeUri: undefined,
						icon: 'https://avatars.githubusercontent.com/u/5155369?v=4',
						publisher: undefined,
						publisherUrl: undefined,
						version: mcp.version,
						installation: { kind: 'mcp', name: 'com.figma.mcp/mcp', version: '1.0.3' },
					}, {
						identifier: plugin.identifier,
						displayName: plugin.displayName,
						mediaType: CustomizationMarketplaceMediaType.CopilotPlugin,
						description: plugin.description,
						tags: [],
						capabilities: [],
						representativeQueries: [],
						url: plugin.url,
						externalUrl: plugin.url,
						repository: 'https://github.com/microsoft/foundry-dev-tools',
						readmeUri: 'https://raw.githubusercontent.com/microsoft/foundry-dev-tools/d008a24518109b4253189942c3ff268cc327a8d5/microsoft-foundry/README.md',
						icon: 'https://github.com/microsoft.png?size=64',
						publisher: 'microsoft',
						publisherUrl: 'https://github.com/microsoft',
						version: plugin.version,
						installation: {
							kind: 'plugin',
							repository: 'microsoft/foundry-dev-tools',
							ref: 'd008a24518109b4253189942c3ff268cc327a8d5',
							path: 'microsoft-foundry',
						},
					}],
				},
			}],
			requests: [{
				url: 'https://agentfinder.github.com/internal/v1/feeds/feed_editors',
				type: 'GET',
				headers: { Accept: 'application/json', Authorization: 'Bearer test-token' },
				disableCache: true,
				timeout: 30_000,
				followRedirects: 0,
				callSite: 'agentFinder.savedResourceFeed',
			}],
		});
	});

	test('returns successful feeds alongside bounded request failures', async () => {
		const { service } = createService(async options => options.url?.endsWith('/feed_plan')
			? response({ error: 'private upstream details' }, 503)
			: response({ id: 'feed_editors', name: 'Editor’s picks', version: 1, entries: [] }));
		const results = await service.getFeeds(['feed_editors', 'feed_plan'], CancellationToken.None);

		assert.deepStrictEqual(results, [{
			id: 'feed_editors',
			feed: { id: 'feed_editors', name: 'Editor’s picks', version: 1, items: [] },
		}, {
			id: 'feed_plan',
			error: 'The customization feed could not complete the request (HTTP 503). Try again later.',
		}]);
	});

	test('rejects malformed feed envelopes and entries', async () => {
		const valid = {
			id: 'feed_editors',
			name: 'Editor’s picks',
			version: 1,
			entries: [{ identifier: skill.identifier, status: 'available', resource: skill }],
		};
		for (const body of [
			null,
			[],
			{},
			{ ...valid, id: 'other' },
			{ ...valid, version: 0 },
			{ ...valid, entries: [{ identifier: skill.identifier, status: 'available' }] },
			{ ...valid, entries: [{ identifier: skill.identifier, status: 'unavailable', resource: skill }] },
			{ ...valid, entries: [...valid.entries, ...valid.entries] },
			{ ...valid, entries: [{ identifier: skill.identifier, status: 'available', resource: { ...skill, mediaType: 'application/mcp-server+json' } }] },
			{ ...valid, entries: [{ identifier: skill.identifier, status: 'available', resource: { ...skill, url: 'http://example.com/skill' } }] },
		]) {
			const { service } = createService(async () => response(body));
			const results = await service.getFeeds(['feed_editors'], CancellationToken.None);
			assert.match(results[0].error ?? '', /invalid response/);
		}
	});

	test('requires authentication and honors cancellation without requesting feeds', async () => {
		const unauthenticated = createService(async () => response({}), null, []);
		const results = await unauthenticated.service.getFeeds(['feed_editors'], CancellationToken.None);
		const cancellation = new CancellationTokenSource();
		cancellation.cancel();

		await assert.rejects(
			unauthenticated.service.getFeeds(['feed_editors'], cancellation.token),
			error => isCancellationError(error),
		);
		assert.deepStrictEqual({
			results,
			authorizationRequired: unauthenticated.service.authorizationRequired,
			requests: unauthenticated.requestService.requests,
		}, {
			results: [{ id: 'feed_editors', error: 'Sign in to view curated customizations.' }],
			authorizationRequired: true,
			requests: [],
		});
		cancellation.dispose();
	});
});
