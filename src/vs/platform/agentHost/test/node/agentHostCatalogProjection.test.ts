/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	AGENT_HOST_CATALOG_ARTIFACT_LIMIT,
	AGENT_HOST_CATALOG_GITHUB_REFERENCE_LIMIT,
	AGENT_HOST_CATALOG_PROJECTION_VERSION,
	IAgentHostCatalogProjection,
	IAgentHostCatalogSource,
	parseAgentHostCatalogSourcePayload,
	parseAgentHostDatabaseCatalog,
	projectAgentHostCatalog,
} from '../../node/agentHostCatalogProjection.js';

const options = {
	session: 'agent-session://test/session',
	sessionGeneration: 'incarnation-1',
	sourceRevision: 7,
} as const;

function createSource(): IAgentHostCatalogSource {
	return {
		modifiedTime: 1720000000000,
		title: 'Implement catalog projection',
		titleSource: 'user',
		isRead: true,
		isArchived: false,
		project: {
			uri: 'file:///workspace',
			displayName: 'workspace',
		},
		workspaceless: false,
		ehcliAdoptable: true,
		ehcliAdopted: true,
		multiRoot: {
			workspaceFile: 'file:///workspace/project.code-workspace',
		},
		folderPicker: {
			hidden: true,
			primary: 'file:///workspace',
		},
		changes: {
			additions: 12,
			deletions: 4,
			files: 2,
		},
		github: {
			owner: 'microsoft',
			repo: 'vscode',
			pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
			initialPullRequestUrls: [],
			associatedPullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
			issueUrls: ['https://github.com/microsoft/vscode/issues/2'],
			pullRequestBranchName: 'catalog-projection',
		},
		git: {
			hasGitHubRemote: true,
			branchName: 'feature/catalog',
			baseBranchName: 'main',
			upstreamBranchName: 'origin/feature/catalog',
			incomingChanges: 2,
			outgoingChanges: 3,
			uncommittedChanges: 4,
			hasBaseBranchChanges: true,
			githubOwner: 'microsoft',
			githubHeadOwner: 'contributor',
			githubRepo: 'vscode',
		},
		sourceControl: {
			merge: { commit: '0123456789abcdef' },
			latestOutcome: 'merge',
		},
		artifacts: [{
			id: 'artifact-1',
			type: 'pullRequest',
			label: 'Catalog projection',
			link: 'https://github.com/microsoft/vscode/pull/1',
			isGitHub: true,
			createdByThisSession: true,
		}],
		orchestration: {
			parentSession: 'agent-session://test/parent',
			creatorSession: 'agent-session://test/parent',
			label: 'projection',
			coordinateWithCreator: true,
			notifyOnIdle: 'once',
			creatorNotificationState: 'waitingForCompletion',
		},
		workingDirectories: ['file:///workspace', 'file:///workspace/secondary'],
		chats: [{
			uri: 'agent-chat://test/session/default',
			order: 0,
			kind: 'default',
			title: 'Main',
			titleSource: 'auto',
			origin: { kind: 'default', metadata: { b: 2, a: 1 } },
		}, {
			uri: 'agent-chat://test/session/peer',
			order: 1,
			kind: 'peer',
			title: 'Peer',
			titleSource: 'agent',
			origin: { kind: 'subagent' },
		}],
	};
}

function project(source: IAgentHostCatalogSource = createSource()): IAgentHostCatalogProjection {
	const result = projectAgentHostCatalog(source, options);
	assert.strictEqual(result.ok, true);
	return result.value;
}

function errorField(result: ReturnType<typeof projectAgentHostCatalog> | ReturnType<typeof parseAgentHostDatabaseCatalog>): string | undefined {
	return result.ok ? undefined : result.error.field;
}

