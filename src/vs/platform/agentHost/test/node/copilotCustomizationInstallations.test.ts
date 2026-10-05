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

	test('requires the exact materialized policy session before starting the SDK', async () => {
		let clientRequests = 0;
		const service = store.add(new CopilotCustomizationInstallations(async () => {
			clientRequests++;
			throw new Error('Unexpected client request');
		}, () => undefined));

		await assert.rejects(service.list(URI.parse('agent-host-copilotcli:///unmaterialized')), /Start a Copilot agent session/);
		assert.strictEqual(clientRequests, 0);
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
		const review = await service.prepare(URI.parse('agent-host-copilotcli:///session'), {
			mediaType: 'application/ai-skill',
			identifier: catalogue.resourceId,
			displayName: catalogue.displayName,
			description: catalogue.description,
			version: catalogue.version,
			itemUrl: catalogue.itemUrl,
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
			review,
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
			prematureDecision: 'cancel',
			decisions: ['confirm'],
		});
	});
});
