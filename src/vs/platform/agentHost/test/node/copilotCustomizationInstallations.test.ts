/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, InstallationConfirmationRequest } from '@github/copilot-sdk';
import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotCustomizationInstallations } from '../../node/copilot/customizations/copilotCustomizationInstallations.js';

suite('CopilotCustomizationInstallations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('fails before starting the SDK when no policy-session factory is available', async () => {
		let clientRequests = 0;
		const service = store.add(new CopilotCustomizationInstallations(async () => {
			clientRequests++;
			throw new Error('Unexpected client request');
		}, () => undefined));

		const search = await service.search(URI.parse('agent-host-copilotcli:///unmaterialized'), {
			query: '',
			limit: 10,
		});
		await assert.rejects(service.list(URI.parse('agent-host-copilotcli:///unmaterialized')), /Start a Copilot agent session/);
		assert.deepStrictEqual({ clientRequests, search }, {
			clientRequests: 0,
			search: { kind: 'unavailable', reason: 'session' },
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
			items: result.items.map(item => ({ kind: item.kind, displayName: item.displayName, installable: item.installable })),
			hasNextCursor: typeof result.nextCursor === 'string',
		} : result, {
			items: [
				{ kind: 'skill', displayName: 'Installable Skill', installable: true },
				{ kind: 'mcp', displayName: 'Installable MCP', installable: true },
			],
			hasNextCursor: true,
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
		const secondSearch = await service.search(URI.parse('agent-host-copilotcli:///session'), {
			query: 'demo',
			mediaType: 'application/ai-skill',
			limit: 10,
		});
		assert.strictEqual(secondSearch.kind, 'page');
		const review = await service.prepare(URI.parse('agent-host-copilotcli:///session'), {
			mediaType: 'application/ai-skill',
			identifier: catalogue.resourceId,
			displayName: catalogue.displayName,
			description: catalogue.description,
			version: catalogue.version,
			selectionId: secondSearch.kind === 'page' ? secondSearch.items[0].selectionId : undefined,
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
