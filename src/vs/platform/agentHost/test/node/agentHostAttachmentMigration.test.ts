/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { SESSION_ATTACHMENTS_DIRNAME } from '../../common/sessionDataService.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind, MessageAttachmentKind, MessageKind, SessionStatus, TurnState, type Turn } from '../../common/state/sessionState.js';
import { ATTACHMENT_COPY_FILES_PER_STEP, AgentHostAttachmentMigration } from '../../node/agentHostAttachmentMigration.js';
import type { IAgentHostChatAttachmentCopy, IAgentHostDatabase } from '../../node/agentHostDatabase.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';

suite('AgentHostAttachmentMigration', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionDataService = createNullSessionDataService();
	const attachmentsOf = (resource: string) => joinPath(sessionDataService.getSessionDataDir(URI.parse(resource)), SESSION_ATTACHMENTS_DIRNAME);

	function setup(recorded: ReadonlyMap<string, IAgentHostChatAttachmentCopy> = new Map(), deleted: ReadonlySet<string> = new Set(), onRecord?: (chat: string) => void) {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const chatOwnership = createTestChatOwnershipService(stateManager);
		const records = new Map(recorded);
		const database = upcastPartial<IAgentHostDatabase>({
			readChatAttachmentCopies: async () => new Map(records),
			writeChatAttachmentCopy: async (chat, copy) => {
				if (deleted.has(chat)) {
					return false;
				}
				records.set(chat, copy);
				onRecord?.(chat);
				return true;
			},
		});
		const completed: string[] = [];
		const migration = disposables.add(new AgentHostAttachmentMigration(database, stateManager, chatOwnership, fileService, sessionDataService, new NullLogService(), async origin => { completed.push(origin); }));
		return { fileService, stateManager, records, completed, migration };
	}

	function summary(resource: string) {
		return {
			resource, defaultChat: buildDefaultChatUri(resource), provider: 'copilot', title: 'Session', status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(), modifiedAt: new Date(0).toISOString(),
		};
	}

	test('copies the files a moved chat and its subagent attached in their origin, never another chat\'s, and reads them from there', async () => {
		const { fileService, stateManager, records, completed, migration } = setup();
		const source = 'copilot:/attachments-source';
		const target = 'copilot:/attachments-target';
		stateManager.createSession(summary(source));
		stateManager.createSession(summary(target));
		const peer = buildChatUri(source, 'peer');
		const subagent = buildChatUri(source, 'subagent');
		const files = { peer: 'one/screen.png', subagent: 'two/log.txt', other: 'three/other.txt' };
		for (const path of Object.values(files)) {
			await fileService.writeFile(joinPath(attachmentsOf(source), ...path.split('/')), VSBuffer.fromString(path));
		}
		const attaching = (path: string): Turn => ({
			id: 'turn',
			message: { text: 'See', origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: joinPath(attachmentsOf(source), ...path.split('/')).toString(), label: path }] },
			responseParts: [], usage: undefined, state: TurnState.Complete,
		});
		stateManager.addChat(source, peer, peer, { turns: [attaching(files.peer)] });
		stateManager.addChat(source, subagent, subagent, { origin: { kind: ChatOriginKind.Tool, chat: peer, toolCallId: 'call' }, turns: [attaching(files.subagent)] });
		stateManager.transferChats(source, target, [peer, subagent], undefined);

		migration.schedule([peer, subagent]);
		await migration.whenIdle();
		const copied = await Promise.all([[peer, files.peer], [subagent, files.subagent], [peer, files.other]].map(([chat, path]) => fileService.exists(joinPath(attachmentsOf(chat), ...path.split('/')))));

		assert.deepStrictEqual({
			copied,
			records: [...records],
			completed,
			fallback: migration.resolveFallback(joinPath(attachmentsOf(source), 'one', 'screen.png'))?.toString(),
		}, {
			copied: [true, true, false],
			records: [
				[peer, { origin: source, storage: peer, copied: [files.peer], complete: true }],
				[subagent, { origin: source, storage: subagent, copied: [files.subagent], complete: true }],
			],
			completed: [source, source],
			fallback: joinPath(attachmentsOf(peer), 'one', 'screen.png').toString(),
		});
	});

	test('stops copying for a chat deleted while its copy runs, records nothing and reports no completion', async () => {
		const source = 'copilot:/deleted-source';
		const target = 'copilot:/deleted-target';
		const peer = buildChatUri(source, 'peer');
		const { fileService, stateManager, records, completed, migration } = setup(undefined, new Set([peer]));
		stateManager.createSession(summary(source));
		stateManager.createSession(summary(target));
		// Two steps' worth of files.
		const paths = Array.from({ length: ATTACHMENT_COPY_FILES_PER_STEP + 2 }, (_, index) => `file${index}/note.txt`);
		for (const path of paths) {
			await fileService.writeFile(joinPath(attachmentsOf(source), ...path.split('/')), VSBuffer.fromString(path));
		}
		stateManager.addChat(source, peer, peer, {
			turns: [{
				id: 'turn',
				message: { text: 'See', origin: { kind: MessageKind.User }, attachments: paths.map(path => ({ type: MessageAttachmentKind.Resource, uri: joinPath(attachmentsOf(source), ...path.split('/')).toString(), label: path })) },
				responseParts: [], usage: undefined, state: TurnState.Complete,
			}],
		});
		stateManager.transferChats(source, target, [peer], undefined);

		migration.schedule([peer]);
		await migration.whenIdle();
		const copied = await Promise.all(paths.map(path => fileService.exists(joinPath(attachmentsOf(peer), ...path.split('/')))));

		assert.deepStrictEqual({
			copiedFiles: copied.filter(Boolean).length,
			records: [...records],
			completed,
			fallback: migration.resolveFallback(joinPath(attachmentsOf(source), ...paths[0].split('/'))),
		}, {
			// The first step ran before its record was refused; nothing after it.
			copiedFiles: ATTACHMENT_COPY_FILES_PER_STEP,
			records: [],
			completed: [],
			fallback: undefined,
		});
	});

	test('resumes the copy of a chat unloaded while its copy runs once it is restored', async () => {
		const source = 'copilot:/unloaded-source';
		const target = 'copilot:/unloaded-target';
		const peer = buildChatUri(source, 'peer');
		const paths = Array.from({ length: ATTACHMENT_COPY_FILES_PER_STEP + 2 }, (_, index) => `file${index}/note.txt`);
		const turns: Turn[] = [{
			id: 'turn',
			message: { text: 'See', origin: { kind: MessageKind.User }, attachments: paths.map(path => ({ type: MessageAttachmentKind.Resource, uri: joinPath(attachmentsOf(source), ...path.split('/')).toString(), label: path })) },
			responseParts: [], usage: undefined, state: TurnState.Complete,
		}];
		let unload: (() => void) | undefined;
		const { fileService, stateManager, records, completed, migration } = setup(undefined, undefined, () => {
			unload?.();
			unload = undefined;
		});
		stateManager.createSession(summary(source));
		stateManager.createSession(summary(target));
		for (const path of paths) {
			await fileService.writeFile(joinPath(attachmentsOf(source), ...path.split('/')), VSBuffer.fromString(path));
		}
		stateManager.addChat(source, peer, peer, { turns });
		stateManager.transferChats(source, target, [peer], undefined);
		// Its session is unloaded right after the first step was recorded.
		unload = () => stateManager.removeSession(target);

		migration.schedule([peer]);
		await migration.whenIdle();
		const whileUnloaded = { ...records.get(peer)!, copied: records.get(peer)!.copied.length };
		stateManager.createSession(summary(target));
		stateManager.addChat(target, peer, peer, { turns });
		await migration.whenIdle();

		assert.deepStrictEqual({ whileUnloaded, restored: { ...records.get(peer)!, copied: records.get(peer)!.copied.length }, completed }, {
			whileUnloaded: { origin: source, storage: peer, copied: ATTACHMENT_COPY_FILES_PER_STEP, complete: false },
			restored: { origin: source, storage: peer, copied: paths.length, complete: true },
			completed: [source],
		});
	});

	test('reads the copies recorded before a restart, also a partial one', async () => {
		const source = 'copilot:/recorded-source';
		const peer = buildChatUri(source, 'peer');
		const { migration } = setup(new Map([[peer, { origin: source, storage: peer, copied: ['one/screen.png'], complete: false }]]));
		await migration.whenIdle();
		await migration.resume([]);

		assert.deepStrictEqual({
			copied: migration.resolveFallback(joinPath(attachmentsOf(source), 'one', 'screen.png'))?.toString(),
			notCopied: migration.resolveFallback(joinPath(attachmentsOf(source), 'two', 'log.txt')),
		}, {
			copied: joinPath(attachmentsOf(peer), 'one', 'screen.png').toString(),
			notCopied: undefined,
		});
	});
});