suite('AgentHostCatalogProjection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('is deterministic across property and chat insertion order', () => {
		const source = createSource();
		const reordered: IAgentHostCatalogSource = {
			chats: [{
				origin: { kind: 'subagent' },
				titleSource: 'agent',
				title: 'Peer',
				kind: 'peer',
				order: 1,
				uri: 'agent-chat://test/session/peer',
			}, {
				origin: { metadata: { a: 1, b: 2 }, kind: 'default' },
				titleSource: 'auto',
				title: 'Main',
				kind: 'default',
				order: 0,
				uri: 'agent-chat://test/session/default',
			}],
			workingDirectories: source.workingDirectories,
			orchestration: {
				creatorNotificationState: 'waitingForCompletion',
				notifyOnIdle: 'once',
				coordinateWithCreator: true,
				label: 'projection',
				creatorSession: 'agent-session://test/parent',
				parentSession: 'agent-session://test/parent',
			},
			artifacts: source.artifacts,
			sourceControl: { latestOutcome: 'merge', merge: { commit: '0123456789abcdef' } },
			git: {
				githubRepo: 'vscode',
				githubHeadOwner: 'contributor',
				githubOwner: 'microsoft',
				hasBaseBranchChanges: true,
				uncommittedChanges: 4,
				outgoingChanges: 3,
				incomingChanges: 2,
				upstreamBranchName: 'origin/feature/catalog',
				baseBranchName: 'main',
				branchName: 'feature/catalog',
				hasGitHubRemote: true,
			},
			github: source.github,
			changes: { files: 2, deletions: 4, additions: 12 },
			folderPicker: { primary: 'file:///workspace', hidden: true },
			multiRoot: source.multiRoot,
			ehcliAdoptable: true,
			ehcliAdopted: true,
			workspaceless: false,
			project: { displayName: 'workspace', uri: 'file:///workspace' },
			isArchived: false,
			isRead: true,
			titleSource: 'user',
			title: 'Implement catalog projection',
			modifiedTime: 1720000000000,
		};

		const first = project(source);
		const second = project(reordered);
		assert.deepStrictEqual({
			payloadEqual: first.sourcePayload === second.sourcePayload,
			hashEqual: first.catalog.sourceHash === second.catalog.sourceHash,
			workingDirectoriesJson: second.catalog.workingDirectoriesJson,
			chatOrder: (JSON.parse(second.catalog.chatsJson) as Array<{ uri: string }>).map(chat => chat.uri),
		}, {
			payloadEqual: true,
			hashEqual: true,
			workingDirectoriesJson: '["file:///workspace","file:///workspace/secondary"]',
			chatOrder: [
				'agent-chat://test/session/default',
				'agent-chat://test/session/peer',
			],
		});
	});

	test('round trips every list-visible Git field and preserves absent versus zero and false', () => {
		const projection = project();
		const parsedPayload = parseAgentHostCatalogSourcePayload(projection.sourcePayload);
		const parsedCatalog = parseAgentHostDatabaseCatalog(projection.catalog);
		const sparse = project({
			...createSource(),
			git: {
				hasGitHubRemote: false,
				incomingChanges: 0,
			},
		});
		assert.strictEqual(parsedPayload.ok, true);
		assert.strictEqual(parsedCatalog.ok, true);

		assert.deepStrictEqual({
			projectedGit: projection.source.git,
			catalogGit: projection.catalog.gitSummaryJson,
			payloadGit: parsedPayload.value.source.git,
			parsedCatalogGit: parsedCatalog.value.source.git,
			sparseSourceGit: sparse.source.git,
			sparseCatalogGit: sparse.catalog.gitSummaryJson,
		}, {
			projectedGit: createSource().git,
			catalogGit: '{"baseBranchName":"main","branchName":"feature/catalog","githubHeadOwner":"contributor","githubOwner":"microsoft","githubRepo":"vscode","hasBaseBranchChanges":true,"hasGitHubRemote":true,"incomingChanges":2,"outgoingChanges":3,"uncommittedChanges":4,"upstreamBranchName":"origin/feature/catalog"}',
			payloadGit: createSource().git,
			parsedCatalogGit: createSource().git,
			sparseSourceGit: { hasGitHubRemote: false, incomingChanges: 0 },
			sparseCatalogGit: '{"hasGitHubRemote":false,"incomingChanges":0}',
		});
	});

	test('changes the canonical hash for every meaningful Git field', () => {
		const source = createSource();
		const baselineHash = project(source).catalog.sourceHash;
		const git = source.git!;
		const hashes = [
			project({ ...source, git: { ...git, hasGitHubRemote: false } }).catalog.sourceHash,
			project({ ...source, git: { ...git, branchName: 'feature/other' } }).catalog.sourceHash,
			project({ ...source, git: { ...git, baseBranchName: 'develop' } }).catalog.sourceHash,
			project({ ...source, git: { ...git, upstreamBranchName: 'origin/feature/other' } }).catalog.sourceHash,
			project({ ...source, git: { ...git, incomingChanges: 5 } }).catalog.sourceHash,
			project({ ...source, git: { ...git, outgoingChanges: 6 } }).catalog.sourceHash,
			project({ ...source, git: { ...git, uncommittedChanges: 7 } }).catalog.sourceHash,
			project({ ...source, git: { ...git, hasBaseBranchChanges: false } }).catalog.sourceHash,
			project({ ...source, git: { ...git, githubOwner: 'owner' } }).catalog.sourceHash,
			project({ ...source, git: { ...git, githubHeadOwner: 'head-owner' } }).catalog.sourceHash,
			project({ ...source, git: { ...git, githubRepo: 'repository' } }).catalog.sourceHash,
		];

		assert.deepStrictEqual(hashes.map(hash => hash !== baselineHash), Array.from({ length: hashes.length }, () => true));
	});

	test('rejects invalid Git counts, oversized strings, and unknown fields', () => {
		const source = createSource();
		const negative = projectAgentHostCatalog({ ...source, git: { incomingChanges: -1 } }, options);
		const unsafe = projectAgentHostCatalog({ ...source, git: { outgoingChanges: Number.MAX_SAFE_INTEGER + 1 } }, options);
		const oversized = projectAgentHostCatalog({ ...source, git: { branchName: 'b'.repeat(1025) } }, options);
		const unknown = projectAgentHostCatalog({
			...source,
			git: { branchName: 'main', rawPath: '/private/repository' },
		} as IAgentHostCatalogSource, options);

		assert.deepStrictEqual([
			errorField(negative),
			errorField(unsafe),
			errorField(oversized),
			errorField(unknown),
		], [
			'git.incomingChanges',
			'git.outgoingChanges',
			'git.branchName',
			'git.rawPath',
		]);
	});

	test('changes hash for meaningful list-visible fields but excludes hydrate-on-open state', () => {
		const source = createSource();
		const baseline = project(source);
		const changed = project({ ...source, isArchived: true });
		const payload = JSON.parse(baseline.sourcePayload) as Record<string, unknown>;

		assert.deepStrictEqual({
			hashChanged: baseline.catalog.sourceHash !== changed.catalog.sourceHash,
			excludedFields: [
				'turns', 'drafts', 'annotations', 'providerData', 'configuration',
				'resumeData', 'changesets', 'activity', 'status',
			].filter(field => JSON.stringify(payload).includes(field)),
		}, {
			hashChanged: true,
			excludedFields: [],
		});
	});

	test('canonically hashes, validates, and round trips the adoptable marker', () => {
		const adoptable = project();
		const adopted = project({ ...createSource(), ehcliAdoptable: false });
		const missing = JSON.stringify({
			projectionVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
			source: {
				...(JSON.parse(adoptable.sourcePayload) as { source: Record<string, unknown> }).source,
				ehcliAdoptable: undefined,
			},
		});
		const invalid = JSON.stringify({
			projectionVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
			source: {
				...(JSON.parse(adoptable.sourcePayload) as { source: Record<string, unknown> }).source,
				ehcliAdoptable: 'true',
			},
		});
		const roundTrip = parseAgentHostDatabaseCatalog(adoptable.catalog);
		const missingPayload = parseAgentHostCatalogSourcePayload(missing);
		const invalidPayload = parseAgentHostCatalogSourcePayload(invalid);

		assert.deepStrictEqual({
			hashChanged: adoptable.catalog.sourceHash !== adopted.catalog.sourceHash,
			catalogMarker: adoptable.catalog.ehcliAdoptable,
			payloadMarker: (JSON.parse(adoptable.sourcePayload) as { source: { ehcliAdoptable: boolean } }).source.ehcliAdoptable,
			roundTripMarker: roundTrip.ok ? roundTrip.value.source.ehcliAdoptable : undefined,
			missingPayloadError: missingPayload.ok ? undefined : missingPayload.error.field,
			invalidSourceError: invalidPayload.ok ? undefined : invalidPayload.error.field,
		}, {
			hashChanged: true,
			catalogMarker: true,
			payloadMarker: true,
			roundTripMarker: true,
			missingPayloadError: 'sourcePayload',
			invalidSourceError: 'ehcliAdoptable',
		});
	});

	test('bounds and de-duplicates each GitHub reference history', () => {
		const source = createSource();
		const references = Array.from({ length: AGENT_HOST_CATALOG_GITHUB_REFERENCE_LIMIT + 5 }, (_, index) => `https://github.com/microsoft/vscode/issues/${index}`);
		const projection = project({
			...source,
			github: {
				...source.github,
				issueUrls: [references[0].toUpperCase(), ...references],
			},
		});

		assert.deepStrictEqual(projection.source.github?.issueUrls, [
			references[0].toUpperCase(),
			...references.slice(1, AGENT_HOST_CATALOG_GITHUB_REFERENCE_LIMIT),
		]);
	});

	test('retains the most recent artifact suffix and round trips it', () => {
		const source = createSource();
		const artifacts = Array.from({ length: AGENT_HOST_CATALOG_ARTIFACT_LIMIT + 5 }, (_, index) => ({
			id: `artifact-${index}`,
			type: 'resource' as const,
			label: `Artifact ${index}`,
			uri: `file:///artifact-${index}`,
		}));
		const projection = project({ ...source, artifacts });
		const parsed = parseAgentHostDatabaseCatalog(projection.catalog);
		assert.strictEqual(parsed.ok, true);

		const expectedIds = artifacts.slice(-AGENT_HOST_CATALOG_ARTIFACT_LIMIT).map(artifact => artifact.id);
		assert.deepStrictEqual({
			projectedIds: projection.source.artifacts?.map(artifact => artifact.id),
			parsedIds: parsed.value.source.artifacts?.map(artifact => artifact.id),
		}, {
			projectedIds: expectedIds,
			parsedIds: expectedIds,
		});
	});

	test('sorts chats and rejects duplicate or non-contiguous exact-set children', () => {
		const source = createSource();
		const duplicateDirectory = projectAgentHostCatalog({
			...source,
			workingDirectories: ['file:///workspace', 'file:///workspace'],
		}, options);
		const duplicateChatUri = projectAgentHostCatalog({
			...source,
			chats: [source.chats[0], { ...source.chats[1], uri: source.chats[0].uri }],
		}, options);
		const duplicateChatOrder = projectAgentHostCatalog({
			...source,
			chats: [source.chats[0], { ...source.chats[1], order: 0 }],
		}, options);
		const sparseChatOrder = projectAgentHostCatalog({
			...source,
			chats: [{ ...source.chats[0], order: 1 }, { ...source.chats[1], order: 2 }],
		}, options);

		assert.deepStrictEqual([
			errorField(duplicateDirectory),
			errorField(duplicateChatUri),
			errorField(duplicateChatOrder),
			errorField(sparseChatOrder),
		], [
			'workingDirectories[1]',
			'chats[1].uri',
			'chats[1].order',
			'chats[0].order',
		]);
	});

	test('returns typed failures for malformed or noncanonical structured catalog data', () => {
		const catalog = project().catalog;
		const malformed = parseAgentHostDatabaseCatalog({ ...catalog, githubSummaryJson: '{' });
		const noncanonical = parseAgentHostDatabaseCatalog({ ...catalog, changesSummaryJson: '{"files":2,"additions":12,"deletions":4}' });
		const tamperedOrigin = parseAgentHostDatabaseCatalog({
			...catalog,
			chatsJson: catalog.chatsJson.replace('{\\"kind\\":\\"default\\",\\"metadata\\":{\\"a\\":1,\\"b\\":2}}', '{\\"kind\\":\\"tampered\\"}'),
		});

		assert.deepStrictEqual([
			errorField(malformed),
			errorField(noncanonical),
			errorField(tamperedOrigin),
		], [
			'githubSummaryJson',
			'changesSummaryJson',
			'sourceHash',
		]);
	});

	test('includes projection version in the hashed canonical payload', () => {
		const projection = project();
		const payload = JSON.parse(projection.sourcePayload) as { projectionVersion: number; source: unknown };
		const nextVersionPayload = JSON.stringify({
			projectionVersion: payload.projectionVersion + 1,
			source: payload.source,
		});
		const nextVersionHash = createHash('sha256').update(nextVersionPayload, 'utf8').digest('hex');

		assert.deepStrictEqual({
			projectionVersion: payload.projectionVersion,
			hashMatchesPayload: projection.catalog.sourceHash === createHash('sha256').update(projection.sourcePayload, 'utf8').digest('hex'),
			versionChangesHash: projection.catalog.sourceHash !== nextVersionHash,
		}, {
			projectionVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
			hashMatchesPayload: true,
			versionChangesHash: true,
		});
	});

	test('identifies projection-v2 source payloads and catalogs as outdated', () => {
		const projection = project();
		const parsedPayload = JSON.parse(projection.sourcePayload) as { projectionVersion: number; source: unknown };
		const oldPayload = JSON.stringify({ projectionVersion: 2, source: parsedPayload.source });
		const payloadResult = parseAgentHostCatalogSourcePayload(oldPayload);
		const catalogResult = parseAgentHostDatabaseCatalog({
			...projection.catalog,
			projectionVersion: 2,
			ehcliAdoptable: undefined,
		});

		assert.deepStrictEqual({
			currentVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
			payloadError: payloadResult.ok ? undefined : payloadResult.error,
			catalogError: catalogResult.ok ? undefined : catalogResult.error,
		}, {
			currentVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION,
			payloadError: { field: 'sourcePayload.projectionVersion', message: `Expected projection version ${AGENT_HOST_CATALOG_PROJECTION_VERSION}.` },
			catalogError: { field: 'projectionVersion', message: `Expected projection version ${AGENT_HOST_CATALOG_PROJECTION_VERSION}.` },
		});
	});

	test('round trips source payload and central catalog type', () => {
		const projection = project();
		const parsedPayload = parseAgentHostCatalogSourcePayload(projection.sourcePayload);
		const parsedCatalog = parseAgentHostDatabaseCatalog(projection.catalog);
		assert.strictEqual(parsedPayload.ok, true);
		assert.strictEqual(parsedCatalog.ok, true);

		assert.deepStrictEqual({
			payloadSource: parsedPayload.value.source,
			catalogSource: parsedCatalog.value.source,
			catalog: parsedCatalog.value.catalog,
		}, {
			payloadSource: projection.source,
			catalogSource: projection.source,
			catalog: projection.catalog,
		});
	});
});
