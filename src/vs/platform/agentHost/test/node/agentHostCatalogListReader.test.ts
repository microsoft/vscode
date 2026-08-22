/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agent.js';
import { readSessionArtifacts } from '../../common/sessionArtifacts.js';
import { isSessionStatusArchived, isSessionStatusRead, readSessionEhcliAdoptable, readSessionExternal, readSessionFolderPickerDecision, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionOrchestration, readSessionSourceControlState, readSessionWorkspaceless } from '../../common/state/sessionState.js';
import { AgentHostCatalogListReader } from '../../node/agentHostCatalogListReader.js';
import { AGENT_HOST_CATALOG_PROJECTION_VERSION, projectAgentHostCatalog, type IAgentHostCatalogSource } from '../../node/agentHostCatalogProjection.js';
import { AgentHostDatabase, type IAgentHostDatabaseSessionV2 } from '../../node/agentHostDatabase.js';
import type { IRegisteredSession } from '../../node/agentSessionRegistry.js';

class TestCatalogDatabase extends AgentHostDatabase {
	catalog: IAgentHostDatabaseSessionV2 | undefined;
	readError: Error | undefined;

	constructor() {
		super(':memory:');
	}

	override async getSessionV2(): Promise<IAgentHostDatabaseSessionV2 | undefined> {
		if (this.readError) {
			throw this.readError;
		}
		return this.catalog;
	}
}

