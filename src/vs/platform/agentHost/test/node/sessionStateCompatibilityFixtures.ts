/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Upgrade and downgrade fixtures for the session state that older builds keep
 * in a session's `session.db` and in `agent-host.db`.
 *
 * {@link writeLegacySessionState} writes the state a 1.142, 1.143 (main before
 * Block 2b) or Block 2b build leaves on disk for a Copilot session with a
 * default chat and peers in the same and in a different folder.
 * {@link readOldBuildView} reads back exactly what those builds read, so a test
 * can assert that an older build still sees the same state after a newer build
 * wrote it.
 *
 * Metadata keys are deliberately spelled as literals: they are the frozen
 * on-disk format older builds read, and must not follow renames in new code.
 */

import { Disposable, IReference } from '../../../../base/common/lifecycle.js';
import type { Database } from '@vscode/sqlite3';
import { URI } from '../../../../base/common/uri.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import type { ISessionDatabase, ISessionDataService } from '../../common/sessionDataService.js';
import type { ChangesSummary } from '../../common/state/protocol/channels-session/state.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, ChatOriginKind, MessageKind, type ChatOrigin, type ISessionFileDiff, type ISessionGitHubState, type ISessionGitState } from '../../common/state/sessionState.js';
import { ChatInteractivity } from '../../common/state/protocol/state.js';
import { AGENT_HOST_CATALOG_PAYLOAD_VERSION, decodeAgentHostCatalogPayload, encodeAgentHostCatalogPayload, projectAgentHostCatalogChatOrigin, type AgentHostCatalogData } from '../../node/agentHostCatalogProjection.js';
import { toSerializableJsonValue } from '../../node/agentHostCatalogSourceResolver.js';
import type { AgentHostDatabase, IAgentHostDatabaseOwnedSessionChat } from '../../node/agentHostDatabase.js';
import type { IPersistedPeerChat } from '../../node/agentHostPeerChatStore.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { CompatibleSessionDatabase } from '../../node/compatibleSessionDatabase.js';
import { storedChatUri, type SessionStorageIdentity } from '../../node/sessionStorageIdentity.js';
import { createSessionDataService } from '../common/sessionTestHelpers.js';

/** Builds whose on-disk session state Block 3a upgrades from and must stay readable by after a downgrade. */
export type LegacyBuild = '1.142' | '1.143' | '2b';

export const LEGACY_BUILDS: readonly LegacyBuild[] = ['1.142', '1.143', '2b'];

/** One chat of a {@link ILegacySessionFixture}. */
export interface ILegacyChatFixture {
	/** Fixture-local name, also the shaped chat id of a peer. */
	readonly name: string;
	readonly isDefault: boolean;
	/** Spelling the build used at runtime. Block 2b peers are opaque `ahp-chat:` URIs. */
	readonly runtimeUri: string;
	/** Shaped URI stored on disk: session.db keys and rows, and the agent-host.db catalog. */
	readonly uri: string;
	/** Recorded storage: the session for the default chat, the stored chat URI for a peer. */
	readonly storage: string;
	readonly title: string;
	/** Folders the chat works in. */
	readonly workingDirectories: readonly string[];
	/**
	 * Whether the chat's own database records its working directory. A peer
	 * without one follows the session db's `copilot.workingDirectory`.
	 */
	readonly pinnedWorkingDirectory: boolean;
	readonly providerData?: string;
	readonly origin?: ChatOrigin;
	readonly inheritedTurnId?: string;
	readonly isRead: boolean;
	readonly draft?: string;
	/** Provider turns with a checkpoint ref. Older builds record every chat's refs in the session db. */
	readonly checkpointTurns: readonly string[];
	readonly localTurns: readonly string[];
	readonly failedTurns: readonly string[];
	readonly changes: ChangesSummary;
}

/** A Copilot session as an older build left it on disk. */
export interface ILegacySessionFixture {
	readonly build: LegacyBuild;
	readonly provider: 'copilotcli';
	/** Spelling the build used at runtime: `ahp-session:` unless {@link historical}. */
	readonly runtimeSession: string;
	/** Session URI stored on disk, which is also where the session's `session.db` lives. */
	readonly session: string;
	/** Whether the session predates runtime identities, so runtime and storage spelling agree. */
	readonly historical: boolean;
	/**
	 * Whether the session db records `agentHost.sessionWorkingDirectories`. Most real Copilot sessions
	 * don't: their folder is only the session db's `copilot.workingDirectory`.
	 */
	readonly recordsSessionWorkingDirectories: boolean;
	/** The session folder, which is also the default chat's folder. */
	readonly folder: string;
	readonly missionControlEnvironment: string;
	/** The default chat first, then peers in catalog order. */
	readonly chats: readonly ILegacyChatFixture[];
}

export interface ILegacySessionFixtureOptions {
	/** Session id; defaults to `fixture`. */
	readonly id?: string;
	/** Create a session that predates runtime identities. */
	readonly historical?: boolean;
	/** Record `agentHost.sessionWorkingDirectories` in the session db; defaults to `true`. */
	readonly sessionWorkingDirectories?: boolean;
}

const PEER_UUIDS: Readonly<Record<string, string>> = {
	'same-folder': '6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b',
	'other-folder': '7a2b3c4d-5e6f-4a7b-9c8d-1e2f3a4b5c6d',
};

/**
 * Creates the description of a session with a default chat, a peer in the
 * session folder that relies on the session db's working directory, and a
 * forked peer pinned to a different folder.
 */
