/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { META_CHANGES_SUMMARY } from '../../common/agentHostChangesetService.js';
import { META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from '../../common/agentHostGitStateService.js';
import { AH_META_DEV_CONTAINER_WORKTREE_DB_KEY } from '../../common/meta/agentDevContainerWorktreeMeta.js';
import { SessionArtifactType, SESSION_META_ARTIFACTS_KEY, withSessionArtifacts } from '../../common/sessionArtifacts.js';
import { ChatOriginKind } from '../../common/state/protocol/state.js';
import { AH_META_CREATED_BY_SESSION_DB_KEY, AH_META_EHCLI_ADOPTED_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_READ_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, SESSION_META_CREATED_BY_SESSION_KEY, SESSION_META_EHCLI_ADOPTABLE_KEY, SESSION_META_EHCLI_ADOPTED_KEY, SESSION_META_FOLDER_PICKER_KEY, SESSION_META_GIT_KEY, SESSION_META_GITHUB_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, SESSION_META_WORKSPACELESS_KEY, SessionSourceControlOutcome, SessionStatus, withSessionCreationReference, withSessionEhcliAdoptable, withSessionFolderPickerDecision, withSessionGitHubState, withSessionGitState, withSessionMultiRootMetadata, withSessionSourceControlState, withSessionWorkspaceless } from '../../common/state/sessionState.js';
import { AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT, encodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
import { AgentHostCatalogSourceResolver, CHAT_BACKING_METADATA_KEY, ICatalogSourceState } from '../../node/agentHostCatalogSourceResolver.js';
import { customChatTitleMetadataKey, customChatTitleSourceMetadataKey, SESSION_ARTIFACTS_KEY, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from '../../node/shared/persistSessionMetadata.js';
import { WORKTREE_META_REPOSITORY_ROOT } from '../../node/shared/worktreeIsolation.js';

const session = URI.parse('agenthost:catalog-source');
const chat = 'agenthost-chat:catalog-source/default';
const liveArtifact = { id: 'live-artifact', type: SessionArtifactType.Website, label: 'Live artifact', isArtifact: true, link: 'https://example.com/live' };
const persistedArtifact = { id: 'persisted-artifact', type: SessionArtifactType.Issue, label: 'Persisted artifact', isArtifact: true, link: 'https://example.com/persisted' };
const liveCreationReference = { session: 'agenthost:live-creator', chat: 'agenthost-chat:live-creator/default', turnId: 'live-turn' } as const;
const persistedCreationReference = { session: 'agenthost:persisted-creator', chat: 'agenthost-chat:persisted-creator/default', turnId: 'persisted-turn' } as const;
const liveGit = { branchName: 'live-branch', outgoingChanges: 2 };
const persistedGit = { branchName: 'persisted-branch', outgoingChanges: 5 };
const liveGitHub = { owner: 'live-owner', repo: 'live-repo' };
const persistedGitHub = { owner: 'persisted-owner', repo: 'persisted-repo' };
const liveSourceControl = { merge: { commit: 'live-commit' }, latestOutcome: SessionSourceControlOutcome.Merge };
const persistedSourceControl = { latestOutcome: SessionSourceControlOutcome.PullRequest };

function sourceState(): ICatalogSourceState {
	let meta = withSessionMultiRootMetadata(undefined, { workspaceFile: 'file:///live.code-workspace' });
	meta = withSessionFolderPickerDecision(meta, { hidden: false });
	meta = withSessionArtifacts(meta, [liveArtifact]);
	meta = withSessionCreationReference(meta, liveCreationReference);
	meta = withSessionGitHubState(meta, liveGitHub);
	meta = withSessionGitState(meta, liveGit);
	meta = withSessionSourceControlState(meta, liveSourceControl);
	meta = withSessionWorkspaceless(meta, true);
	meta = withSessionEhcliAdoptable(meta);
	return {
		modifiedTime: 123,
		title: 'Live title',
		status: SessionStatus.Idle,
		project: { uri: 'file:///live-project', displayName: 'Live project' },
		workingDirectories: ['file:///live'],
		changes: { additions: 1, deletions: 2, files: 3 },
		meta,
		chats: [{
			uri: chat,
			kind: 'default',
			title: 'Live chat',
			origin: { kind: ChatOriginKind.Fork, chat: 'agenthost-chat:source/default', turnId: 'turn-1' },
		}],
	};
}

function persistedMetadata(): Readonly<Record<string, string>> {
	return {
		[SESSION_CUSTOM_TITLE_KEY]: 'Persisted title',
		[SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user',
		[AH_META_IS_READ_DB_KEY]: 'true',
		[AH_META_IS_ARCHIVED_DB_KEY]: 'true',
		[AH_META_WORKSPACELESS_DB_KEY]: 'false',
		[AH_META_EHCLI_ADOPTED_DB_KEY]: 'true',
		[SESSION_META_MULTI_ROOT_KEY]: JSON.stringify({ workspaceFile: 'file:///persisted.code-workspace' }),
		[SESSION_META_FOLDER_PICKER_KEY]: JSON.stringify({ hidden: true, primary: 'file:///persisted' }),
		[SESSION_ARTIFACTS_KEY]: JSON.stringify([persistedArtifact]),
		[AH_META_CREATED_BY_SESSION_DB_KEY]: JSON.stringify(persistedCreationReference),
		[META_GITHUB_STATE]: JSON.stringify(persistedGitHub),
		[META_GIT_STATE]: JSON.stringify(persistedGit),
		[META_SOURCE_CONTROL_STATE]: JSON.stringify(persistedSourceControl),
		[META_CHANGES_SUMMARY]: JSON.stringify({ additions: 10, deletions: 20, files: 30 }),
		[CHAT_BACKING_METADATA_KEY]: 'agenthost-chat:owner/peer',
		[WORKTREE_META_REPOSITORY_ROOT]: 'file:///persisted-worktree',
		[customChatTitleMetadataKey(chat)]: 'Persisted chat',
		[customChatTitleSourceMetadataKey(chat)]: 'agent',
	};
}

function createResolver(metadata: Readonly<Record<string, string>>, unpersistedBacking = false, chatMetadata?: Readonly<Record<string, string>>): AgentHostCatalogSourceResolver {
	return new AgentHostCatalogSourceResolver({
		openDatabase: () => ({
			object: {
				getMetadataObject: async <T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }> =>
					Object.fromEntries(Object.keys(keys).map(key => [key, metadata[key]])) as { [K in keyof T]: string | undefined },
			},
			dispose: () => { },
		}),
		tryOpenDatabase: async () => chatMetadata ? ({
			object: {
				getMetadataObject: async <T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }> =>
					Object.fromEntries(Object.keys(keys).map(key => [key, chatMetadata[key]])) as { [K in keyof T]: string | undefined },
			},
			dispose: () => { },
		}) : undefined,
		isUnpersistedChatBacking: () => unpersistedBacking,
		worktreeProjectFromRepositoryRoot: root => root ? { uri: URI.parse(root), displayName: 'Persisted worktree' } : undefined,
	});
}

suite('AgentHostCatalogSourceResolver', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('prefers chat-local titles over the downgrade-compatible session mirror', async () => {
		const result = await createResolver(persistedMetadata(), false, {
			[SESSION_CUSTOM_TITLE_KEY]: 'Chat-local title',
			[SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user',
		}).buildCatalogSyncRequest(session, sourceState(), {}, true);

		assert.deepStrictEqual(result.data.chats, [{
			uri: chat,
			order: 0,
			kind: 'default',
			summary: 'Chat-local title',
			titleSource: 'user',
			origin: { kind: ChatOriginKind.Fork, chat: 'agenthost-chat:source/default', turnId: 'turn-1' },
		}]);
	});

	test('bounds chat-local metadata reads and isolates open and read failures', async () => {
		const chats = Array.from({ length: 10 }, (_, index) => ({
			uri: `agenthost-chat:catalog-source/peer-${index}`,
			kind: 'peer' as const,
			title: `Live ${index}`,
		}));
		const metadata = Object.fromEntries(chats.flatMap((chat, index) => [
			[customChatTitleMetadataKey(chat.uri), `Fallback ${index}`],
			[customChatTitleSourceMetadataKey(chat.uri), 'user'],
		]));
		let active = 0;
		let maximumActive = 0;
		const resolver = new AgentHostCatalogSourceResolver({
			openDatabase: () => ({
				object: {
					getMetadataObject: async <T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }> =>
						Object.fromEntries(Object.keys(keys).map(key => [key, metadata[key]])) as { [K in keyof T]: string | undefined },
				},
				dispose: () => { },
			}),
			tryOpenDatabase: async chatUri => {
				active++;
				maximumActive = Math.max(maximumActive, active);
				await new Promise(resolve => setTimeout(resolve, 1));
				active--;
				if (chatUri.toString() === chats[2].uri) {
					throw new Error('open failed');
				}
				return {
					object: {
						getMetadataObject: async <T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }> => {
							if (chatUri.toString() === chats[7].uri) {
								throw new Error('read failed');
							}
							return Object.fromEntries(Object.keys(keys).map(key => [key, undefined])) as { [K in keyof T]: string | undefined };
						},
					},
					dispose: () => { },
				};
			},
			isUnpersistedChatBacking: () => false,
			worktreeProjectFromRepositoryRoot: () => undefined,
		});

		const result = await resolver.buildCatalogSyncRequest(session, {
			...sourceState(),
			chats,
		}, {}, true);

		assert.deepStrictEqual({
			maximumActive,
			titles: result.data.chats.map(chat => chat.summary),
			sources: result.data.chats.map(chat => chat.titleSource),
		}, {
			maximumActive: 4,
			titles: chats.map((_, index) => `Fallback ${index}`),
			sources: chats.map(() => 'user'),
		});
	});

	test('uses the default chat title as the session title when no explicit session title exists', async () => {
		const metadata = { ...persistedMetadata() };
		delete metadata[SESSION_CUSTOM_TITLE_KEY];
		delete metadata[SESSION_CUSTOM_TITLE_SOURCE_KEY];
		const result = await createResolver(metadata, false, {
			[SESSION_CUSTOM_TITLE_KEY]: 'Default Chat Title',
			[SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user',
		}).buildCatalogSyncRequest(session, sourceState(), {}, true);

		assert.deepStrictEqual({
			summary: result.data.summary,
			titleSource: result.data.titleSource,
		}, {
			summary: 'Default Chat Title',
			titleSource: 'user',
		});
	});

	test('projects persisted Dev Container worktree and pull request state metadata', async () => {
		const devContainerWorktree = {
			version: 1,
			handle: '00000000-0000-4000-8000-000000000001',
		} as const;
		const gitHub = {
			...persistedGitHub,
			pullRequestState: 'merged',
			pullRequestStateUrl: 'https://github.com/microsoft/vscode/pull/1',
		} as const;
		const result = await createResolver({
			...persistedMetadata(),
			[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY]: JSON.stringify(devContainerWorktree),
			[META_GITHUB_STATE]: JSON.stringify(gitHub),
		}).buildCatalogSyncRequest(session, sourceState(), {}, true);

		assert.deepStrictEqual({
			devContainerWorktree: result.data._meta?.[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY],
			gitHub: result.data._meta?.[SESSION_META_GITHUB_KEY],
			persistedDevContainerWorktree: result.legacyMetadata[AH_META_DEV_CONTAINER_WORKTREE_DB_KEY],
		}, {
			devContainerWorktree,
			gitHub,
			persistedDevContainerWorktree: JSON.stringify(devContainerWorktree),
		});
	});

	test('bounds derived summaries without changing source metadata and produces a stable payload', async () => {
		const oversized = `${'x'.repeat(AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT - 2)}😀tail`;
		const metadata = {
			...persistedMetadata(),
			[SESSION_CUSTOM_TITLE_KEY]: oversized,
			[customChatTitleMetadataKey(chat)]: oversized,
		};
		const resolver = createResolver(metadata);
		const first = await resolver.buildCatalogSyncRequest(session, sourceState(), {}, true);
		const second = await resolver.buildCatalogSyncRequest(session, sourceState(), {}, true);
		const firstPayload = encodeAgentHostCatalogPayload(first.data);
		const secondPayload = encodeAgentHostCatalogPayload(second.data);

		assert.deepStrictEqual({
			sessionSummary: first.data.summary,
			sessionSummaryLength: first.data.summary?.length,
			chatSummary: first.data.chats[0].summary,
			chatSummaryLength: first.data.chats[0].summary?.length,
			legacySessionTitle: first.legacyMetadata[SESSION_CUSTOM_TITLE_KEY],
			payloadHash: firstPayload.ok ? firstPayload.value.payloadHash : firstPayload.error,
			hashStable: firstPayload.ok && secondPayload.ok && firstPayload.value.payloadHash === secondPayload.value.payloadHash,
		}, {
			sessionSummary: `${'x'.repeat(AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT - 2)}…`,
			sessionSummaryLength: AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT - 1,
			chatSummary: `${'x'.repeat(AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT - 2)}…`,
			chatSummaryLength: AGENT_HOST_CATALOG_TITLE_LENGTH_LIMIT - 1,
			legacySessionTitle: oversized,
			payloadHash: firstPayload.ok ? firstPayload.value.payloadHash : firstPayload.error,
			hashStable: true,
		});
	});

	test('prefers live chat titles over stale chat-local metadata during live synchronization', async () => {
		const result = await createResolver(persistedMetadata(), false, {
			[SESSION_CUSTOM_TITLE_KEY]: 'Stale chat-local title',
			[SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user',
		}).buildCatalogSyncRequest(session, sourceState(), {}, false);

		assert.strictEqual(result.data.chats[0].summary, 'Live chat');
	});

	test('prefers live state while preserving persisted-only source and legacy metadata', async () => {
		const metadata = persistedMetadata();
		const result = await createResolver(metadata).buildCatalogSyncRequest(session, sourceState(), {
			[SESSION_CUSTOM_TITLE_KEY]: 'Override title',
			[customChatTitleMetadataKey(chat)]: 'Override chat',
		}, false);

		assert.deepStrictEqual(result, {
			data: {
				modifiedTime: 123,
				summary: 'Override title',
				titleSource: 'user',
				isRead: false,
				isArchived: false,
				project: { uri: 'file:///persisted-worktree', displayName: 'Persisted worktree' },
				isChatBacking: true,
				changes: { additions: 1, deletions: 2, files: 3 },
				_meta: {
					[SESSION_META_MULTI_ROOT_KEY]: { workspaceFile: 'file:///live.code-workspace' },
					[SESSION_META_FOLDER_PICKER_KEY]: { hidden: false },
					[SESSION_META_GITHUB_KEY]: liveGitHub,
					[SESSION_META_GIT_KEY]: liveGit,
					[SESSION_META_SOURCE_CONTROL_KEY]: liveSourceControl,
					[SESSION_META_ARTIFACTS_KEY]: [liveArtifact],
					[SESSION_META_CREATED_BY_SESSION_KEY]: liveCreationReference,
					[SESSION_META_WORKSPACELESS_KEY]: true,
					[SESSION_META_EHCLI_ADOPTABLE_KEY]: true,
					[SESSION_META_EHCLI_ADOPTED_KEY]: true,
				},
				workingDirectories: ['file:///live'],
				chats: [{
					uri: chat,
					order: 0,
					kind: 'default',
					summary: 'Override chat',
					titleSource: 'agent',
					origin: { kind: ChatOriginKind.Fork, chat: 'agenthost-chat:source/default', turnId: 'turn-1' },
				}],
			},
			legacyMetadata: {
				[SESSION_CUSTOM_TITLE_KEY]: 'Override title',
				[customChatTitleMetadataKey(chat)]: 'Override chat',
				[AH_META_IS_READ_DB_KEY]: '',
				[AH_META_IS_ARCHIVED_DB_KEY]: '',
				[SESSION_META_MULTI_ROOT_KEY]: JSON.stringify({ workspaceFile: 'file:///live.code-workspace' }),
				[SESSION_META_FOLDER_PICKER_KEY]: JSON.stringify({ hidden: false }),
				[SESSION_ARTIFACTS_KEY]: JSON.stringify([liveArtifact]),
				[AH_META_CREATED_BY_SESSION_DB_KEY]: JSON.stringify(liveCreationReference),
				[AH_META_WORKSPACELESS_DB_KEY]: 'true',
				[CHAT_BACKING_METADATA_KEY]: 'agenthost-chat:owner/peer',
				[WORKTREE_META_REPOSITORY_ROOT]: 'file:///persisted-worktree',
				[SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user',
				[META_GITHUB_STATE]: JSON.stringify(liveGitHub),
				[META_SOURCE_CONTROL_STATE]: JSON.stringify(liveSourceControl),
				[META_GIT_STATE]: JSON.stringify(liveGit),
				[META_CHANGES_SUMMARY]: JSON.stringify({ additions: 1, deletions: 2, files: 3 }),
			},
		});
	});

	test('prefers persisted list metadata with live git precedence', async () => {
		const result = await createResolver(persistedMetadata()).buildCatalogSyncRequest(session, sourceState(), {}, true);

		assert.deepStrictEqual(result, {
			data: {
				modifiedTime: 123,
				summary: 'Persisted title',
				titleSource: 'user',
				isRead: true,
				isArchived: true,
				project: { uri: 'file:///persisted-worktree', displayName: 'Persisted worktree' },
				isChatBacking: true,
				changes: { additions: 10, deletions: 20, files: 30 },
				_meta: {
					[SESSION_META_MULTI_ROOT_KEY]: { workspaceFile: 'file:///persisted.code-workspace' },
					[SESSION_META_FOLDER_PICKER_KEY]: { hidden: true, primary: 'file:///persisted' },
					[SESSION_META_GITHUB_KEY]: persistedGitHub,
					[SESSION_META_GIT_KEY]: liveGit,
					[SESSION_META_SOURCE_CONTROL_KEY]: { merge: undefined, ...persistedSourceControl },
					[SESSION_META_ARTIFACTS_KEY]: [persistedArtifact],
					[SESSION_META_CREATED_BY_SESSION_KEY]: persistedCreationReference,
					[SESSION_META_EHCLI_ADOPTABLE_KEY]: true,
					[SESSION_META_EHCLI_ADOPTED_KEY]: true,
				},
				workingDirectories: ['file:///live'],
				chats: [{
					uri: chat,
					order: 0,
					kind: 'default',
					summary: 'Persisted chat',
					titleSource: 'agent',
					origin: { kind: ChatOriginKind.Fork, chat: 'agenthost-chat:source/default', turnId: 'turn-1' },
				}],
			},
			legacyMetadata: {
				[AH_META_IS_READ_DB_KEY]: 'true',
				[AH_META_IS_ARCHIVED_DB_KEY]: 'true',
				[SESSION_META_MULTI_ROOT_KEY]: JSON.stringify({ workspaceFile: 'file:///persisted.code-workspace' }),
				[SESSION_META_FOLDER_PICKER_KEY]: JSON.stringify({ hidden: true, primary: 'file:///persisted' }),
				[SESSION_ARTIFACTS_KEY]: JSON.stringify([persistedArtifact]),
				[AH_META_CREATED_BY_SESSION_DB_KEY]: JSON.stringify(persistedCreationReference),
				[AH_META_WORKSPACELESS_DB_KEY]: 'false',
				[CHAT_BACKING_METADATA_KEY]: 'agenthost-chat:owner/peer',
				[WORKTREE_META_REPOSITORY_ROOT]: 'file:///persisted-worktree',
				[SESSION_CUSTOM_TITLE_KEY]: 'Persisted title',
				[SESSION_CUSTOM_TITLE_SOURCE_KEY]: 'user',
				[META_GITHUB_STATE]: JSON.stringify(persistedGitHub),
				[META_SOURCE_CONTROL_STATE]: JSON.stringify(persistedSourceControl),
				[META_GIT_STATE]: JSON.stringify(liveGit),
				[META_CHANGES_SUMMARY]: JSON.stringify({ additions: 10, deletions: 20, files: 30 }),
			},
		});
	});

	test('omits malformed persisted changes metadata', async () => {
		const result = await createResolver({
			...persistedMetadata(),
			[META_CHANGES_SUMMARY]: JSON.stringify({ additions: 'many', files: 1 }),
		}).buildCatalogSyncRequest(session, sourceState(), {}, true);

		assert.strictEqual(result.data.changes, undefined);
	});

	test('re-projects persisted sources to the identical canonical payload hash', async () => {
		const state = sourceState();
		const liveRequest = await createResolver({}).buildCatalogSyncRequest(session, state, {}, false);
		const stored = encodeAgentHostCatalogPayload(liveRequest.data);
		assert.strictEqual(stored.ok, true);

		const reprojectedRequest = await createResolver(liveRequest.legacyMetadata).buildCatalogSyncRequest(session, state, {}, true);
		const reprojected = encodeAgentHostCatalogPayload(reprojectedRequest.data);
		assert.strictEqual(reprojected.ok, true);

		assert.deepStrictEqual({
			payload: reprojected.value.payload,
			payloadHash: reprojected.value.payloadHash,
		}, {
			payload: stored.value.payload,
			payloadHash: stored.value.payloadHash,
		});
	});
});