suite('AgentHostCatalogListReader', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = AgentSession.uri('copilot', 'central-list');
	const registered: IRegisteredSession = {
		session,
		provider: 'copilot',
		startTime: 100,
		external: true,
		source: 'discovery',
	};
	const source: IAgentHostCatalogSource = {
		modifiedTime: 200,
		title: 'Catalog title',
		titleSource: 'user',
		isRead: true,
		isArchived: true,
		project: { uri: 'file:///workspace', displayName: 'Workspace' },
		workspaceless: true,
		ehcliAdoptable: true,
		multiRoot: { workspaceFile: 'file:///workspace/project.code-workspace' },
		folderPicker: { hidden: true, primary: 'file:///workspace' },
		changes: { additions: 4, deletions: 2, files: 3 },
		github: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'] },
		git: {
			hasGitHubRemote: true,
			branchName: 'feature',
			baseBranchName: 'main',
			upstreamBranchName: 'origin/feature',
			incomingChanges: 1,
			outgoingChanges: 2,
			uncommittedChanges: 3,
			hasBaseBranchChanges: true,
			githubOwner: 'microsoft',
			githubHeadOwner: 'contributor',
			githubRepo: 'vscode',
		},
		sourceControl: { merge: { commit: 'abc123' }, latestOutcome: 'pullRequest' },
		artifacts: [{ id: 'artifact', type: 'pullRequest', label: 'PR', link: 'https://github.com/microsoft/vscode/pull/1', isGitHub: true, createdByThisSession: true }],
		orchestration: {
			parentSession: 'agent-session://copilot/parent',
			creatorSession: 'agent-session://copilot/creator',
			label: 'child',
			coordinateWithCreator: true,
			notifyOnIdle: 'always',
			creatorNotificationState: 'waitingForCompletion',
		},
		workingDirectories: ['file:///workspace', 'file:///other'],
		chats: [
			{ uri: `${session.toString()}/chat/default`, order: 0, kind: 'default', title: 'Catalog title', titleSource: 'user' },
			{ uri: `${session.toString()}/chat/peer`, order: 1, kind: 'peer', title: 'Peer title', titleSource: 'agent', origin: { kind: 'fork', chat: `${session.toString()}/chat/default`, turnId: 'turn-1' } },
		],
	};

	function createDatabase(): TestCatalogDatabase {
		const database = disposables.add(new TestCatalogDatabase());
		const projection = projectAgentHostCatalog(source, {
			session: session.toString(),
			sessionGeneration: 'incarnation',
			sourceRevision: 2,
		});
		if (!projection.ok) {
			throw new Error(projection.error.message);
		}
		database.catalog = {
			...projection.value.catalog,
			provider: registered.provider,
			startTime: registered.startTime,
			external: registered.external,
			source: registered.source,
		};
		return database;
	}

	test('converts a verified projection-v3 catalog into complete list metadata', async () => {
		const result = await new AgentHostCatalogListReader(createDatabase()).read(registered);
		assert.strictEqual(result.eligible, true);
		if (!result.eligible) {
			return;
		}

		assert.deepStrictEqual({
			session: result.metadata.session.toString(),
			startTime: result.metadata.startTime,
			modifiedTime: result.metadata.modifiedTime,
			summary: result.metadata.summary,
			isRead: isSessionStatusRead(result.metadata.status),
			isArchived: isSessionStatusArchived(result.metadata.status),
			project: result.metadata.project && { uri: result.metadata.project.uri.toString(), displayName: result.metadata.project.displayName },
			workingDirectories: result.metadata.workingDirectories?.map(directory => directory.toString()),
			changes: result.metadata.changes,
			external: readSessionExternal(result.metadata._meta),
			workspaceless: readSessionWorkspaceless(result.metadata._meta),
			ehcliAdoptable: readSessionEhcliAdoptable(result.metadata._meta),
			multiRoot: readSessionMultiRootMetadata(result.metadata._meta),
			folderPicker: readSessionFolderPickerDecision(result.metadata._meta),
			github: readSessionGitHubState(result.metadata._meta),
			git: readSessionGitState(result.metadata._meta),
			sourceControl: readSessionSourceControlState(result.metadata._meta),
			artifacts: readSessionArtifacts(result.metadata._meta),
			orchestration: readSessionOrchestration(result.metadata._meta),
			chats: result.source.chats,
		}, {
			session: session.toString(),
			startTime: 100,
			modifiedTime: 200,
			summary: 'Catalog title',
			isRead: true,
			isArchived: true,
			project: { uri: 'file:///workspace', displayName: 'Workspace' },
			workingDirectories: ['file:///workspace', 'file:///other'],
			changes: source.changes,
			external: true,
			workspaceless: true,
			ehcliAdoptable: true,
			multiRoot: source.multiRoot,
			folderPicker: source.folderPicker,
			github: source.github,
			git: source.git,
			sourceControl: source.sourceControl,
			artifacts: source.artifacts,
			orchestration: source.orchestration,
			chats: source.chats.map(chat => ({ ...chat, origin: chat.origin })),
		});
	});

	test('returns explicit ineligibility reasons without fabricating metadata', async () => {
		const cases: Array<{ readonly expected: string; readonly mutate: (database: TestCatalogDatabase) => void }> = [
			{ expected: 'missingCatalog', mutate: database => database.catalog = undefined },
			{ expected: 'chatBacking', mutate: database => database.catalog = { ...database.catalog!, isChatBacking: true } },
			{ expected: 'identityMismatch', mutate: database => database.catalog = { ...database.catalog!, session: AgentSession.uri('copilot', 'other').toString() } },
			{ expected: 'providerMismatch', mutate: database => database.catalog = { ...database.catalog!, provider: 'claude' } },
			{ expected: 'outdated', mutate: database => database.catalog = { ...database.catalog!, projectionVersion: AGENT_HOST_CATALOG_PROJECTION_VERSION - 1 } },
			{ expected: 'malformed', mutate: database => database.catalog = { ...database.catalog!, sourceHash: 'not-the-canonical-hash' } },
			{ expected: 'readError', mutate: database => database.readError = new Error('read failed') },
		];
		const actual: string[] = [];
		for (const testCase of cases) {
			const database = createDatabase();
			testCase.mutate(database);
			const result = await new AgentHostCatalogListReader(database).read(registered);
			actual.push(result.eligible ? 'eligible' : result.reason);
		}
		assert.deepStrictEqual(actual, cases.map(testCase => testCase.expected));
	});

	test('rejects a registry provider that does not match the session identity', async () => {
		const result = await new AgentHostCatalogListReader(createDatabase()).read({ ...registered, provider: 'claude' });
		assert.deepStrictEqual(result, { eligible: false, reason: 'providerMismatch' });
	});
});
