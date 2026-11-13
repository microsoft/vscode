/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, InstallationConfirmationRequest, McpInstallationReview } from '@github/copilot-sdk';
import assert from 'assert';
import { createHash } from 'crypto';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { stableStringify } from '../../../../base/common/objects.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { McpServerType } from '../../../mcp/common/mcpPlatformTypes.js';
import { IRequestService } from '../../../request/common/request.js';
import type { IAgentCustomizationInstallationAnswers, IAgentCustomizationInstallationApplyRequest, IAgentCustomizationInstallationConfigurationRequest, IAgentCustomizationInstallationHandle, IAgentCustomizationInstallationReview } from '../../common/agent.js';
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

const reviewHandles = new WeakMap<IAgentCustomizationInstallationReview, IAgentCustomizationInstallationHandle>();

/** Prepares an owned review and keeps its ownership handle out of review snapshots. */
async function prepareReview(service: CopilotCustomizationInstallations, request: Parameters<CopilotCustomizationInstallations['prepare']>[0]): Promise<IAgentCustomizationInstallationReview> {
	const prepared = await service.prepare(request);
	if (prepared.kind !== 'review') {
		throw new Error('Expected a review');
	}
	reviewHandles.set(prepared.review, prepared);
	return prepared.review;
}

function applyReview(service: CopilotCustomizationInstallations, review: IAgentCustomizationInstallationReview) {
	const handle = reviewHandles.get(review)!;
	return service.apply({ operationId: review.operationId, hostGeneration: handle.hostGeneration, ownershipToken: handle.ownershipToken });
}

