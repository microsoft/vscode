/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { META_CHANGES_SUMMARY } from '../../common/agentHostChangesetService.js';
import { META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from '../../common/agentHostGitStateService.js';
import { SessionArtifactType, SESSION_META_ARTIFACTS_KEY, withSessionArtifacts } from '../../common/sessionArtifacts.js';
import { ChatOriginKind } from '../../common/state/protocol/state.js';
import { AH_META_CREATED_BY_SESSION_DB_KEY, AH_META_EHCLI_ADOPTED_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_READ_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, SESSION_META_CREATED_BY_SESSION_KEY, SESSION_META_EHCLI_ADOPTABLE_KEY, SESSION_META_EHCLI_ADOPTED_KEY, SESSION_META_FOLDER_PICKER_KEY, SESSION_META_GIT_KEY, SESSION_META_GITHUB_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, SESSION_META_WORKSPACELESS_KEY, SessionSourceControlOutcome, SessionStatus, withSessionCreationReference, withSessionEhcliAdoptable, withSessionFolderPickerDecision, withSessionGitHubState, withSessionGitState, withSessionMultiRootMetadata, withSessionSourceControlState, withSessionWorkspaceless } from '../../common/state/sessionState.js';
import { encodeAgentHostCatalogPayload } from '../../node/agentHostCatalogProjection.js';
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

function createResolver(metadata: Readonly<Record<string, string>>, unpersistedBacking = false): AgentHostCatalogSourceResolver {
	return new AgentHostCatalogSourceResolver({
		openDatabase: () => ({
			object: {
				getMetadataObject: async <T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }> =>
					Object.fromEntries(Object.keys(keys).map(key => [key, metadata[key]])) as { [K in keyof T]: string | undefined },
			},
			dispose: () => { },
		}),
		isUnpersistedChatBacking: () => unpersistedBacking,
		worktreeProjectFromRepositoryRoot: root => root ? { uri: URI.parse(root), displayName: 'Persisted worktree' } : undefined,
	});
}

suite('AgentHostCatalogSourceResolver', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
