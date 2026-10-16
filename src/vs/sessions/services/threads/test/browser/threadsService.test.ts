/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChat, ISession, SessionStatus } from '../../../sessions/common/session.js';
import { ISessionsManagementService } from '../../../sessions/common/sessionsManagement.js';
import { LOCAL_THREAD_HOST_ID, ThreadAvatarIds, ThreadsService } from '../../browser/threadsService.js';

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
	const stubConnections = (instantiationService: TestInstantiationService, resolve: (resource: URI) => URI | undefined = () => undefined) => {
		instantiationService.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
			override readonly onDidChangeSessionResolution = Event.None;
			override resolveSessionResourceIdentity(resource: URI) {
				const backendSession = resolve(resource);
				return backendSession ? { connectionAuthority: 'test', backendSession } : undefined;
			}
		}());
	};

	test('restores records archived by the initial Threads prototype', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.threads', JSON.stringify([{
			id: 'thread-1',
			name: 'Design partner',
			sessionId: 'session-1',
			sessionResource: 'test-session:/session-1',
			providerId: 'local-agent-host',
			sessionTypeId: 'copilot',
			scope: { kind: 'global' },
			avatar: ThreadAvatarIds.Artist,
			connectorIds: [],
			automationIds: [],
			archived: true,
			createdAt: 1,
			updatedAt: 1,
		}]), StorageScope.PROFILE, StorageTarget.USER);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		stubConnections(instantiationService);
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidReplaceSession = Event.None;
			override readonly onDidReplaceNewDraftSession = Event.None;
			override readonly onDidDeleteSession = Event.None;
		}());
		const service = disposables.add(instantiationService.createInstance(ThreadsService));

		assert.deepStrictEqual(service.threads.get().map(thread => ({
			id: thread.id,
			name: thread.name,
			resource: thread.sessionResource.toString(),
			routingResource: thread.routingResource.toString(),
			materialized: thread.materialized,
			scope: thread.scope,
			participants: thread.participants,
			primaryParticipantId: thread.primaryParticipantId,
			keys: Object.keys(thread).sort(),
		})), [{
			id: 'thread-1',
			name: 'Design partner',
			resource: 'test-session:/session-1',
			routingResource: 'test-session:/session-1',
			materialized: true,
			scope: { kind: 'global', hostId: LOCAL_THREAD_HOST_ID },
			participants: [{ id: 'default', name: 'Default Agent' }],
			primaryParticipantId: 'default',
			keys: ['automationIds', 'avatar', 'connectorIds', 'createdAt', 'id', 'materialized', 'name', 'participants', 'primaryParticipantId', 'providerId', 'routingResource', 'schemaVersion', 'scope', 'sessionId', 'sessionResource', 'sessionTypeId', 'updatedAt'],
		}]);
	});

	test('recovers an unmaterialized version-two draft when its session is absent', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.threads', JSON.stringify([{
			schemaVersion: 2,
			id: 'draft-thread',
			name: 'Remote helper',
			sessionId: 'missing-draft',
			sessionResource: 'remote-agent:/missing-draft',
			providerId: 'remote-agent',
			sessionTypeId: 'copilot',
			scope: { kind: 'global', hostId: 'devbox-1' },
			participants: [{ id: 'default', name: 'Default Agent' }],
			primaryParticipantId: 'default',
			avatar: ThreadAvatarIds.None,
			connectorIds: [],
			automationIds: [],
			createdAt: 1,
			updatedAt: 1,
		}]), StorageScope.PROFILE, StorageTarget.USER);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		stubConnections(instantiationService);
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidReplaceSession = Event.None;
			override readonly onDidReplaceNewDraftSession = Event.None;
			override readonly onDidDeleteSession = Event.None;
			override getSession(): ISession | undefined { return undefined; }
		}());
		const service = disposables.add(instantiationService.createInstance(ThreadsService));

		assert.strictEqual(service.getThread('draft-thread')?.materialized, false);
	});

	test('migrates a remote frontend resource to its host-native routing identity', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.threads', JSON.stringify([{
			schemaVersion: 2,
			id: 'remote-thread',
			name: 'VS Code work hub',
			sessionId: 'remote-draft',
			sessionResource: 'remote-tunnel__devbox-copilotcli:/40da8bd4-7fa9-44bd-aac9-0b19336e6d2e',
			materialized: true,
			providerId: 'agenthost-tunnel__devbox',
			sessionTypeId: 'copilotcli',
			scope: { kind: 'global', hostId: 'devbox-1' },
			participants: [{ id: 'default', name: 'Default Agent' }],
			primaryParticipantId: 'default',
			avatar: ThreadAvatarIds.None,
			connectorIds: [],
			automationIds: [],
			createdAt: 1,
			updatedAt: 1,
		}]), StorageScope.PROFILE, StorageTarget.USER);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storageService);
		stubConnections(instantiationService, resource => URI.from({ scheme: 'ahp-session', path: resource.path }));
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidReplaceSession = Event.None;
			override readonly onDidReplaceNewDraftSession = Event.None;
			override readonly onDidDeleteSession = Event.None;
		}());

		const service = disposables.add(instantiationService.createInstance(ThreadsService));

		assert.deepStrictEqual({
			frontend: service.getThread('remote-thread')?.sessionResource.toString(),
			routing: service.getThread('remote-thread')?.routingResource.toString(),
		}, {
			frontend: 'remote-tunnel__devbox-copilotcli:/40da8bd4-7fa9-44bd-aac9-0b19336e6d2e',
			routing: 'ahp-session:/40da8bd4-7fa9-44bd-aac9-0b19336e6d2e',
		});
	});

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
		stubConnections(instantiationService, resource => URI.from({ scheme: 'ahp-session', path: resource.path }));
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
			scope: { kind: 'global', hostId: LOCAL_THREAD_HOST_ID },
			participants: [{ id: 'default', name: 'Default Agent' }],
			primaryParticipantId: 'default',
			avatar: ThreadAvatarIds.Artist,
			connectorIds: ['github'],
		});
		sessions.set(draft.sessionId, draft);
		service.addAutomation(created.id, 'automation-1');
		service.setAvatar(created.id, ThreadAvatarIds.Crown);
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
				routingResource: persisted.routingResource.toString(),
				materialized: persisted.materialized,
				avatar: persisted.avatar,
				participants: persisted.participants,
				primaryParticipantId: persisted.primaryParticipantId,
				connectors: persisted.connectorIds,
				automations: persisted.automationIds,
			},
			renamed,
			removed,
			remaining: service.threads.get().length,
		}, {
			persisted: {
				name: 'Product partner',
				sessionId: 'running',
				resource: 'test-session:/running',
				routingResource: 'ahp-session:/running',
				materialized: true,
				avatar: ThreadAvatarIds.Crown,
				participants: [{ id: 'default', name: 'Default Agent' }],
				primaryParticipantId: 'default',
				connectors: ['github'],
				automations: ['automation-1'],
			},
			renamed: ['running:Product partner'],
			removed: ['running'],
			remaining: 0,
		});
	});
});