const cancellationToken: Parameters<CopilotCustomizationInstallations['confirmationHandler']>[1] = {
	isCancellationRequested: false,
	onCancellationRequested: () => Disposable.None,
};

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
			await assert.rejects(prepareReview(fixture.service, {
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
					}, cancellationToken));
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
		await prepareReview(service, request);
		const review = await prepareReview(service, request);
		const applyResult = await applyReview(service, review);

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
		const uninstall = await prepareReview(service, { installationId: 'missing' }).then(() => undefined, error => error instanceof Error ? error.message : String(error));
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
			uninstall: 'This customization installation is no longer available.',
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

		const sdkReview = await prepareReview(service, { installationId: installation.installationId });
		const configurationReview = await prepareReview(service, { installationId: 'mcp-config:demo' });
		await service.releasePolicySession(client);
		const sdkApply = await applyReview(service, sdkReview).then(() => undefined, message);
		const sdkRetry = await applyReview(service, sdkReview).then(() => undefined, message);
		await applyReview(service, configurationReview);

		assert.deepStrictEqual({ sdkApply, sdkRetry, applies }, {
			sdkApply: 'The customization runtime restarted. Start the operation again.',
			sdkRetry: 'This customization installation review expired. Start the operation again.',
			applies: ['mcp.config.remove:demo'],
		});
	});

	test('reports an unfinished skill removal as a removal', async () => {
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
				resourceId: catalogue.resourceId, catalogRevisionId: 'catalog-revision', repositoryId: 'repository-id', repository: 'owner/repository',
				revision: 'a'.repeat(40), root: 'skills/demo', descriptorDigest: 'b'.repeat(64), bundleDigest: 'c'.repeat(64),
			},
			catalogue,
			installedAt: new Date().toISOString(),
			ownershipState: 'intact' as const,
		};
		const results: string[] = [];
		for (const kind of ['cancelled', 'declined', 'recovery-required'] as const) {
			const client = {
				rpc: {
					catalog: new class extends mock<CopilotClient['rpc']['catalog']>() { }(),
					skills: new class extends mock<CopilotClient['rpc']['skills']>() {
						override readonly installations = new class extends mock<CopilotClient['rpc']['skills']['installations']>() {
							override readonly list: CopilotClient['rpc']['skills']['installations']['list'] = async () => ({ kind: 'outcome' as const, negotiated, outcome: { kind: 'listed' as const, installations: [installation] } });
						}();
						override readonly planUninstall: CopilotClient['rpc']['skills']['planUninstall'] = async () => ({
							kind: 'outcome' as const,
							negotiated,
							outcome: {
								kind: 'uninstall-planned' as const,
								plan: { planHandle: 'skill-plan', operationId: 'skill-uninstall', expiresAt, installation, review: { action: 'uninstall' as const, installation, filesModified: false, files: [], totalBytes: 0, catalogue } },
							},
						});
						override readonly applyUninstall: CopilotClient['rpc']['skills']['applyUninstall'] = async () => ({ kind: 'outcome', negotiated, outcome: { kind, operationId: 'skill-uninstall' } } as Awaited<ReturnType<CopilotClient['rpc']['skills']['applyUninstall']>>);
					}(),
					mcp: new class extends mock<CopilotClient['rpc']['mcp']>() {
						override readonly installations = new class extends mock<CopilotClient['rpc']['mcp']['installations']>() {
							override readonly list: CopilotClient['rpc']['mcp']['installations']['list'] = async () => ({ kind: 'outcome' as const, negotiated, outcome: { kind: 'listed' as const, installations: [] } });
						}();
					}(),
				},
			};
			const service = store.add(new CopilotCustomizationInstallations(async () => client, new TestPolicySessions().create));
			const review = await prepareReview(service, { installationId: installation.installationId });
			results.push(await applyReview(service, review).then(() => 'removed', error => error instanceof Error ? error.message : String(error)));
		}
		assert.deepStrictEqual(results, [
			'The customization removal did not complete. (cancelled)',
			'The customization removal did not complete. (declined)',
			'The customization removal did not complete. (recovery-required)',
		]);
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
			resourceId: 'urn:air:registry.modelcontextprotocol.io:io.github.example:demo',
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
					decisions.push(await serviceRef.value!.confirmationHandler(confirmation(id, effectiveConfiguration), cancellationToken));
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
				const request = (authority: string): InstallationConfirmationRequest => ({
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
							provenance: { ...provenance, authority },
							target,
							policy,
							restoresPreviousConfiguration: false,
							ownedSecretCount: 0,
							preservesSharedAuthentication: true,
						},
					},
				});
				let decision: string | undefined;
				for (const authority of ['', provenance.authority]) {
					decision = await serviceRef.value!.confirmationHandler(request(authority), cancellationToken);
					uninstallDecisions.push(decision);
				}
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

		const review = await prepareReview(service, {
			mediaType: candidate.mediaType,
			identifier: itemUrl,
			displayName: candidate.displayName,
			description: candidate.description ?? '',
			itemUrl,
			selectionId: 'expired-selection',
			installation: { kind: 'mcp' },
		});
		await applyReview(service, review);
		const uninstallReview = await prepareReview(service, {
			installationId: installation.installationId,
		});
		await applyReview(service, uninstallReview);

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
			uninstallDecisions: ['cancel', 'confirm'],
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

		await assert.rejects(prepareReview(service, {
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

		const review = await prepareReview(service, {
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
		await applyReview(service, review);
		const inventory = await service.list();
		const uninstallReview = await prepareReview(service, { installationId: inventory[0].installationId });
		await applyReview(service, uninstallReview);
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

	function createLocalMcpCardFixture(options: { readonly expiresInMs?: number } = {}) {
		const document = {
			_meta: {},
			server: {
				name: 'microsoft/markitdown',
				description: 'Convert documents to Markdown.',
				version: '1.0.0',
				packages: [{
					registryType: 'pypi',
					identifier: 'markitdown-mcp',
					version: '0.0.1a4',
					transport: { type: 'stdio' },
					packageArguments: [{ type: 'positional', value: '--verbose' }],
					environmentVariables: [{ name: 'MODE', value: 'stdio' }],
				}],
			},
		};
		const plan: McpInstallPlan = {
			planHandle: 'local-plan',
			planHandleExpiresAt: new Date(Date.now() + (options.expiresInMs ?? 60_000)).toISOString(),
			identity: { canonicalName: document.server.name, serverName: document.server.name, version: document.server.version },
			provenance: {
				authority: 'api.mcp.github.com',
				validatedAt: new Date().toISOString(),
				cardDigest: { algorithm: 'sha256-rfc8785', value: createHash('sha256').update(stableStringify(document)).digest('hex') },
				mediaType: 'application/mcp-server+json',
			},
			transportChoices: [{
				choiceId: 'package:0',
				transport: 'stdio',
				installMethod: 'package',
				packageType: 'pypi',
				packageIdentifier: 'markitdown-mcp',
				requiredValues: [],
				secretPlaceholders: [],
			}],
			target: { scope: 'user', configKey: document.server.name },
			policy: { decision: 'allowed', source: 'none' },
			configurationChanges: [{
				operation: 'add',
				scope: 'user',
				configKey: document.server.name,
				changedFields: ['args', 'command', 'env', 'tools', 'type'],
				secretReferences: [],
			}],
			reloadRequired: true,
			requiresInteractiveConfiguration: false,
		};
		const added: Parameters<CopilotClient['rpc']['mcp']['config']['add']>[0][] = [];
		const requests: { url: string | undefined; followRedirects: number | undefined }[] = [];
		const response = { statusCode: 200, text: JSON.stringify(document) };
		const client = {
			rpc: {
				catalog: new class extends mock<CopilotClient['rpc']['catalog']>() { }(),
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() {
					override readonly planInstall: CopilotClient['rpc']['mcp']['planInstall'] = async () => ({
						kind: 'planned', plan, negotiated: { runtimeProtocolVersion: 3, grantedCapabilities: [] },
					});
					override readonly config = new class extends mock<CopilotClient['rpc']['mcp']['config']>() {
						override readonly add: CopilotClient['rpc']['mcp']['config']['add'] = async request => { added.push(request); };
					}();
				}(),
			},
		};
		const requestService = new class extends mock<IRequestService>() {
			override readonly request: IRequestService['request'] = async options => {
				requests.push({ url: options.url, followRedirects: options.followRedirects });
				return {
					res: { statusCode: response.statusCode, headers: {} },
					stream: bufferToStream(VSBuffer.fromString(response.text)),
				};
			};
		}();
		const policySessions = new TestPolicySessions();
		// Tests hold client admission to interleave expiry and duplicate applies before effects start.
		const clientGate: { value?: Promise<void> } = {};
		const service = store.add(new CopilotCustomizationInstallations(async () => { await clientGate.value; return client; }, policySessions.create, requestService));
		const request = {
			mediaType: 'application/mcp-server+json',
			identifier: 'default:microsoft/markitdown',
			displayName: 'Markitdown',
			description: document.server.description,
			installation: {
				kind: 'mcp' as const,
				source: {
					kind: 'url' as const,
					mediaType: 'application/mcp-server+json' as const,
					url: 'https://api.mcp.github.com/v0.1/servers/microsoft%2Fmarkitdown/versions/latest',
				},
			},
		};
		return { service, request, document, plan, added, requests, response, clientGate };
	}

	test('parses the SDK-validated local MCP card in the host and writes only after review', async () => {
		const { service, request, added, requests } = createLocalMcpCardFixture();
		const review = await prepareReview(service, request);
		assert.deepStrictEqual(added, []);
		await applyReview(service, review);
		await assert.rejects(applyReview(service, review), /review expired/);
		assert.deepStrictEqual({ review, added, requests }, {
			review: {
				operationId: review.operationId, action: 'install', kind: 'mcp', displayName: 'Markitdown',
				serverName: 'microsoft/markitdown', target: 'microsoft/markitdown',
				command: 'uvx', args: ['markitdown-mcp@0.0.1a4', '--verbose'], env: { MODE: 'stdio' },
				configurationFields: ['args', 'command', 'env', 'tools', 'type'],
			},
			added: [{
				name: 'microsoft/markitdown',
				config: { type: 'stdio', command: 'uvx', args: ['markitdown-mcp@0.0.1a4', '--verbose'], env: { MODE: 'stdio' }, tools: ['*'] },
			}],
			requests: [{ url: request.installation.source.url, followRedirects: 0 }],
		});
	});

	suite('apply admission', () => {
		const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

		test('expiry while the client is admitted prevents the provisional configuration write', () => runWithFakedTimers({}, async () => {
			// Virtual time only advances once preparation is idle, so setup time can't expire the plan early.
			const { service, request, added, clientGate } = createLocalMcpCardFixture({ expiresInMs: 30 });
			const prepared = await service.prepare(request);
			assert.strictEqual(prepared.kind, 'review');
			const gate = new DeferredPromise<void>();
			clientGate.value = gate.p;
			const applying = service.apply({ operationId: prepared.review.operationId, hostGeneration: prepared.hostGeneration, ownershipToken: prepared.ownershipToken }).then(() => 'applied', errorMessage);
			await timeout(60);
			gate.complete();
			assert.deepStrictEqual({ result: await applying, added }, {
				result: 'This customization installation review expired. Start the operation again.',
				added: [],
			});
		}));

		test('a concurrent duplicate apply is refused and effects run once', async () => {
			const { service, request, added, clientGate } = createLocalMcpCardFixture();
			const prepared = await service.prepare(request);
			assert.strictEqual(prepared.kind, 'review');
			const gate = new DeferredPromise<void>();
			clientGate.value = gate.p;
			const handle = { operationId: prepared.review.operationId, hostGeneration: prepared.hostGeneration, ownershipToken: prepared.ownershipToken };
			const first = service.apply(handle).then(() => 'applied', errorMessage);
			const second = service.apply(handle).then(() => 'applied', errorMessage);
			gate.complete();
			assert.deepStrictEqual({ results: await Promise.all([first, second]), writes: added.length }, {
				results: ['applied', 'This customization installation review expired. Start the operation again.'],
				writes: 1,
			});
		});
	});

	test('refuses changed local cards, redirects, invalid JSON, and mismatched planned fields without writing', async () => {
		for (const scenario of ['digest', 'redirect', 'json', 'fields', 'identity', 'update'] as const) {
			const { service, request, plan, added, response } = createLocalMcpCardFixture();
			switch (scenario) {
				case 'digest': response.text = response.text.replace('Convert documents', 'Changed documents'); break;
				case 'redirect': response.statusCode = 302; break;
				case 'json': response.text = '{'; break;
				case 'fields': plan.configurationChanges[0].changedFields = ['args', 'command', 'tools', 'type']; break;
				case 'identity': plan.identity.canonicalName = 'another/server'; break;
				case 'update': plan.configurationChanges[0].operation = 'update'; break;
			}
			await assert.rejects(prepareReview(service, request), /changed|HTTP 302|invalid JSON|does not match|cannot preserve/, scenario);
			assert.deepStrictEqual(added, [], scenario);
		}
	});

	test('uses an input-free local package when the recommended remote card requires values', async () => {
		const { service, request, plan, added } = createLocalMcpCardFixture();
		plan.transportChoices.push({
			choiceId: 'remote:0',
			transport: 'streamable-http',
			installMethod: 'remote',
			endpoint: 'https://example.com/mcp',
			requiredValues: [{ kind: 'scalar', key: 'region', category: 'header', valueType: 'string', required: true, isRepeated: false }],
			secretPlaceholders: [],
		});
		plan.recommendedTransportChoiceId = 'remote:0';
		const review = await prepareReview(service, request);
		await applyReview(service, review);
		assert.deepStrictEqual(added, [{
			name: 'microsoft/markitdown',
			config: { type: 'stdio', command: 'uvx', args: ['markitdown-mcp@0.0.1a4', '--verbose'], env: { MODE: 'stdio' }, tools: ['*'] },
		}]);
	});

	test('refuses blocked local plans and package secrets before fetching a card', async () => {
		for (const scenario of ['policy', 'secret'] as const) {
			const { service, request, plan, added, requests } = createLocalMcpCardFixture();
			if (scenario === 'policy') {
				plan.policy = { decision: 'blocked', source: 'enterprise-allowlist', reason: 'Blocked by test policy' };
			} else {
				plan.transportChoices[0].secretPlaceholders.push({ key: 'token', placeholder: '${secret:token}', title: 'Token' });
			}
			await assert.rejects(prepareReview(service, request), /Blocked by test policy|additional values/);
			assert.deepStrictEqual({ added, requests }, { added: [], requests: [] });
		}
	});

	test('bounds local MCP card reads at five mebibytes', async () => {
		for (const excess of [0, 1]) {
			const { service, request, added, response } = createLocalMcpCardFixture();
			response.text = response.text.padEnd(5 * 1024 * 1024 + excess, ' ');
			if (excess) {
				await assert.rejects(prepareReview(service, request), /too large/);
			} else {
				await prepareReview(service, request);
			}
			assert.deepStrictEqual(added, []);
		}
	});

	test('refuses local parser inputs even when the SDK advertises an input-free choice', async () => {
		const { service, request, document, plan, added, response } = createLocalMcpCardFixture();
		const inputDocument = {
			...document,
			server: {
				...document.server,
				packages: [{
					...document.server.packages[0],
					environmentVariables: [{ name: 'TOKEN', isRequired: true, isSecret: true }],
				}],
			},
		};
		response.text = JSON.stringify(inputDocument);
		plan.provenance.cardDigest.value = createHash('sha256').update(stableStringify(inputDocument)).digest('hex');
		await assert.rejects(prepareReview(service, request), /additional configuration/);
		assert.deepStrictEqual(added, []);
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
				const decision = await serviceRef.value!.confirmationHandler(request, cancellationToken);
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
		const versionMismatch = await prepareReview(service, {
			mediaType: 'application/ai-skill',
			identifier: catalogue.resourceId,
			displayName: catalogue.displayName,
			description: catalogue.description,
			version: '2.0.0',
			selectionId: firstSearch.kind === 'page' ? firstSearch.items[0].selectionId : undefined,
			installation: { kind: 'skill' },
		}).then(() => undefined, error => error instanceof Error ? error.message : String(error));
		const review = await prepareReview(service, {
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
		}, cancellationToken);
		await applyReview(service, review);

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
			versionMismatch: 'The catalog version changed after discovery. Refresh Browse and try again.',
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
				error: 'Could not list installed MCP servers. (refused: lifecycle-unavailable)',
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
				error: 'Could not list installed MCP servers. (recovery-required)',
				calls: ['mcp.list', 'mcp.recover', 'skills.list'],
			});
		});
	});
	suite('local package MCP installation from the catalog', () => {
		const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
		const cardUrl = 'https://api.mcp.github.com/v0.1/servers/io.github.example%2Flocal/versions/latest';

		const remoteValues: McpInstallPlan['transportChoices'][number]['requiredValues'] = [
			{ kind: 'enum', key: 'region', category: 'url-variable', valueType: 'enum', required: true, enumValues: ['us', 'eu'], isRepeated: false },
			{ kind: 'scalar', key: 'X-Tenant', category: 'header', valueType: 'string', required: true, isRepeated: false },
			{ kind: 'scalar', key: 'X-Debug', category: 'header', valueType: 'boolean', required: false, defaultValue: 'false', isRepeated: false },
			{ kind: 'scalar', key: 'path', category: 'url-variable', valueType: 'string', required: false, isRepeated: false },
		];

		function createPackageFixture(options: { readonly requiredValues?: McpInstallPlan['transportChoices'][number]['requiredValues']; readonly secret?: boolean; readonly remote?: boolean; readonly sse?: boolean; readonly packageArguments?: readonly object[] } = {}) {
			const expiresAt = new Date(Date.now() + 60_000).toISOString();
			const observedAt = new Date().toISOString();
			const secretHeader = { name: 'Authorization', value: 'Bearer {api_key}', isRequired: true, variables: { api_key: { isRequired: true, isSecret: true } } };
			const document = {
				_meta: {},
				server: {
					name: 'io.github.example/local',
					description: 'Local MCP',
					version: '1.0.0',
					...(options.remote ? {
						remotes: [{
							type: options.sse ? 'sse' : 'streamable-http',
							url: 'https://example.test/{region}/{path}/mcp',
							variables: { region: { isRequired: true, choices: ['us', 'eu'] }, path: { description: 'Optional path' } },
							// A header template whose variable is fixed by the card is not a value the user supplies.
							headers: [{ name: 'X-Tenant', isRequired: true }, { name: 'X-Debug', format: 'boolean', default: 'false' }, { name: 'X-Region', value: 'r-{fixed}', variables: { fixed: { value: 'us' } } }, ...(options.secret ? [secretHeader] : [])],
						}],
					} : {
						packages: [{
							registryType: 'npm',
							identifier: '@example/local',
							version: '1.2.3',
							transport: { type: 'stdio' },
							packageArguments: options.packageArguments ?? (options.requiredValues ? [
								{ type: 'positional', valueHint: 'directory', description: 'Root directory' },
								{ type: 'named', name: '--port', description: 'Port', default: '3000' },
								{ type: 'named', name: '--headless', description: 'Run headless' },
								{ type: 'named', name: '--verbose', description: 'Verbose logging' },
							] : [{ type: 'named', name: '--headless' }]),
							environmentVariables: options.packageArguments ? [] : options.requiredValues ? [
								{ name: 'LOG_LEVEL', description: 'Log level', choices: ['info', 'debug'] },
								{ name: 'OPTIONAL_TAG', description: 'Optional tag' },
							] : [{ name: 'MODE', value: 'stdio' }],
						}],
					}),
				},
			};
			const candidate: McpCatalogCandidate = {
				handle: 'candidate-handle', handleExpiresAt: expiresAt, kind: 'mcp-server', mediaType: 'application/mcp-server+json', installability: 'installable',
				displayName: 'Local MCP', description: 'Local MCP', source: { kind: 'url', url: cardUrl },
				provenance: { authority: 'api.mcp.github.com', observedAt, mediaType: 'application/mcp-server+json' },
				trust: { schemaVersion: 'v1', status: 'absent', eligibility: 'unknown', provenance: { source: 'agent-finder', observedAt } },
			};
			const plan: McpInstallPlan = {
				planHandle: 'plan-handle',
				planHandleExpiresAt: expiresAt,
				identity: { canonicalName: document.server.name, serverName: document.server.name, version: document.server.version },
				provenance: { authority: 'api.mcp.github.com', validatedAt: observedAt, cardDigest: { algorithm: 'sha256-rfc8785', value: createHash('sha256').update(stableStringify(document)).digest('hex') }, mediaType: 'application/mcp-server+json' },
				transportChoices: [options.remote ? {
					choiceId: 'remote:0', transport: options.sse ? 'sse' : 'streamable-http', installMethod: 'remote', endpoint: 'https://example.test/{region}/{path}/mcp',
					requiredValues: remoteValues,
					secretPlaceholders: options.secret ? [{ key: 'api_key', placeholder: '${secret:abc}' }] : [],
				} : {
					choiceId: 'package:0', transport: 'stdio', installMethod: 'package', packageType: 'npm', packageIdentifier: '@example/local',
					requiredValues: options.requiredValues ?? [],
					secretPlaceholders: options.secret ? [{ key: 'API_KEY', placeholder: '${secret:abc}' }] : [],
				}],
				// The configuration key the runtime planned can differ from the server name.
				target: { scope: 'user', configKey: options.remote ? 'local-alias' : document.server.name },
				policy: { decision: 'allowed', source: 'none' },
				configurationChanges: [options.remote
					? { operation: 'add', scope: 'user', configKey: 'local-alias', changedFields: ['headers', 'tools', 'type', 'url'], secretReferences: options.secret ? ['${secret:abc}'] : [] }
					: { operation: 'add', scope: 'user', configKey: document.server.name, changedFields: ['args', 'command', 'env', 'tools', 'type'], secretReferences: [] }],
				reloadRequired: true,
				requiresInteractiveConfiguration: !!options.requiredValues?.length,
			};
			const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
			const added: Parameters<CopilotClient['rpc']['mcp']['config']['add']>[0][] = [];
			const client = {
				rpc: {
					catalog: new class extends mock<CopilotClient['rpc']['catalog']>() {
						override readonly search: CopilotClient['rpc']['catalog']['search'] = async () => ({ kind: 'succeeded', searchId: 'search', candidates: [candidate], truncated: false, negotiated });
					}(),
					skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
					mcp: new class extends mock<CopilotClient['rpc']['mcp']>() {
						override readonly planInstall: CopilotClient['rpc']['mcp']['planInstall'] = async () => ({ kind: 'planned', plan, negotiated });
						override readonly config = new class extends mock<CopilotClient['rpc']['mcp']['config']>() {
							override readonly add: CopilotClient['rpc']['mcp']['config']['add'] = async request => { added.push(request); };
						}();
					}(),
				},
			};
			const requestService = new class extends mock<IRequestService>() {
				override readonly request: IRequestService['request'] = async () => ({ res: { statusCode: 200, headers: {} }, stream: bufferToStream(VSBuffer.fromString(JSON.stringify(document))) });
			}();
			const service = store.add(new CopilotCustomizationInstallations(async () => client, new TestPolicySessions().create, requestService));
			const request = { mediaType: candidate.mediaType, identifier: cardUrl, displayName: 'Local MCP', description: 'Local MCP', itemUrl: cardUrl, installation: { kind: 'mcp' as const } };
			return { service, request, added };
		}

		const declaredValues: McpInstallPlan['transportChoices'][number]['requiredValues'] = [
			{ kind: 'scalar', key: 'directory', category: 'package-argument', valueType: 'path', required: true, isRepeated: false },
			{ kind: 'scalar', key: '--port', category: 'package-argument', valueType: 'number', required: false, defaultValue: '3000', isRepeated: false },
			{ kind: 'scalar', key: '--headless', category: 'package-argument', valueType: 'boolean', required: true, isRepeated: false },
			{ kind: 'scalar', key: '--verbose', category: 'package-argument', valueType: 'boolean', required: false, isRepeated: false },
			{ kind: 'enum', key: 'LOG_LEVEL', category: 'environment-variable', valueType: 'enum', required: true, enumValues: ['info', 'debug'], isRepeated: false },
			{ kind: 'scalar', key: 'OPTIONAL_TAG', category: 'environment-variable', valueType: 'string', required: false, isRepeated: false },
		];
		const submitted: IAgentCustomizationInstallationAnswers['inputs'] = [
			{ category: 'package-argument', key: 'directory', value: 'C:\\work' },
			{ category: 'package-argument', key: '--headless', value: 'true' },
			{ category: 'package-argument', key: '--verbose', value: 'false' },
			{ category: 'environment-variable', key: 'LOG_LEVEL', value: 'debug' },
		];

		test('installs an input-free catalog package after review', async () => {
			const { service, request, added } = createPackageFixture();
			const review = await prepareReview(service, request);
			assert.deepStrictEqual(added, []);
			await applyReview(service, review);
			assert.deepStrictEqual({ review: review.kind === 'mcp' ? [review.command, review.args, review.env] : undefined, added }, {
				review: ['npx', ['@example/local@1.2.3', '--headless'], { MODE: 'stdio' }],
				added: [{ name: 'io.github.example/local', config: { type: 'stdio', command: 'npx', args: ['@example/local@1.2.3', '--headless'], env: { MODE: 'stdio' }, tools: ['*'] } }],
			});
		});

		test('collects non-secret package values and writes them once into the local configuration', async () => {
			const { service, request, added } = createPackageFixture({ requiredValues: declaredValues });
			const configuration = await service.prepare(request);
			assert.strictEqual(configuration.kind, 'configuration');
			const apply = { hostGeneration: configuration.hostGeneration, ownershipToken: configuration.ownershipToken, operationId: configuration.operationId, answers: { choiceId: 'package:0', inputs: submitted, secrets: [] } };
			await service.apply(apply);
			const duplicate = await service.apply(apply).then(() => 'accepted', errorMessage);
			assert.deepStrictEqual({ choice: { ...configuration.choices[0], values: configuration.choices[0].values.map(value => `${value.category}:${value.key}`) }, added, duplicate }, {
				choice: {
					choiceId: 'package:0', transport: 'stdio',
					command: 'npx @example/local@1.2.3 ${input:directory} --port ${input:port} --headless ${input:headless} --verbose ${input:verbose}',
					env: { LOG_LEVEL: '${input:LOG_LEVEL}', OPTIONAL_TAG: '${input:OPTIONAL_TAG}' },
					configurationFields: ['args', 'command', 'env', 'tools', 'type'],
					values: ['package-argument:directory', 'package-argument:--port', 'package-argument:--headless', 'package-argument:--verbose', 'environment-variable:LOG_LEVEL', 'environment-variable:OPTIONAL_TAG'],
					secrets: [],
				},
				added: [{ name: 'io.github.example/local', config: { type: 'stdio', command: 'npx', args: ['@example/local@1.2.3', 'C:\\work', '--port', '3000', '--headless'], env: { LOG_LEVEL: 'debug' }, tools: ['*'] } }],
				duplicate: 'This customization installation review expired. Start the operation again.',
			});
		});

		test('configures an MCP Gallery remote with non-secret values and refuses one that needs a secret', async () => {
			const galleryCard = { kind: 'mcp' as const, source: { kind: 'url' as const, mediaType: 'application/mcp-server+json' as const, url: cardUrl } };
			const install = async (fixture: ReturnType<typeof createPackageFixture>) => {
				const configuration = await fixture.service.prepare({ ...fixture.request, installation: galleryCard });
				assert.strictEqual(configuration.kind, 'configuration');
				await fixture.service.apply({
					hostGeneration: configuration.hostGeneration, ownershipToken: configuration.ownershipToken, operationId: configuration.operationId,
					answers: { choiceId: 'remote:0', inputs: [{ category: 'url-variable', key: 'region', value: 'eu' }, { category: 'header', key: 'X-Tenant', value: 'contoso' }, { category: 'url-variable', key: 'path', value: 'v1' }], secrets: [] },
				});
				return configuration;
			};
			const streamable = createPackageFixture({ remote: true });
			const configuration = await install(streamable);
			const sse = createPackageFixture({ remote: true, sse: true });
			await install(sse);
			const withSecret = createPackageFixture({ remote: true, secret: true });
			const refused = await withSecret.service.prepare({ ...withSecret.request, installation: galleryCard }).then(prepared => prepared.kind, errorMessage);
			const headers = { 'X-Tenant': 'contoso', 'X-Debug': 'false', 'X-Region': 'r-us' };
			assert.deepStrictEqual({
				choice: configuration.choices.map(choice => [choice.choiceId, choice.endpointSummary, choice.command, choice.values.map(value => `${value.key}:${value.required}`)]),
				added: [...streamable.added, ...sse.added], refused, secretAdded: withSecret.added,
			}, {
				// The optional URL variable has no default and sits inside the URL template, so it must be answered.
				choice: [['remote:0', 'https://example.test/{region}/{path}/mcp', undefined, ['region:true', 'X-Tenant:true', 'X-Debug:false', 'path:true']]],
				added: [
					{ name: 'local-alias', config: { type: 'http', url: 'https://example.test/eu/v1/mcp', headers, tools: ['*'] } },
					{ name: 'local-alias', config: { type: 'sse', url: 'https://example.test/eu/v1/mcp', headers, tools: ['*'] } },
				],
				refused: 'This MCP server requires an installation choice or additional values that Browse cannot collect yet.',
				secretAdded: [],
			});
		});

		test('refuses an input-free catalog package after its policy session was released', async () => {
			const { service, request, added } = createPackageFixture();
			const review = await prepareReview(service, request);
			await service.releasePolicySession();
			const result = await applyReview(service, review).then(() => 'applied', errorMessage);
			assert.deepStrictEqual({ result, added }, { result: 'The customization runtime restarted. Start the operation again.', added: [] });
		});

		test('collects package values for an MCP Gallery card the same way', async () => {
			const { service, request, added } = createPackageFixture({ requiredValues: declaredValues });
			const configuration = await service.prepare({ ...request, installation: { kind: 'mcp', source: { kind: 'url', mediaType: 'application/mcp-server+json', url: cardUrl } } });
			assert.strictEqual(configuration.kind, 'configuration');
			await service.apply({ hostGeneration: configuration.hostGeneration, ownershipToken: configuration.ownershipToken, operationId: configuration.operationId, answers: { choiceId: 'package:0', inputs: submitted, secrets: [] } });
			assert.deepStrictEqual(added.map(entry => entry.config), [{ type: 'stdio', command: 'npx', args: ['@example/local@1.2.3', 'C:\\work', '--port', '3000', '--headless'], env: { LOG_LEVEL: 'debug' }, tools: ['*'] }]);
		});

		test('writes a repeated package argument once per submitted value', async () => {
			const { service, request, added } = createPackageFixture({
				requiredValues: [
					{ kind: 'scalar', key: '--include', category: 'package-argument', valueType: 'string', required: true, isRepeated: true },
					{ kind: 'scalar', key: 'path', category: 'package-argument', valueType: 'path', required: false, defaultValue: '.', isRepeated: true },
				],
				packageArguments: [
					{ type: 'named', name: '--include', isRepeated: true, isRequired: true, description: 'Folder to include' },
					{ type: 'positional', valueHint: 'path', isRepeated: true, default: '.', description: 'Path' },
				],
			});
			const configuration = await service.prepare(request);
			assert.strictEqual(configuration.kind, 'configuration');
			const handle = { hostGeneration: configuration.hostGeneration, ownershipToken: configuration.ownershipToken, operationId: configuration.operationId };
			const include = (value: string) => ({ category: 'package-argument' as const, key: '--include', value });
			await service.apply({ ...handle, answers: { choiceId: 'package:0', inputs: [include('src'), include('test')], secrets: [] } });
			assert.deepStrictEqual(added.map(entry => entry.config), [{ type: 'stdio', command: 'npx', args: ['@example/local@1.2.3', '--include', 'src', '--include', 'test', '.'], tools: ['*'] }]);
		});

		test('fails closed for package secrets, variable references and values the card cannot place', async () => {
			const results: string[] = [];
			const withSecret = createPackageFixture({ requiredValues: declaredValues, secret: true });
			results.push(await withSecret.service.prepare(withSecret.request).then(prepared => prepared.kind, errorMessage));
			const cases: [McpInstallPlan['transportChoices'][number]['requiredValues'], IAgentCustomizationInstallationAnswers['inputs']][] = [
				[declaredValues, submitted.map(input => input.key === 'directory' ? { ...input, value: '${env:HOME}' } : input)],
				[[...declaredValues, { kind: 'scalar', key: 'UNPLACED', category: 'environment-variable', valueType: 'string', required: false, defaultValue: 'x', isRepeated: false }], submitted],
			];
			for (const [requiredValues, inputs] of cases) {
				const { service, request, added } = createPackageFixture({ requiredValues });
				const configuration = await service.prepare(request);
				assert.strictEqual(configuration.kind, 'configuration');
				results.push(await service.apply({ hostGeneration: configuration.hostGeneration, ownershipToken: configuration.ownershipToken, operationId: configuration.operationId, answers: { choiceId: 'package:0', inputs, secrets: [] } }).then(() => 'accepted', errorMessage));
				assert.deepStrictEqual(added, []);
			}
			assert.deepStrictEqual(results, [
				'This MCP server requires an installation choice or additional values that Browse cannot collect yet.',
				'The value for \'directory\' is invalid.',
				'This MCP package requires additional configuration that Browse cannot collect yet.',
			]);
		});
	});

	suite('configured remote MCP installation', () => {
		const sentinel = {
			region: 'SENTINEL-REGION-7f3a',
			tenant: 'SENTINEL-TENANT-91bd',
			secret: 'SENTINEL-SECRET-c04e',
		};
		const placeholder = '${secret:abc}';

		function createConfiguredFixture(options: { readonly granted?: boolean; readonly repeated?: boolean; readonly prepareInstall?: CopilotClient['rpc']['mcp']['prepareInstall']; readonly applyInstall?: CopilotClient['rpc']['mcp']['applyInstall'] } = {}) {
			const expiresAtEpochMs = Date.now() + 60_000;
			const expiresAt = new Date(expiresAtEpochMs).toISOString();
			const itemUrl = 'https://agentfinder.github.com/items/configured';
			const observedAt = new Date().toISOString();
			const trust = { schemaVersion: 'v1' as const, status: 'absent' as const, eligibility: 'unknown' as const, provenance: { source: 'agent-finder' as const, observedAt } };
			const catalogue = { displayName: 'Configured MCP', description: 'Configured', source: 'agentfinder.github.com' };
			const candidate: McpCatalogCandidate = {
				handle: 'candidate-handle', handleExpiresAt: expiresAt, kind: 'mcp-server', mediaType: 'application/mcp-server+json', installability: 'installable',
				displayName: catalogue.displayName, description: catalogue.description, source: { kind: 'url', url: itemUrl },
				provenance: { authority: 'agentfinder.github.com', observedAt, mediaType: 'application/mcp-server+json' }, trust,
			};
			const identity = { canonicalName: 'io.github.example/configured', serverName: 'io.github.example/configured' };
			const provenance = { authority: 'api.mcp.github.com', validatedAt: observedAt, cardDigest: { algorithm: 'sha256-rfc8785' as const, value: 'b'.repeat(64) }, mediaType: 'application/mcp-server+json' as const };
			const target = { scope: 'user' as const, configKey: identity.serverName };
			const policy = { decision: 'allowed' as const, source: 'none' as const };
			const choice: McpInstallPlan['transportChoices'][number] = {
				choiceId: 'remote:0', transport: 'streamable-http', installMethod: 'remote', endpoint: 'https://example.test/eu/mcp',
				requiredValues: [
					{ kind: 'enum', key: 'X-Region', category: 'header', valueType: 'enum', required: true, enumValues: ['eu', 'us'], isRepeated: !!options.repeated },
					{ kind: 'scalar', key: 'TENANT', category: 'url-variable', valueType: 'string', required: false, defaultValue: 'common', title: 'Tenant', isRepeated: false },
				],
				secretPlaceholders: [{ key: 'API_KEY', placeholder, title: 'API key' }],
			};
			const configuration = { operation: 'add' as const, scope: 'user' as const, configKey: identity.serverName, changedFields: ['headers', 'tools', 'type', 'url'], secretReferences: [placeholder] };
			const plan: McpInstallPlan = {
				planHandle: 'plan-handle', planHandleExpiresAt: expiresAt, identity, provenance, transportChoices: [choice], recommendedTransportChoiceId: choice.choiceId,
				target, policy, configurationChanges: [configuration], reloadRequired: true, requiresInteractiveConfiguration: true,
			};
			const negotiated = { runtimeProtocolVersion: 3, grantedCapabilities: [] };
			const prepared: Parameters<CopilotClient['rpc']['mcp']['prepareInstall']>[0][] = [];
			const cancelled: string[] = [];
			const decisions: string[] = [];
			const serviceRef: { value?: CopilotCustomizationInstallations } = {};
			const policySessions = new TestPolicySessions();
			const effective: McpEffectiveConfiguration = { transport: 'http', url: `https://example.test/${sentinel.tenant}/mcp`, headers: { 'X-Region': 'us', Authorization: 'Bearer ${installation-secret:abc}' }, tools: ['*'] };
			const confirmation = (id: string, review: McpInstallReview): InstallationConfirmationRequest => ({
				policySessionId: policySessions.sessionId, confirmationId: id, operationId: 'sdk-operation', expiresAt, reviewFingerprint: id, review: { resource: 'mcp', review },
			});
			const mcp = new class extends mock<CopilotClient['rpc']['mcp']>() {
				override readonly installations = new class extends mock<CopilotClient['rpc']['mcp']['installations']>() {
					override readonly list: CopilotClient['rpc']['mcp']['installations']['list'] = async request => request.contract.requiredCapabilities.includes('mcp-configured-remote-installation') && options.granted === false
						? { kind: 'negotiation-refused', reason: 'unsupported-capability', message: 'refused', runtimeProtocolVersion: 3, minimumSupportedProtocolVersion: 3, supportedCapabilities: [], unsupportedCapabilities: ['mcp-configured-remote-installation'] }
						: { kind: 'outcome', outcome: { kind: 'listed', installations: [] }, negotiated: { runtimeProtocolVersion: 3, grantedCapabilities: [...request.contract.requiredCapabilities] as typeof negotiated.grantedCapabilities } };
					override readonly cancel: CopilotClient['rpc']['mcp']['installations']['cancel'] = async request => {
						cancelled.push(request.operationId);
						return { kind: 'outcome', outcome: { kind: 'operation', operation: { operationId: request.operationId, cancellationRequested: true, phase: 'prepared' } }, negotiated };
					};
				}();
				override readonly planInstall: CopilotClient['rpc']['mcp']['planInstall'] = async () => ({ kind: 'planned', plan, negotiated });
				override readonly prepareInstall: CopilotClient['rpc']['mcp']['prepareInstall'] = options.prepareInstall ?? (async request => {
					prepared.push(request);
					return { kind: 'outcome', outcome: { kind: 'install-prepared', operation: { operationId: 'sdk-operation', expiresAtEpochMs } }, negotiated };
				});
				override readonly applyInstall: CopilotClient['rpc']['mcp']['applyInstall'] = options.applyInstall ?? (async () => {
					const request = prepared.at(-1)!;
					const review: McpInstallReview = {
						action: 'install', identity, provenance, catalogueTrust: trust, catalogue, target, policy, selectedChoice: choice, configurationChange: configuration,
						inputs: request.inputs, suppliedSecrets: request.secrets.map(secret => secret.placeholder), secretStorage: 'keychain', effectiveConfiguration: effective,
					};
					const variants: [string, McpInstallReview][] = [
						['tampered-inputs', { ...review, inputs: [...review.inputs, { category: 'header', key: 'X-Extra', value: 'x' }] }],
						['added-default', { ...review, inputs: [...review.inputs, { category: 'url-variable', key: 'TENANT', value: 'common' }] }],
						['foreign-secret', { ...review, effectiveConfiguration: { ...effective, headers: { ...effective.headers, Other: '${installation-secret:other}' } } }],
						['unexpanded-url', { ...review, effectiveConfiguration: { ...effective, url: 'https://example.test/${TENANT}/mcp' } }],
						['missing-secret', { ...review, effectiveConfiguration: { ...effective, headers: { 'X-Region': 'us' } } }],
						['private-file', { ...review, secretStorage: 'private-file' }],
						['valid', review],
					];
					for (const [id, variant] of variants) {
						decisions.push(`${id}:${await serviceRef.value!.confirmationHandler(confirmation(id, variant), cancellationToken)}`);
					}
					return { kind: 'outcome', outcome: { kind: 'installed', installation: { installationId: 'installed', operationId: 'sdk-operation', identity, choiceId: choice.choiceId, state: 'active', installedAt: observedAt }, cleanupPending: false }, negotiated };
				});
			}();
			const client = {
				rpc: {
					catalog: new class extends mock<CopilotClient['rpc']['catalog']>() {
						override readonly search: CopilotClient['rpc']['catalog']['search'] = async () => ({ kind: 'succeeded', searchId: 'search', candidates: [candidate], truncated: false, negotiated });
					}(),
					skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
					mcp,
				},
			};
			let current = client;
			const service = store.add(new CopilotCustomizationInstallations(async () => current, policySessions.create));
			serviceRef.value = service;
			const request = { mediaType: candidate.mediaType, identifier: itemUrl, displayName: candidate.displayName, description: catalogue.description, itemUrl, installation: { kind: 'mcp' as const } };
			return { service, request, prepared, cancelled, decisions, swapClient: () => { current = { rpc: client.rpc }; }, confirm: (id: string) => serviceRef.value!.confirmationHandler(confirmation(id, { action: 'install', identity, provenance, catalogueTrust: trust, catalogue, target, policy, selectedChoice: choice, configurationChange: configuration, inputs: prepared.at(-1)!.inputs, suppliedSecrets: [placeholder], secretStorage: 'keychain', effectiveConfiguration: effective }), cancellationToken) };
		}

		async function prepareConfiguration(service: CopilotCustomizationInstallations, request: Parameters<CopilotCustomizationInstallations['prepare']>[0]) {
			const prepared = await service.prepare(request);
			assert.strictEqual(prepared.kind, 'configuration');
			return prepared as IAgentCustomizationInstallationConfigurationRequest;
		}

		function answers(configuration: IAgentCustomizationInstallationConfigurationRequest, overrides: Partial<IAgentCustomizationInstallationAnswers & IAgentCustomizationInstallationApplyRequest> = {}): IAgentCustomizationInstallationApplyRequest {
			const { hostGeneration = configuration.hostGeneration, ownershipToken = configuration.ownershipToken, operationId = configuration.operationId, ...answerOverrides } = overrides;
			return {
				hostGeneration, ownershipToken, operationId,
				answers: {
					choiceId: 'remote:0',
					inputs: [{ category: 'header', key: 'X-Region', value: 'us' }, { category: 'url-variable', key: 'TENANT', value: sentinel.tenant }],
					secrets: [{ placeholder, value: sentinel.secret }],
					...answerOverrides,
				},
			};
		}

		function assertNoSentinels(value: unknown): void {
			const text = JSON.stringify(value) ?? '';
			for (const secret of Object.values(sentinel)) {
				assert.ok(!text.includes(secret), `leaked ${secret}`);
			}
		}

		const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

		test('applies an owned request once with its answers and confirms only the exact submission', async () => {
			const { service, request, prepared, decisions } = createConfiguredFixture();
			const configuration = await prepareConfiguration(service, request);
			const applied = await service.apply(answers(configuration));
			const duplicate = await service.apply(answers(configuration)).then(() => 'accepted', errorMessage);

			assertNoSentinels(configuration);
			assert.deepStrictEqual({
				target: configuration.target,
				choices: configuration.choices,
				recommendedChoiceId: configuration.recommendedChoiceId,
				sent: prepared.map(({ inputs, secrets, secretStorage, choiceId, contract }) => ({ inputs, secrets, secretStorage, choiceId, configured: contract.requiredCapabilities.includes('mcp-configured-remote-installation') })),
				decisions,
				applied,
				duplicate,
			}, {
				target: 'io.github.example/configured',
				choices: [{
					choiceId: 'remote:0', transport: 'streamable-http', endpointSummary: 'https://example.test/eu/mcp', configurationFields: ['headers', 'tools', 'type', 'url'],
					values: [
						{ key: 'X-Region', category: 'header', valueType: 'enum', required: true, isRepeated: false, enumValues: ['eu', 'us'] },
						{ key: 'TENANT', category: 'url-variable', valueType: 'string', required: false, isRepeated: false, defaultValue: 'common', title: 'Tenant' },
					],
					secrets: [{ key: 'API_KEY', placeholder, title: 'API key' }],
				}],
				recommendedChoiceId: 'remote:0',
				sent: [{
					inputs: [{ category: 'header', key: 'X-Region', value: 'us' }, { category: 'url-variable', key: 'TENANT', value: sentinel.tenant }],
					secrets: [{ placeholder, value: sentinel.secret }], secretStorage: 'keychain', choiceId: 'remote:0', configured: true,
				}],
				decisions: ['tampered-inputs:cancel', 'added-default:cancel', 'foreign-secret:cancel', 'unexpanded-url:cancel', 'missing-secret:cancel', 'private-file:cancel', 'valid:confirm'],
				applied: { kind: 'receipt', installationId: 'installed' },
				duplicate: 'This customization installation review expired. Start the operation again.',
			});
		});

		test('treats foreign tokens and generations as unknown and leaves the request usable by its owner', async () => {
			const { service, request, prepared } = createConfiguredFixture();
			const configuration = await prepareConfiguration(service, request);
			const failures: string[] = [];
			failures.push(await service.apply(answers(configuration, { ownershipToken: 'learned-id-without-token' })).then(() => 'accepted', errorMessage));
			failures.push(await service.apply(answers(configuration, { hostGeneration: 'restarted' })).then(() => 'accepted', errorMessage));
			const applied = await service.apply(answers(configuration));

			assert.deepStrictEqual({ failures: [...new Set(failures)], prepared: prepared.length, applied }, {
				failures: ['This customization installation review expired. Start the operation again.'],
				prepared: 1,
				applied: { kind: 'receipt', installationId: 'installed' },
			});
		});

		test('revalidates submissions before consuming the request, naming keys but never values', async () => {
			const { service, request, prepared } = createConfiguredFixture();
			const configuration = await prepareConfiguration(service, request);
			const region = { category: 'header' as const, key: 'X-Region', value: 'eu' };
			const invalid: Partial<IAgentCustomizationInstallationAnswers>[] = [
				{ inputs: [region, { ...region }] },
				{ inputs: [region, { category: 'header', key: 'Unknown', value: sentinel.tenant }] },
				{ inputs: [{ ...region, value: sentinel.region }] },
				{ inputs: [] },
				{ inputs: [region, { category: 'url-variable', key: 'TENANT', value: `$${sentinel.tenant}` }] },
				{ inputs: [region, { category: 'url-variable', key: 'TENANT', value: `\0${sentinel.tenant}` }] },
				{ inputs: [region, { category: 'url-variable', key: 'TENANT', value: '' }] },
				{ inputs: [region], secrets: [] },
				{ inputs: [region], secrets: [{ placeholder, value: '' }] },
				{ inputs: [region], secrets: [{ placeholder: '${secret:other}', value: sentinel.secret }] },
				{ inputs: [region], choiceId: 'other' },
			];
			const messages: string[] = [];
			for (const overrides of invalid) {
				messages.push(await service.apply(answers(configuration, { secrets: [{ placeholder, value: sentinel.secret }], ...overrides })).then(() => 'accepted', errorMessage));
			}
			assertNoSentinels(messages);
			// An omitted default stays omitted, and the request was never consumed.
			const applied = await service.apply(answers(configuration, { inputs: [region] }));
			assert.deepStrictEqual({ messages, sentInputs: prepared.map(request => request.inputs), applied }, {
				messages: [
					`The value for 'X-Region' is invalid.`,
					`The value for 'Unknown' is invalid.`,
					`The value for 'X-Region' is invalid.`,
					`A value for 'X-Region' is required.`,
					`The value for 'TENANT' is invalid.`,
					`The value for 'TENANT' is invalid.`,
					`The value for 'TENANT' is invalid.`,
					`A secret for 'API_KEY' is required.`,
					`The value for 'API_KEY' is invalid.`,
					`The value for '' is invalid.`,
					'The selected installation choice is unavailable. Start the installation again.',
				],
				sentInputs: [[region]],
				applied: { kind: 'receipt', installationId: 'installed' },
			});
		});

		test('a concurrent duplicate apply is refused and values are sent once', async () => {
			const release = new DeferredPromise<void>();
			const sent: string[] = [];
			const { service, request } = createConfiguredFixture({
				prepareInstall: async preparedRequest => {
					sent.push(preparedRequest.choiceId);
					await release.p;
					return { kind: 'outcome', outcome: { kind: 'refused', reason: 'secret-store-unavailable' }, negotiated: { runtimeProtocolVersion: 3, grantedCapabilities: [] } };
				},
			});
			const configuration = await prepareConfiguration(service, request);
			const first = service.apply(answers(configuration)).then(() => 'accepted', errorMessage);
			const second = service.apply(answers(configuration)).then(() => 'accepted', errorMessage);
			release.complete();
			assert.deepStrictEqual({ results: await Promise.all([first, second]), sent }, {
				results: ['The secret store is unavailable.', 'This customization installation review expired. Start the operation again.'],
				sent: ['remote:0'],
			});
		});

		test('refuses apply without answers for a configuration request and leaves it usable', async () => {
			const { service, request, prepared } = createConfiguredFixture();
			const configuration = await prepareConfiguration(service, request);
			const { answers: _, ...withoutAnswers } = answers(configuration);
			const results = [await service.apply(withoutAnswers).then(() => 'accepted', errorMessage)];
			const applied = await service.apply(answers(configuration));
			assert.deepStrictEqual({ results, prepared: prepared.length, applied }, {
				results: ['This customization installation review expired. Start the operation again.'],
				prepared: 1,
				applied: { kind: 'receipt', installationId: 'installed' },
			});
		});

		test('sends no values or secrets after the runtime client or policy session changed during prompting', async () => {
			const results: unknown[] = [];
			for (const change of ['policy-session', 'client'] as const) {
				const { service, request, prepared, swapClient } = createConfiguredFixture();
				const configuration = await prepareConfiguration(service, request);
				if (change === 'client') {
					swapClient();
				} else {
					await service.releasePolicySession();
				}
				results.push(await service.apply(answers(configuration)).then(() => 'accepted', errorMessage), prepared.length);
			}
			assert.deepStrictEqual(results, [
				'The customization runtime restarted. Start the operation again.', 0,
				'The customization runtime restarted. Start the operation again.', 0,
			]);
		});

		test('fails closed for repeated values and runtimes without configured installation', async () => {
			const results: string[] = [];
			for (const options of [{ repeated: true }, { granted: false }]) {
				const { service, request } = createConfiguredFixture(options);
				results.push(await service.prepare(request).then(prepared => prepared.kind, errorMessage));
			}
			// Direct cards (MCP Gallery) plan without a session binding, which configured preparation requires.
			const card = createConfiguredFixture();
			const cardUrl = 'https://api.mcp.github.com/v0.1/servers/io.github.example%2Fconfigured/versions/latest';
			results.push(await card.service.prepare({ ...card.request, itemUrl: cardUrl, installation: { kind: 'mcp', source: { kind: 'url', mediaType: 'application/mcp-server+json', url: cardUrl } } }).then(prepared => prepared.kind, errorMessage));
			assert.deepStrictEqual({ results, cardPrepared: card.prepared.length }, {
				results: [
					'This MCP server requires an installation choice or additional values that Browse cannot collect yet.',
					'This MCP server requires an installation choice or additional values that Browse cannot collect yet.',
					'This MCP server requires an installation choice or additional values that Browse cannot collect yet.',
				],
				cardPrepared: 0,
			});
		});

		test('reports failures from typed reasons without runtime text or values, and never replays', async () => {
			const results: string[] = [];
			const responses: Awaited<ReturnType<CopilotClient['rpc']['mcp']['prepareInstall']>>[] = [
				{ kind: 'outcome', outcome: { kind: 'refused', reason: 'secret-store-unavailable' }, negotiated: { runtimeProtocolVersion: 3, grantedCapabilities: [] } },
			];
			for (const response of [...responses, undefined]) {
				const { service, request } = createConfiguredFixture({
					prepareInstall: async () => {
						if (!response) {
							throw new Error(`transport failed while sending ${sentinel.secret}`);
						}
						return response;
					},
				});
				const configuration = await prepareConfiguration(service, request);
				results.push(await service.apply(answers(configuration)).then(() => 'accepted', errorMessage));
			}
			// The runtime prepared the operation but applying it failed ambiguously.
			const ambiguous = createConfiguredFixture({ applyInstall: async () => { throw new Error(`apply failed with ${sentinel.secret}`); } });
			const configuration = await prepareConfiguration(ambiguous.service, ambiguous.request);
			results.push(await ambiguous.service.apply(answers(configuration)).then(() => 'accepted', errorMessage));
			results.push(await ambiguous.service.apply(answers(configuration)).then(() => 'accepted', errorMessage));
			assertNoSentinels(results);
			assert.deepStrictEqual({ results, ambiguousPrepared: ambiguous.prepared.length }, {
				results: [
					'The secret store is unavailable.',
					'Could not prepare this MCP server installation. Start the installation again.',
					'The installation result is unknown. Refresh the installed customizations before trying again.',
					'This customization installation review expired. Start the operation again.',
				],
				ambiguousPrepared: 1,
			});
		});
	});
});