export function createLegacySessionFixture(build: LegacyBuild, options: ILegacySessionFixtureOptions = {}): ILegacySessionFixture {
	const id = options.id ?? 'fixture';
	const historical = options.historical ?? false;
	const session = `copilotcli:/${id}`;
	const runtimeSession = historical ? session : `ahp-session:/${id}`;
	const folder = 'file:///workspace/app';
	const otherFolder = 'file:///workspace/lib';
	const defaultChat = buildDefaultChatUri(session);
	const peer = (name: string): Pick<ILegacyChatFixture, 'name' | 'runtimeUri' | 'uri' | 'storage'> => {
		if (build === '2b' && !historical) {
			const runtimeUri = `ahp-chat:/${PEER_UUIDS[name]}`;
			const uri = storedChatUri(session, runtimeUri, { kind: 'peer' });
			return { name, runtimeUri, uri, storage: uri };
		}
		const uri = buildChatUri(session, name);
		return { name, runtimeUri: buildChatUri(runtimeSession, name), uri, storage: uri };
	};
	return {
		build,
		provider: 'copilotcli',
		runtimeSession,
		session,
		historical,
		recordsSessionWorkingDirectories: options.sessionWorkingDirectories ?? true,
		folder,
		missionControlEnvironment: 'fixture-environment',
		chats: [
			{
				name: 'default', isDefault: true, runtimeUri: buildDefaultChatUri(runtimeSession), uri: defaultChat, storage: session,
				title: 'Fix the login flow', workingDirectories: [folder], pinnedWorkingDirectory: true,
				providerData: 'copilot-sdk-default', isRead: true, draft: 'Default chat draft',
				checkpointTurns: ['default-turn-1', 'default-turn-2'], localTurns: [], failedTurns: ['default-failed-1'],
				changes: { files: 2, additions: 10, deletions: 3 },
			},
			{
				...peer('same-folder'), isDefault: false,
				title: 'Write the tests', workingDirectories: [folder], pinnedWorkingDirectory: false,
				providerData: 'copilot-sdk-same-folder', origin: { kind: ChatOriginKind.User }, isRead: false, draft: 'Peer draft',
				checkpointTurns: ['same-folder-turn-1'], localTurns: ['same-folder-local-1'], failedTurns: ['same-folder-failed-1'],
				changes: { files: 1, additions: 4, deletions: 0 },
			},
			{
				...peer('other-folder'), isDefault: false,
				title: 'Update the library docs', workingDirectories: [otherFolder], pinnedWorkingDirectory: true,
				providerData: 'copilot-sdk-other-folder', origin: { kind: ChatOriginKind.Fork, chat: defaultChat, turnId: 'default-turn-1' }, inheritedTurnId: 'default-turn-1', isRead: true,
				checkpointTurns: ['other-folder-turn-1'], localTurns: [], failedTurns: [],
				changes: { files: 3, additions: 12, deletions: 5 },
			},
		],
	};
}

function defaultChatOf(fixture: ILegacySessionFixture): ILegacyChatFixture {
	return fixture.chats[0];
}

function peersOf(fixture: ILegacySessionFixture): readonly ILegacyChatFixture[] {
	return fixture.chats.slice(1);
}

/** Folder sets other than the session folder, each with its own git and branch-changes state. */
function otherFolderScopes(fixture: ILegacySessionFixture): readonly (readonly string[])[] {
	const scopes = new Map<string, readonly string[]>();
	for (const chat of fixture.chats) {
		if (chat.workingDirectories.length !== 1 || chat.workingDirectories[0] !== fixture.folder) {
			scopes.set(getWorkingDirectoryScopeId(chat.workingDirectories), chat.workingDirectories);
		}
	}
	return [...scopes.values()];
}

function gitState(branchName: string): ISessionGitState {
	return { hasGitRemote: true, hasGitHubRemote: true, branchName, baseBranchName: 'main', upstreamBranchName: `origin/${branchName}`, defaultBranchName: 'main' };
}

function fileDiffs(folder: string, files: number): ISessionFileDiff[] {
	return Array.from({ length: files }, (_, index) => {
		const uri = `${folder}/src/file${index}.ts`;
		return { after: { uri, content: { uri: `${uri}?after` } }, diff: { added: index + 1, removed: index } };
	});
}

function persistedPeerChat(chat: ILegacyChatFixture): IPersistedPeerChat {
	return {
		uri: chat.uri,
		isRead: chat.isRead,
		...(chat.providerData !== undefined ? { providerData: chat.providerData } : {}),
		...(chat.origin !== undefined ? { origin: chat.origin } : {}),
		...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
		...(chat.pinnedWorkingDirectory ? { workingDirectories: chat.workingDirectories } : {}),
	};
}

/** The `peerChats` mirror an older build writes to the session db. */
export function legacyPeerChatsPayload(fixture: ILegacySessionFixture): string {
	return JSON.stringify(peersOf(fixture).map(persistedPeerChat));
}

