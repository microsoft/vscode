/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agent.js';
import { readSessionArtifacts, SESSION_META_ARTIFACTS_KEY } from '../../common/sessionArtifacts.js';
import { ChatInteractivity } from '../../common/state/protocol/state.js';
import { buildChatUri, buildSubagentChatUri, isSessionStatusArchived, isSessionStatusRead, readSessionCreationReference, readSessionEhcliAdoptable, readSessionExternal, readSessionFolderPickerDecision, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, SESSION_META_CREATED_BY_SESSION_KEY, SESSION_META_EHCLI_ADOPTABLE_KEY, SESSION_META_FOLDER_PICKER_KEY, SESSION_META_GIT_KEY, SESSION_META_GITHUB_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, SESSION_META_WORKSPACELESS_KEY } from '../../common/state/sessionState.js';
import { AgentHostCatalogListReader } from '../../node/agentHostCatalogListReader.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, encodeAgentHostCatalogPayload, type AgentHostCatalogData } from '../../node/agentHostCatalogProjection.js';
import { AgentHostDatabase, type IAgentHostDatabaseSessionV2 } from '../../node/agentHostDatabase.js';
import type { IRegisteredSession } from '../../node/agentSessionRegistry.js';

class TestCatalogDatabase extends AgentHostDatabase {
	catalog: IAgentHostDatabaseSessionV2 | undefined;
	readError: Error | undefined;
	batchReadError: Error | undefined;
	readonly singleReadErrors = new Map<string, Error>();
	singleReads = 0;
	batchReads = 0;
	batchSessions: readonly string[] | undefined;

	constructor() {
		super(':memory:');
	}

	override async getSessionV2(session: string): Promise<IAgentHostDatabaseSessionV2 | undefined> {
		this.singleReads++;
		const error = this.readError ?? this.singleReadErrors.get(session);
		if (error) {
			throw error;
		}
		return this.catalog?.session === session ? this.catalog : undefined;
	}

	override async listSessionsV2(sessions?: readonly string[]): Promise<readonly IAgentHostDatabaseSessionV2[]> {
		this.batchReads++;
		this.batchSessions = sessions;
		const error = this.readError ?? this.batchReadError;
		if (error) {
			throw error;
		}
		return this.catalog && (!sessions || sessions.includes(this.catalog.session)) ? [this.catalog] : [];
	}
}

