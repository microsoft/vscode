/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { createAgentHostResourceUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { FEEDBACK_ANNOTATION_META_KEY } from '../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType, ClientAnnotationsAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { AnnotationsState, ComponentToState, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { AnnotationsAgentFeedbackItemsBackend } from '../../browser/agentFeedbackItemsBackend.js';

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
						kind: 'codeReview',
						state: 'created',
						sessionResource: sessionResource.toString(),
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

		assert.deepStrictEqual({
			decoded: feedback.resourceUri.toString(),
			encoded: dispatchedActions.find(action => action.type === ActionType.AnnotationsSet)?.annotation.resource,
		}, {
			decoded: resourceUris.fromAgentHost(agentHostResource).toString(),
			encoded: agentHostResource.toString(),
		});
	});
});
