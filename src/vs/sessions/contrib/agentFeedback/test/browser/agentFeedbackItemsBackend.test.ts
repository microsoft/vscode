/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { createAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { FEEDBACK_ANNOTATION_META_KEY } from '../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType, ClientAnnotationsAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { annotationsReducer } from '../../../../../platform/agentHost/common/state/sessionReducers.js';
import { AnnotationsState, ComponentToState, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { AnnotationsAgentFeedbackItemsBackend } from '../../browser/agentFeedbackItemsBackend.js';
import { AgentFeedbackKind, AgentFeedbackState } from '../../browser/agentFeedbackService.js';

suite('AnnotationsAgentFeedbackItemsBackend', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
});