suite('AgentHostCatalogListReader', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = AgentSession.uri('copilot', 'central-list');
	const registered: IRegisteredSession = {
		session,
		provider: 'copilot',
		startTime: 100,
		modifiedTime: 100,
		external: true,
		source: 'discovery',
	};
	const data: AgentHostCatalogData = {
		modifiedTime: 200,
		summary: 'Catalog title',
		titleSource: 'user',
		isRead: true,
		isArchived: true,
		project: { uri: 'file:///workspace', displayName: 'Workspace' },
		workingDirectories: ['file:///workspace', 'file:///other'],
		changes: { additions: 4, deletions: 2, files: 3 },
		_meta: {
			[SESSION_META_MULTI_ROOT_KEY]: { workspaceFile: 'file:///workspace/project.code-workspace' },
			[SESSION_META_FOLDER_PICKER_KEY]: { hidden: true, primary: 'file:///workspace' },
			[SESSION_META_GITHUB_KEY]: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'] },
			[SESSION_META_GIT_KEY]: {
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
			[SESSION_META_SOURCE_CONTROL_KEY]: { merge: { commit: 'abc123' }, latestOutcome: 'pullRequest' },
			[SESSION_META_ARTIFACTS_KEY]: [{ id: 'artifact', type: 'pullRequest', label: 'PR', isArtifact: true, link: 'https://github.com/microsoft/vscode/pull/1', isGitHub: true }],
			[SESSION_META_CREATED_BY_SESSION_KEY]: {
				session: 'agent-session://copilot/creator',
				chat: 'agent-chat://copilot/creator/default',
				turnId: 'turn-1',
			},
			[SESSION_META_WORKSPACELESS_KEY]: true,
			[SESSION_META_EHCLI_ADOPTABLE_KEY]: true,
		},
		chats: [
			{ uri: `${session.toString()}/chat/default`, order: 0, kind: 'default', summary: 'Catalog title', titleSource: 'user' },
			{ uri: `${session.toString()}/chat/peer`, order: 1, kind: 'peer', summary: 'Peer title', titleSource: 'agent', origin: { kind: 'fork', chat: `${session.toString()}/chat/default`, turnId: 'turn-1' }, interactivity: ChatInteractivity.Hidden, archived: true },
		],
	};

	function encode(catalogData: AgentHostCatalogData): { readonly payload: string; readonly payloadHash: string } {
		const encoded = encodeAgentHostCatalogPayload(catalogData);
		if (!encoded.ok) {
			throw new Error(encoded.error);
		}
		return encoded.value;
	}

	function createDatabase(catalogData: AgentHostCatalogData = data): TestCatalogDatabase {
		const database = disposables.add(new TestCatalogDatabase());
		const encoded = encode(catalogData);
		database.catalog = {
			session: session.toString(),
			modifiedTime: 100,
			sessionGeneration: 'incarnation',
			sourceRevision: 2,
			payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION,
			payloadHash: encoded.payloadHash,
			verified: true,
			payload: encoded.payload,
			isChatBacking: catalogData.isChatBacking === true,
			payloadDirty: 0,
			provider: registered.provider,
			startTime: registered.startTime,
			external: registered.external,
			source: registered.source,
		};
		return database;
	}

	test('converts a verified catalog payload into complete list metadata and chats', async () => {
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
			github: readSessionGitHubState(result.metadata._meta, 'file:///workspace'),
			legacyGitHub: result.metadata._meta?.[SESSION_META_GITHUB_KEY],
			git: readSessionGitState(result.metadata._meta),
			sourceControl: readSessionSourceControlState(result.metadata._meta),
			artifacts: readSessionArtifacts(result.metadata._meta),
			creationReference: readSessionCreationReference(result.metadata._meta),
			metadataChats: result.metadata.chats?.map(chat => ({ ...chat, chat: chat.chat.toString() })),
			catalogChats: result.data.chats.map(chat => ({ ...chat, uri: chat.uri.toString() })),
		}, {
			session: session.toString(),
			startTime: 100,
			modifiedTime: 200,
			summary: 'Catalog title',
			isRead: true,
			isArchived: true,
			project: { uri: 'file:///workspace', displayName: 'Workspace' },
			workingDirectories: ['file:///workspace', 'file:///other'],
			changes: data.changes,
			external: true,
			workspaceless: true,
			ehcliAdoptable: true,
			multiRoot: data._meta?.[SESSION_META_MULTI_ROOT_KEY],
			folderPicker: data._meta?.[SESSION_META_FOLDER_PICKER_KEY],
			// Payloads written by earlier versions are migrated to the session folder.
			github: data._meta?.[SESSION_META_GITHUB_KEY],
			legacyGitHub: undefined,
			git: data._meta?.[SESSION_META_GIT_KEY],
			sourceControl: data._meta?.[SESSION_META_SOURCE_CONTROL_KEY],
			artifacts: data._meta?.[SESSION_META_ARTIFACTS_KEY],
			creationReference: data._meta?.[SESSION_META_CREATED_BY_SESSION_KEY],
			metadataChats: data.chats.map(chat => ({
				chat: chat.uri,
				summary: chat.summary,
				kind: chat.kind,
				origin: chat.origin,
				...(chat.interactivity !== undefined ? { interactivity: chat.interactivity } : {}),
				...(chat.archived === true ? { archived: true } : {}),
			})),
			catalogChats: data.chats,
		});
	});

	test('reads multiple registered sessions with one catalog query', async () => {
		const database = createDatabase();
		const missing: IRegisteredSession = {
			...registered,
			session: AgentSession.uri('copilot', 'missing'),
		};

		const { results } = await new AgentHostCatalogListReader(database).readMany([registered, missing]);

		assert.deepStrictEqual({
			eligible: results.map(result => result.eligible),
			singleReads: database.singleReads,
			batchReads: database.batchReads,
			batchSessions: database.batchSessions,
		}, {
			eligible: [true, false],
			singleReads: 0,
			batchReads: 1,
			batchSessions: [registered.session.toString(), missing.session.toString()],
		});
	});

	test('skips the catalog query for an empty candidate list', async () => {
		const database = createDatabase();

		const result = await new AgentHostCatalogListReader(database).readMany([]);

		assert.deepStrictEqual({
			result,
			singleReads: database.singleReads,
			batchReads: database.batchReads,
		}, {
			result: { results: [] },
			singleReads: 0,
			batchReads: 0,
		});
	});

	test('recovers individual rows with bounded reads when the bulk query fails', async () => {
		const database = createDatabase();
		const missing: IRegisteredSession = {
			...registered,
			session: AgentSession.uri('copilot', 'missing'),
		};
		const failed: IRegisteredSession = {
			...registered,
			session: AgentSession.uri('copilot', 'failed'),
		};
		database.batchReadError = new Error('bulk failed');
		database.singleReadErrors.set(failed.session.toString(), new Error('row failed'));

		const result = await new AgentHostCatalogListReader(database).readMany([registered, missing, failed]);

		assert.deepStrictEqual({
			eligible: result.results.map(entry => entry.eligible),
			errors: result.results.map(entry => entry.eligible || entry.chatBacking ? undefined : entry.error?.message),
			bulkReadError: result.bulkReadError?.message,
			fallbackReadCount: result.bulkReadError ? result.fallbackReadCount : undefined,
			fallbackRecoveredRowCount: result.bulkReadError ? result.fallbackRecoveredRowCount : undefined,
			fallbackReadFailureCount: result.bulkReadError ? result.fallbackReadFailureCount : undefined,
			singleReads: database.singleReads,
			batchReads: database.batchReads,
		}, {
			eligible: [true, false, false],
			errors: [undefined, undefined, 'row failed'],
			bulkReadError: 'bulk failed',
			fallbackReadCount: 3,
			fallbackRecoveredRowCount: 1,
			fallbackReadFailureCount: 1,
			singleReads: 3,
			batchReads: 1,
		});
	});

	test('omits reserved subagent and tool-origin channels from list metadata and catalog data', async () => {
		const subagentChat = buildSubagentChatUri(session, 'tool-call');
		const toolChat = buildChatUri(session, 'spawned-tool');
		const result = await new AgentHostCatalogListReader(createDatabase({
			...data,
			chats: [
				...data.chats,
				{ uri: subagentChat, order: data.chats.length, kind: 'peer', summary: 'Explore', titleSource: 'agent' },
				{
					uri: toolChat,
					order: data.chats.length + 1,
					kind: 'peer',
					summary: 'Spawned Tool',
					titleSource: 'agent',
					origin: { kind: 'tool', chat: `${session.toString()}/chat/default`, toolCallId: 'tool-call' },
				},
			],
		})).read(registered);
		assert.strictEqual(result.eligible, true);
		if (!result.eligible) {
			return;
		}

		assert.deepStrictEqual({
			metadataChats: result.metadata.chats?.map(chat => chat.chat.toString()),
			catalogChats: result.data.chats.map(chat => chat.uri.toString()),
		}, {
			metadataChats: data.chats.map(chat => chat.uri),
			catalogChats: data.chats.map(chat => chat.uri),
		});
	});

	test('falls back for every unusable row and hides a chat-backing row instead', async () => {
		const outdated = encode(data);
		const cases: Array<{ readonly expected: string; readonly mutate: (database: TestCatalogDatabase) => void }> = [
			{ expected: 'fallback', mutate: database => database.catalog = undefined },
			{ expected: 'chatBacking', mutate: database => database.catalog = { ...database.catalog!, isChatBacking: true } },
			{ expected: 'fallback', mutate: database => database.catalog = { ...database.catalog!, session: AgentSession.uri('copilot', 'other').toString() } },
			{ expected: 'fallback', mutate: database => database.catalog = { ...database.catalog!, provider: 'claude' } },
			{ expected: 'fallback', mutate: database => database.catalog = { ...database.catalog!, payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION - 1, payload: outdated.payload } },
			{ expected: 'fallback', mutate: database => database.catalog = { ...database.catalog!, payload: '{ not json' } },
			{ expected: 'fallback', mutate: database => database.readError = new Error('read failed') },
		];
		const actual: string[] = [];
		for (const testCase of cases) {
			const database = createDatabase();
			testCase.mutate(database);
			const result = await new AgentHostCatalogListReader(database).read(registered);
			actual.push(result.eligible ? 'eligible' : result.chatBacking ? 'chatBacking' : 'fallback');
		}
		assert.deepStrictEqual(actual, cases.map(testCase => testCase.expected));
	});

	test('hides a chat-backing payload even when the row marker disagrees', async () => {
		const database = createDatabase({ ...data, isChatBacking: true });
		database.catalog = { ...database.catalog!, isChatBacking: false };

		const result = await new AgentHostCatalogListReader(database).read(registered);

		assert.deepStrictEqual(result, { eligible: false, chatBacking: true });
	});

	test('rejects a registry provider that does not match the session identity', async () => {
		const result = await new AgentHostCatalogListReader(createDatabase()).read({ ...registered, provider: 'claude' });

		assert.strictEqual(result.eligible, false);
		assert.strictEqual(result.eligible === false && result.chatBacking, false);
	});

	test('reports a read failure with its error so the caller can log it', async () => {
		const database = createDatabase();
		database.readError = new Error('read failed');

		const result = await new AgentHostCatalogListReader(database).read(registered);

		assert.deepStrictEqual(result.eligible === false && !result.chatBacking ? result.error?.message : undefined, 'read failed');
	});
});
