/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, InstallationConfirmationRequest, McpInstallationReview } from '@github/copilot-sdk';
import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotCustomizationInstallations } from '../../node/copilot/customizations/copilotCustomizationInstallations.js';

type CatalogSearchSucceeded = Extract<Awaited<ReturnType<CopilotClient['rpc']['catalog']['search']>>, { readonly kind: 'succeeded' }>;
type McpCatalogCandidate = Extract<CatalogSearchSucceeded['candidates'][number], { readonly kind: 'mcp-server' }>;
type McpInstallPlan = Extract<Awaited<ReturnType<CopilotClient['rpc']['mcp']['planInstall']>>, { readonly kind: 'planned' }>['plan'];
type McpInstallationListOutcome = Extract<Extract<Awaited<ReturnType<CopilotClient['rpc']['mcp']['installations']['list']>>, { readonly kind: 'outcome' }>['outcome'], { readonly kind: 'listed' }>;
type McpInstallationSummary = McpInstallationListOutcome['installations'][number];
type McpInstallReview = Extract<McpInstallationReview, { readonly action: 'install' }>;
type McpEffectiveConfiguration = NonNullable<McpInstallReview['effectiveConfiguration']>;

suite('CopilotCustomizationInstallations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('fails before starting the SDK when no policy-session factory is available', async () => {
		let clientRequests = 0;
		const service = store.add(new CopilotCustomizationInstallations(async () => {
			clientRequests++;
			throw new Error('Unexpected client request');
		}, () => undefined));

		const search = await service.search(URI.parse('agent-host-copilotcli:///unmaterialized'), {
			query: 'demo',
			limit: 10,
		});
		const mcpBrowse = await service.search(URI.parse('agent-host-copilotcli:///unmaterialized'), {
			query: '',
			mediaType: 'application/mcp-server+json',
			limit: 10,
		});
		await assert.rejects(service.list(URI.parse('agent-host-copilotcli:///unmaterialized')), /Start a Copilot agent session/);
		assert.deepStrictEqual({ clientRequests, search, mcpBrowse }, {
			clientRequests: 0,
			search: { kind: 'unavailable', reason: 'session' },
			mcpBrowse: { kind: 'page', items: [] },
		});
	});

	test('uses SDK marketplace browse for an empty featured-plugin query', async () => {
		const calls: string[] = [];
		const marketplaces = new class extends mock<CopilotClient['rpc']['plugins']['marketplaces']>() {
			override readonly list: CopilotClient['rpc']['plugins']['marketplaces']['list'] = async () => {
				calls.push('list');
				return {
					marketplaces: [
						{ name: 'awesome-copilot', source: 'GitHub: github/awesome-copilot', isDefault: true },
						{ name: 'copilot-plugins', source: 'GitHub: github/copilot-plugins', isDefault: true },
						{ name: 'other', source: 'GitHub: example/other' },
					],
				};
			};
			override readonly browse: CopilotClient['rpc']['plugins']['marketplaces']['browse'] = async request => {
				calls.push(`browse:${request.name}`);
				throw new Error('Unexpected marketplace browse');
			};
		}();
		const catalog = new class extends mock<CopilotClient['rpc']['catalog']>() {
			override readonly search: CopilotClient['rpc']['catalog']['search'] = async () => {
				throw new Error('Unexpected catalog search');
			};
		}();
		const client = {
			rpc: {
				catalog,
				plugins: new class extends mock<CopilotClient['rpc']['plugins']>() {
					override readonly marketplaces = marketplaces;
				}(),
				skills: new class extends mock<CopilotClient['rpc']['skills']>() { }(),
				mcp: new class extends mock<CopilotClient['rpc']['mcp']>() { }(),
			},
		};
		const service = store.add(new CopilotCustomizationInstallations(
			async () => client,
			() => undefined,
		));

		const result = await service.search(URI.parse('agent-host-copilotcli:///unmaterialized'), { query: '', limit: 10 });

		assert.deepStrictEqual({ calls, result }, {
			calls: ['list'],
			result: {
				kind: 'page',
				items: [
					{
						selectionId: 'featured-plugin:awesome-copilot:azure',
						kind: 'plugin',
						displayName: 'Azure',
						description: 'Plan, deploy, troubleshoot, and manage Azure resources with skills and MCP tools.',
						publisher: 'microsoft',
						pluginName: 'azure',
						marketplace: 'awesome-copilot',
						marketplaceSource: 'GitHub: github/awesome-copilot',
						installable: true,
					},
					{
						selectionId: 'featured-plugin:copilot-plugins:workiq',
						kind: 'plugin',
						displayName: 'WorkIQ',
						description: 'Find answers across Microsoft 365 emails, meetings, documents, and Teams messages.',
						publisher: 'microsoft',
						pluginName: 'workiq',
						marketplace: 'copilot-plugins',
						marketplaceSource: 'GitHub: github/copilot-plugins',
						installable: true,
					},
					{
						selectionId: 'featured-plugin:awesome-copilot:security-best-practices',
						kind: 'plugin',
						displayName: 'Security Best Practices',
						description: 'Build secure, accessible, reliable software.',
						publisher: 'github',
						pluginName: 'security-best-practices',
						marketplace: 'awesome-copilot',
						marketplaceSource: 'GitHub: github/awesome-copilot',
						installable: true,
					},
				],
			},
		});
	});

	test('creates and reuses a hidden policy session when no chat is materialized', async () => {
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
			() => undefined,
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
		await service.search(URI.parse('agent-host-copilotcli:///unmaterialized'), { query: 'first', limit: 10 });
		await service.search(URI.parse('agent-host-copilotcli:///unmaterialized'), { query: 'second', limit: 10 });
		await service.releasePolicySession(client);
		await service.search(URI.parse('agent-host-copilotcli:///unmaterialized'), { query: 'third', limit: 10 });
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
						kind: 'plugin' as const,
						mediaType: 'application/vnd.github.copilot-plugin' as const,
						identity: 'plugin',
						displayName: 'Pinned Plugin',
						source: { repository: 'owner/repository', path: '.github/plugin/plugin.json' },
						compatibilityTags: ['github-copilot' as const],
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
		const service = store.add(new CopilotCustomizationInstallations(
			async () => client,
			() => 'policy-session',
		));

		const result = await service.search(URI.parse('agent-host-copilotcli:///session'), { query: 'demo', limit: 10 });

		assert.deepStrictEqual(result.kind === 'page' ? {
			items: result.items.map(item => ({ kind: item.kind, displayName: item.displayName, itemUrl: item.itemUrl, installable: item.installable })),
			hasNextCursor: typeof result.nextCursor === 'string',
		} : result, {
			items: [
				{ kind: 'skill', displayName: 'Installable Skill', itemUrl: 'https://example.test/installable-skill', installable: true },
				{ kind: 'mcp', displayName: 'Installable MCP', itemUrl: 'https://example.test/installable-mcp', installable: true },
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
		const service = store.add(new CopilotCustomizationInstallations(async () => client, () => 'policy-session'));

		const result = await service.search(URI.parse('agent-host-copilotcli:///session'), { query: 'azure', limit: 10 });

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
		const service = store.add(new CopilotCustomizationInstallations(async () => client, () => 'sdk-session'));

		const first = await service.search(URI.parse('agent-host-copilotcli:///session'), { query: 'demo', limit: 10 });
		if (first.kind !== 'page' || !first.nextCursor) {
			assert.fail('Expected a paged SDK catalog result.');
		}
		const second = await service.search(URI.parse('agent-host-copilotcli:///session'), { query: 'ignored', limit: 1, cursor: first.nextCursor });

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
					],
				},
				policySessionId: 'sdk-session',
				query: 'demo',
				limit: 10,
				kinds: ['ai-skill', 'mcp-server'],
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
		const decisions: string[] = [];
		const uninstallDecisions: string[] = [];
		const searchCapabilities: string[][] = [];
		let installed = false;
		const confirmation = (id: string, effectiveConfiguration: McpEffectiveConfiguration): InstallationConfirmationRequest => ({
			policySessionId: 'policy-session',
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
					policySessionId: 'policy-session',
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
		const service = store.add(new CopilotCustomizationInstallations(async () => client, () => 'policy-session'));
		serviceRef.value = service;

		const review = await service.prepare(URI.parse('agent-host-copilotcli:///session'), {
			mediaType: candidate.mediaType,
			identifier: itemUrl,
			displayName: candidate.displayName,
			description: candidate.description ?? '',
			itemUrl,
			selectionId: 'expired-selection',
			installation: { kind: 'mcp' },
		});
		await service.apply(review.operationId);
		const uninstallReview = await service.prepare(URI.parse('agent-host-copilotcli:///session'), {
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
			]],
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
					policySessionId: 'sdk-session',
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
		const service = store.add(new CopilotCustomizationInstallations(async () => client, () => 'sdk-session'));
		serviceRef.value = service;

		const inventory = await service.list(URI.parse('agent-host-copilotcli:///session'));
		const firstSearch = await service.search(URI.parse('agent-host-copilotcli:///session'), {
			query: 'demo',
			mediaType: 'application/ai-skill',
			limit: 10,
		});
		assert.strictEqual(firstSearch.kind, 'page');
		const versionMismatch = await service.prepare(URI.parse('agent-host-copilotcli:///session'), {
			mediaType: 'application/ai-skill',
			identifier: catalogue.resourceId,
			displayName: catalogue.displayName,
			description: catalogue.description,
			version: '2.0.0',
			selectionId: firstSearch.kind === 'page' ? firstSearch.items[0].selectionId : undefined,
			installation: { kind: 'skill' },
		}).then(() => undefined, error => error instanceof Error ? error.message : String(error));
		const review = await service.prepare(URI.parse('agent-host-copilotcli:///session'), {
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
			policySessionId: 'sdk-session',
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
			versionMismatch: 'The SDK catalog version changed after discovery. Refresh Discover and try again.',
			prematureDecision: 'cancel',
			decisions: ['confirm'],
		});
	});
});
