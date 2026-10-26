/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, InstallationConfirmationRequest, McpInstallationReview } from '@github/copilot-sdk';
import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import { CopilotCustomizationInstallations } from '../../node/copilot/customizations/copilotCustomizationInstallations.js';

type CatalogSearchSucceeded = Extract<Awaited<ReturnType<CopilotClient['rpc']['catalog']['search']>>, { readonly kind: 'succeeded' }>;
type SkillCatalogCandidate = Extract<CatalogSearchSucceeded['candidates'][number], { readonly kind: 'ai-skill' }>;
type McpCatalogCandidate = Extract<CatalogSearchSucceeded['candidates'][number], { readonly kind: 'mcp-server' }>;
type PluginCatalogCandidate = Extract<CatalogSearchSucceeded['candidates'][number], { readonly kind: 'plugin' }>;
type McpInstallPlan = Extract<Awaited<ReturnType<CopilotClient['rpc']['mcp']['planInstall']>>, { readonly kind: 'planned' }>['plan'];
type PluginInstallManagementResult = Extract<Awaited<ReturnType<CopilotClient['rpc']['plugins']['planInstall']>>, { readonly kind: 'outcome' }>;
type PluginInstallationReview = Extract<PluginInstallManagementResult['outcome'], { readonly kind: 'install-planned' }>['plan']['review'];
type McpInstallationListOutcome = Extract<Extract<Awaited<ReturnType<CopilotClient['rpc']['mcp']['installations']['list']>>, { readonly kind: 'outcome' }>['outcome'], { readonly kind: 'listed' }>;
type McpInstallationSummary = McpInstallationListOutcome['installations'][number];
type McpInstallReview = Extract<McpInstallationReview, { readonly action: 'install' }>;
type McpEffectiveConfiguration = NonNullable<McpInstallReview['effectiveConfiguration']>;
type CustomizationClient = Awaited<ReturnType<ConstructorParameters<typeof CopilotCustomizationInstallations>[0]>>;
type GetSavedFeed = CopilotClient['rpc']['catalog']['getSavedFeed'];

type PolicySessionFactory = ConstructorParameters<typeof CopilotCustomizationInstallations>[1];

/**
 * Records the hidden policy sessions a {@link CopilotCustomizationInstallations}
 * creates and disposes.
 */
class TestPolicySessions {
	readonly created: string[] = [];
	readonly disposed: string[] = [];

	readonly create: PolicySessionFactory = async (client, sessionId) => {
		this.created.push(sessionId);
		return {
			client,
			sessionId,
			dispose: async () => { this.disposed.push(sessionId); },
		};
	};

	/** The most recently created hidden policy session. */
	get sessionId(): string {
		const sessionId = this.created.at(-1);
		if (!sessionId) {
			throw new Error('No hidden policy session was created.');
		}
		return sessionId;
	}
}

