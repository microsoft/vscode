/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChat, ISession, SessionStatus } from '../../../sessions/common/session.js';
import { ISessionsManagementService } from '../../../sessions/common/sessionsManagement.js';
import { ThreadAvatarIds, ThreadsService } from '../../browser/threadsService.js';

function session(id: string): ISession {
	const owner = {};
	const chat = { resource: URI.parse(`test-chat:/${id}`) } as IChat;
	return {
		sessionId: id,
		resource: URI.parse(`test-session:/${id}`),
		providerId: 'local-agent-host',
		sessionType: 'copilot',
		harness: 'copilot',
		environment: 'local',
		application: constObservable({ id: 'vscode', label: 'VS Code' }),
		icon: Codicon.account,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: observableValue(owner, id),
		updatedAt: observableValue(owner, new Date()),
		status: observableValue(owner, SessionStatus.Completed),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable([chat]),
		mainChat: constObservable(chat),
		capabilities: constObservable({ supportsMultipleChats: false }),
	};
}

suite('ThreadsService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('persists lifecycle state and follows draft replacement', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const replaced = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const draftReplaced = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const deleted = disposables.add(new Emitter<ISession>());
		const sessions = new Map<string, ISession>();
		const renamed: string[] = [];
		const removed: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidReplaceSession = replaced.event;
			override readonly onDidReplaceNewDraftSession = draftReplaced.event;
			override readonly onDidDeleteSession = deleted.event;
			override getSession(resource: URI): ISession | undefined {
				return [...sessions.values()].find(candidate => candidate.resource.toString() === resource.toString());
			}
			override async renameSession(target: ISession, title: string): Promise<void> {
				renamed.push(`${target.sessionId}:${title}`);
			}
			override async deleteSession(target: ISession): Promise<void> {
				removed.push(target.sessionId);
			}
		}());
		const service = disposables.add(instantiationService.createInstance(ThreadsService));
		const draft = session('draft');
		const created = service.createThread({
			name: 'Design partner',
			session: draft,
			sessionTypeId: 'copilot',
			scope: { kind: 'global' },
			avatar: ThreadAvatarIds.Artist,
			connectorIds: ['github'],
		});
		sessions.set(draft.sessionId, draft);
		service.addAutomation(created.id, 'automation-1');
		service.setAvatar(created.id, ThreadAvatarIds.Crown);
		service.setArchived(created.id, true);
		const replacement = session('running');
		draftReplaced.fire({ from: draft, to: replacement });
		sessions.delete(draft.sessionId);
		sessions.set(replacement.sessionId, replacement);
		await service.renameThread(created.id, 'Product partner');
		const restored = disposables.add(instantiationService.createInstance(ThreadsService));
		const persisted = restored.getThread(created.id);

		await service.deleteThread(created.id);

		assert.deepStrictEqual({
			persisted: persisted && {
				name: persisted.name,
				sessionId: persisted.sessionId,
				resource: persisted.sessionResource.toString(),
				avatar: persisted.avatar,
				connectors: persisted.connectorIds,
				automations: persisted.automationIds,
				archived: persisted.archived,
			},
			renamed,
			removed,
			remaining: service.threads.get().length,
		}, {
			persisted: {
				name: 'Product partner',
				sessionId: 'running',
				resource: 'test-session:/running',
				avatar: ThreadAvatarIds.Crown,
				connectors: ['github'],
				automations: ['automation-1'],
				archived: true,
			},
			renamed: ['running:Product partner'],
			removed: ['running'],
			remaining: 0,
		});
	});
});
