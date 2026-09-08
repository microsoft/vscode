/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { CustomizationType, type AgentCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { agentHostAgentPickerStorageKey, resolveAgentHostAgent } from '../../../../../../platform/agentHost/common/customAgents.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionAgentRef, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { AgentHostAgentPickerContribution } from '../../browser/agentHostAgentPicker.js';

suite('agentHostAgentPicker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const alpha: AgentCustomization = { type: CustomizationType.Agent, id: 'agent://a', uri: 'agent://a', name: 'alpha' };
	const beta: AgentCustomization = { type: CustomizationType.Agent, id: 'agent://b', uri: 'agent://b', name: 'beta', description: 'b desc' };
	const agents: readonly AgentCustomization[] = [alpha, beta];

	suite('agentHostAgentPickerStorageKey', () => {
		test('builds a per-scheme storage key', () => {
			assert.strictEqual(
				agentHostAgentPickerStorageKey('agent-host-copilotcli'),
				'workbench.agentsession.agentHostAgentPicker.agent-host-copilotcli.selectedAgentUri',
			);
		});
	});

	suite('resolveAgentHostAgent', () => {
		test('returns the session-selected agent when its URI is in the list', () => {
			assert.deepStrictEqual(resolveAgentHostAgent(agents, 'agent://b', undefined), beta);
		});

		test('falls back to the stored URI when the session has no selection', () => {
			assert.strictEqual(resolveAgentHostAgent(agents, undefined, 'agent://a'), alpha);
		});

		test('returns undefined when neither session nor stored selection matches the list', () => {
			assert.strictEqual(resolveAgentHostAgent(agents, undefined, 'agent://missing'), undefined);
			assert.strictEqual(resolveAgentHostAgent(agents, 'agent://missing', undefined), undefined);
		});

		test('session selection wins over stored selection', () => {
			assert.deepStrictEqual(resolveAgentHostAgent(agents, 'agent://a', 'agent://b'), alpha);
		});

		test('falls through to stored URI when the session agent URI is not in the list', () => {
			// The session's recorded selection is no longer in the effective
			// agent list (e.g. the customization providing it was removed),
			// so the stored fallback is consulted.
			assert.deepStrictEqual(resolveAgentHostAgent(agents, 'agent://gone', 'agent://a'), alpha);
		});

		test('returns undefined for an empty agent list', () => {
			assert.strictEqual(resolveAgentHostAgent([], 'agent://a', 'agent://a'), undefined);
			assert.strictEqual(resolveAgentHostAgent([], undefined, undefined), undefined);
		});
	});

	test('preserves an established selection without changing untitled initialization', () => {
		const sessionMode = observableValue<{ readonly id: string; readonly kind: string } | undefined>('sessionMode', { id: beta.uri, kind: 'agent' });
		const sessionStatus = observableValue('sessionStatus', SessionStatus.Completed);
		const session = new class extends mock<IActiveSession>() {
			override readonly sessionId = `${LOCAL_AGENT_HOST_PROVIDER_ID}:session-1`;
			override readonly resource = URI.parse('agent-host-copilotcli:/session-1');
			override readonly providerId = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly mode = sessionMode;
			override readonly status = sessionStatus;
		};
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(session);
		};

		let customAgents: readonly AgentCustomization[] = agents;
		const customAgentsChanged = store.add(new Emitter<void>());
		const setAgentCalls: Array<string | undefined> = [];
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly onDidChangeCustomAgents = customAgentsChanged.event;
			override getCustomAgents(): readonly AgentCustomization[] {
				return customAgents;
			}
			override setAgent(_sessionId: string, agent: ISessionAgentRef | undefined): void {
				setAgentCalls.push(agent?.uri);
				sessionMode.set(agent ? { id: agent.uri, kind: 'agent' } : undefined, undefined);
			}
		};
		const sessionsProvidersService = new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				return (providerId === provider.id ? provider : undefined) as T | undefined;
			}
		};
		const chatService = new class extends mock<IChatService>() {
			override getSession() {
				return undefined;
			}
		};
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = Event.None;
			override readonly onDidChangeFocusedSession = Event.None;
			override getWidgetBySessionResource() {
				return undefined;
			}
		};
		const storageService = store.add(new TestStorageService());
		const storageKey = agentHostAgentPickerStorageKey(session.resource.scheme);
		storageService.store(storageKey, beta.uri, StorageScope.PROFILE, StorageTarget.MACHINE);

		store.add(new AgentHostAgentPickerContribution(
			new NullActionViewItemService(),
			sessionsService,
			sessionsProvidersService,
			chatService,
			chatWidgetService,
			storageService,
			new NullLogService(),
		));

		customAgents = [alpha];
		customAgentsChanged.fire();
		const unavailable = sessionMode.get()?.id;

		customAgents = agents;
		customAgentsChanged.fire();
		const established = {
			unavailable,
			restored: sessionMode.get()?.id,
			remembered: storageService.get(storageKey, StorageScope.PROFILE),
			setAgentCalls: [...setAgentCalls],
		};

		sessionMode.set(undefined, undefined);
		sessionStatus.set(SessionStatus.Untitled, undefined);

		assert.deepStrictEqual({
			established,
			untitled: {
				selected: sessionMode.get()?.id,
				remembered: storageService.get(storageKey, StorageScope.PROFILE),
				setAgentCalls,
			},
		}, {
			established: {
				unavailable: beta.uri,
				restored: beta.uri,
				remembered: beta.uri,
				setAgentCalls: [],
			},
			untitled: {
				selected: beta.uri,
				remembered: beta.uri,
				setAgentCalls: [beta.uri],
			},
		});
	});
});
