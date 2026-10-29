/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { createAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { FEEDBACK_ANNOTATION_META_KEY } from '../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { AgentSubscriptionManager, IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType, ClientAnnotationsAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { annotationsReducer } from '../../../../../platform/agentHost/common/state/sessionReducers.js';
import { Annotation, AnnotationsState, ComponentToState, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { AnnotationsAgentFeedbackItemsBackend } from '../../browser/agentFeedbackItemsBackend.js';
import { AgentFeedbackKind, AgentFeedbackState } from '../../browser/agentFeedbackService.js';

suite('AnnotationsAgentFeedbackItemsBackend', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Renders the given panes in the window, as {@link ISessionsService.visibleSessionPanes}.
	 * The main session slots in {@link ISessionsService.visibleSessions} exclude standalone child panes.
	 */
	function stubVisibleSessions(
		instantiationService: TestInstantiationService,
		visibleSessionPanes: IObservable<readonly IActiveSession[]>,
		visibleSessions: IObservable<readonly IActiveSession[]> = visibleSessionPanes,
		activeSession: IObservable<IActiveSession | undefined> = constObservable(undefined),
	): void {
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
			override readonly visibleSessions = visibleSessions;
			override readonly visibleSessionPanes = visibleSessionPanes;
		}());
	}

	/**
	 * A backend whose sessions reach a fake agent host through a real
	 * {@link AgentSubscriptionManager}, so feedback writes stay pending until
	 * the host acknowledges them. While `host.connected` is false, writes are
	 * lost on the wire as on a dropped connection, and
	 * `host.replayPendingActions` resends what is still pending, as a reconnect
	 * does.
	 */
	function createConnectedBackend(sessionCount: number) {
		const clientId = 'client';
		const resourceUris = createAgentHostResourceUriMapper('test');
		const sessions = Array.from({ length: sessionCount }, (_, i) => new class extends mock<IActiveSession>() {
			override readonly resource = URI.parse(`agent-host-test:/s${i + 1}`);
			override readonly providerId = 'agenthost-test';
			override readonly sessionId = `s${i + 1}`;
		}());
		const annotationsUri = (session: ISession) => URI.parse(`test:/${session.sessionId}/annotations`);
		const hostState = new Map<string, AnnotationsState>();
		// Channels subscribed on the host.
		const open = new Set<string>();
		let serverSeq = 0;
		let clientSeq = 0;
		const manager = store.add(new AgentSubscriptionManager(clientId, () => ++clientSeq, () => { }, async resource => {
			open.add(resource.toString());
			return { resource: resource.toString(), state: hostState.get(resource.toString()) ?? { annotations: [] }, fromSeq: serverSeq };
		}, resource => open.delete(resource.toString())));
		const hostApply = (channel: string, action: ClientAnnotationsAction, origin?: { clientId: string; clientSeq: number }) => {
			hostState.set(channel, annotationsReducer(hostState.get(channel) ?? { annotations: [] }, action));
			manager.receiveEnvelope({ channel, action, serverSeq: ++serverSeq, origin });
		};
		const host = {
			connected: true,
			open,
			/** Feedback texts the host holds for the session. */
			items: (session: ISession) => hostState.get(annotationsUri(session).toString())?.annotations.map(annotation => annotation.entries[0].text) ?? [],
			/** Adds feedback from another client, such as the agent. */
			addFeedback: (session: ISession, id: string) => hostApply(annotationsUri(session).toString(), {
				type: ActionType.AnnotationsSet,
				annotation: {
					id, resource: URI.file('/repo/file.ts').toString(), resolved: false,
					origin: { session: session.resource.toString() },
					entries: [{ id: `${id}:0`, text: id }],
					_meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind: 'user', state: 'accepted', sessionResource: session.resource.toString() } },
				},
			}),
			replayPendingActions: () => {
				for (const pending of manager.getPendingActions()) {
					hostApply(pending.channel, pending.action as ClientAnnotationsAction, { clientId, clientSeq: pending.clientSeq });
				}
			},
		};
		const connection = new class extends mock<IAgentConnection>() {
			override readonly resourceUris = resourceUris;
			override getSubscription<T extends StateComponents>(kind: T, resource: URI, owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
				return manager.getSubscription(kind, resource, owner);
			}
			override dispatch(channel: string, action: ClientAnnotationsAction): void {
				const seq = manager.dispatchOptimistic(channel, action);
				if (host.connected) {
					hostApply(channel, action, { clientId, clientSeq: seq });
				}
			}
		}();
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override getFeedbackAnnotationsChannel(sessionId: string) {
				const session = sessions.find(candidate => candidate.sessionId === sessionId)!;
				return { connection, annotationsUri: annotationsUri(session) };
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidDeleteSession = Event.None;
			override onDidChangeSessions = Event.None;
			override getSession(resource: URI) { return sessions.find(session => session.resource.toString() === resource.toString()); }
		});
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(): T {
				return provider as unknown as T;
			}
		});
		const visibleSessionPanes = observableValue<readonly IActiveSession[]>('visibleSessionPanes', []);
		const visibleSessions = observableValue<readonly IActiveSession[]>('visibleSessions', []);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		stubVisibleSessions(instantiationService, visibleSessionPanes, visibleSessions, activeSession);
		const backend = store.add(instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));
		/** Renders `panes`, of which `mainSlots` are main session slots, and focuses `active`. */
		const showPanes = (panes: readonly IActiveSession[], mainSlots = panes, active = panes[0]) => transaction(tx => {
			visibleSessionPanes.set(panes, tx);
			visibleSessions.set(mainSlots, tx);
			activeSession.set(active, tx);
		});
		const feedback = (id: string, session: ISession) => ({
			id, text: id, sessionResource: session.resource,
			resourceUri: resourceUris.fromAgentHost(URI.file('/repo/file.ts')),
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			kind: AgentFeedbackKind.UserReview, state: AgentFeedbackState.Accepted,
		});
		return { backend, host, sessions, showPanes, feedback };
	}

	for (const initiallyAvailable of [false, true]) {
		test(`suspends unavailable annotations without discarding cached feedback (cold=${!initiallyAvailable})`, async () => {
			const sessionResource = URI.parse('agent-host-claude:/saved');
			const annotationsUri = URI.parse('claude:/saved/annotations');
			const changes = store.add(new Emitter<ISessionsChangeEvent>());
			const deletions = store.add(new Emitter<ISession>());
			const operations: string[] = [];
			const state: AnnotationsState = {
				annotations: [{
					id: 'saved-feedback', resource: URI.file('/repo/file.ts').toString(), resolved: false,
					origin: { session: sessionResource.toString() },
					entries: [{ id: 'saved-feedback:0', text: 'Saved feedback' }],
					_meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind: 'user', state: 'accepted', sessionResource: sessionResource.toString() } },
				}],
			};
			let seq = 0;
			const manager = store.add(new AgentSubscriptionManager('test', () => ++seq, () => { }, async resource => {
				operations.push('subscribe');
				return { resource: resource.toString(), state, fromSeq: 0 };
			}, () => operations.push('unsubscribe')));
			const connection = new class extends mock<IAgentConnection>() {
				override readonly resourceUris = createAgentHostResourceUriMapper('test');
				override getSubscription<T extends StateComponents>(kind: T, resource: URI, owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
					return manager.getSubscription(kind, resource, owner);
				}
				override dispatch(): void { operations.push('dispatch'); }
			}();
			let available = initiallyAvailable;
			const provider = new class extends mock<IAgentHostSessionsProvider>() {
				override getFeedbackAnnotationsChannel() { return available ? { connection, annotationsUri } : undefined; }
			}();
			const session = new class extends mock<ISession>() {
				override readonly resource = sessionResource;
				override readonly providerId = 'agenthost-test';
				override readonly sessionId = 'saved';
			}();
			let deleted = false;
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(ISessionsManagementService, {
				onDidDeleteSession: deletions.event,
				onDidChangeSessions: changes.event,
				getSession: () => deleted ? undefined : session,
			});
			instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() { }(), 'getProvider', () => provider);
			stubVisibleSessions(instantiationService, constObservable([session as IActiveSession]));
			const backend = store.add(instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));
			backend.getItems(sessionResource);
			await timeout(0);
			const opened = [...operations];
			available = true;
			changes.fire({ added: [], changed: [], removed: [] });
			await timeout(0);
			const enabled = [...operations];
			const saved = backend.getItems(sessionResource)[0];
			assert.ok(saved);
			available = false;
			changes.fire({ added: [], changed: [], removed: [] });
			const suspended = [...operations];
			backend.upsert(saved);
			const disabled = {
				operations: [...operations],
				items: backend.getItems(sessionResource).map(item => item.text),
				channel: backend.getAnnotationsChannelResource(sessionResource),
				loaded: backend.hasLoaded(sessionResource),
			};
			available = true;
			changes.fire({ added: [], changed: [], removed: [] });
			await timeout(0);
			const recovered = [...operations];
			deleted = true;
			deletions.fire(session);
			changes.fire({ added: [], changed: [], removed: [] });
			assert.deepStrictEqual({
				opened, enabled, suspended, disabled, recovered,
				deleted: { operations, items: backend.getItems(sessionResource) },
			}, {
				opened: initiallyAvailable ? ['subscribe'] : [],
				enabled: ['subscribe'],
				suspended: ['subscribe', 'unsubscribe'],
				disabled: { operations: ['subscribe', 'unsubscribe'], items: ['Saved feedback'], channel: undefined, loaded: false },
				recovered: ['subscribe', 'unsubscribe', 'subscribe'],
				deleted: { operations: ['subscribe', 'unsubscribe', 'subscribe', 'unsubscribe'], items: [] },
			});
		});
	}

	test('maps annotation resources through the owning connection', () => {
		const sessionResource = URI.parse('remote-agent-host:///session');
		const annotationsUri = URI.parse('copilot:///session/annotations');
		const agentHostResource = URI.parse('file:///Q:/Source/repository/src/file.ts');
		const resourceUris = createAgentHostResourceUriMapper('remote-test');
		const state: AnnotationsState = {
			annotations: [{
				id: 'feedback-1',
				origin: { session: sessionResource.toString() },
				resource: agentHostResource.toString(),
				resolved: false,
				entries: [{ id: 'feedback-1:0', text: 'Review this code.' }],
				_meta: {
					[FEEDBACK_ANNOTATION_META_KEY]: {
						kind: 'prReview',
						state: 'created',
						sessionResource: sessionResource.toString(),
						sourcePRReviewCommentId: 'thread-1',
						sourcePRReviewCommentAuthor: 'reviewer',
						sourcePullRequest: { owner: 'owner', repo: 'repo', number: 42 },
					},
				},
			}],
		};
		const subscription: IAgentSubscription<AnnotationsState> = {
			value: state,
			verifiedValue: state,
			onDidChange: Event.None,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		const dispatchedActions: ClientAnnotationsAction[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override readonly resourceUris = resourceUris;

			override getSubscription<T extends StateComponents>(kind: T): IReference<IAgentSubscription<ComponentToState[T]>> {
				assert.strictEqual(kind, StateComponents.Annotations);
				return {
					object: subscription as IAgentSubscription<ComponentToState[T]>,
					dispose() { },
				};
			}

			override dispatch(_channel: string, action: ClientAnnotationsAction): void {
				dispatchedActions.push(action);
			}
		}();
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override getFeedbackAnnotationsChannel() {
				return { connection, annotationsUri };
			}
		}();
		const session = new class extends mock<ISession>() {
			override readonly providerId = 'agenthost-test';
			override readonly sessionId = 'session';
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidDeleteSession = Event.None;
			override onDidChangeSessions = Event.None;
			override getSession() { return session; }
		});
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(): T {
				return provider as unknown as T;
			}
		});
		stubVisibleSessions(instantiationService, constObservable([]));
		const backend = store.add(instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));

		const feedback = backend.getItems(sessionResource)[0];
		assert.ok(feedback);
		backend.upsert(feedback);
		const encodedMeta = dispatchedActions.find(action => action.type === ActionType.AnnotationsSet)?.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY];

		assert.deepStrictEqual({
			decoded: feedback.resourceUri.toString(),
			encoded: dispatchedActions.find(action => action.type === ActionType.AnnotationsSet)?.annotation.resource,
			decodedPullRequest: feedback.sourcePullRequest,
			decodedAuthor: feedback.sourcePRReviewCommentAuthor,
			encodedMeta,
		}, {
			decoded: resourceUris.fromAgentHost(agentHostResource).toString(),
			encoded: agentHostResource.toString(),
			decodedPullRequest: { owner: 'owner', repo: 'repo', number: 42 },
			decodedAuthor: 'reviewer',
			encodedMeta: {
				kind: 'prReview',
				state: 'created',
				sessionResource: sessionResource.toString(),
				suggestion: undefined,
				codeSelection: undefined,
				diffHunks: undefined,
				sourcePRReviewCommentId: 'thread-1',
				sourcePRReviewCommentAuthor: 'reviewer',
				sourcePullRequest: { owner: 'owner', repo: 'repo', number: 42 },
				pendingAgentReveal: undefined,
			},
		});
	});

	test('shows local mutations immediately after the annotations snapshot has loaded', () => {
		const sessionResource = URI.parse('remote-agent-host:///session');
		const annotationsUri = URI.parse('copilot:///session/annotations');
		const resourceUris = createAgentHostResourceUriMapper('remote-test');
		const existingResource = resourceUris.fromAgentHost(URI.file('existing.ts'));
		const addedResource = resourceUris.fromAgentHost(URI.file('added.ts'));
		let state: AnnotationsState = {
			annotations: [{
				id: 'existing',
				origin: { session: sessionResource.toString() },
				resource: resourceUris.toAgentHost(existingResource).toString(),
				resolved: false,
				entries: [{ id: 'existing:0', text: 'Existing feedback' }],
				_meta: {
					[FEEDBACK_ANNOTATION_META_KEY]: {
						kind: 'user',
						state: 'accepted',
						sessionResource: sessionResource.toString(),
					},
				},
			}],
		};
		const onDidChange = store.add(new Emitter<AnnotationsState>());
		const subscription: IAgentSubscription<AnnotationsState> = {
			get value() { return state; },
			get verifiedValue() { return state; },
			onDidChange: onDidChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		const connection = new class extends mock<IAgentConnection>() {
			override readonly resourceUris = resourceUris;
			override getSubscription<T extends StateComponents>(): IReference<IAgentSubscription<ComponentToState[T]>> {
				return {
					object: subscription as IAgentSubscription<ComponentToState[T]>,
					dispose() { },
				};
			}
			override dispatch(_channel: string, action: ClientAnnotationsAction): void {
				state = annotationsReducer(state, action, () => { });
				onDidChange.fire(state);
			}
		}();
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override getFeedbackAnnotationsChannel() {
				return { connection, annotationsUri };
			}
		}();
		const session = new class extends mock<ISession>() {
			override readonly providerId = 'agenthost-test';
			override readonly sessionId = 'session';
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidDeleteSession = Event.None;
			override onDidChangeSessions = Event.None;
			override getSession() { return session; }
		});
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(): T {
				return provider as unknown as T;
			}
		});
		stubVisibleSessions(instantiationService, constObservable([]));
		const backend = store.add(instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));
		const events: string[][] = [];
		store.add(backend.onDidChangeItems(resource => events.push(backend.getItems(resource).map(item => item.id))));

		backend.getItems(sessionResource);
		backend.upsert({
			id: 'added',
			text: 'Added feedback',
			resourceUri: addedResource,
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			sessionResource,
			kind: AgentFeedbackKind.UserReview,
			state: AgentFeedbackState.Accepted,
		});
		const afterAdd = backend.getItems(sessionResource).map(item => item.id);
		backend.remove(sessionResource, 'added');
		const afterRemove = backend.getItems(sessionResource).map(item => item.id);
		backend.clear(sessionResource);

		assert.deepStrictEqual({
			afterAdd,
			afterRemove,
			afterClear: backend.getItems(sessionResource).map(item => item.id),
			events,
		}, {
			afterAdd: ['existing', 'added'],
			afterRemove: ['existing'],
			afterClear: [],
			events: [
				['existing', 'added'],
				['existing'],
				[],
			],
		});
	});

	test('moves to the provider\'s new connection after a reconnect', () => {
		const sessionResource = URI.parse('remote-agent-host:///session');
		const annotationsUri = URI.parse('copilot:///session/annotations');
		const resourceUris = createAgentHostResourceUriMapper('remote-test');
		const log: string[] = [];
		const createConnection = (name: string) => new class extends mock<IAgentConnection>() {
			override readonly resourceUris = resourceUris;
			override getSubscription<T extends StateComponents>(): IReference<IAgentSubscription<ComponentToState[T]>> {
				log.push(`${name}: subscribe`);
				const state: AnnotationsState = { annotations: [] };
				const subscription: IAgentSubscription<AnnotationsState> = {
					value: state,
					verifiedValue: state,
					onDidChange: Event.None,
					onWillApplyAction: Event.None,
					onDidApplyAction: Event.None,
				};
				return {
					object: subscription as IAgentSubscription<ComponentToState[T]>,
					dispose: () => log.push(`${name}: unsubscribe`),
				};
			}
			override dispatch(_channel: string, action: ClientAnnotationsAction): void {
				log.push(`${name}: ${action.type}`);
			}
		}();
		let connection = createConnection('old');
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override getFeedbackAnnotationsChannel() {
				return { connection, annotationsUri };
			}
		}();
		const session = new class extends mock<ISession>() {
			override readonly providerId = 'agenthost-test';
			override readonly sessionId = 'session';
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidDeleteSession = Event.None;
			override onDidChangeSessions = Event.None;
			override getSession() { return session; }
		});
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(): T {
				return provider as unknown as T;
			}
		});
		stubVisibleSessions(instantiationService, constObservable([]));
		const backend = store.add(instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));

		backend.getItems(sessionResource);
		connection = createConnection('new');
		backend.upsert({
			id: 'added',
			text: 'Added feedback',
			resourceUri: resourceUris.fromAgentHost(URI.file('added.ts')),
			range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			sessionResource,
			kind: AgentFeedbackKind.UserReview,
			state: AgentFeedbackState.Accepted,
		});

		assert.deepStrictEqual(log, [
			'old: subscribe',
			'old: unsubscribe',
			'new: subscribe',
			'new: annotations/set',
		]);
	});

	test('holds annotations subscriptions only for visible sessions', () => {
		const resourceUris = createAgentHostResourceUriMapper('test');
		const sessions = Array.from({ length: 30 }, (_, i) => new class extends mock<ISession>() {
			override readonly resource = URI.parse(`agent-host-test:/s${i + 1}`);
			override readonly providerId = 'agenthost-test';
			override readonly sessionId = `s${i + 1}`;
		}());
		const feedbackAnnotation = (id: string, session: ISession): Annotation => ({
			id, resource: URI.file('/repo/file.ts').toString(), resolved: false,
			origin: { session: session.resource.toString() },
			entries: [{ id: `${id}:0`, text: id }],
			_meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind: 'user', state: 'accepted', sessionResource: session.resource.toString() } },
		});
		const annotationsUri = (sessionId: string) => URI.parse(`test:/${sessionId}/annotations`);
		// Annotations held by the agent host, keyed by channel.
		const hostState = new Map<string, AnnotationsState>([[annotationsUri('s1').toString(), { annotations: [feedbackAnnotation('first', sessions[0])] }]]);
		const onDidChangeHostState = store.add(new Emitter<string>());
		// Open subscriptions as `<connection> <channel>`.
		const open = new Set<string>();
		const createConnection = (name: string) => new class extends mock<IAgentConnection>() {
			override readonly resourceUris = resourceUris;
			override getSubscription<T extends StateComponents>(_kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
				const channel = resource.toString();
				const read = () => hostState.get(channel) ?? { annotations: [] };
				const onDidChange = new Emitter<AnnotationsState>();
				const listener = onDidChangeHostState.event(changed => changed === channel && onDidChange.fire(read()));
				const subscription: IAgentSubscription<AnnotationsState> = {
					get value() { return read(); },
					get verifiedValue() { return read(); },
					onDidChange: onDidChange.event,
					onWillApplyAction: Event.None,
					onDidApplyAction: Event.None,
				};
				open.add(`${name} ${channel}`);
				return {
					object: subscription as IAgentSubscription<ComponentToState[T]>,
					dispose: () => {
						open.delete(`${name} ${channel}`);
						listener.dispose();
						onDidChange.dispose();
					},
				};
			}
		}();
		let connection = createConnection('old');
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override getFeedbackAnnotationsChannel(sessionId: string) {
				return { connection, annotationsUri: annotationsUri(sessionId) };
			}
		}();
		const changes = store.add(new Emitter<ISessionsChangeEvent>());
		const deletions = store.add(new Emitter<ISession>());
		const deleted = new Set<ISession>();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override onDidDeleteSession = deletions.event;
			override onDidChangeSessions = changes.event;
			override getSession(resource: URI) { return sessions.find(session => !deleted.has(session) && session.resource.toString() === resource.toString()); }
		});
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(): T {
				return provider as unknown as T;
			}
		});
		const visibleSessions = observableValue<readonly IActiveSession[]>('visibleSessions', []);
		stubVisibleSessions(instantiationService, visibleSessions);
		const backend = store.add(instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));
		const changed: string[] = [];
		store.add(backend.onDidChangeItems(resource => changed.push(resource.toString())));
		// Opens a session and reads its feedback, as the Changes view does.
		const show = (session: ISession) => {
			visibleSessions.set([session as IActiveSession], undefined);
			return backend.getItems(session.resource).map(item => item.text);
		};
		const archive = (session: ISession) => changes.fire({ added: [], changed: [session], removed: [] });

		sessions.slice(0, 10).forEach(show);
		const afterTen = open.size;
		sessions.slice(10).forEach(show);
		const afterThirty = open.size;

		const returned = { items: show(sessions[0]), open: [...open] };
		hostState.set(annotationsUri('s1').toString(), { annotations: [feedbackAnnotation('first', sessions[0]), feedbackAnnotation('live', sessions[0])] });
		onDidChangeHostState.fire(annotationsUri('s1').toString());
		const live = { items: backend.getItems(sessions[0].resource).map(item => item.text), changed: [...changed] };

		archive(sessions[0]);
		const archivedWhileVisible = [...open];
		show(sessions[1]);
		archive(sessions[0]);
		const archivedAfterLeaving = [...open];

		deleted.add(sessions[1]);
		deletions.fire(sessions[1]);
		const afterDelete = [...open];

		show(sessions[2]);
		connection = createConnection('new');
		changes.fire({ added: [], changed: [], removed: [] });
		const afterReconnect = [...open];

		assert.deepStrictEqual({ afterTen, afterThirty, returned, live, archivedWhileVisible, archivedAfterLeaving, afterDelete, afterReconnect }, {
			afterTen: 1,
			afterThirty: 1,
			returned: { items: ['first'], open: ['old test:/s1/annotations'] },
			live: { items: ['first', 'live'], changed: ['agent-host-test:/s1'] },
			archivedWhileVisible: ['old test:/s1/annotations'],
			archivedAfterLeaving: ['old test:/s2/annotations'],
			afterDelete: [],
			afterReconnect: ['new test:/s3/annotations'],
		});
	});

	test('keeps a left session subscribed until the host acknowledges its feedback writes', async () => {
		const { backend, host, sessions: [first, second], showPanes, feedback } = createConnectedBackend(2);
		showPanes([first]);
		backend.getItems(first.resource);
		await timeout(0);

		// The connection drops right after the comment is sent, and the user
		// moves on before the reconnect resends it.
		host.connected = false;
		backend.upsert(feedback('offline', first));
		showPanes([second]);
		backend.getItems(second.resource);
		await timeout(0);
		const leaving = [...host.open];

		host.connected = true;
		host.replayPendingActions();
		const replayed = { open: [...host.open], host: host.items(first) };

		showPanes([first]);
		backend.getItems(first.resource);
		await timeout(0);

		assert.deepStrictEqual({ leaving, replayed, returned: backend.getItems(first.resource).map(item => item.text) }, {
			leaving: ['test:/s1/annotations', 'test:/s2/annotations'],
			replayed: { open: ['test:/s2/annotations'], host: ['offline'] },
			returned: ['offline'],
		});
	});

	test('keeps a standalone child pane subscribed after its parent pane closes', async () => {
		const { backend, host, sessions: [parent, other], showPanes } = createConnectedBackend(2);
		const child = new class extends mock<IActiveSession>() {
			override readonly resource = parent.resource;
			override readonly providerId = parent.providerId;
			override readonly sessionId = parent.sessionId;
			override readonly scopedChatResource = URI.parse('agent-host-test:/s1/chat');
		}();
		showPanes([parent, child]);
		backend.getItems(parent.resource);
		await timeout(0);

		// Close the parent pane and focus another session. The child pane of
		// the parent session stays on screen.
		showPanes([other, child], [other]);
		backend.getItems(other.resource);
		await timeout(0);
		const changed: string[] = [];
		store.add(backend.onDidChangeItems(resource => changed.push(resource.toString())));
		host.addFeedback(parent, 'live');

		assert.deepStrictEqual({ open: [...host.open], items: backend.getItems(parent.resource).map(item => item.text), changed }, {
			open: ['test:/s1/annotations', 'test:/s2/annotations'],
			items: ['live'],
			changed: ['agent-host-test:/s1'],
		});
	});
});
