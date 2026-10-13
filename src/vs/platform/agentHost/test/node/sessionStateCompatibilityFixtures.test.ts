/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostPeerChatStore } from '../../node/agentHostPeerChatStore.js';
import { CompatibleAgentHostDatabase } from '../../node/compatibleAgentHostDatabase.js';
import { createLiveChatOwnership } from './chatOwnershipTestUtils.js';
import { createLegacySessionFixture, InMemorySessionDataService, LEGACY_BUILDS, legacyPeerMetadata, legacySessionMetadata, readOldBuildView, writeLegacySessionState, type ILegacySessionFixture } from './sessionStateCompatibilityFixtures.js';

suite('Session state compatibility fixtures', () => {
	const store = new DisposableStore();
	let directory: string;

	setup(async () => directory = await mkdtemp(join(tmpdir(), 'ah-session-state-compat-')));
	teardown(async () => {
		store.clear();
		await rm(directory, { recursive: true, force: true });
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	async function writeOldBuild(fixture: ILegacySessionFixture, sessionData: InMemorySessionDataService): Promise<void> {
		const oldBuild = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
		await writeLegacySessionState(sessionData.createService(), oldBuild, fixture);
		await oldBuild.close();
	}

	for (const build of LEGACY_BUILDS) {
		test(`${build}: an old build reads back the state it wrote`, async () => {
			const fixture = createLegacySessionFixture(build);
			const sessionData = store.add(new InMemorySessionDataService());
			await writeOldBuild(fixture, sessionData);
			const oldBuild = store.add(new AgentHostDatabase(join(directory, 'agent-host.db')));
			const view = await readOldBuildView(sessionData.createService(), oldBuild, fixture);
			const [defaultChat, sameFolder, otherFolder] = fixture.chats;

			assert.deepStrictEqual({
				...view,
				agentHost: {
					...view.agentHost,
					chatCatalog: view.agentHost.chatCatalog && { ...view.agentHost.chatCatalog, chats: view.agentHost.chatCatalog.chats.map(chat => chat.chat) },
					catalogPayload: view.agentHost.catalogPayload?.chats.map(chat => [chat.uri, chat.kind]),
				},
			}, {
				sessionDb: legacySessionMetadata(fixture),
				peerDbs: { [sameFolder.uri]: legacyPeerMetadata(sameFolder), [otherFolder.uri]: legacyPeerMetadata(otherFolder) },
				drafts: { [defaultChat.uri]: 'Default chat draft', [sameFolder.uri]: 'Peer draft', [otherFolder.uri]: undefined },
				persistedTurns: [
					{ kind: 'failed', turnId: 'default-failed-1', chatUri: defaultChat.uri, anchorTurnId: 'default-turn-2' },
					{ kind: 'local', turnId: 'same-folder-local-1', chatUri: sameFolder.uri, anchorTurnId: 'same-folder-turn-1' },
					{ kind: 'failed', turnId: 'same-folder-failed-1', chatUri: sameFolder.uri, anchorTurnId: 'same-folder-turn-1' },
				],
				checkpointRefs: {
					'default-turn-1': 'refs/agents/fixture/checkpoints/turn/1',
					'default-turn-2': 'refs/agents/fixture/checkpoints/turn/2',
					'same-folder-turn-1': 'refs/agents/fixture/checkpoints/turn/3',
					'other-folder-turn-1': 'refs/agents/fixture/checkpoints/turn/4',
				},
				agentHost: {
					provider: 'copilotcli',
					chatCatalog: { revision: 1, legacyMirroredRevision: 1, chats: [sameFolder.uri, otherFolder.uri] },
					catalogPayload: [[defaultChat.uri, 'default'], [sameFolder.uri, 'peer'], [otherFolder.uri, 'peer']],
					sessionStorageIdentities: [{ key: 'sessionStorageIdentity:ahp-session:/fixture', value: JSON.stringify({ runtime: 'ahp-session:/fixture', storage: 'copilotcli:/fixture', provider: 'copilotcli' }) }],
					chatStorageIdentities: build === '2b' ? [
						{ runtime: sameFolder.runtimeUri, storage: sameFolder.uri },
						{ runtime: otherFolder.runtimeUri, storage: otherFolder.uri },
					] : [],
				},
			});
		});
	}

	for (const [build, historical] of [['1.143', false], ['2b', false], ['2b', true]] as const) {
		test(`${build}${historical ? ' historical session' : ''}: today's build reads the old build's state in runtime spelling`, async () => {
			const fixture = createLegacySessionFixture(build, { historical });
			const sessionData = store.add(new InMemorySessionDataService());
			await writeOldBuild(fixture, sessionData);

			const today = store.add(new CompatibleAgentHostDatabase(join(directory, 'agent-host.db')));
			await today.initialize();
			const service = sessionData.createService(today.identity);
			const peers = new AgentHostPeerChatStore(today, service, new NullLogService(), createLiveChatOwnership(() => undefined, () => undefined));
			const session = URI.parse(fixture.runtimeSession);
			const drafts: Record<string, string | undefined> = {};
			for (const chat of fixture.chats) {
				const reference = service.openDatabase(URI.parse(chat.isDefault ? fixture.runtimeSession : chat.runtimeUri));
				drafts[chat.runtimeUri] = (await reference.object.getChatDraft(URI.parse(chat.runtimeUri)))?.text;
				reference.dispose();
			}
			const [defaultChat, sameFolder, otherFolder] = fixture.chats;

			assert.deepStrictEqual({
				sessions: (await today.listSessionV2Registrations()).map(entry => entry.session),
				peers: (await peers.reconcileLegacy(session))?.map(entry => ({ uri: entry.uri, workingDirectories: entry.workingDirectories, providerData: entry.providerData })),
				drafts,
				databases: sessionData.resources,
			}, {
				sessions: [fixture.runtimeSession],
				peers: [
					{ uri: sameFolder.runtimeUri, workingDirectories: undefined, providerData: 'copilot-sdk-same-folder' },
					{ uri: otherFolder.runtimeUri, workingDirectories: ['file:///workspace/lib'], providerData: 'copilot-sdk-other-folder' },
				],
				// Older builds keep every chat's draft in the session db, so only the default chat's own database has one.
				drafts: { [defaultChat.runtimeUri]: 'Default chat draft', [sameFolder.runtimeUri]: undefined, [otherFolder.runtimeUri]: undefined },
				databases: [fixture.session, sameFolder.uri, otherFolder.uri].sort(),
			});
		});
	}
});
