/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IChat, ISession } from '../../common/session.js';
import { ISessionChangeEvent, ISessionsProvider } from '../../common/sessionsProvider.js';
import { deduplicateSessions, SessionsManagementService } from '../../browser/sessionsManagementService.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../browser/sessionsProvidersService.js';

const stubChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changesets: constObservable([]),
	changes: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
} satisfies IChat;

function stubSession(overrides: Partial<ISession> & Pick<ISession, 'sessionId' | 'providerId'>): ISession {
	return {
		resource: URI.parse(`test:///${overrides.sessionId}`),
		sessionType: 'test',
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable('Test'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		gitHubInfo: constObservable(undefined),
		chats: constObservable([]),
		mainChat: stubChat,
		capabilities: { supportsMultipleChats: false },
		...overrides,
	};
}

suite('deduplicateSessions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns all sessions when no deduplication keys are set', () => {
		const s1 = stubSession({ sessionId: 'a', providerId: 'p1' });
		const s2 = stubSession({ sessionId: 'b', providerId: 'p2' });
		const result = deduplicateSessions([s1, s2]);
		assert.deepStrictEqual(result, [s1, s2]);
	});

	test('removes duplicate when same deduplicationKey appears across providers', () => {
		const local = stubSession({ sessionId: 'local-1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, deduplicationKey: 'copilot:///abc123' });
		const remote = stubSession({ sessionId: 'remote-1', providerId: 'agenthost-tunnel', deduplicationKey: 'copilot:///abc123' });
		const result = deduplicateSessions([remote, local]);
		assert.deepStrictEqual(result, [local]);
	});

	test('prefers local provider over remote regardless of order', () => {
		const local = stubSession({ sessionId: 'local-1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, deduplicationKey: 'copilot:///abc123' });
		const remote = stubSession({ sessionId: 'remote-1', providerId: 'agenthost-tunnel', deduplicationKey: 'copilot:///abc123' });

		// local first
		assert.deepStrictEqual(deduplicateSessions([local, remote]), [local]);
		// remote first
		assert.deepStrictEqual(deduplicateSessions([remote, local]), [local]);
	});

	test('keeps first occurrence when no local provider exists among duplicates', () => {
		const r1 = stubSession({ sessionId: 'r1', providerId: 'agenthost-a', deduplicationKey: 'copilot:///abc123' });
		const r2 = stubSession({ sessionId: 'r2', providerId: 'agenthost-b', deduplicationKey: 'copilot:///abc123' });
		const result = deduplicateSessions([r1, r2]);
		assert.deepStrictEqual(result, [r1]);
	});

	test('does not deduplicate sessions with different keys', () => {
		const s1 = stubSession({ sessionId: 's1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, deduplicationKey: 'copilot:///aaa' });
		const s2 = stubSession({ sessionId: 's2', providerId: 'agenthost-tunnel', deduplicationKey: 'copilot:///bbb' });
		const result = deduplicateSessions([s1, s2]);
		assert.deepStrictEqual(result, [s1, s2]);
	});

	test('mixes sessions with and without deduplication keys', () => {
		const keyed1 = stubSession({ sessionId: 'k1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, deduplicationKey: 'copilot:///abc123' });
		const keyed2 = stubSession({ sessionId: 'k2', providerId: 'agenthost-tunnel', deduplicationKey: 'copilot:///abc123' });
		const noKey = stubSession({ sessionId: 'nk', providerId: 'copilot-chat' });
		const result = deduplicateSessions([keyed2, noKey, keyed1]);
		assert.deepStrictEqual(result, [noKey, keyed1]);
	});
});

class StubSessionsProvider extends Disposable {
	readonly id = 'stub-provider';
	readonly label = 'Stub';
	readonly icon = Codicon.vm;
	readonly sessionTypes = [];
	readonly browseActions = [];

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession = this._onDidReplaceSession.event;

	private _sessions: ISession[] = [];

	getSessions(): ISession[] { return this._sessions; }
	setSessions(sessions: ISession[]): void { this._sessions = sessions; }
	fireReplace(from: ISession, to: ISession): void { this._onDidReplaceSession.fire({ from, to }); }

	asProvider(): ISessionsProvider { return this as unknown as ISessionsProvider; }
}

class StubSessionsProvidersService extends Disposable {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, ISessionsProvider>();
	private readonly _onDidChangeProviders = this._register(new Emitter<ISessionsProvidersChangeEvent>());
	readonly onDidChangeProviders: Event<ISessionsProvidersChangeEvent> = this._onDidChangeProviders.event;

	register(provider: ISessionsProvider): void {
		this._providers.set(provider.id, provider);
		this._onDidChangeProviders.fire({ added: [provider], removed: [] });
	}

	getProviders(): ISessionsProvider[] { return Array.from(this._providers.values()); }
	getProvider<T extends ISessionsProvider>(id: string): T | undefined { return this._providers.get(id) as T | undefined; }

	asService(): ISessionsProvidersService { return this as unknown as ISessionsProvidersService; }
}

class StubAgentSessionsService {
	declare readonly _serviceBrand: undefined;
	readonly model = { observeSession: () => constObservable(undefined) } as unknown as IAgentSessionsService['model'];
	readonly onDidChangeSessionArchivedState = Event.None;
	getSession() { return undefined; }

	asService(): IAgentSessionsService { return this as unknown as IAgentSessionsService; }
}

suite('SessionsManagementService - setActiveSession', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('rewires active session when provider replaces with a new instance sharing the same sessionId', () => {
		const instantiationService: TestInstantiationService = workbenchInstantiationService({}, disposables);
		const providersService = disposables.add(new StubSessionsProvidersService());
		instantiationService.stub(ISessionsProvidersService, providersService.asService());
		instantiationService.stub(IAgentSessionsService, new StubAgentSessionsService().asService());

		const provider = disposables.add(new StubSessionsProvider());
		providersService.register(provider.asProvider());

		const service = disposables.add(instantiationService.createInstance(SessionsManagementService));

		// Two separate instances that share the same sessionId — modeling the
		// agent host skeleton/adapter swap that produced #315936.
		const skeleton = stubSession({ sessionId: 'shared-id', providerId: provider.id });
		const adapter = stubSession({ sessionId: 'shared-id', providerId: provider.id });
		assert.notStrictEqual(skeleton, adapter);

		// Seed the active session with the skeleton via the public openChat
		// entry point (which calls setActiveSession internally).
		void service.openChat(skeleton, skeleton.resource);
		assert.strictEqual(service.activeSession.get()?.sessionId, 'shared-id');
		const before = service.activeSession.get();

		// Provider swaps in the committed instance with the same sessionId.
		provider.fireReplace(skeleton, adapter);

		const after = service.activeSession.get();
		assert.strictEqual(after?.sessionId, 'shared-id');
		// The IActiveSession is a fresh object spread from the new underlying
		// session, so the wrapper changes identity even though the sessionId is
		// the same. This confirms the rewire happened (regression guard for
		// the early-return that previously skipped same-sessionId swaps).
		assert.notStrictEqual(after, before);
	});
});
