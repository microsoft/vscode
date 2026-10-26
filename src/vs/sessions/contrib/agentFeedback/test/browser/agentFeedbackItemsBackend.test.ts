/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { createAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { FEEDBACK_ANNOTATION_META_KEY } from '../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { AgentSubscriptionManager, IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType, ClientAnnotationsAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { annotationsReducer } from '../../../../../platform/agentHost/common/state/sessionReducers.js';
import { AnnotationsState, ComponentToState, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { AnnotationsAgentFeedbackItemsBackend } from '../../browser/agentFeedbackItemsBackend.js';
import { AgentFeedbackKind, AgentFeedbackState } from '../../browser/agentFeedbackService.js';

suite('AnnotationsAgentFeedbackItemsBackend', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
		const backend = store.add(instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));

		const feedback = backend.getItems(sessionResource)[0];
		assert.ok(feedback);
		backend.upsert(feedback);
		const encodedMeta = dispatchedActions.find(action => action.type === ActionType.AnnotationsSet)?.annotation._meta?.[FEEDBACK_ANNOTATION_META_KEY];

		assert.deepStrictEqual({
			decoded: feedback.resourceUri.toString(),
			encoded: dispatchedActions.find(action => action.type === ActionType.AnnotationsSet)?.annotation.resource,
			decodedPullRequest: feedback.sourcePullRequest,
			encodedMeta,
		}, {
			decoded: resourceUris.fromAgentHost(agentHostResource).toString(),
			encoded: agentHostResource.toString(),
			decodedPullRequest: { owner: 'owner', repo: 'repo', number: 42 },
			encodedMeta: {
				kind: 'prReview',
				state: 'created',
				sessionResource: sessionResource.toString(),
				suggestion: undefined,
				codeSelection: undefined,
				diffHunks: undefined,
				sourcePRReviewCommentId: 'thread-1',
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
});
