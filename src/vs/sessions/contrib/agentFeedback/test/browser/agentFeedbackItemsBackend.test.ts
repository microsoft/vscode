/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { deepFreeze } from '../../../../../base/common/objects.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { createAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { FEEDBACK_ANNOTATION_META_KEY } from '../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { AgentSubscriptionManager, IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionEnvelope, ActionType, ClientAnnotationsAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { annotationsReducer } from '../../../../../platform/agentHost/common/state/sessionReducers.js';
import { Annotation, AnnotationsState, ComponentToState, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
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
	const nativeChannelUri = URI.parse('review-channel://tenant/native-comments');

	function createBackend(initialState: AnnotationsState | undefined, confirm?: (action: ClientAnnotationsAction, token: CancellationToken) => Promise<ActionEnvelope>) {
		const sessionResource = URI.parse('remote-agent-host:///session');
		let annotationsUri: URI | undefined = nativeChannelUri;
		let state = initialState;
		let error: Error | undefined;
		const changes = store.add(new Emitter<AnnotationsState>());
		const errors = store.add(new Emitter<Error>());
		const connectionStatus = observableValue<RemoteAgentHostConnectionStatus>('connectionStatus', RemoteAgentHostConnectionStatus.connected);
		const subscription: IAgentSubscription<AnnotationsState> = {
			get value() { return error ?? state; },
			get verifiedValue() { return state; },
			onDidChange: changes.event,
			onDidError: errors.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		const dispatchedActions: ClientAnnotationsAction[] = [];
		const channelOperations: { operation: string; resource: string }[] = [];
		const sessionChanges = store.add(new Emitter<ISessionsChangeEvent>());
		const connection = new class extends mock<IAgentConnection>() {
			override readonly resourceUris = createAgentHostResourceUriMapper('remote-test');
			override getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
				assert.deepStrictEqual({ kind, resource }, { kind: StateComponents.Annotations, resource: annotationsUri });
				channelOperations.push({ operation: 'subscribe', resource: resource.toString() });
				return {
					object: subscription as IAgentSubscription<ComponentToState[T]>,
					dispose: () => channelOperations.push({ operation: 'unsubscribe', resource: resource.toString() }),
				};
			}
			override dispatch(channel: string, action: ClientAnnotationsAction): void {
				channelOperations.push({ operation: action.type, resource: channel });
				dispatchedActions.push(action);
			}
			override async dispatchConfirmed<T>(channel: string, _subscription: IAgentSubscription<T>, action: ClientAnnotationsAction, token: CancellationToken): Promise<ActionEnvelope> {
				this.dispatch(channel, action);
				if (confirm) {
					return confirm(action, token);
				}
				state = annotationsReducer(state!, action, () => { });
				changes.fire(state);
				return { channel, action, serverSeq: 1, origin: undefined };
			}
		}();
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly connectionStatus = connectionStatus;
			override getFeedbackAnnotationsChannel() { return annotationsUri ? { connection, annotationsUri } : undefined; }
		}();
		const session = new class extends mock<ISession>() {
			override readonly providerId = 'agenthost-test';
			override readonly sessionId = 'session';
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, {
			onDidDeleteSession: Event.None,
			onDidChangeSessions: sessionChanges.event,
			getSession: () => session,
		});
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() { }(), 'getProvider', () => provider);
		const backend = store.add(instantiationService.createInstance(AnnotationsAgentFeedbackItemsBackend));
		return {
			backend,
			sessionResource,
			dispatchedActions,
			channelOperations,
			setChannel(resource: URI | undefined) {
				annotationsUri = resource;
				sessionChanges.fire({ added: [], removed: [], changed: [session] });
			},
			setState(value: AnnotationsState) {
				error = undefined;
				state = value;
				changes.fire(value);
			},
			setError(value: Error) {
				error = value;
				errors.fire(value);
			},
			setConnectionStatus(value: RemoteAgentHostConnectionStatus) {
				connectionStatus.set(value, undefined);
			},
		};
	}

	function nativeAnnotation(): Annotation {
		return {
			id: 'native',
			resource: 'file:///repo/file.ts',
			origin: { session: 'session-store:/opaque', chat: 'conversation:/other', turnId: 'turn' },
			resolved: false,
			entries: [
				{ id: 'opening', text: { markdown: '**Original**' }, _meta: { 'example.entry': { keep: true } } },
				{ id: 'reply', text: 'Another client replied.' },
			],
			_meta: { 'example.annotation': { keep: true }, [FEEDBACK_ANNOTATION_META_KEY]: { kind: 'unrecognized' } },
		};
	}

	test('native edits and replies preserve identity, format, provenance and opaque metadata', async () => {
		const original = deepFreeze(nativeAnnotation());
		const { backend, sessionResource, dispatchedActions } = createBackend({ annotations: [original] });
		await backend.updateAnnotationEntry(sessionResource, original.id, 'opening', '**Edited**', nativeChannelUri);
		await backend.addAnnotationReply(sessionResource, original.id, 'new-reply', 'New plain reply', nativeChannelUri);
		const reply = dispatchedActions[1];
		assert.ok(reply.type === ActionType.AnnotationsEntrySet && !original.entries.some(entry => entry.id === reply.entry.id));
		assert.deepStrictEqual({
			actions: dispatchedActions,
			current: backend.getAnnotations(sessionResource),
			feedback: backend.getItems(sessionResource),
			mappedFile: backend.getNativeAnnotations(sessionResource)[0].resourceUri.toString(),
		}, {
			actions: [
				{ type: ActionType.AnnotationsEntrySet, annotationId: original.id, entry: { ...original.entries[0], text: { markdown: '**Edited**' } } },
				{ type: ActionType.AnnotationsEntrySet, annotationId: original.id, entry: { id: reply.entry.id, text: 'New plain reply' } },
			],
			current: [{ ...original, entries: [{ ...original.entries[0], text: { markdown: '**Edited**' } }, original.entries[1], reply.entry] }],
			feedback: [],
			mappedFile: createAgentHostResourceUriMapper('remote-test').fromAgentHost(URI.parse(original.resource)).toString(),
		});
	});

	test('native resolution and deletion use narrow standard actions', async () => {
		const annotation = nativeAnnotation();
		const { backend, sessionResource, dispatchedActions } = createBackend({ annotations: [annotation] });
		backend.getNativeAnnotations(sessionResource);
		let feedbackChanges = 0;
		store.add(backend.onDidChangeItems(() => feedbackChanges++));
		await backend.setAnnotationResolved(sessionResource, annotation.id, true, nativeChannelUri);
		const resolved = backend.getAnnotations(sessionResource);
		await backend.setAnnotationResolved(sessionResource, annotation.id, false, nativeChannelUri);
		const reopened = backend.getAnnotations(sessionResource);
		await backend.removeAnnotation(sessionResource, annotation.id, nativeChannelUri);
		assert.deepStrictEqual({ resolved, reopened, deleted: backend.getAnnotations(sessionResource), dispatchedActions, feedbackChanges }, {
			resolved: [{ ...annotation, resolved: true }],
			reopened: [annotation],
			deleted: [],
			feedbackChanges: 0,
			dispatchedActions: [
				{ type: ActionType.AnnotationsUpdated, annotationId: annotation.id, resolved: true },
				{ type: ActionType.AnnotationsUpdated, annotationId: annotation.id, resolved: false },
				{ type: ActionType.AnnotationsRemoved, annotationId: annotation.id },
			],
		});
	});

	test('native mutations reject unavailable, missing and feedback-owned targets', async () => {
		const annotation = nativeAnnotation();
		const feedback = { ...annotation, id: 'feedback', _meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind: 'user', state: 'accepted', sessionResource: 'remote-agent-host:///session' } } };
		const { backend, sessionResource, setChannel, dispatchedActions } = createBackend({ annotations: [annotation, feedback] });
		await assert.rejects(backend.removeAnnotation(sessionResource, 'missing', nativeChannelUri), /no longer available/);
		await assert.rejects(backend.removeAnnotation(sessionResource, 'feedback', nativeChannelUri), /no longer available/);
		await assert.rejects(backend.updateAnnotationEntry(sessionResource, annotation.id, 'missing', 'edit', nativeChannelUri), /no longer available/);
		setChannel(undefined);
		await assert.rejects(backend.addAnnotationReply(sessionResource, annotation.id, 'new-reply', 'offline', nativeChannelUri), /not available/);
		assert.deepStrictEqual({ dispatchedActions, cached: backend.getNativeAnnotations(sessionResource).map(item => item.annotation) }, { dispatchedActions: [], cached: [annotation] });
	});

	test('native mutations report a rejected authoritative echo without fabricating success', async () => {
		const annotation = nativeAnnotation();
		const { backend, sessionResource } = createBackend({ annotations: [annotation] }, async action => ({
			channel: 'review-channel:/opaque', serverSeq: 1, origin: undefined, action, rejectionReason: 'Host rejected the edit',
		}));
		await assert.rejects(backend.setAnnotationResolved(sessionResource, annotation.id, true, nativeChannelUri), /Host rejected the edit/);
		assert.deepStrictEqual(backend.getAnnotations(sessionResource), [annotation]);
	});

	test('withdrawing a channel cancels confirmation without dispatching to its replacement', async () => {
		const pending = new DeferredPromise<ActionEnvelope>();
		const dispatched = new DeferredPromise<void>();
		const { backend, sessionResource, setChannel, dispatchedActions } = createBackend({ annotations: [nativeAnnotation()] }, (action, token) => {
			dispatched.complete();
			return raceCancellationError(pending.p, token);
		});
		const mutation = backend.removeAnnotation(sessionResource, 'native', nativeChannelUri);
		const rejected = assert.rejects(mutation, /Canceled/);
		await dispatched.p;
		setChannel(undefined);
		await rejected;
		setChannel(URI.parse('review-channel:/replacement'));
		assert.deepStrictEqual(dispatchedActions, [{ type: ActionType.AnnotationsRemoved, annotationId: 'native' }]);
	});

	test('channel replacement updates cached ownership and rejects stale native actions', async () => {
		const annotation = nativeAnnotation();
		const { backend, sessionResource, setChannel, dispatchedActions } = createBackend({ annotations: [annotation] });
		const original = backend.getNativeAnnotations(sessionResource)[0];
		const replacement = URI.parse('review-channel://tenant/replacement');
		setChannel(replacement);
		await assert.rejects(backend.updateAnnotationEntry(sessionResource, annotation.id, 'opening', 'stale edit', original.annotationsUri), /channel has changed/);
		await assert.rejects(backend.addAnnotationReply(sessionResource, annotation.id, 'new-reply', 'stale reply', original.annotationsUri), /channel has changed/);
		await assert.rejects(backend.removeAnnotation(sessionResource, annotation.id, original.annotationsUri), /channel has changed/);
		await assert.rejects(backend.setAnnotationResolved(sessionResource, annotation.id, true, original.annotationsUri), /channel has changed/);
		assert.deepStrictEqual({
			original: original.annotationsUri, replacement: backend.getNativeAnnotations(sessionResource)[0].annotationsUri,
			annotations: backend.getAnnotations(sessionResource), dispatchedActions,
		}, { original: nativeChannelUri, replacement, annotations: [annotation], dispatchedActions: [] });
	});

	test('removing an edited entry does not retarget the next entry', async () => {
		const annotation = nativeAnnotation();
		const { backend, sessionResource, setState, dispatchedActions } = createBackend({ annotations: [annotation] });
		backend.getNativeAnnotations(sessionResource);
		const remaining = { ...annotation, entries: annotation.entries.slice(1) };
		setState({ annotations: [remaining] });
		await assert.rejects(backend.updateAnnotationEntry(sessionResource, annotation.id, 'opening', 'old draft', nativeChannelUri), /no longer available/);
		assert.deepStrictEqual({ annotations: backend.getAnnotations(sessionResource), dispatchedActions }, { annotations: [remaining], dispatchedActions: [] });
	});

	for (const appliedBeforeDisconnect of [false, true]) {
		test(`retrying a replayed reply is idempotent (applied before disconnect: ${appliedBeforeDisconnect})`, async () => {
			const annotation = nativeAnnotation();
			let hostState: AnnotationsState = { annotations: [annotation] };
			let disconnected = false;
			const harness = createBackend(hostState, async action => {
				if (!disconnected) {
					disconnected = true;
					if (appliedBeforeDisconnect) {
						hostState = annotationsReducer(hostState, action);
					}
					throw new Error('Transport lost before acknowledgement');
				}
				hostState = annotationsReducer(hostState, action);
				harness.setState(hostState);
				return { channel: nativeChannelUri.toString(), action, serverSeq: 2, origin: undefined };
			});
			const { backend, sessionResource, dispatchedActions, setState } = harness;
			await assert.rejects(backend.addAnnotationReply(sessionResource, annotation.id, 'draft-reply', 'Reply', nativeChannelUri), /Transport lost/);
			hostState = annotationsReducer(hostState, dispatchedActions[0]);
			const reply = { id: 'draft-reply', text: 'Reply', _meta: { 'example.host': 'preserved' } };
			hostState = annotationsReducer(hostState, { type: ActionType.AnnotationsEntrySet, annotationId: annotation.id, entry: reply });
			setState(hostState);
			await backend.addAnnotationReply(sessionResource, annotation.id, 'draft-reply', 'Reply', nativeChannelUri);
			assert.deepStrictEqual(backend.getAnnotations(sessionResource), [{ ...annotation, entries: [...annotation.entries, reply] }]);
		});
	}

	test('identical recovery snapshots restore native availability without feedback changes', () => {
		const state = { annotations: [nativeAnnotation()] };
		const { backend, sessionResource, setState, setError } = createBackend(state);
		backend.getNativeAnnotations(sessionResource);
		const availability: boolean[] = [];
		let feedbackChanges = 0;
		store.add(backend.onDidChangeAnnotations(() => availability.push(backend.canEditAnnotations(sessionResource))));
		store.add(backend.onDidChangeItems(() => feedbackChanges++));
		setError(new Error('Subscription failed'));
		setState(state);
		setState(state);
		assert.deepStrictEqual({ availability, feedbackChanges, annotations: backend.getAnnotations(sessionResource) }, {
			availability: [false, true], feedbackChanges: 0, annotations: state.annotations,
		});
	});

	test('live connection availability gates native mutations without dropping cached annotations', async () => {
		const annotation = nativeAnnotation();
		const { backend, sessionResource, setConnectionStatus, dispatchedActions } = createBackend({ annotations: [annotation] });
		const cached = backend.getNativeAnnotations(sessionResource);
		const availability: boolean[] = [];
		let feedbackChanges = 0;
		store.add(backend.onDidChangeAnnotations(() => availability.push(backend.canEditAnnotations(sessionResource))));
		store.add(backend.onDidChangeItems(() => feedbackChanges++));
		setConnectionStatus(RemoteAgentHostConnectionStatus.reconnecting);
		await assert.rejects(backend.addAnnotationReply(sessionResource, annotation.id, 'new-reply', 'offline', nativeChannelUri), /not available/);
		const duringReconnect = { loaded: backend.hasLoaded(sessionResource), comments: backend.getNativeAnnotations(sessionResource) };
		setConnectionStatus(RemoteAgentHostConnectionStatus.connected);
		assert.deepStrictEqual({ availability, feedbackChanges, dispatchedActions, duringReconnect }, {
			availability: [false, true], feedbackChanges: 0, dispatchedActions: [], duringReconnect: { loaded: true, comments: cached },
		});
	});

	test('rebinds advertised channels on the same connection and stops using withdrawn channels', () => {
		const { backend, sessionResource, channelOperations, setChannel } = createBackend({ annotations: [] });
		const original = backend.getAnnotationsChannelResource(sessionResource)?.toString();
		const replacement = URI.parse('review-channel://tenant/replacement');
		setChannel(replacement);
		backend.remove(sessionResource, 'feedback');
		setChannel(undefined);
		const unavailable = backend.getAnnotationsChannelResource(sessionResource);
		setChannel(replacement);

		assert.deepStrictEqual({
			channelOperations,
			unavailable,
			current: backend.getAnnotationsChannelResource(sessionResource)?.toString(),
		}, {
			channelOperations: [
				{ operation: 'subscribe', resource: original },
				{ operation: 'unsubscribe', resource: original },
				{ operation: 'subscribe', resource: replacement.toString() },
				{ operation: ActionType.AnnotationsRemoved, resource: replacement.toString() },
				{ operation: 'unsubscribe', resource: replacement.toString() },
				{ operation: 'subscribe', resource: replacement.toString() },
			],
			unavailable: undefined,
			current: replacement.toString(),
		});
	});

	test('exposes native annotations without interpreting or rewriting metadata', () => {
		const state = deepFreeze<AnnotationsState>({
			annotations: [{
				id: 'native-thread',
				origin: { session: 'ahp-session:/owning-session', chat: 'ahp-chat:/another-chat', turnId: 'turn-1' },
				resource: 'file:///Q:/repo/file.ts',
				range: { start: { line: 4, character: 2 }, end: { line: 6, character: 8 } },
				resolved: false,
				entries: [
					{ id: 'opening-entry', text: 'Plain text with **literal markers**.' },
					{ id: 'reply-entry', text: { markdown: '**Markdown reply**' }, _meta: { 'example.provenance': { value: 'opaque' } } },
				],
				_meta: { 'example.annotation': { value: 'opaque' } },
			}, {
				id: 'file-annotation',
				origin: { session: 'ahp-session:/owning-session' },
				resource: 'file:///Q:/repo/other.ts',
				resolved: true,
				entries: [{ id: 'file-entry', text: 'A resolved file-level comment.' }],
				_meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind: 'unrecognized' } },
			}, {
				id: 'feedback',
				origin: { session: 'ahp-session:/owning-session' },
				resource: 'file:///Q:/repo/file.ts',
				resolved: false,
				entries: [{ id: 'feedback-entry', text: 'Existing feedback.' }],
				_meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind: 'user', state: 'accepted', sessionResource: 'remote-agent-host:///session' } },
			}],
		});
		const { backend, sessionResource, dispatchedActions } = createBackend(state);
		const snapshots: (readonly Annotation[])[] = [];
		store.add(backend.onDidChangeAnnotations(resource => snapshots.push(backend.getAnnotations(resource))));

		assert.deepStrictEqual({
			annotations: backend.getAnnotations(sessionResource),
			feedback: backend.getItems(sessionResource).map(item => ({ id: item.id, state: item.state })),
			snapshots,
			dispatchedActions,
		}, {
			annotations: state.annotations,
			feedback: [{ id: 'feedback', state: AgentFeedbackState.Accepted }],
			snapshots: [state.annotations],
			dispatchedActions: [],
		});
	});

	test('reports native snapshot and action updates independently of feedback', () => {
		const { backend, sessionResource, dispatchedActions, setState } = createBackend(undefined);
		const snapshots: (readonly Annotation[])[] = [];
		const feedbackChanges: (readonly string[])[] = [];
		store.add(backend.onDidChangeAnnotations(resource => snapshots.push(backend.getAnnotations(resource))));
		store.add(backend.onDidChangeItems(resource => feedbackChanges.push(backend.getItems(resource).map(item => item.id))));
		const beforeSnapshot = backend.getAnnotations(sessionResource);
		const annotation: Annotation = {
			id: 'native-thread',
			origin: { session: 'ahp-session:/owning-session' },
			resource: 'file:///repo/file.ts',
			resolved: false,
			entries: [{ id: 'original-entry', text: 'Original comment' }],
		};
		let state: AnnotationsState = { annotations: [annotation] };
		setState(state);
		setState({ annotations: [{ ...annotation }] });
		state = annotationsReducer(state, {
			type: ActionType.AnnotationsEntrySet,
			annotationId: annotation.id,
			entry: { id: 'reply-entry', text: { markdown: 'Reply' } },
		});
		setState(state);
		const replied = state.annotations;
		state = annotationsReducer(state, {
			type: ActionType.AnnotationsUpdated,
			annotationId: annotation.id,
			resolved: true,
		});
		setState(state);
		const resolved = state.annotations;
		state = annotationsReducer(state, { type: ActionType.AnnotationsRemoved, annotationId: annotation.id });
		setState(state);

		assert.deepStrictEqual({
			beforeSnapshot,
			snapshots,
			afterRemoval: backend.getAnnotations(sessionResource),
			feedbackChanges,
			dispatchedActions,
		}, {
			beforeSnapshot: [],
			snapshots: [[annotation], replied, resolved, []],
			afterRemoval: [],
			feedbackChanges: [[]],
			dispatchedActions: [],
		});
	});

	test('reconciles native and feedback state before notifying readers', () => {
		const { backend, sessionResource, setState } = createBackend({ annotations: [] });
		backend.getAnnotations(sessionResource);
		const snapshots: { annotations: readonly string[]; feedback: readonly string[] }[] = [];
		const readSnapshot = () => snapshots.push({
			annotations: backend.getAnnotations(sessionResource).map(annotation => annotation.id),
			feedback: backend.getItems(sessionResource).map(item => item.id),
		});
		store.add(backend.onDidChangeAnnotations(readSnapshot));
		store.add(backend.onDidChangeItems(readSnapshot));

		setState({
			annotations: [{
				id: 'feedback',
				origin: { session: 'ahp-session:/owning-session' },
				resource: 'file:///repo/file.ts',
				resolved: false,
				entries: [{ id: 'opening-entry', text: 'Updated feedback' }],
				_meta: { [FEEDBACK_ANNOTATION_META_KEY]: { kind: 'user', state: 'accepted', sessionResource: sessionResource.toString() } },
			}],
		});

		assert.deepStrictEqual(snapshots, [
			{ annotations: ['feedback'], feedback: ['feedback'] },
			{ annotations: ['feedback'], feedback: ['feedback'] },
		]);
	});

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
				annotations: backend.getAnnotations(sessionResource),
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
				deleted: { operations, items: backend.getItems(sessionResource), annotations: backend.getAnnotations(sessionResource) },
			}, {
				opened: initiallyAvailable ? ['subscribe'] : [],
				enabled: ['subscribe'],
				suspended: ['subscribe', 'unsubscribe'],
				disabled: { operations: ['subscribe', 'unsubscribe'], items: ['Saved feedback'], annotations: state.annotations, channel: undefined, loaded: false },
				recovered: ['subscribe', 'unsubscribe', 'subscribe'],
				deleted: { operations: ['subscribe', 'unsubscribe', 'subscribe', 'unsubscribe'], items: [], annotations: [] },
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
		const nativeAnnotation: Annotation = {
			id: 'native-thread',
			origin: { session: 'ahp-session:/owning-session' },
			resource: 'file:///repo/file.ts',
			resolved: false,
			entries: [{ id: 'original-entry', text: 'Native comment' }],
		};
		let state: AnnotationsState = {
			annotations: [nativeAnnotation, {
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
		const nativeEvents: string[][] = [];
		store.add(backend.onDidChangeItems(resource => events.push(backend.getItems(resource).map(item => item.id))));
		store.add(backend.onDidChangeAnnotations(resource => nativeEvents.push(backend.getAnnotations(resource).map(annotation => annotation.id))));

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
			nativeAfterClear: backend.getAnnotations(sessionResource),
			nativeEvents,
		}, {
			afterAdd: ['existing', 'added'],
			afterRemove: ['existing'],
			afterClear: [],
			events: [
				['existing', 'added'],
				['existing'],
				[],
			],
			nativeAfterClear: [nativeAnnotation],
			nativeEvents: [
				['native-thread', 'existing'],
				['native-thread', 'existing', 'added'],
				['native-thread', 'existing'],
				['native-thread'],
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
				const state: AnnotationsState = {
					annotations: [{
						id: 'native-thread',
						origin: { session: 'ahp-session:/owning-session' },
						resource: 'file:///repo/file.ts',
						resolved: false,
						entries: [{ id: 'original-entry', text: name }],
					}],
				};
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
		const nativeChanges: (readonly Annotation[])[] = [];
		store.add(backend.onDidChangeAnnotations(resource => nativeChanges.push(backend.getAnnotations(resource))));

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

		assert.deepStrictEqual({
			log,
			nativeChanges: nativeChanges.map(annotations => annotations.map(annotation => ({ id: annotation.id, entries: annotation.entries }))),
			current: backend.getAnnotations(sessionResource),
		}, {
			log: [
				'old: subscribe',
				'old: unsubscribe',
				'new: subscribe',
				'new: annotations/set',
			],
			nativeChanges: [
				[{ id: 'native-thread', entries: [{ id: 'original-entry', text: 'old' }] }],
				[{ id: 'native-thread', entries: [{ id: 'original-entry', text: 'new' }] }],
			],
			current: nativeChanges[1],
		});
	});
});