/** Every session.db metadata value an older build writes for {@link fixture}. */
export function legacySessionMetadata(fixture: ILegacySessionFixture): Record<string, string> {
	const defaultChat = defaultChatOf(fixture);
	const peers = peersOf(fixture);
	const scopes = otherFolderScopes(fixture);
	const changes = (chats: readonly ILegacyChatFixture[]) => chats.reduce((total, chat) => total + (chat.changes.files ?? 0), 0);
	const metadata: Record<string, string> = {
		'configValues': JSON.stringify({ isolation: 'folder', autoApprove: false }),
		'customizationEnablement': JSON.stringify({ disabled: ['file:///workspace/app/.github/prompts/legacy.prompt.md'] }),
		'isRead': 'true',
		'defaultChatIsRead': defaultChat.isRead ? 'true' : '',
		'isArchived': '',
		...(fixture.recordsSessionWorkingDirectories ? { 'agentHost.sessionWorkingDirectories': JSON.stringify([fixture.folder]) } : {}),
		'sessionArtifacts': JSON.stringify([{ kind: 'pullRequest', uri: 'https://github.com/microsoft/vscode/pull/1' }]),
		'agentHost.sourceControl': JSON.stringify({ kind: 'git', rootUri: fixture.folder }),
		'agentHost.pendingRecordedPullRequests': JSON.stringify([]),
		'vscode.scheduleCursors': JSON.stringify({ nightly: 1700000000000 }),
		[`missionControl.sdkSequence.${fixture.missionControlEnvironment}`]: '42',
		[`missionControl.sdkJournalCursor.${fixture.missionControlEnvironment}`]: 'journal-cursor-7',
		'copilot.customizationDirectory': fixture.folder,
		'copilot.sharedCustomizationDirectories': JSON.stringify([fixture.folder]),
		'copilot.project.resolved': 'true',
		'copilot.project.uri': fixture.folder,
		'copilot.project.displayName': 'app',
		'copilot.workingDirectory': fixture.folder,
		'copilot.workingDirectories': JSON.stringify([fixture.folder]),
		'copilot.model': JSON.stringify({ id: 'gpt-5' }),
		'agentHost.git': JSON.stringify(gitState('feature/login')),
		'agentHost.gitData': JSON.stringify(Object.fromEntries(scopes.map(scope => [getWorkingDirectoryScopeId(scope), gitState('feature/docs')]))),
		'agentHost.githubData': JSON.stringify({ [getWorkingDirectoryKey(fixture.folder)]: { owner: 'microsoft', repo: 'vscode', pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'] } satisfies ISessionGitHubState }),
		'agentHost.diffBaseBranch': 'main',
		'agentHost.changes': JSON.stringify(defaultChat.changes),
		'agentHost.changeset.session': JSON.stringify(fileDiffs(fixture.folder, defaultChat.changes.files ?? 0)),
		'agentHost.changeset.branch': JSON.stringify(fileDiffs(fixture.folder, changes(fixture.chats.filter(chat => chat.workingDirectories[0] === fixture.folder)))),
		'customTitle': defaultChat.title,
		'customTitleSource': 'user',
		'peerChats': legacyPeerChatsPayload(fixture),
		'defaultChatProviderData': defaultChat.providerData ?? '',
	};
	for (const scope of scopes) {
		metadata[`agentHost.changeset.branch.${getWorkingDirectoryScopeId(scope)}`] = JSON.stringify(fileDiffs(scope[0], changes(fixture.chats.filter(chat => chat.workingDirectories[0] === scope[0]))));
	}
	for (const chat of fixture.chats) {
		metadata[`customChatTitle:${chat.uri}`] = chat.title;
		metadata[`customChatTitleSource:${chat.uri}`] = 'user';
	}
	for (const peer of peers) {
		metadata[`agentHost.changes:${peer.uri}`] = JSON.stringify(peer.changes);
	}
	return metadata;
}

/** Every metadata value an older build writes to a peer's own database. */
export function legacyPeerMetadata(peer: ILegacyChatFixture): Record<string, string> {
	return {
		'isRead': peer.isRead ? 'true' : '',
		'agentHost.chatProviderData': peer.providerData ?? '',
		'agentHost.chatOrigin': peer.origin === undefined ? '' : JSON.stringify(peer.origin),
		'agentHost.chatInheritedTurnId': peer.inheritedTurnId ?? '',
		'agentHost.chatWorkingDirectories': peer.pinnedWorkingDirectory ? JSON.stringify(peer.workingDirectories) : '',
		...(peer.pinnedWorkingDirectory ? {
			'copilot.workingDirectory': peer.workingDirectories[0],
			'copilot.workingDirectories': JSON.stringify(peer.workingDirectories),
		} : {}),
		'copilot.model': JSON.stringify({ id: 'gpt-5-mini' }),
	};
}

function legacyCatalogData(fixture: ILegacySessionFixture): AgentHostCatalogData {
	const defaultChat = defaultChatOf(fixture);
	return {
		modifiedTime: 2,
		summary: defaultChat.title,
		titleSource: 'user',
		isRead: true,
		isArchived: false,
		workingDirectories: [fixture.folder],
		changes: defaultChat.changes,
		chats: fixture.chats.map((chat, order) => ({
			uri: chat.uri,
			order,
			kind: chat.isDefault ? 'default' : 'peer',
			summary: chat.title,
			titleSource: 'user',
			isRead: chat.isRead,
			changes: chat.changes,
			...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
			...(!chat.isDefault && chat.pinnedWorkingDirectory ? { workingDirectories: chat.workingDirectories } : {}),
		})),
	};
}

const CATALOG_SYNC_GENERATION = 'fixture-generation';

/**
 * Writes {@link fixture} the way an older build leaves it: the session's
 * registration, storage identities, legacy chat catalog and catalog payload in
 * agent-host.db, and the session db and every peer db.
 *
 * Copilot sessions stay on the legacy (v1) chat catalog in every build listed
 * in {@link LegacyBuild}: the compatibility database refuses to normalize
 * provider-native session storage, so `peerChats` is a live mirror.
 */
export async function writeLegacySessionState(sessionData: ISessionDataService, agentHost: AgentHostDatabase, fixture: ILegacySessionFixture): Promise<void> {
	await agentHost.registerRuntimeSession(fixture.session, { provider: fixture.provider, startTime: 1, source: 'explicit' }, { checkTombstone: false });
	if (!fixture.historical) {
		await agentHost.setStorageIdentityMetadata(`sessionStorageIdentity:${fixture.runtimeSession}`, JSON.stringify({ runtime: fixture.runtimeSession, storage: fixture.session, provider: fixture.provider }));
	}
	if (fixture.build === '2b') {
		for (const chat of peersOf(fixture)) {
			if (chat.runtimeUri.startsWith('ahp-chat:')) {
				await agentHost.setStorageIdentityMetadata(`chatStorageIdentity:${chat.runtimeUri}`, JSON.stringify({ runtime: chat.runtimeUri, storage: chat.uri }));
			}
		}
	}

	const encoded = encodeAgentHostCatalogPayload(legacyCatalogData(fixture));
	if (!encoded.ok) {
		throw new Error(`Invalid fixture catalog payload: ${encoded.error}`);
	}
	const snapshot = { sessionGeneration: CATALOG_SYNC_GENERATION, sourceRevision: 1, projectionVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, payloadHash: encoded.value.payloadHash };
	await withDatabase(sessionData, fixture.session, async database => {
		await database.setMetadataValuesAndCatalogSyncSnapshot(legacySessionMetadata(fixture), { ...snapshot, state: 'pending', payload: encoded.value.payload });
		await writeLegacyRows(database, fixture);
	});
	await agentHost.upsertSessionV2({ session: fixture.session, sessionGeneration: CATALOG_SYNC_GENERATION, sourceRevision: 1, payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, verified: true, payload: encoded.value.payload, payloadHash: encoded.value.payloadHash }, undefined);
	await withDatabase(sessionData, fixture.session, database => database.acknowledgeCatalogSyncSnapshot(snapshot));

	const peers = peersOf(fixture);
	for (const peer of peers) {
		await withDatabase(sessionData, peer.storage, database => database.setMetadataValues(legacyPeerMetadata(peer)));
	}
	const replaced = await agentHost.replaceSessionChatCatalog(fixture.session, peers.map((peer, order) => ({
		chat: peer.uri,
		order,
		isRead: peer.isRead,
		...(peer.providerData !== undefined ? { providerData: peer.providerData } : {}),
		...(peer.origin !== undefined ? { origin: JSON.stringify(peer.origin) } : {}),
		...(peer.inheritedTurnId !== undefined ? { inheritedTurnId: peer.inheritedTurnId } : {}),
		...(peer.pinnedWorkingDirectory ? { workingDirectories: peer.workingDirectories } : {}),
	})), undefined);
	if (replaced.status !== 'applied') {
		throw new Error(`Could not write the fixture chat catalog: ${replaced.status}`);
	}
	if (!await agentHost.markSessionChatCatalogLegacyMirrored(fixture.session, replaced.revision, legacyPeerChatsPayload(fixture))) {
		throw new Error('Could not acknowledge the fixture peerChats mirror');
	}
}

/** Chats a {@link normalizeLegacySessionFixture} catalog records beyond the fixture's own. */
export interface INormalizedSessionFixtureChats {
	/** A private subagent chat of the same-folder peer. Never listed for older builds. */
	readonly privateChat: string;
	/** A peer minted by another session and moved in, stored at its own URI. */
	readonly movedInPeer: string;
	/** Another session's default chat moved in as a peer, so stored in that session's database. */
	readonly sessionMovedPeer: { readonly chat: string; readonly storage: string };
}

/**
 * Converts {@link fixture} to a normalized (`chats_v2`) catalog in storage spelling, as builds before
 * the compatibility gate did, adding the chats of {@link INormalizedSessionFixtureChats} (whose ids
 * are derived from the fixture's session) after the fixture's peers.
 */
export async function normalizeLegacySessionFixture(agentHost: AgentHostDatabase, fixture: ILegacySessionFixture): Promise<INormalizedSessionFixtureChats> {
	const source = await agentHost.getSessionV2(fixture.session);
	const catalog = await agentHost.getSessionChatCatalog(fixture.session);
	if (!source || !catalog) {
		throw new Error('The fixture has no catalog to normalize');
	}
	const id = URI.parse(fixture.session).path.slice(1);
	const donor = `copilotcli:/${id}-donor`;
	const extra: INormalizedSessionFixtureChats = {
		privateChat: buildSubagentChatUri(fixture.session, 'tool-call-1'),
		movedInPeer: buildChatUri(donor, 'moved-in'),
		sessionMovedPeer: { chat: buildDefaultChatUri(`copilotcli:/${id}-moved`), storage: `copilotcli:/${id}-moved` },
	};
	const data = legacyCatalogData(fixture);
	const privateOrigin: ChatOrigin = { kind: ChatOriginKind.Tool, chat: peersOf(fixture)[0].uri, toolCallId: 'tool-call-1' };
	const encoded = encodeAgentHostCatalogPayload({
		...data,
		chats: [
			...data.chats.map((chat, index) => {
				const origin = fixture.chats[index].origin;
				return origin ? { ...chat, origin: projectAgentHostCatalogChatOrigin(toSerializableJsonValue(origin)) } : chat;
			}),
			{ uri: extra.movedInPeer, order: data.chats.length, kind: 'peer', isRead: true },
			{ uri: extra.sessionMovedPeer.chat, order: data.chats.length + 1, kind: 'peer', isRead: true },
			{ uri: extra.privateChat, order: data.chats.length + 2, kind: 'peer', interactivity: ChatInteractivity.Hidden, origin: projectAgentHostCatalogChatOrigin(toSerializableJsonValue(privateOrigin)) },
		],
	});
	if (!encoded.ok) {
		throw new Error(`Invalid normalized fixture catalog payload: ${encoded.error}`);
	}
	const upserted = await agentHost.upsertSessionV2({ session: fixture.session, sessionGeneration: source.sessionGeneration, sourceRevision: source.sourceRevision + 1, payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, verified: true, payload: encoded.value.payload, payloadHash: encoded.value.payloadHash }, source.sessionGeneration);
	if (upserted !== 'applied') {
		throw new Error(`Could not write the normalized fixture catalog payload: ${upserted}`);
	}
	const dirty = await agentHost.getSessionV2PayloadDirty(fixture.session);
	if (dirty && !await agentHost.markSessionV2PayloadClean(fixture.session, dirty)) {
		throw new Error('Could not mark the normalized fixture catalog payload clean');
	}
	const legacyPeers = await agentHost.replaceSessionChatCatalog(fixture.session, [
		...catalog.chats,
		{ chat: extra.movedInPeer, order: catalog.chats.length, isRead: true },
		{ chat: extra.sessionMovedPeer.chat, order: catalog.chats.length + 1, isRead: true },
	], catalog.revision);
	if (legacyPeers.status !== 'applied') {
		throw new Error(`Could not add the normalized fixture's peers: ${legacyPeers.status}`);
	}
	const chat = (entry: ILegacyChatFixture, order: number) => ({
		chat: entry.uri,
		order,
		storageResource: entry.storage,
		isRead: entry.isRead,
		...(entry.providerData !== undefined ? { providerData: entry.providerData } : {}),
		...(entry.origin !== undefined ? { origin: JSON.stringify(entry.origin) } : {}),
		...(entry.inheritedTurnId !== undefined ? { inheritedTurnId: entry.inheritedTurnId } : {}),
		...(!entry.isDefault && entry.pinnedWorkingDirectory ? { workingDirectories: entry.workingDirectories } : {}),
		metadata: { summary: entry.title, titleSource: 'user' as const, interactivity: ChatInteractivity.Full, changes: entry.changes },
	});
	const peers = peersOf(fixture);
	const result = await agentHost.ensureChatCatalogV2(fixture.session, {
		sessionGeneration: source.sessionGeneration,
		sourceRevision: source.sourceRevision + 1,
		payloadHash: encoded.value.payloadHash,
		catalogRevision: legacyPeers.revision,
	}, {
		defaultChat: chat(defaultChatOf(fixture), 0),
		peers: [
			...peers.map((peer, index) => chat(peer, index + 1)),
			{ chat: extra.movedInPeer, order: peers.length + 1, storageResource: extra.movedInPeer, isRead: true, metadata: { interactivity: ChatInteractivity.Full } },
			{ chat: extra.sessionMovedPeer.chat, order: peers.length + 2, storageResource: extra.sessionMovedPeer.storage, isRead: true, metadata: { interactivity: ChatInteractivity.Full } },
		],
		privateDescendants: [{
			chat: extra.privateChat,
			storageResource: extra.privateChat,
			parentChat: peers[0].uri,
			origin: JSON.stringify(privateOrigin),
			metadata: { interactivity: ChatInteractivity.Hidden },
		}],
	});
	if (result.status !== 'applied') {
		throw new Error(`Could not normalize the fixture chat catalog: ${result.status}`);
	}
	return extra;
}

/**
 * The peer list 1.141, which does not know normalized catalogs, restores for {@link fixture}'s session, following
 * release/1.141 `AgentHostPeerChatStore.reconcileLegacy`: it reads `session_chats` and the session database's
 * `peerChats`, and takes `peerChats` for its own older edits whenever it differs from the acknowledged payload,
 * merging them over `session_chats` against that payload.
 */
export async function restorePeersAsOldBuild(sessionData: ISessionDataService, agentHost: AgentHostDatabase, fixture: ILegacySessionFixture): Promise<readonly IPersistedPeerChat[]> {
	const sqlite = await (agentHost as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
	const query = (sql: string, parameters: readonly unknown[]) => new Promise<Record<string, unknown>[]>((resolve, reject) => sqlite.all(sql, parameters, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows)));
	const [header] = await query(`SELECT revision, legacy_mirrored_revision, (SELECT value FROM metadata WHERE key = ?) AS payload
		FROM session_chat_catalogs WHERE session_uri = ?`, [`sessionChatCatalogLegacyMirror:${fixture.session}`, fixture.session]);
	const central: IPersistedPeerChat[] = (await query('SELECT * FROM session_chats WHERE session_uri = ? ORDER BY chat_order', [fixture.session])).map(row => ({
		uri: row.chat_uri as string,
		...(row.is_read === null ? {} : { isRead: row.is_read === 1 }),
		...(row.archived === 1 ? { archived: true } : {}),
		...(row.provider_data === null ? {} : { providerData: row.provider_data as string }),
		...(row.origin === null ? {} : { origin: JSON.parse(row.origin as string) }),
		...(row.inherited_turn_id === null ? {} : { inheritedTurnId: row.inherited_turn_id as string }),
	}));
	const raw = await withExistingDatabase(sessionData, fixture.session, database => database.getMetadata('peerChats'));
	const payload = header.payload === null ? undefined : header.payload as string;
	const legacy: IPersistedPeerChat[] | undefined = raw === undefined ? undefined : JSON.parse(raw);
	const base: IPersistedPeerChat[] | undefined = payload === undefined ? undefined : JSON.parse(payload);
	const takesPeerChatsAsEdits = header.legacy_mirrored_revision !== header.revision
		? legacy !== undefined && base !== undefined && raw !== payload && JSON.stringify(legacy) !== JSON.stringify(base)
		: legacy !== undefined && raw !== payload;
	if (!takesPeerChatsAsEdits || !legacy) {
		return central;
	}
	if (!base) {
		return legacy;
	}
	const baseByUri = new Map(base.map(entry => [entry.uri, JSON.stringify(entry)]));
	const merged = legacy.flatMap(entry => !baseByUri.has(entry.uri) || baseByUri.get(entry.uri) !== JSON.stringify(entry)
		? [entry] : central.filter(chat => chat.uri === entry.uri));
	return [...merged, ...central.filter(chat => !baseByUri.has(chat.uri) && !legacy.some(entry => entry.uri === chat.uri))];
}

/**
 * Re-projects {@link fixture}'s catalog payload from its legacy chat list (`session_chats` and each peer's own
 * database), as catalog synchronization does before a legacy catalog can be converted.
 */
export async function reprojectLegacyFixturePayload(sessionData: ISessionDataService, agentHost: AgentHostDatabase, fixture: ILegacySessionFixture): Promise<void> {
	const source = await agentHost.getSessionV2(fixture.session);
	const catalog = await agentHost.getSessionChatCatalog(fixture.session);
	if (!source || !catalog) {
		throw new Error('The fixture has no catalog to re-project');
	}
	const data = legacyCatalogData(fixture);
	const peers = await Promise.all(catalog.chats.map(async (row, index) => {
		const known = fixture.chats.find(chat => chat.uri === row.chat);
		const directories = await withExistingDatabase(sessionData, row.chat, database => database.getMetadata('agentHost.chatWorkingDirectories'));
		return {
			uri: row.chat, order: index + 1, kind: 'peer' as const,
			...(known ? { summary: known.title, titleSource: 'user' as const, changes: known.changes } : {}),
			...(row.isRead !== undefined ? { isRead: row.isRead } : {}),
			...(row.archived ? { archived: true } : {}),
			...(row.origin !== undefined ? { origin: projectAgentHostCatalogChatOrigin(toSerializableJsonValue(JSON.parse(row.origin))) } : {}),
			...(row.inheritedTurnId !== undefined ? { inheritedTurnId: row.inheritedTurnId } : {}),
			...(directories ? { workingDirectories: JSON.parse(directories) } : {}),
		};
	}));
	const encoded = encodeAgentHostCatalogPayload({ ...data, chats: [data.chats[0], ...peers] });
	if (!encoded.ok) {
		throw new Error(`Invalid re-projected fixture catalog payload: ${encoded.error}`);
	}
	const upserted = await agentHost.upsertSessionV2({ session: fixture.session, sessionGeneration: source.sessionGeneration, sourceRevision: source.sourceRevision + 1, payloadVersion: AGENT_HOST_CATALOG_PAYLOAD_VERSION, verified: true, payload: encoded.value.payload, payloadHash: encoded.value.payloadHash }, source.sessionGeneration);
	const dirty = await agentHost.getSessionV2PayloadDirty(fixture.session);
	if (upserted !== 'applied' || dirty && !await agentHost.markSessionV2PayloadClean(fixture.session, dirty)) {
		throw new Error(`Could not re-project the fixture catalog payload: ${upserted}`);
	}
}

/** How an older build without normalized authority writes a session's chat list. */
export type OldBuildChatListWriter =
	/**
	 * 1.141 (release/1.141 `replaceSessionChatCatalog` and peer store): `session_chats` under the header's revision
	 * check, then each changed peer's keys in its own database and `peerChats`, then the acknowledgement of its
	 * own `peerChats` (`legacy_mirrored_revision` and payload). It does not know `chats_v2` or `authority_version`.
	 */
	| 'centralCatalog'
	/**
	 * A build that keeps the list only in the session database's `peerChats` and each peer's own database. No
	 * release does (probe 4a); it stands for an edit read back from a copy whose acknowledgement lags the revision.
	 */
	| 'sessionDatabase';

/**
 * Edits the peer list of {@link fixture}'s session the way an {@link OldBuildChatListWriter} does after a
 * downgrade, in storage spelling. `edit` receives the peers that build reads and returns the peers it writes.
 */
export async function editChatListAsOldBuild(sessionData: ISessionDataService, agentHost: AgentHostDatabase, fixture: Pick<ILegacySessionFixture, 'session'>, writer: OldBuildChatListWriter, edit: (peers: readonly IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
	const sqlite = await (agentHost as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
	const query = (sql: string, parameters: readonly unknown[]) => new Promise<Record<string, unknown>[]>((resolve, reject) => sqlite.all(sql, parameters, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows)));
	const readPeerChats = () => withDatabase(sessionData, fixture.session, database => database.getMetadata('peerChats'));
	let current: IPersistedPeerChat[];
	if (writer === 'centralCatalog') {
		current = [];
		for (const row of await query('SELECT * FROM session_chats WHERE session_uri = ? ORDER BY chat_order', [fixture.session])) {
			const directories = await withExistingDatabase(sessionData, row.chat_uri as string, database => database.getMetadata('agentHost.chatWorkingDirectories'));
			current.push({
				uri: row.chat_uri as string,
				...(row.is_read === null ? {} : { isRead: row.is_read === 1 }),
				...(row.archived === 1 ? { archived: true } : {}),
				...(row.provider_data === null ? {} : { providerData: row.provider_data as string }),
				...(row.origin === null ? {} : { origin: JSON.parse(row.origin as string) }),
				...(row.inherited_turn_id === null ? {} : { inheritedTurnId: row.inherited_turn_id as string }),
				...(directories ? { workingDirectories: JSON.parse(directories) } : {}),
			});
		}
	} else {
		current = JSON.parse(await readPeerChats() ?? '[]');
	}
	const next = edit(current);
	let revision: number | undefined;
	// Serialized with the database's own transactions, as another process's write would be by SQLite's lock.
	const sequencer = (agentHost as unknown as { readonly _transactionSequencer: { queue<T>(task: () => Promise<T>): Promise<T> } })._transactionSequencer;
	if (writer === 'centralCatalog') {
		await sequencer.queue(async () => {
			await query('BEGIN IMMEDIATE', []);
			const [header] = await query('SELECT revision FROM session_chat_catalogs WHERE session_uri = ?', [fixture.session]);
			revision = (header.revision as number) + 1;
			await query('UPDATE session_chat_catalogs SET revision = ? WHERE session_uri = ?', [revision, fixture.session]);
			await query('DELETE FROM session_chats WHERE session_uri = ?', [fixture.session]);
			for (const [order, peer] of next.entries()) {
				await query(`INSERT INTO session_chats (session_uri, chat_uri, chat_order, is_read, archived, provider_data, origin, inherited_turn_id)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [fixture.session, peer.uri, order, peer.isRead === undefined ? null : peer.isRead ? 1 : 0, peer.archived ? 1 : 0,
				peer.providerData ?? null, peer.origin === undefined ? null : JSON.stringify(peer.origin), peer.inheritedTurnId ?? null]);
			}
			await query('COMMIT', []);
		});
	}
	const previous = new Map(current.map(peer => [peer.uri, JSON.stringify(peer)]));
	for (const peer of next.filter(entry => previous.get(entry.uri) !== JSON.stringify(entry))) {
		await withDatabase(sessionData, peer.uri, database => database.setMetadataValues({
			...(peer.isRead !== undefined ? { 'isRead': peer.isRead ? 'true' : '' } : {}),
			'agentHost.chatProviderData': peer.providerData ?? '',
			'agentHost.chatOrigin': peer.origin === undefined ? '' : JSON.stringify(peer.origin),
			'agentHost.chatInheritedTurnId': peer.inheritedTurnId ?? '',
		}));
	}
	const payload = JSON.stringify(next);
	await withDatabase(sessionData, fixture.session, database => database.setMetadata('peerChats', payload));
	if (revision !== undefined) {
		const acknowledged = revision;
		await sequencer.queue(async () => {
			await query('UPDATE session_chat_catalogs SET legacy_mirrored_revision = ? WHERE session_uri = ? AND revision = ?', [acknowledged, fixture.session, acknowledged]);
			await query(`INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [`sessionChatCatalogLegacyMirror:${fixture.session}`, payload]);
		});
	}
}

/**
 * Edits a chat's own state the way 1.140 and 1.141 do after a downgrade, for a peer of a normalized session too
 * (they do not know normalized authority), in storage spelling (probe 4a). A rename writes
 * `customChatTitle:<chat>` and its source into the session database and `customTitle` / `customTitleSource`
 * into the database at the chat's URI; a draft of a peer is written into the session database alone, with no
 * turn row.
 */
export async function editChatStateAsOldBuild(sessionData: ISessionDataService, fixture: Pick<ILegacySessionFixture, 'session'>, chat: string, edit: { readonly title?: string; readonly ownTitle?: string; readonly draft?: string }): Promise<void> {
	if (edit.title !== undefined) {
		await withDatabase(sessionData, fixture.session, database => database.setMetadataValues({ [`customChatTitle:${chat}`]: edit.title!, [`customChatTitleSource:${chat}`]: 'user' }));
		await withDatabase(sessionData, chat, database => database.setMetadataValues({ customTitle: edit.ownTitle ?? edit.title!, customTitleSource: 'user' }));
	}
	if (edit.draft !== undefined) {
		await withDatabase(sessionData, fixture.session, database => database.setChatDraft(URI.parse(chat), { text: edit.draft!, origin: { kind: MessageKind.User } }));
	}
}

/**
 * Records a move of `chat` from session `from` to session `to` (both normalized, storage spelling) the way Block 4
 * leaves it: owned by `to` at its last visible slot, `origin_session_uri` keeping the session it was created in, the
 * source's slots closed up, and both sessions re-projected for older builds.
 */
export async function moveChatAsBlock4(agentHost: AgentHostDatabase, chat: string, from: string, to: string): Promise<void> {
	const sqlite = await (agentHost as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
	const sequencer = (agentHost as unknown as { readonly _transactionSequencer: { queue<T>(task: () => Promise<T>): Promise<T> } })._transactionSequencer;
	const query = (sql: string, parameters: readonly unknown[]) => new Promise<Record<string, unknown>[]>((resolve, reject) => sqlite.all(sql, parameters, (error: Error | null, rows: Record<string, unknown>[]) => error ? reject(error) : resolve(rows)));
	const revisions = await sequencer.queue(async () => {
		await query('BEGIN IMMEDIATE', []);
		const [moved] = await query('SELECT chat_order FROM chats_v2 WHERE chat_uri = ? AND owner_session_uri = ?', [chat, from]);
		await query(`UPDATE chats_v2 SET owner_session_uri = ?, origin_session_uri = COALESCE(origin_session_uri, ?),
			chat_order = (SELECT COALESCE(MAX(chat_order), -1) + 1 FROM chats_v2 WHERE owner_session_uri = ? AND tombstoned = 0) WHERE chat_uri = ?`, [to, from, to, chat]);
		await query('UPDATE chats_v2 SET chat_order = chat_order + 1000 WHERE owner_session_uri = ? AND chat_order > ? AND tombstoned = 0', [from, moved.chat_order]);
		await query('UPDATE chats_v2 SET chat_order = chat_order - 1001 WHERE owner_session_uri = ? AND chat_order >= 1000 AND tombstoned = 0', [from]);
		const rows = await query('SELECT session_uri, revision FROM session_chat_catalogs WHERE session_uri IN (?, ?)', [from, to]);
		await query('COMMIT', []);
		return rows;
	});
	for (const row of revisions) {
		if (!await agentHost.reprojectOlderBuildChatList(row.session_uri as string, row.revision as number)) {
			throw new Error(`Could not re-project ${row.session_uri} after moving ${chat}`);
		}
	}
}

async function writeLegacyRows(database: ISessionDatabase, fixture: ILegacySessionFixture): Promise<void> {
	let seq = 0;
	for (const chat of fixture.chats) {
		const chatUri = URI.parse(chat.uri);
		if (chat.draft !== undefined) {
			await database.setChatDraft(chatUri, { text: chat.draft, origin: { kind: MessageKind.User } });
		}
		for (const [index, turnId] of chat.checkpointTurns.entries()) {
			await database.createTurn(turnId);
			if (chat.isDefault) {
				await database.setTurnEventId(turnId, `event-${turnId}`);
			}
			await database.setTurnCheckpointRef(turnId, `refs/agents/${URI.parse(fixture.session).path.slice(1)}/checkpoints/turn/${seq + index + 1}`);
		}
		seq += chat.checkpointTurns.length;
		const anchorTurnId = chat.checkpointTurns.at(-1);
		for (const [kind, turnIds] of [['local', chat.localTurns], ['failed', chat.failedTurns]] as const) {
			for (const turnId of turnIds) {
				await database.insertPersistedTurn({ kind, turnId, chatUri: chat.uri, anchorTurnId, payload: JSON.stringify({ id: turnId }) });
			}
		}
	}
}

/** Session-level session.db keys every {@link LegacyBuild} reads (see the Block 3a mirror matrix). */
export const OLD_BUILD_SESSION_KEYS: readonly string[] = [
	'configValues', 'customizationEnablement', 'isArchived', 'isDone', 'isRead', 'defaultChatIsRead',
	'agentHost.autoArchivedAt', 'agentHost.workspaceless', 'agentHost.workspaceConversionQuarantined', 'agentHost.createdBySession',
	'agentHost.ehcliAdopted', 'agentHost.ehcliLastMigratedTurn', 'agentHost.sessionWorkingDirectories', 'agentHost.additionalWorktrees',
	'copilot.worktree.branchName', 'copilot.worktree.path', 'copilot.worktree.repositoryRoot', 'copilot.worktree.symlinkPatterns',
	'copilot.worktree.symlinkSourceRoot', 'copilot.worktree.creationFailure',
	'sessionArtifacts', 'agentHost.sourceControl', 'agentHost.pendingRecordedPullRequests', 'vscode.scheduleCursors',
	'missionControl.sdkSequence.fixture-environment', 'missionControl.sdkJournalCursor.fixture-environment',
	'copilot.customizationDirectory', 'copilot.sharedCustomizationDirectories', 'copilot.project.uri', 'copilot.project.displayName', 'copilot.project.resolved',
	'copilot.workingDirectory', 'copilot.workingDirectories', 'copilot.model', 'copilot.agent', 'copilot.chats',
	'agentHost.git', 'agentHost.github', 'agentHost.gitData', 'agentHost.githubData', 'agentHost.diffBaseBranch',
	'agentHost.changes', 'agentHost.changeset.session', 'agentHost.changeset.branch', 'diffs',
	'customTitle', 'customTitleSource', 'peerChats', 'defaultChatProviderData',
];

/** Keys every {@link LegacyBuild} reads from a peer's own database. */
export const OLD_BUILD_PEER_KEYS: readonly string[] = [
	'isRead', 'agentHost.chatProviderData', 'agentHost.chatOrigin', 'agentHost.chatInheritedTurnId', 'agentHost.chatWorkingDirectories',
	'copilot.workingDirectory', 'copilot.workingDirectories', 'copilot.model', 'copilot.agent',
];

/** Session.db keys an older build derives from the session's chats, folders and environment. */
function oldBuildDerivedSessionKeys(fixture: ILegacySessionFixture): string[] {
	return [
		...fixture.chats.flatMap(chat => [`customChatTitle:${chat.uri}`, `customChatTitleSource:${chat.uri}`, `agentHost.changes:${chat.uri}`]),
		...otherFolderScopes(fixture).map(scope => `agentHost.changeset.branch.${getWorkingDirectoryScopeId(scope)}`),
	];
}

/** What an older build reads for one session. Absent metadata keys are omitted. */
export interface IOldBuildSessionView {
	readonly sessionDb: Readonly<Record<string, string>>;
	readonly peerDbs: Readonly<Record<string, Readonly<Record<string, string>>>>;
	/** Draft text per chat, read from the session db. */
	readonly drafts: Readonly<Record<string, string | undefined>>;
	/** Local and failed turns of every chat, read from the session db. */
	readonly persistedTurns: readonly { readonly kind: 'local' | 'failed'; readonly turnId: string; readonly chatUri: string; readonly anchorTurnId: string | undefined }[];
	/** Checkpoint ref per turn of every chat, read from the session db. */
	readonly checkpointRefs: Readonly<Record<string, string | undefined>>;
	readonly agentHost: {
		readonly provider: string | undefined;
		readonly chatCatalog: { readonly revision: number; readonly legacyMirroredRevision: number; readonly chats: readonly IAgentHostDatabaseOwnedSessionChat[] } | undefined;
		readonly catalogPayload: AgentHostCatalogData | undefined;
		readonly sessionStorageIdentities: readonly { readonly key: string; readonly value: string }[];
		readonly chatStorageIdentities: readonly IChatStorageIdentityRecord[];
	};
}

interface IChatStorageIdentityRecord {
	readonly runtime: string;
	readonly storage: string;
}

/**
 * Reads exactly what an older build reads for {@link fixture}: the session-level
 * and derived keys and the per-chat rows from the session db, each peer's own
 * keys, and the session's agent-host.db rows. The session's chats, folders and
 * environment come from the fixture, as an older build knows them from its catalog.
 */
export async function readOldBuildView(sessionData: ISessionDataService, agentHost: AgentHostDatabase, fixture: ILegacySessionFixture): Promise<IOldBuildSessionView> {
	const sessionDb = await withExistingDatabase(sessionData, fixture.session, async database => {
		const keys = [...OLD_BUILD_SESSION_KEYS, ...oldBuildDerivedSessionKeys(fixture)];
		const drafts: Record<string, string | undefined> = {};
		const checkpointRefs: Record<string, string | undefined> = {};
		for (const chat of fixture.chats) {
			drafts[chat.uri] = (await database.getChatDraft(URI.parse(chat.uri)))?.text;
			for (const turnId of chat.checkpointTurns) {
				checkpointRefs[turnId] = await database.getTurnCheckpointRef(turnId);
			}
		}
		return {
			metadata: await readMetadata(database, keys),
			drafts,
			checkpointRefs,
			persistedTurns: (await database.getPersistedTurns()).map(({ kind, turnId, chatUri, anchorTurnId }) => ({ kind, turnId, chatUri, anchorTurnId })),
		};
	});
	const peerDbs: Record<string, Record<string, string>> = {};
	for (const peer of peersOf(fixture)) {
		peerDbs[peer.uri] = await withExistingDatabase(sessionData, peer.storage, database => readMetadata(database, OLD_BUILD_PEER_KEYS)) ?? {};
	}
	const catalog = await agentHost.getSessionChatCatalog(fixture.session);
	const payload = await agentHost.getSessionV2(fixture.session);
	const decoded = payload ? decodeAgentHostCatalogPayload(payload.payload) : undefined;
	return {
		sessionDb: sessionDb?.metadata ?? {},
		peerDbs,
		drafts: sessionDb?.drafts ?? {},
		persistedTurns: sessionDb?.persistedTurns ?? [],
		checkpointRefs: sessionDb?.checkpointRefs ?? {},
		agentHost: {
			provider: (await agentHost.getSessionV2Registration(fixture.session))?.provider,
			chatCatalog: catalog ? { revision: catalog.revision, legacyMirroredRevision: catalog.legacyMirroredRevision, chats: catalog.chats } : undefined,
			catalogPayload: decoded?.ok ? decoded.value.data : undefined,
			sessionStorageIdentities: await agentHost.readStorageIdentityMetadata('sessionStorageIdentity:'),
			chatStorageIdentities: JSON.parse(await agentHost.readStorageIdentityValues('chatStorageIdentity:')) as IChatStorageIdentityRecord[],
		},
	};
}

async function readMetadata(database: ISessionDatabase, keys: readonly string[]): Promise<Record<string, string>> {
	const values = await database.getMetadataObject(Object.fromEntries(keys.map(key => [key, true])));
	const result: Record<string, string> = {};
	for (const key of [...keys].sort()) {
		const value = values[key];
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return result;
}

async function withDatabase<T>(sessionData: ISessionDataService, resource: string, callback: (database: ISessionDatabase) => Promise<T>): Promise<T> {
	const reference = sessionData.openDatabase(URI.parse(resource));
	try {
		return await callback(reference.object);
	} finally {
		reference.dispose();
	}
}

async function withExistingDatabase<T>(sessionData: ISessionDataService, resource: string, callback: (database: ISessionDatabase) => Promise<T>): Promise<T | undefined> {
	const reference = await sessionData.tryOpenDatabase(URI.parse(resource));
	if (!reference) {
		return undefined;
	}
	try {
		return await callback(reference.object);
	} finally {
		reference.dispose();
	}
}

/**
 * A session data service whose databases are real in-memory
 * {@link SessionDatabase}s, one per storage resource. They stay open until the
 * service is disposed, so state written by one "build" is visible to the next.
 */
export class InMemorySessionDataService extends Disposable {
	private readonly _databases = new Map<string, SessionDatabase>();

	/**
	 * Returns a service view over the same databases. Without an `identity` it
	 * is what an older build sees: storage spelling only. With one, it maps
	 * runtime resources and translates owned metadata like today's
	 * `SessionDataService`.
	 */
	createService(identity?: SessionStorageIdentity): ISessionDataService {
		const key = (resource: URI) => identity ? identity.toStorage(resource.toString()) : resource.toString();
		// The databases outlive every reference, so neither the reference nor the translating wrapper closes them.
		const reference = (database: SessionDatabase): IReference<ISessionDatabase> => ({ object: identity ? new CompatibleSessionDatabase(database, identity) : database, dispose: () => { } });
		return {
			...createSessionDataService(),
			openDatabase: resource => reference(this.database(key(resource))),
			tryOpenDatabase: async resource => {
				const database = this._databases.get(key(resource));
				return database ? reference(database) : undefined;
			},
		};
	}

	/** Deletes the database of a storage resource, as deleting its data directory does. */
	remove(storage: string): void {
		this._databases.get(storage)?.dispose();
		this._databases.delete(storage);
	}

	/** Storage resources that have a database, sorted. */
	get resources(): readonly string[] {
		return [...this._databases.keys()].sort();
	}

	private database(storage: string): SessionDatabase {
		let database = this._databases.get(storage);
		if (!database) {
			database = this._register(new SessionDatabase(':memory:'));
			this._databases.set(storage, database);
		}
		return database;
	}
}