suite('CopilotCustomizationInstallations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('saved feeds', () => {
		function createFixture(getSavedFeed: GetSavedFeed) {
			const plans: Parameters<CopilotClient['rpc']['mcp']['planInstall']>[0][] = [];
			const policySessions: string[] = [];
			const client: CustomizationClient = {
				rpc: {
					catalog: new class extends mock<CustomizationClient['rpc']['catalog']>() {
						override readonly getSavedFeed = getSavedFeed;
						override readonly search: CopilotClient['rpc']['catalog']['search'] = async () => {
							throw new Error('Feed retrieval and installation must not search');
						};
					}(),
					skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
					mcp: new class extends mock<CopilotClient['rpc']['mcp']>() {
						override readonly planInstall: CopilotClient['rpc']['mcp']['planInstall'] = async request => {
							plans.push(request);
							throw new Error('Reached SDK installation planning');
						};
					}(),
				},
			};
			const service = store.add(new CopilotCustomizationInstallations(async () => client, async (client, sessionId) => {
				policySessions.push(sessionId);
				return { client, sessionId, async dispose() { } };
			}));
			return { service, plans, policySessions };
		}

		test('preserves order and metadata and installs the retained feed candidate without searching', async () => {
			const candidate: McpCatalogCandidate = {
				kind: 'mcp-server', handle: 'feed-candidate', handleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				mediaType: 'application/mcp-server+json', installability: 'installable', displayName: 'Figma',
				source: { kind: 'url', url: 'https://api.mcp.github.com/figma' },
				provenance: { authority: 'agentfinder.github.com', observedAt: new Date().toISOString(), mediaType: 'application/mcp-server+json' },
				iconUrl: 'https://raw.githubusercontent.com/example/icons/main/figma.png', categories: ['build'],
			};
			const pluginCandidate: PluginCatalogCandidate = {
				kind: 'plugin',
				handle: 'plugin-feed-candidate',
				handleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
				installability: 'installable',
				mediaType: 'application/vnd.anthropic.claude-plugin+json',
				identity: 'azure-devops-copilot-plugin',
				displayName: 'Azure DevOps Copilot Plugin',
				source: { repository: 'microsoft/azure-devops-copilot-plugin', path: '.claude-plugin/plugin.json' },
				compatibilityTags: ['github-copilot', 'canvas', 'canvas-only'],
				provenance: { authority: 'agentfinder.github.com', observedAt: new Date().toISOString(), mediaType: 'application/vnd.anthropic.claude-plugin+json' },
				iconUrl: 'https://raw.githubusercontent.com/example/icons/main/azure-devops.png',
				categories: ['build'],
			};
			const requests: Parameters<GetSavedFeed>[0][] = [];
			const fixture = createFixture(async request => {
				requests.push(request);
				return {
					kind: 'succeeded', searchId: 'feed-search', feed: { id: request.feedId, name: 'Editorial', version: 2 },
					negotiated: { runtimeProtocolVersion: 3, grantedCapabilities: ['catalog-feeds'] },
					entries: [
						{ status: 'unavailable', identifier: 'missing', reason: 'not-found' },
						{ status: 'available', identifier: 'figma', candidate },
						{ status: 'available', identifier: 'azure-devops', candidate: pluginCandidate },
						{ status: 'filtered', identifier: 'filtered' },
						{ status: 'available', identifier: 'second', candidate: { ...candidate, handle: 'second-handle', displayName: 'Second' } },
						{ status: 'available', identifier: 'blocked', candidate: { ...candidate, handle: 'blocked-handle', displayName: 'Blocked', installability: 'not-installable-policy' } },
					],
				};
			});
			const result = await fixture.service.search({ query: '', feedId: 'feed_editorial', limit: 1 });
			assert.ok(result.kind === 'page');
			const item = result.items[0];
			await assert.rejects(fixture.service.prepare({
				identifier: item.identifier!, displayName: item.displayName, description: item.description ?? '',
				mediaType: candidate.mediaType, itemUrl: item.itemUrl, selectionId: item.selectionId, installation: { kind: 'mcp' },
			}), /Reached SDK installation planning/);
			await fixture.service.search({ query: '', feedId: 'feed_another', limit: 1 });
			assert.deepStrictEqual({
				items: result.items.map(item => [item.identifier, item.displayName, item.iconUrl, item.categories, item.compatibilityTags]),
				feedIds: requests.map(request => request.feedId),
				bound: requests.every(request => request.policySessionId === fixture.policySessions[0]),
				capabilities: requests[0].contract.requiredCapabilities,
				policySessions: fixture.policySessions.length,
				planSource: fixture.plans[0].source,
				installability: result.items.map(item => [item.installable, !!item.unavailableMessage]),
			}, {
				items: [
					['figma', 'Figma', candidate.iconUrl, ['build'], undefined],
					['azure-devops', 'Azure DevOps Copilot Plugin', pluginCandidate.iconUrl, ['build'], ['canvas', 'canvas-only']],
					['second', 'Second', candidate.iconUrl, ['build'], undefined],
					['blocked', 'Blocked', candidate.iconUrl, ['build'], undefined],
				],
				feedIds: ['feed_editorial', 'feed_another'],
				bound: true,
				capabilities: ['catalog-search-credential-required', 'catalog-search-session-bound', 'catalog-selection', 'catalog-search-pagination', 'trust-snapshot', 'ai-skill-discovery', 'skill-confirmed-installation', 'agent-plugin-discovery', 'agent-plugin-formats', 'agent-plugin-confirmed-installation', 'catalog-feeds'],
				policySessions: 1,
				planSource: { kind: 'candidate', candidateHandle: 'feed-candidate', searchId: 'feed-search' },
				installability: [[true, false], [true, false], [true, false], [false, true]],
			});
		});

		for (const kind of ['negotiation-refused', 'authentication-required'] as const) {
			test(`surfaces ${kind} without falling back to search`, async () => {
				const { service } = createFixture(async () => kind === 'negotiation-refused' ? {
					kind, message: 'Unavailable', reason: 'unsupported-capability',
					runtimeProtocolVersion: 3, minimumSupportedProtocolVersion: 3,
					supportedCapabilities: [], unsupportedCapabilities: ['catalog-feeds'],
				} : { kind, message: 'Unavailable', reason: 'no-credential' });
				assert.deepStrictEqual(await service.search({ query: '', feedId: 'feed_editorial', limit: 30 }), {
					kind: 'unavailable', reason: kind === 'negotiation-refused' ? 'unsupported' : 'authentication',
				});
			});
		}

		test('surfaces feed retrieval failures rather than returning an empty page', async () => {
			const { service } = createFixture(async () => ({ kind: 'unavailable', reason: 'feed-not-found', message: 'Collection not found' }));
			await assert.rejects(service.search({ query: '', feedId: 'feed_missing', limit: 30 }), /Collection not found/);
		});
	});

	test('installs a retained catalog plugin through verified planning and confirmation', async () => {
		const expiresAt = new Date(Date.now() + 60_000).toISOString();
		const observedAt = new Date().toISOString();
		const candidate: PluginCatalogCandidate = {
			kind: 'plugin',
			handle: 'plugin-candidate',
			handleExpiresAt: expiresAt,
			installability: 'installable',
			mediaType: 'application/vnd.github.copilot-plugin',
			identity: 'demo-plugin',
			displayName: 'Demo Plugin',
			description: 'A demo plugin',
			version: '1.2.3',
			publisher: 'GitHub',
			source: { repository: 'github/demo-plugin', path: '.github/plugin/plugin.json' },
			compatibilityTags: ['github-copilot'],
			provenance: { authority: 'agentfinder.github.com', observedAt, mediaType: 'application/vnd.github.copilot-plugin' },
		};
		const catalogue = {
			resourceId: 'demo-plugin',
			displayName: candidate.displayName,
			description: candidate.description,
			publisher: candidate.publisher,
			version: candidate.version,
			source: 'agentfinder.github.com',
		};
		const source = {
			resourceId: 'demo-plugin',
			catalogRevisionId: 'catalog-revision',
			repositoryId: 'repository-id',
			repository: 'github/demo-plugin',
			revision: '0123456789abcdef',
			root: '',
			descriptorDigest: 'descriptor-digest',
			bundleDigest: 'bundle-digest',
		};
		const target = {
			relativePath: 'installed-plugins/_direct/github--demo-plugin',
			displayLabel: '~/.copilot/installed-plugins/_direct/github--demo-plugin',
		};
		const sdkReview: PluginInstallationReview = {
			name: 'demo-plugin',
			description: candidate.description,
			version: candidate.version,
			catalogue,
			source,
			target,
			installsDisabled: true,
			files: [{
				path: '.github/plugin/plugin.json',
				sizeBytes: 128,
				mediaType: 'application/json',
				executable: false,
				digest: 'manifest-digest',
			}],
			totalBytes: 128,
			manifestPath: '.github/plugin/plugin.json',
			manifestContent: '{"name":"demo-plugin"}',
			action: 'install',
		};
		const negotiated: PluginInstallManagementResult['negotiated'] = { runtimeProtocolVersion: 3, grantedCapabilities: ['agent-plugin-confirmed-installation'] };
		const planRequests: Parameters<CopilotClient['rpc']['plugins']['planInstall']>[0][] = [];
		const applyRequests: Parameters<CopilotClient['rpc']['plugins']['applyInstall']>[0][] = [];
		const searchRequests: Parameters<CopilotClient['rpc']['catalog']['search']>[0][] = [];
		const decisions: string[] = [];
		const serviceRef: { value?: CopilotCustomizationInstallations } = {};
		const policySessions = new TestPolicySessions();
		const plugins = new class extends mock<CopilotClient['rpc']['plugins']>() {
			override readonly planInstall: CopilotClient['rpc']['plugins']['planInstall'] = async request => {
				planRequests.push(request);
				const planNumber = planRequests.length;
				return {
					kind: 'outcome',
					outcome: {
						kind: 'install-planned',
						plan: {
							planHandle: `plugin-plan-${planNumber}`,
							operationId: `plugin-operation-${planNumber}`,
							expiresAt,
							review: sdkReview,
						},
					},
					negotiated,
				};
			};
			override readonly applyInstall: CopilotClient['rpc']['plugins']['applyInstall'] = async request => {
				applyRequests.push(request);
				const operationId = request.planHandle === 'plugin-plan-2' ? 'plugin-operation-2' : 'plugin-operation-1';
				for (const review of [{ ...sdkReview, name: 'tampered' }, sdkReview]) {
					decisions.push(await serviceRef.value!.confirmationHandler({
						policySessionId: policySessions.sessionId,
						confirmationId: `confirmation-${decisions.length}`,
						operationId,
						expiresAt,
						reviewFingerprint: `fingerprint-${decisions.length}`,
						review: { resource: 'plugin', review },
					}, CancellationToken.None));
				}
				return {
					kind: 'outcome',
					outcome: {
						kind: 'installed',
						installation: {
							name: sdkReview.name,
							operationId,
							target,
							enabled: false,
							source,
							catalogue,
							installedAt: new Date().toISOString(),
						},
					},
					negotiated,
				};
			};
		}();
		const client = {
			rpc: {
				catalog: new class extends mock<CopilotClient['rpc']['catalog']>() {
					override readonly getSavedFeed: CopilotClient['rpc']['catalog']['getSavedFeed'] = async request => ({
						kind: 'succeeded',
						searchId: 'feed-search',
						feed: { id: request.feedId, name: 'Editorial', version: 1 },
						entries: [{ status: 'available', identifier: 'editorial-demo-plugin', candidate }],
						negotiated,
					});
					override readonly search: CopilotClient['rpc']['catalog']['search'] = async request => {
						searchRequests.push(request);
						return {
							kind: 'succeeded',
							searchId: 'refreshed-plugin-search',
							candidates: [{ ...candidate, handle: 'refreshed-plugin-candidate' }],
							truncated: false,
							negotiated,
						};
					};
				}(),
				plugins,
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() { }(),
			},
		};
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));
		serviceRef.value = service;

		const search = await service.search({ query: '', feedId: 'feed_editorial', limit: 10 });
		assert.strictEqual(search.kind, 'page');
		const item = search.kind === 'page' ? search.items[0] : undefined;
		assert.ok(item);
		const request = {
			mediaType: candidate.mediaType,
			identifier: item.identifier!,
			displayName: item.displayName,
			description: item.description ?? '',
			version: candidate.version,
			selectionId: item.selectionId,
			catalogIdentity: item.catalogIdentity,
			installation: { kind: 'plugin' },
		} as const;
		await service.prepare(request);
		const review = await service.prepare(request);
		const applyResult = await service.apply(review.operationId);

		assert.deepStrictEqual({
			item: {
				kind: item.kind,
				identifier: item.identifier,
				catalogIdentity: item.catalogIdentity,
				installable: item.installable,
				version: item.version,
				repository: item.repository,
				path: item.path,
			},
			review,
			applyResult,
			planRequests: planRequests.map(request => ({
				...request,
				contract: { ...request.contract, requiredCapabilities: [...request.contract.requiredCapabilities] },
			})),
			applyRequests: applyRequests.map(request => ({
				...request,
				contract: { ...request.contract, requiredCapabilities: [...request.contract.requiredCapabilities] },
			})),
			searchRequests: searchRequests.map(request => ({ query: request.query, kinds: request.kinds })),
			decisions,
		}, {
			item: {
				kind: 'plugin',
				identifier: 'editorial-demo-plugin',
				catalogIdentity: candidate.identity,
				installable: true,
				version: '1.2.3',
				repository: 'github/demo-plugin',
				path: '.github/plugin/plugin.json',
			},
			review: {
				operationId: review.operationId,
				action: 'install',
				kind: 'plugin',
				displayName: sdkReview.name,
				description: sdkReview.description,
				version: sdkReview.version,
				source: `${source.repository}@${source.revision}`,
				target: target.displayLabel,
				fileCount: 1,
				totalBytes: 128,
				installsDisabled: true,
				mcpServerCount: 0,
			},
			applyResult: {
				kind: 'plugin',
				name: sdkReview.name,
				repository: source.repository,
				ref: source.revision,
				path: source.root,
			},
			planRequests: [{
				contract: {
					protocolVersion: 3,
					requiredCapabilities: ['catalog-search-credential-required', 'catalog-search-session-bound', 'catalog-selection', 'agent-plugin-discovery', 'agent-plugin-confirmed-installation'],
				},
				candidateHandle: candidate.handle,
				policySessionId: policySessions.sessionId,
			}, {
				contract: {
					protocolVersion: 3,
					requiredCapabilities: ['catalog-search-credential-required', 'catalog-search-session-bound', 'catalog-selection', 'agent-plugin-discovery', 'agent-plugin-confirmed-installation'],
				},
				candidateHandle: 'refreshed-plugin-candidate',
				policySessionId: policySessions.sessionId,
			}],
			applyRequests: [{
				contract: {
					protocolVersion: 3,
					requiredCapabilities: ['catalog-search-credential-required', 'catalog-search-session-bound', 'catalog-selection', 'agent-plugin-discovery', 'agent-plugin-confirmed-installation'],
				},
				planHandle: 'plugin-plan-2',
				policySessionId: policySessions.sessionId,
			}],
			searchRequests: [{ query: candidate.identity, kinds: ['plugin'] }],
			decisions: ['cancel', 'confirm'],
		});
	});

	test('keeps a stable identifier for the same skill across searches', async () => {
		const candidateUrl = 'https://example.test/stable-skill';
		const candidate: SkillCatalogCandidate = {
			kind: 'ai-skill',
			handle: 'skill-handle',
			handleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
			mediaType: 'application/ai-skill',
			installability: 'installable',
			displayName: 'Stable Skill',
			source: { kind: 'url', url: candidateUrl },
			provenance: { authority: 'agentfinder.github.com', observedAt: new Date().toISOString(), mediaType: 'application/ai-skill' },
		};
		const client = {
			rpc: {
				catalog: new class extends mock<CopilotClient['rpc']['catalog']>() {
					override readonly search: CopilotClient['rpc']['catalog']['search'] = async () => ({
						kind: 'succeeded',
						searchId: 'search',
						candidates: [candidate],
						truncated: false,
						negotiated: { runtimeProtocolVersion: 3, grantedCapabilities: [] },
					});
				}(),
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() { }(),
			},
		};
		const policySessions = new TestPolicySessions();
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));

		const first = await service.search({ query: 'stable', limit: 10 });
		const second = await service.search({ query: 'stable', limit: 10 });

		assert.deepStrictEqual({
			firstIdentifier: first.kind === 'page' ? first.items[0].identifier : undefined,
			secondIdentifier: second.kind === 'page' ? second.items[0].identifier : undefined,
			selectionChanged: first.kind === 'page' && second.kind === 'page' && first.items[0].selectionId !== second.items[0].selectionId,
		}, {
			firstIdentifier: candidateUrl,
			secondIdentifier: candidateUrl,
			selectionChanged: true,
		});
	});

	test('answers queryless catalog browse without starting the SDK', async () => {
		let clientRequests = 0;
		const policySessions = new TestPolicySessions();
		const service = store.add(new CopilotCustomizationInstallations(async () => {
			clientRequests++;
			throw new Error('Unexpected client request');
		}, policySessions.create));

		const unfilteredBrowse = await service.search({
			query: '',
			limit: 10,
		});
		const mcpBrowse = await service.search({
			query: '',
			mediaType: 'application/mcp-server+json',
			limit: 10,
		});
		const pluginBrowse = await service.search({
			query: '',
			mediaType: 'application/vnd.github.copilot-plugin',
			limit: 10,
		});
		assert.deepStrictEqual({ clientRequests, created: policySessions.created, unfilteredBrowse, mcpBrowse, pluginBrowse }, {
			clientRequests: 0,
			created: [],
			unfilteredBrowse: { kind: 'page', items: [] },
			mcpBrowse: { kind: 'page', items: [] },
			pluginBrowse: { kind: 'page', items: [] },
		});
	});

	test('creates and reuses a hidden policy session', async () => {
		const policySessionIds: (string | undefined)[] = [];
		const catalog = new class extends mock<CopilotClient['rpc']['catalog']>() {
			override readonly search: CopilotClient['rpc']['catalog']['search'] = async request => {
				policySessionIds.push(request.policySessionId);
				return {
					kind: 'succeeded' as const,
					searchId: 'search',
					candidates: [],
					truncated: false,
					negotiated: { runtimeProtocolVersion: 3, grantedCapabilities: [] },
				};
			};
		}();
		const client = {
			rpc: {
				catalog,
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() { }(),
			},
		};
		let created = 0;
		let disposed = 0;
		const service = store.add(new CopilotCustomizationInstallations(
			async () => client,
			async (requestedClient, sessionId) => {
				created++;
				return {
					client: requestedClient,
					sessionId,
					async dispose() { disposed++; },
				};
			},
		));

		assert.strictEqual(service.releasePolicySession(client), undefined);
		await service.search({ query: 'first', limit: 10 });
		await service.search({ query: 'second', limit: 10 });
		await service.releasePolicySession(client);
		await service.search({ query: 'third', limit: 10 });
		await service.releasePolicySession(client);

		assert.deepStrictEqual({
			created,
			disposed,
			hasIds: policySessionIds.every(id => typeof id === 'string' && id.length > 0),
			reusedFirst: policySessionIds[0] === policySessionIds[1],
			replacedAfterRelease: policySessionIds[1] !== policySessionIds[2],
		}, {
			created: 2,
			disposed: 2,
			hasIds: true,
			reusedFirst: true,
			replacedAfterRelease: true,
		});
	});

	test('binds search, inventory, recovery, and installation planning to the hidden policy session', async () => {
		const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
		const requests: string[] = [];
		const record = (operation: string, policySessionId: string | undefined) => requests.push(`${operation}:${policySessionId}`);
		const client = {
			rpc: {
				catalog: new class extends mock<CopilotClient['rpc']['catalog']>() {
					override readonly search: CopilotClient['rpc']['catalog']['search'] = async request => {
						record('catalog.search', request.policySessionId);
						return { kind: 'succeeded' as const, searchId: 'search', candidates: [], truncated: false, negotiated };
					};
				}(),
				skills: new class extends mock<CopilotClient['rpc']['skills']>() {
					override readonly installations = new class extends mock<CopilotClient['rpc']['skills']['installations']>() {
						override readonly list: CopilotClient['rpc']['skills']['installations']['list'] = async request => {
							record('skills.list', request.policySessionId);
							return { kind: 'outcome' as const, negotiated, outcome: { kind: 'listed' as const, installations: [] } };
						};
						override readonly recover: CopilotClient['rpc']['skills']['installations']['recover'] = async request => {
							record('skills.recover', request.policySessionId);
							return { kind: 'outcome' as const, negotiated, outcome: { kind: 'recovered' as const, installations: [] } };
						};
					}();
				}(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() {
					override readonly installations = new class extends mock<CopilotClient['rpc']['mcp']['installations']>() {
						override readonly list: CopilotClient['rpc']['mcp']['installations']['list'] = async request => {
							record('mcp.list', request.policySessionId);
							return { kind: 'outcome' as const, negotiated, outcome: { kind: 'listed' as const, installations: [] } };
						};
						override readonly recover: CopilotClient['rpc']['mcp']['installations']['recover'] = async request => {
							record('mcp.recover', request.policySessionId);
							return { kind: 'outcome' as const, negotiated, outcome: { kind: 'recovered' as const, installations: [] } };
						};
					}();
					override readonly config = new class extends mock<CopilotClient['rpc']['mcp']['config']>() {
						override readonly list: CopilotClient['rpc']['mcp']['config']['list'] = async () => ({ servers: {} });
					}();
				}(),
			},
		};
		const policySessions = new TestPolicySessions();
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));

		await service.list();
		await service.recover();
		await service.search({ query: 'demo', limit: 10 });
		const uninstall = await service.prepare({ installationId: 'missing' }).then(() => undefined, error => error instanceof Error ? error.message : String(error));
		await service.releasePolicySession(client);

		const hidden = policySessions.created[0];
		assert.deepStrictEqual({ created: policySessions.created.length, disposed: policySessions.disposed, requests, uninstall }, {
			created: 1,
			disposed: [hidden],
			requests: [
				`skills.list:${hidden}`,
				`mcp.list:${hidden}`,
				`skills.recover:${hidden}`,
				`mcp.recover:${hidden}`,
				`catalog.search:${hidden}`,
				`skills.list:${hidden}`,
				`mcp.list:${hidden}`,
			],
			uninstall: 'The SDK no longer owns this customization installation.',
		});
	});

	test('rejects a pending SDK review after its hidden policy session is replaced', async () => {
		const expiresAt = new Date(Date.now() + 60_000).toISOString();
		const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
		const catalogue = { resourceId: 'urn:air:github.test:skill:demo', displayName: 'Demo Skill', source: 'https://agentfinder.github.com' };
		const installation = {
			installationId: 'skill-installation',
			operationId: 'skill-operation',
			name: 'demo-skill',
			target: { scope: 'personal' as const, relativePath: 'skills/demo', displayLabel: '~/.copilot/skills/demo' },
			configuredEnabled: false,
			sessionState: 'loaded-disabled' as const,
			source: {
				resourceId: catalogue.resourceId,
				catalogRevisionId: 'catalog-revision',
				repositoryId: 'repository-id',
				repository: 'owner/repository',
				revision: 'a'.repeat(40),
				root: 'skills/demo',
				descriptorDigest: 'b'.repeat(64),
				bundleDigest: 'c'.repeat(64),
			},
			catalogue,
			installedAt: new Date().toISOString(),
			ownershipState: 'intact' as const,
		};
		const applies: string[] = [];
		const client = {
			rpc: {
				catalog: new class extends mock<CopilotClient['rpc']['catalog']>() { }(),
				skills: new class extends mock<CopilotClient['rpc']['skills']>() {
					override readonly installations = new class extends mock<CopilotClient['rpc']['skills']['installations']>() {
						override readonly list: CopilotClient['rpc']['skills']['installations']['list'] = async () => ({
							kind: 'outcome' as const,
							negotiated,
							outcome: { kind: 'listed' as const, installations: [installation] },
						});
					}();
					override readonly planUninstall: CopilotClient['rpc']['skills']['planUninstall'] = async () => ({
						kind: 'outcome' as const,
						negotiated,
						outcome: {
							kind: 'uninstall-planned' as const,
							plan: {
								planHandle: 'skill-plan',
								operationId: 'skill-uninstall',
								expiresAt,
								installation,
								review: { action: 'uninstall' as const, installation, filesModified: false, files: [], totalBytes: 0, catalogue },
							},
						},
					});
					override readonly applyUninstall: CopilotClient['rpc']['skills']['applyUninstall'] = async request => {
						applies.push(`skills.applyUninstall:${request.policySessionId}`);
						throw new Error('Applied a plan bound to a deleted policy session');
					};
				}(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() {
					override readonly installations = new class extends mock<CopilotClient['rpc']['mcp']['installations']>() {
						override readonly list: CopilotClient['rpc']['mcp']['installations']['list'] = async () => ({
							kind: 'outcome' as const,
							negotiated,
							outcome: { kind: 'listed' as const, installations: [] },
						});
					}();
					override readonly config = new class extends mock<CopilotClient['rpc']['mcp']['config']>() {
						override readonly list: CopilotClient['rpc']['mcp']['config']['list'] = async () => ({
							servers: { demo: { type: 'http' as const, url: 'https://example.test/mcp', tools: ['*'] } },
						});
						override readonly remove: CopilotClient['rpc']['mcp']['config']['remove'] = async request => {
							applies.push(`mcp.config.remove:${request.name}`);
						};
					}();
				}(),
			},
		};
		const policySessions = new TestPolicySessions();
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));
		const message = (error: unknown) => error instanceof Error ? error.message : String(error);

		const sdkReview = await service.prepare({ installationId: installation.installationId });
		const configurationReview = await service.prepare({ installationId: 'mcp-config:demo' });
		await service.releasePolicySession(client);
		const sdkApply = await service.apply(sdkReview.operationId).then(() => undefined, message);
		const sdkRetry = await service.apply(sdkReview.operationId).then(() => undefined, message);
		await service.apply(configurationReview.operationId);

		assert.deepStrictEqual({ sdkApply, sdkRetry, applies }, {
			sdkApply: 'The customization runtime restarted. Start the operation again.',
			sdkRetry: 'This customization installation review expired. Start the operation again.',
			applies: ['mcp.config.remove:demo'],
		});
	});

	test('adds a raw MCP configuration through the SDK', async () => {
		const requests: Parameters<CopilotClient['rpc']['mcp']['config']['add']>[0][] = [];
		const client = {
			rpc: {
				catalog: new class extends mock<CopilotClient['rpc']['catalog']>() { }(),
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() {
					override readonly config = new class extends mock<CopilotClient['rpc']['mcp']['config']>() {
						override readonly add: CopilotClient['rpc']['mcp']['config']['add'] = async request => { requests.push(request); };
					}();
				}(),
			},
		};
		const service = store.add(new CopilotCustomizationInstallations(async () => client, new TestPolicySessions().create));

		await service.addMcpServerConfiguration('demo', {
			type: McpServerType.LOCAL,
			command: 'node',
			args: ['server.js'],
			env: { PORT: 3000, TOKEN: '$TOKEN', UNSET: null },
		});

		assert.deepStrictEqual(requests, [{
			name: 'demo',
			config: {
				type: 'stdio',
				command: 'node',
				args: ['server.js'],
				tools: ['*'],
				env: { PORT: '3000', TOKEN: '$TOKEN' },
			},
		}]);
	});

	test('filters non-installable catalog candidates while preserving pagination', async () => {
		const expiresAt = new Date(Date.now() + 60_000).toISOString();
		const observedAt = new Date().toISOString();
		const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
		const catalog = new class extends mock<CopilotClient['rpc']['catalog']>() {
			override readonly search: CopilotClient['rpc']['catalog']['search'] = async () => ({
				kind: 'succeeded' as const,
				searchId: 'search',
				candidates: [
					{
						handle: 'unverified-skill',
						handleExpiresAt: expiresAt,
						kind: 'ai-skill' as const,
						mediaType: 'application/ai-skill' as const,
						installability: 'materialisation-unavailable' as const,
						displayName: 'Unverified Skill',
						source: { kind: 'url' as const, url: 'https://example.test/unverified-skill' },
						provenance: { authority: 'agentfinder.github.com', observedAt, mediaType: 'application/ai-skill' as const },
					},
					{
						handle: 'installable-skill',
						handleExpiresAt: expiresAt,
						kind: 'ai-skill' as const,
						mediaType: 'application/ai-skill' as const,
						installability: 'installable' as const,
						displayName: 'Installable Skill',
						source: { kind: 'url' as const, url: 'https://example.test/installable-skill' },
						provenance: { authority: 'agentfinder.github.com', observedAt, mediaType: 'application/ai-skill' as const },
					},
					{
						handle: 'installable-mcp',
						handleExpiresAt: expiresAt,
						kind: 'mcp-server' as const,
						mediaType: 'application/mcp-server+json' as const,
						installability: 'installable' as const,
						displayName: 'Installable MCP',
						connectorIds: ['githubcopilotfigmamcp'],
						source: { kind: 'url' as const, url: 'https://example.test/installable-mcp' },
						provenance: { authority: 'agentfinder.github.com', observedAt, mediaType: 'application/mcp-server+json' as const },
					},
					{
						handle: 'embedded-mcp',
						handleExpiresAt: expiresAt,
						kind: 'mcp-server' as const,
						mediaType: 'application/mcp-server+json' as const,
						installability: 'installable' as const,
						displayName: 'Embedded MCP',
						source: { kind: 'embedded' as const },
						provenance: { authority: 'agentfinder.github.com', observedAt, mediaType: 'application/mcp-server+json' as const },
					},
					{
						handle: 'installable-plugin',
						handleExpiresAt: expiresAt,
						kind: 'plugin' as const,
						mediaType: 'application/vnd.github.copilot-plugin' as const,
						installability: 'installable' as const,
						identity: 'plugin',
						displayName: 'Pinned Plugin',
						source: { repository: 'owner/repository', path: '.github/plugin/plugin.json' },
						compatibilityTags: ['github-copilot' as const, 'canvas' as const, 'canvas-only' as const],
						installCount: 42,
						provenance: { authority: 'agentfinder.github.com', observedAt, mediaType: 'application/vnd.github.copilot-plugin' as const },
					},
				],
				truncated: false,
				negotiated,
				pagination: {
					currentPage: 1,
					pageSize: 10,
					totalCount: 10,
					totalCountRelation: 'unknown' as const,
					pageCount: 2,
					maxPage: 100,
					hasNextPage: true,
					hasPreviousPage: false,
					token: 'native-token',
				},
			});
		}();
		const client = {
			rpc: {
				catalog,
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() { }(),
			},
		};
		const policySessions = new TestPolicySessions();
		const service = store.add(new CopilotCustomizationInstallations(
			async () => client,
			policySessions.create,
		));

		const result = await service.search({ query: 'demo', limit: 10 });

		assert.deepStrictEqual(result.kind === 'page' ? {
			items: result.items.map(item => ({
				kind: item.kind,
				displayName: item.displayName,
				itemUrl: item.itemUrl,
				connectorIds: item.connectorIds,
				...(item.kind === 'plugin' ? { compatibilityTags: item.compatibilityTags, installCount: item.installCount } : {}),
				installable: item.installable,
			})),
			hasNextCursor: typeof result.nextCursor === 'string',
		} : result, {
			items: [
				{ kind: 'skill', displayName: 'Installable Skill', itemUrl: 'https://example.test/installable-skill', connectorIds: undefined, installable: true },
				{ kind: 'mcp', displayName: 'Installable MCP', itemUrl: 'https://example.test/installable-mcp', connectorIds: ['githubcopilotfigmamcp'], installable: true },
				{ kind: 'plugin', displayName: 'Pinned Plugin', itemUrl: undefined, connectorIds: undefined, compatibilityTags: ['canvas', 'canvas-only'], installCount: 42, installable: true },
			],
			hasNextCursor: true,
		});
	});

	test('skips SDK pages whose candidates are all filtered', async () => {
		const expiresAt = new Date(Date.now() + 60_000).toISOString();
		const observedAt = new Date().toISOString();
		const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
		const requestPages: ({ token: string; number: number } | undefined)[] = [];
		const catalog = new class extends mock<CopilotClient['rpc']['catalog']>() {
			override readonly search: CopilotClient['rpc']['catalog']['search'] = async request => {
				requestPages.push(request.page);
				return requestPages.length === 1 ? {
					kind: 'succeeded' as const,
					searchId: 'filtered-search',
					candidates: [{
						handle: 'unavailable-skill',
						handleExpiresAt: expiresAt,
						kind: 'ai-skill' as const,
						mediaType: 'application/ai-skill' as const,
						installability: 'materialisation-unavailable' as const,
						displayName: 'Unavailable Skill',
						source: { kind: 'url' as const, url: 'https://example.test/unavailable-skill' },
						provenance: { authority: 'agentfinder.github.com', observedAt, mediaType: 'application/ai-skill' as const },
					}],
					truncated: true,
					negotiated,
					pagination: {
						token: 'private-sdk-token',
						currentPage: 1,
						pageSize: 10,
						totalCount: 11,
						totalCountRelation: 'unknown' as const,
						pageCount: 2,
						maxPage: 100,
						hasNextPage: true,
					},
				} : {
					kind: 'succeeded' as const,
					searchId: 'visible-search',
					candidates: [{
						handle: 'available-mcp',
						handleExpiresAt: expiresAt,
						kind: 'mcp-server' as const,
						mediaType: 'application/mcp-server+json' as const,
						installability: 'installable' as const,
						displayName: 'Available MCP',
						source: { kind: 'url' as const, url: 'https://example.test/available-mcp' },
						provenance: { authority: 'agentfinder.github.com', observedAt, mediaType: 'application/mcp-server+json' as const },
					}],
					truncated: false,
					negotiated,
				};
			};
		}();
		const client = {
			rpc: {
				catalog,
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() { }(),
			},
		};
		const policySessions = new TestPolicySessions();
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));

		const result = await service.search({ query: 'azure', limit: 10 });

		assert.deepStrictEqual({
			requestPages,
			result: result.kind === 'page' ? {
				items: result.items.map(item => item.displayName),
				hasNextCursor: typeof result.nextCursor === 'string',
			} : result,
		}, {
			requestPages: [undefined, { token: 'private-sdk-token', number: 2 }],
			result: {
				items: ['Available MCP'],
				hasNextCursor: false,
			},
		});
	});

	test('keeps SDK pagination tokens private behind workbench cursors', async () => {
		const expiresAt = new Date(Date.now() + 60_000).toISOString();
		const requests: unknown[] = [];
		const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
		const catalog = new class extends mock<CopilotClient['rpc']['catalog']>() {
			override readonly search: CopilotClient['rpc']['catalog']['search'] = async request => {
				requests.push(request);
				return requests.length === 1 ? {
					kind: 'succeeded' as const,
					searchId: 'search',
					candidates: [{
						handle: 'candidate',
						handleExpiresAt: expiresAt,
						kind: 'mcp-server' as const,
						mediaType: 'application/mcp-server+json' as const,
						installability: 'installable' as const,
						displayName: 'Demo MCP',
						publisher: 'octo-org',
						source: { kind: 'url' as const, url: 'https://example.test/server.json' },
						provenance: {
							authority: 'agentfinder.github.com',
							observedAt: new Date().toISOString(),
							mediaType: 'application/mcp-server+json' as const,
						},
					}],
					truncated: true,
					negotiated,
					pagination: {
						token: 'private-sdk-token',
						currentPage: 1,
						pageSize: 10,
						totalCount: 20,
						totalCountRelation: 'unknown' as const,
						pageCount: 2,
						maxPage: 100,
						hasNextPage: true,
					},
				} : {
					kind: 'succeeded' as const,
					searchId: 'search-2',
					candidates: [],
					truncated: false,
					negotiated,
				};
			};
		}();
		const client = {
			rpc: {
				catalog,
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() { }(),
			},
		};
		const policySessions = new TestPolicySessions();
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));

		const first = await service.search({ query: 'demo', limit: 10 });
		if (first.kind !== 'page' || !first.nextCursor) {
			assert.fail('Expected a paged SDK catalog result.');
		}
		const second = await service.search({ query: 'ignored', limit: 1, cursor: first.nextCursor });

		assert.deepStrictEqual({
			publicCursorIsPrivateToken: first.nextCursor === 'private-sdk-token',
			second,
			secondRequest: requests[1],
		}, {
			publicCursorIsPrivateToken: false,
			second: { kind: 'page', items: [], nextCursor: undefined },
			secondRequest: {
				contract: {
					protocolVersion: 3,
					requiredCapabilities: [
						'catalog-search-credential-required',
						'catalog-search-session-bound',
						'catalog-selection',
						'catalog-search-pagination',
						'trust-snapshot',
						'ai-skill-discovery',
						'skill-confirmed-installation',
						'agent-plugin-discovery',
						'agent-plugin-formats',
						'agent-plugin-confirmed-installation',
					],
				},
				policySessionId: policySessions.sessionId,
				query: 'demo',
				limit: 10,
				kinds: ['ai-skill', 'mcp-server', 'plugin'],
				page: { token: 'private-sdk-token', number: 2 },
			},
		});
	});

	test('confirms exact refreshed MCP install and uninstall reviews', async () => {
		const expiresAtEpochMs = Date.now() + 60_000;
		const expiresAt = new Date(expiresAtEpochMs).toISOString();
		const catalogue = {
			resourceId: 'urn:air:api.mcp.github.com:io.github.example:demo',
			displayName: 'Demo MCP',
			description: 'A demo MCP server',
			source: 'agentfinder.github.com',
		};
		const itemUrl = 'https://agentfinder.github.com/items/demo';
		const observedAt = new Date().toISOString();
		const trust = {
			schemaVersion: 'v1' as const,
			status: 'absent' as const,
			eligibility: 'unknown' as const,
			provenance: {
				source: 'agent-finder' as const,
				observedAt,
			},
		};
		const candidate: McpCatalogCandidate = {
			handle: 'candidate-handle',
			handleExpiresAt: expiresAt,
			kind: 'mcp-server',
			mediaType: 'application/mcp-server+json',
			installability: 'installable',
			displayName: catalogue.displayName,
			description: catalogue.description,
			source: { kind: 'url', url: itemUrl },
			provenance: {
				authority: 'agentfinder.github.com',
				observedAt,
				mediaType: 'application/mcp-server+json',
			},
			trust,
		};
		const identity = {
			canonicalName: 'io.github.example/demo',
			serverName: 'io.github.example/demo',
			version: '1.0.0',
			registryId: catalogue.resourceId,
		};
		const provenance = {
			authority: 'api.mcp.github.com',
			validatedAt: new Date().toISOString(),
			cardDigest: { algorithm: 'sha256-rfc8785' as const, value: 'a'.repeat(64) },
			mediaType: 'application/mcp-server+json' as const,
		};
		const target = { scope: 'user' as const, configKey: identity.serverName };
		const policy = { decision: 'allowed' as const, source: 'none' as const };
		const choice = {
			choiceId: 'remote:0',
			transport: 'streamable-http' as const,
			installMethod: 'remote' as const,
			endpoint: 'https://example.test/mcp',
			requiredValues: [],
			secretPlaceholders: [],
		};
		const configuration = {
			operation: 'add' as const,
			scope: 'user' as const,
			configKey: identity.serverName,
			changedFields: ['tools', 'type', 'url'],
			secretReferences: [],
		};
		const plan: McpInstallPlan = {
			planHandle: 'plan-handle',
			planHandleExpiresAt: expiresAt,
			identity,
			provenance,
			transportChoices: [choice],
			recommendedTransportChoiceId: choice.choiceId,
			target,
			policy,
			configurationChanges: [configuration],
			reloadRequired: true,
			requiresInteractiveConfiguration: false,
		};
		const sdkReview: McpInstallReview = {
			action: 'install',
			identity,
			provenance,
			catalogueTrust: trust,
			catalogue,
			target,
			policy,
			selectedChoice: choice,
			configurationChange: configuration,
			inputs: [],
			suppliedSecrets: [],
			secretStorage: 'keychain',
			effectiveConfiguration: {
				transport: 'http',
				url: choice.endpoint,
				headers: {},
				tools: ['*'],
			},
		};
		const installation: McpInstallationSummary = {
			installationId: 'installation-id',
			operationId: 'operation-id',
			identity,
			choiceId: choice.choiceId,
			state: 'active',
			catalogue,
			installedAt: new Date().toISOString(),
		};
		const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
		const serviceRef: { value?: CopilotCustomizationInstallations } = {};
		const policySessions = new TestPolicySessions();
		const decisions: string[] = [];
		const uninstallDecisions: string[] = [];
		const searchCapabilities: string[][] = [];
		let installed = false;
		const confirmation = (id: string, effectiveConfiguration: McpEffectiveConfiguration): InstallationConfirmationRequest => ({
			policySessionId: policySessions.sessionId,
			confirmationId: id,
			operationId: 'operation-id',
			expiresAt,
			reviewFingerprint: `fingerprint-${id}`,
			review: {
				resource: 'mcp',
				review: { ...sdkReview, effectiveConfiguration },
			},
		});
		const mcp = new class extends mock<CopilotClient['rpc']['mcp']>() {
			override readonly installations = new class extends mock<CopilotClient['rpc']['mcp']['installations']>() {
				override readonly list: CopilotClient['rpc']['mcp']['installations']['list'] = async () => ({
					kind: 'outcome',
					outcome: { kind: 'listed', installations: installed ? [installation] : [] },
					negotiated,
				});
			}();
			override readonly planInstall: CopilotClient['rpc']['mcp']['planInstall'] = async () => ({
				kind: 'planned',
				plan,
				negotiated,
			});
			override readonly prepareInstall: CopilotClient['rpc']['mcp']['prepareInstall'] = async () => ({
				kind: 'outcome',
				outcome: {
					kind: 'install-prepared',
					operation: { operationId: installation.operationId, expiresAtEpochMs },
				},
				negotiated,
			});
			override readonly applyInstall: CopilotClient['rpc']['mcp']['applyInstall'] = async () => {
				const configurations: readonly [string, McpEffectiveConfiguration][] = [
					['tampered-url', { ...sdkReview.effectiveConfiguration!, url: 'https://other.invalid/mcp' }],
					['tampered-header', { ...sdkReview.effectiveConfiguration!, headers: { Authorization: 'tampered' } }],
					['tampered-tools', { ...sdkReview.effectiveConfiguration!, tools: ['unexpected'] }],
					['valid', sdkReview.effectiveConfiguration!],
				];
				for (const [id, effectiveConfiguration] of configurations) {
					decisions.push(await serviceRef.value!.confirmationHandler(confirmation(id, effectiveConfiguration), CancellationToken.None));
				}
				installed = true;
				return {
					kind: 'outcome',
					outcome: {
						kind: 'installed',
						installation,
						cleanupPending: false,
					},
					negotiated,
				};
			};
			override readonly planUninstall: CopilotClient['rpc']['mcp']['planUninstall'] = async () => ({
				kind: 'outcome',
				outcome: {
					kind: 'uninstall-planned',
					plan: {
						planHandle: 'uninstall-plan',
						operationId: 'uninstall-operation',
						expiresAtEpochMs,
						installation,
						restoresPreviousConfiguration: false,
						ownedSecretCount: 0,
						preservesSharedAuthentication: true,
					},
				},
				negotiated,
			});
			override readonly applyUninstall: CopilotClient['rpc']['mcp']['applyUninstall'] = async () => {
				const request: InstallationConfirmationRequest = {
					policySessionId: policySessions.sessionId,
					confirmationId: 'uninstall-confirmation',
					operationId: 'uninstall-operation',
					expiresAt,
					reviewFingerprint: 'uninstall-fingerprint',
					review: {
						resource: 'mcp',
						review: {
							action: 'uninstall',
							installationId: installation.installationId,
							identity,
							provenance,
							target,
							policy,
							restoresPreviousConfiguration: false,
							ownedSecretCount: 0,
							preservesSharedAuthentication: true,
						},
					},
				};
				const decision = await serviceRef.value!.confirmationHandler(request, CancellationToken.None);
				uninstallDecisions.push(decision);
				installed = decision !== 'confirm';
				return {
					kind: 'outcome',
					outcome: decision === 'confirm'
						? {
							kind: 'uninstalled',
							installationId: installation.installationId,
							operationId: 'uninstall-operation',
							cleanupPending: false,
							restoredPreviousConfiguration: false,
							removedOwnedSecrets: 0,
							preservedSharedAuthentication: true,
						}
						: { kind: 'cancelled', operationId: 'uninstall-operation' },
					negotiated,
				};
			};
		}();
		const catalog = new class extends mock<CopilotClient['rpc']['catalog']>() {
			override readonly search: CopilotClient['rpc']['catalog']['search'] = async request => {
				searchCapabilities.push([...request.contract.requiredCapabilities]);
				return {
					kind: 'succeeded',
					searchId: 'refreshed-search',
					candidates: [{
						...candidate,
						trust: request.contract.requiredCapabilities.includes('trust-snapshot') ? candidate.trust : undefined,
					}],
					truncated: false,
					negotiated,
				};
			};
		}();
		const client = {
			rpc: {
				catalog,
				skills: new class extends mock<CopilotClient['rpc']['skills']>() {
					override readonly installations = new class extends mock<CopilotClient['rpc']['skills']['installations']>() {
						override readonly list: CopilotClient['rpc']['skills']['installations']['list'] = async () => ({
							kind: 'outcome',
							outcome: { kind: 'listed', installations: [] },
							negotiated,
						});
					}();
				}(),
				mcp,
			},
		};
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));
		serviceRef.value = service;

		const review = await service.prepare({
			mediaType: candidate.mediaType,
			identifier: itemUrl,
			displayName: candidate.displayName,
			description: candidate.description ?? '',
			itemUrl,
			selectionId: 'expired-selection',
			installation: { kind: 'mcp' },
		});
		await service.apply(review.operationId);
		const uninstallReview = await service.prepare({
			installationId: installation.installationId,
		});
		await service.apply(uninstallReview.operationId);

		assert.deepStrictEqual({ review, decisions, uninstallReview, uninstallDecisions, installed, searchCapabilities }, {
			review: {
				operationId: review.operationId,
				action: 'install',
				kind: 'mcp',
				displayName: candidate.displayName,
				serverName: identity.serverName,
				target: target.configKey,
				endpoint: choice.endpoint,
				configurationFields: configuration.changedFields,
			},
			decisions: ['cancel', 'cancel', 'cancel', 'confirm'],
			uninstallReview: {
				operationId: uninstallReview.operationId,
				action: 'uninstall',
				kind: 'mcp',
				displayName: catalogue.displayName,
				serverName: identity.serverName,
				target: identity.serverName,
				configurationFields: [],
				restoresPreviousConfiguration: false,
				preservesSharedAuthentication: true,
			},
			uninstallDecisions: ['confirm'],
			installed: false,
			searchCapabilities: [[
				'catalog-search-credential-required',
				'catalog-search-session-bound',
				'catalog-selection',
				'catalog-search-pagination',
				'trust-snapshot',
				'ai-skill-discovery',
				'skill-confirmed-installation',
				'agent-plugin-discovery',
				'agent-plugin-formats',
				'agent-plugin-confirmed-installation',
			]],
		});
	});

	test('plans a caller-supplied MCP card without catalog search', async () => {
		const cardUrl = 'https://api.mcp.github.com/v0.1/servers/io.example%2Fdemo/versions/latest';
		let catalogSearches = 0;
		let planRequest: Parameters<CopilotClient['rpc']['mcp']['planInstall']>[0] | undefined;
		const client = {
			rpc: {
				catalog: new class extends mock<CopilotClient['rpc']['catalog']>() {
					override readonly search: CopilotClient['rpc']['catalog']['search'] = async () => {
						catalogSearches++;
						throw new Error('Unexpected catalog search');
					};
				}(),
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() {
					override readonly planInstall: CopilotClient['rpc']['mcp']['planInstall'] = async request => {
						planRequest = request;
						throw new Error('Stop after planning request');
					};
				}(),
			},
		};
		const policySessions = new TestPolicySessions();
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));

		await assert.rejects(service.prepare({
			mediaType: 'application/mcp-server+json',
			identifier: 'default:io.example/demo',
			displayName: 'Demo MCP',
			description: 'Demo',
			version: '1.0.0',
			itemUrl: cardUrl,
			installation: {
				kind: 'mcp',
				source: { kind: 'url', mediaType: 'application/mcp-server+json', url: cardUrl },
			},
		}), /Stop after planning request/);

		assert.deepStrictEqual({ catalogSearches, planRequest }, {
			catalogSearches: 0,
			planRequest: {
				contract: {
					protocolVersion: 3,
					requiredCapabilities: [
						'catalog-search-credential-required',
						'catalog-search-session-bound',
						'catalog-selection',
						'mcp-install-planning',
						'multiple-transport-choice',
					],
				},
				scope: 'user',
				source: {
					kind: 'card',
					card: { kind: 'url', mediaType: 'application/mcp-server+json', url: cardUrl },
				},
			},
		});
	});

	test('provisionally adds a ready remote MCP card through SDK configuration', async () => {
		const cardUrl = 'https://api.mcp.github.com/v0.1/servers/io.example%2Fdemo/versions/latest';
		const expiresAt = new Date(Date.now() + 60_000).toISOString();
		const added: Parameters<CopilotClient['rpc']['mcp']['config']['add']>[0][] = [];
		const removed: Parameters<CopilotClient['rpc']['mcp']['config']['remove']>[0][] = [];
		const configured = new Map<string, Parameters<CopilotClient['rpc']['mcp']['config']['add']>[0]['config']>();
		const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
		let prepared = 0;
		const client = {
			rpc: {
				catalog: new class extends mock<CopilotClient['rpc']['catalog']>() { }(),
				skills: new class extends mock<CopilotClient['rpc']['skills']>() {
					override readonly installations = new class extends mock<CopilotClient['rpc']['skills']['installations']>() {
						override readonly list: CopilotClient['rpc']['skills']['installations']['list'] = async () => ({
							kind: 'outcome',
							outcome: { kind: 'listed', installations: [] },
							negotiated,
						});
					}();
				}(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() {
					override readonly config = new class extends mock<CopilotClient['rpc']['mcp']['config']>() {
						override readonly add: CopilotClient['rpc']['mcp']['config']['add'] = async request => {
							added.push(request);
							configured.set(request.name, request.config);
						};
						override readonly list: CopilotClient['rpc']['mcp']['config']['list'] = async () => ({ servers: Object.fromEntries(configured) });
						override readonly remove: CopilotClient['rpc']['mcp']['config']['remove'] = async request => {
							removed.push(request);
							configured.delete(request.name);
						};
					}();
					override readonly installations = new class extends mock<CopilotClient['rpc']['mcp']['installations']>() {
						override readonly list: CopilotClient['rpc']['mcp']['installations']['list'] = async () => ({
							kind: 'outcome',
							outcome: { kind: 'listed', installations: [] },
							negotiated,
						});
					}();
					override readonly planInstall: CopilotClient['rpc']['mcp']['planInstall'] = async () => ({
						kind: 'planned',
						plan: {
							planHandle: 'plan',
							planHandleExpiresAt: expiresAt,
							identity: { canonicalName: 'io.example/demo', serverName: 'demo' },
							provenance: {
								authority: 'api.mcp.github.com',
								validatedAt: new Date().toISOString(),
								cardDigest: { algorithm: 'sha256-rfc8785', value: 'a'.repeat(64) },
								mediaType: 'application/mcp-server+json',
							},
							transportChoices: [{
								choiceId: 'remote',
								transport: 'streamable-http',
								installMethod: 'remote',
								endpoint: 'https://example.com/mcp',
								requiredValues: [],
								secretPlaceholders: [],
							}],
							recommendedTransportChoiceId: 'remote',
							target: { scope: 'user', configKey: 'demo' },
							policy: { decision: 'allowed', source: 'none' },
							configurationChanges: [{
								operation: 'add',
								scope: 'user',
								configKey: 'demo',
								changedFields: ['tools', 'type', 'url'],
								secretReferences: [],
							}],
							reloadRequired: true,
							requiresInteractiveConfiguration: false,
						},
						negotiated,
					});
					override readonly prepareInstall: CopilotClient['rpc']['mcp']['prepareInstall'] = async () => {
						prepared++;
						throw new Error('Unexpected confirmed preparation');
					};
				}(),
			},
		};
		const policySessions = new TestPolicySessions();
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));

		const review = await service.prepare({
			mediaType: 'application/mcp-server+json',
			identifier: 'default:io.example/demo',
			displayName: 'Demo MCP',
			description: 'Demo',
			itemUrl: cardUrl,
			installation: {
				kind: 'mcp',
				source: { kind: 'url', mediaType: 'application/mcp-server+json', url: cardUrl },
			},
		});
		await service.apply(review.operationId);
		const inventory = await service.list();
		const uninstallReview = await service.prepare({ installationId: inventory[0].installationId });
		await service.apply(uninstallReview.operationId);
		const finalInventory = await service.list();

		assert.deepStrictEqual({ prepared, review, added, inventory, uninstallReview, removed, finalInventory }, {
			prepared: 0,
			review: {
				operationId: review.operationId,
				action: 'install',
				kind: 'mcp',
				displayName: 'Demo MCP',
				serverName: 'demo',
				target: 'demo',
				endpoint: 'https://example.com/mcp',
				configurationFields: ['tools', 'type', 'url'],
			},
			added: [{
				name: 'demo',
				config: {
					type: 'http',
					url: 'https://example.com/mcp',
					tools: ['*'],
				},
			}],
			inventory: [{
				installationId: 'mcp-config:demo',
				kind: 'mcp',
				mediaType: 'application/mcp-server+json',
				serverName: 'demo',
				state: 'installed',
			}],
			uninstallReview: {
				operationId: uninstallReview.operationId,
				action: 'uninstall',
				kind: 'mcp',
				displayName: 'demo',
				serverName: 'demo',
				target: 'demo',
				configurationFields: [],
				restoresPreviousConfiguration: false,
				preservesSharedAuthentication: true,
			},
			removed: [{ name: 'demo' }],
			finalInventory: [],
		});
	});

	test('uses receipt inventory and confirms only the reviewed pending Skill operation', async () => {
		const expiresAt = new Date(Date.now() + 60_000).toISOString();
		const catalogue = {
			resourceId: 'urn:air:github.test:skill:demo',
			itemUrl: 'https://agentfinder.github.com/items/demo',
			displayName: 'Demo Skill',
			description: 'A demo skill',
			publisher: 'GitHub',
			version: '1.0.0',
			source: 'https://agentfinder.github.com',
		};
		const source = {
			resourceId: catalogue.resourceId,
			catalogRevisionId: 'catalog-revision',
			repositoryId: 'repository-id',
			repository: 'owner/repository',
			revision: 'a'.repeat(40),
			root: 'skills/demo',
			descriptorDigest: 'b'.repeat(64),
			bundleDigest: 'c'.repeat(64),
		};
		const target = { scope: 'personal' as const, relativePath: 'skills/demo', displayLabel: '~/.copilot/skills/demo' };
		const files = [{ path: 'SKILL.md', sizeBytes: 12, mediaType: 'text/markdown', executable: false, digest: 'd'.repeat(64) }];
		const sdkReview = {
			action: 'install' as const,
			name: 'demo-skill',
			description: 'A demo skill',
			catalogue,
			source,
			target,
			installsDisabled: true,
			files,
			totalBytes: 12,
			entrypointPath: 'SKILL.md',
			entrypointContent: '# Demo Skill',
		};
		const installation = {
			installationId: 'skill-installation',
			operationId: 'skill-operation',
			name: 'demo-skill',
			target,
			configuredEnabled: false,
			sessionState: 'loaded-disabled' as const,
			source,
			catalogue,
			installedAt: new Date().toISOString(),
			ownershipState: 'intact' as const,
		};
		const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
		const serviceRef: { value?: CopilotCustomizationInstallations } = {};
		const policySessions = new TestPolicySessions();
		const decisions: string[] = [];
		const skills = new class extends mock<CopilotClient['rpc']['skills']>() {
			override readonly installations = new class extends mock<CopilotClient['rpc']['skills']['installations']>() {
				override readonly list: CopilotClient['rpc']['skills']['installations']['list'] = async () => {
					return { kind: 'outcome' as const, negotiated, outcome: { kind: 'listed' as const, installations: [installation] } };
				};
				override readonly recover: CopilotClient['rpc']['skills']['installations']['recover'] = async () => {
					return { kind: 'outcome' as const, negotiated, outcome: { kind: 'recovered' as const, installations: [installation] } };
				};
			}();
			override readonly planInstall: CopilotClient['rpc']['skills']['planInstall'] = async () => {
				return {
					kind: 'outcome' as const,
					negotiated,
					outcome: {
						kind: 'install-planned' as const,
						plan: {
							planHandle: 'skill-plan',
							operationId: 'skill-operation',
							expiresAt,
							review: sdkReview,
						},
					},
				};
			};
			override readonly applyInstall: CopilotClient['rpc']['skills']['applyInstall'] = async () => {
				const request: InstallationConfirmationRequest = {
					policySessionId: policySessions.sessionId,
					confirmationId: 'confirmation',
					operationId: 'skill-operation',
					expiresAt,
					reviewFingerprint: 'fingerprint',
					review: { resource: 'skill', review: sdkReview },
				};
				const decision = await serviceRef.value!.confirmationHandler(request, CancellationToken.None);
				decisions.push(decision);
				return {
					kind: 'outcome' as const,
					negotiated,
					outcome: decision === 'confirm'
						? { kind: 'installed' as const, installation }
						: { kind: 'declined' as const, operationId: 'skill-operation' },
				};
			};
		}();
		const mcp = new class extends mock<CopilotClient['rpc']['mcp']>() {
			override readonly installations = new class extends mock<CopilotClient['rpc']['mcp']['installations']>() {
				override readonly list: CopilotClient['rpc']['mcp']['installations']['list'] = async () => {
					return { kind: 'outcome' as const, negotiated, outcome: { kind: 'listed' as const, installations: [] } };
				};
				override readonly recover: CopilotClient['rpc']['mcp']['installations']['recover'] = async () => {
					return { kind: 'outcome' as const, negotiated, outcome: { kind: 'recovered' as const, installations: [] } };
				};
			}();
		}();
		const catalog = new class extends mock<CopilotClient['rpc']['catalog']>() {
			override readonly search: CopilotClient['rpc']['catalog']['search'] = async () => {
				return {
					kind: 'succeeded' as const,
					searchId: 'search-id',
					candidates: [{
						handle: 'candidate-handle',
						handleExpiresAt: expiresAt,
						kind: 'ai-skill' as const,
						mediaType: 'application/ai-skill' as const,
						installability: 'installable' as const,
						displayName: 'Demo Skill',
						description: 'A demo skill',
						publisher: 'GitHub',
						source: { kind: 'url' as const, url: catalogue.itemUrl },
						provenance: {
							authority: 'agentfinder.github.com',
							observedAt: new Date().toISOString(),
							mediaType: 'application/ai-skill' as const,
						},
					}],
					truncated: false,
					negotiated,
				};
			};
		}();
		const client = { rpc: { catalog, skills, mcp } };
		const service = store.add(new CopilotCustomizationInstallations(async () => client, policySessions.create));
		serviceRef.value = service;

		const inventory = await service.list();
		const firstSearch = await service.search({
			query: 'demo',
			mediaType: 'application/ai-skill',
			limit: 10,
		});
		assert.strictEqual(firstSearch.kind, 'page');
		const versionMismatch = await service.prepare({
			mediaType: 'application/ai-skill',
			identifier: catalogue.resourceId,
			displayName: catalogue.displayName,
			description: catalogue.description,
			version: '2.0.0',
			selectionId: firstSearch.kind === 'page' ? firstSearch.items[0].selectionId : undefined,
			installation: { kind: 'skill' },
		}).then(() => undefined, error => error instanceof Error ? error.message : String(error));
		const review = await service.prepare({
			mediaType: 'application/ai-skill',
			identifier: catalogue.resourceId,
			displayName: catalogue.displayName,
			description: catalogue.description,
			version: catalogue.version,
			itemUrl: catalogue.itemUrl,
			selectionId: 'expired-selection',
			installation: { kind: 'skill' },
		});
		const prematureDecision = await service.confirmationHandler({
			policySessionId: policySessions.sessionId,
			confirmationId: 'premature',
			operationId: 'skill-operation',
			expiresAt,
			reviewFingerprint: 'premature-fingerprint',
			review: { resource: 'skill', review: sdkReview },
		}, CancellationToken.None);
		await service.apply(review.operationId);

		assert.deepStrictEqual({
			inventory,
			searchItems: firstSearch.kind === 'page' ? firstSearch.items.map(item => ({
				kind: item.kind,
				displayName: item.displayName,
				publisher: item.publisher,
				installable: item.installable,
			})) : [],
			review,
			versionMismatch,
			prematureDecision,
			decisions,
		}, {
			inventory: [{
				installationId: 'skill-installation',
				kind: 'skill',
				mediaType: 'application/ai-skill',
				catalogue,
				name: 'demo-skill',
				targetUri: undefined,
				state: 'installed',
			}],
			searchItems: [{
				kind: 'skill',
				displayName: 'Demo Skill',
				publisher: 'GitHub',
				installable: true,
			}],
			review: {
				operationId: review.operationId,
				action: 'install',
				kind: 'skill',
				displayName: 'demo-skill',
				description: 'A demo skill',
				source: `owner/repository@${'a'.repeat(40)}/skills/demo`,
				target: 'skills/demo',
				fileCount: 1,
				totalBytes: 12,
			},
			versionMismatch: 'The SDK catalog version changed after discovery. Refresh Browse and try again.',
			prematureDecision: 'cancel',
			decisions: ['confirm'],
		});
	});

	suite('inventory failures', () => {
		type McpInstallationManagementResult = Awaited<ReturnType<CopilotClient['rpc']['mcp']['installations']['list']>>;
		const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };

		function createService(mcpResults: { list: McpInstallationManagementResult; recover: McpInstallationManagementResult }) {
			const calls: string[] = [];
			const skills = new class extends mock<CopilotClient['rpc']['skills']>() {
				override readonly installations = new class extends mock<CopilotClient['rpc']['skills']['installations']>() {
					override readonly list: CopilotClient['rpc']['skills']['installations']['list'] = async () => {
						calls.push('skills.list');
						return { kind: 'outcome' as const, negotiated, outcome: { kind: 'listed' as const, installations: [] } };
					};
					override readonly recover: CopilotClient['rpc']['skills']['installations']['recover'] = async () => {
						calls.push('skills.recover');
						return { kind: 'outcome' as const, negotiated, outcome: { kind: 'recovered' as const, installations: [] } };
					};
				}();
			}();
			const mcp = new class extends mock<CopilotClient['rpc']['mcp']>() {
				override readonly installations = new class extends mock<CopilotClient['rpc']['mcp']['installations']>() {
					override readonly list: CopilotClient['rpc']['mcp']['installations']['list'] = async () => {
						calls.push('mcp.list');
						return mcpResults.list;
					};
					override readonly recover: CopilotClient['rpc']['mcp']['installations']['recover'] = async () => {
						calls.push('mcp.recover');
						return mcpResults.recover;
					};
				}();
			}();
			const catalog = new class extends mock<CopilotClient['rpc']['catalog']>() { }();
			const policySessions = new TestPolicySessions();
			const service = store.add(new CopilotCustomizationInstallations(async () => ({ rpc: { catalog, skills, mcp } }), policySessions.create));
			return { service, calls };
		}

		test('surfaces the refusal reason when MCP inventory is refused', async () => {
			const refused: McpInstallationManagementResult = { kind: 'outcome', negotiated, outcome: { kind: 'refused', reason: 'lifecycle-unavailable' } };
			const { service, calls } = createService({ list: refused, recover: refused });

			const error = await service.list().then(() => undefined, error => error instanceof Error ? error.message : String(error));

			assert.deepStrictEqual({ error, calls: calls.sort() }, {
				error: 'The SDK could not list installed MCP servers. (refused: lifecycle-unavailable)',
				calls: ['mcp.list', 'skills.list'],
			});
		});

		test('recovers once when MCP inventory requires recovery', async () => {
			const installation: McpInstallationSummary = {
				installationId: 'installation-id',
				operationId: 'operation-id',
				identity: { canonicalName: 'io.github.example/demo', serverName: 'io.github.example/demo', version: '1.0.0' },
				choiceId: 'remote:0',
				state: 'active',
				installedAt: new Date().toISOString(),
			};
			const { service, calls } = createService({
				list: { kind: 'outcome', negotiated, outcome: { kind: 'recovery-required' } },
				recover: { kind: 'outcome', negotiated, outcome: { kind: 'recovered', installations: [installation] } },
			});

			const inventory = await service.list();

			assert.deepStrictEqual({ inventory, calls: calls.sort() }, {
				inventory: [{
					installationId: 'installation-id',
					kind: 'mcp',
					mediaType: 'application/mcp-server+json',
					catalogue: undefined,
					serverName: 'io.github.example/demo',
					state: 'installed',
				}],
				calls: ['mcp.list', 'mcp.recover', 'skills.list'],
			});
		});

		test('does not retry recovery when MCP inventory still requires recovery', async () => {
			const recoveryRequired: McpInstallationManagementResult = { kind: 'outcome', negotiated, outcome: { kind: 'recovery-required' } };
			const { service, calls } = createService({ list: recoveryRequired, recover: recoveryRequired });

			const error = await service.list().then(() => undefined, error => error instanceof Error ? error.message : String(error));

			assert.deepStrictEqual({ error, calls: calls.sort() }, {
				error: 'The SDK could not list installed MCP servers. (recovery-required)',
				calls: ['mcp.list', 'mcp.recover', 'skills.list'],
			});
		});
	});
});
