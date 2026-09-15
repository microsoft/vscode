/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
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
	type SessionMode = { readonly id: string; readonly kind: string };

	interface ITestSession {
		readonly session: IActiveSession;
		readonly mode: ISettableObservable<SessionMode | undefined>;
		readonly status: ISettableObservable<SessionStatus>;
	}

	function createSession(id: string, providerId: string, resourceScheme: string, selectedAgentUri: string | undefined, status: SessionStatus): ITestSession {
		const mode = observableValue<SessionMode | undefined>(`mode-${id}`, selectedAgentUri ? { id: selectedAgentUri, kind: 'agent' } : undefined);
		const sessionStatus = observableValue(`status-${id}`, status);
		const session = new class extends mock<IActiveSession>() {
			override readonly sessionId = `${providerId}:${id}`;
			override readonly resource = URI.parse(`${resourceScheme}:/${id}`);
			override readonly providerId = providerId;
			override readonly mode = mode;
			override readonly status = sessionStatus;
		};
		return { session, mode, status: sessionStatus };
	}

	function createContributionHarness(
		providerId: string,
		initialSession: ITestSession | undefined,
		sessions: readonly ITestSession[],
		customAgents: Map<string, readonly AgentCustomization[]>,
		storedAgentUri?: string,
	) {
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', initialSession?.session);
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSession;
		};
		const sessionById = new Map(sessions.map(state => [state.session.sessionId, state]));
		const customAgentsChanged = store.add(new Emitter<void>());
		const setAgentCalls: Array<{ readonly sessionId: string; readonly agentUri: string | undefined }> = [];
		const provider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = providerId;
			override readonly onDidChangeCustomAgents = customAgentsChanged.event;
			override getCustomAgents(sessionId: string): readonly AgentCustomization[] {
				return customAgents.get(sessionId) ?? [];
			}
			override setAgent(sessionId: string, agent: ISessionAgentRef | undefined): void {
				setAgentCalls.push({ sessionId, agentUri: agent?.uri });
				sessionById.get(sessionId)?.mode.set(agent ? { id: agent.uri, kind: 'agent' } : undefined, undefined);
			}
		};
		const sessionsProvidersService = new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(candidateId: string): T | undefined {
				return (candidateId === provider.id ? provider : undefined) as T | undefined;
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
		if (storedAgentUri && initialSession) {
			storageService.store(agentHostAgentPickerStorageKey(initialSession.session.resource.scheme), storedAgentUri, StorageScope.PROFILE, StorageTarget.MACHINE);
		}

		store.add(new AgentHostAgentPickerContribution(
			new NullActionViewItemService(),
			sessionsService,
			sessionsProvidersService,
			chatService,
			chatWidgetService,
			storageService,
			new NullLogService(),
		));

		return {
			activeSession,
			customAgentsChanged,
			registerSession: (state: ITestSession) => sessionById.set(state.session.sessionId, state),
			setAgentCalls,
			storageService,
		};
	}

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

	test('preserves selection through graduation, background switching, and reopen hydration', () => {
		const resourceScheme = 'agent-host-copilotcli';
		const draft = createSession('draft-a', LOCAL_AGENT_HOST_PROVIDER_ID, resourceScheme, beta.uri, SessionStatus.Untitled);
		const committed = createSession('session-a', LOCAL_AGENT_HOST_PROVIDER_ID, resourceScheme, beta.uri, SessionStatus.InProgress);
		const defaultSession = createSession('session-b', LOCAL_AGENT_HOST_PROVIDER_ID, resourceScheme, undefined, SessionStatus.InProgress);
		const customAgents = new Map<string, readonly AgentCustomization[]>([
			[draft.session.sessionId, agents],
			[committed.session.sessionId, [alpha]],
			[defaultSession.session.sessionId, agents],
		]);
		const harness = createContributionHarness(
			LOCAL_AGENT_HOST_PROVIDER_ID,
			draft,
			[draft, committed, defaultSession],
			customAgents,
			beta.uri,
		);
		const storageKey = agentHostAgentPickerStorageKey(resourceScheme);

		harness.activeSession.set(committed.session, undefined);
		const afterGraduation = committed.mode.get()?.id;

		for (let i = 0; i < 3; i++) {
			harness.activeSession.set(defaultSession.session, undefined);
			committed.status.set(SessionStatus.Completed, undefined);
			harness.customAgentsChanged.fire();
			harness.activeSession.set(committed.session, undefined);
		}
		const afterBackgroundSwitches = {
			custom: committed.mode.get()?.id,
			default: defaultSession.mode.get()?.id,
		};

		const reopened: Array<{ readonly beforeHydration: string | undefined; readonly afterHydration: string | undefined }> = [];
		for (let i = 0; i < 3; i++) {
			harness.activeSession.set(undefined, undefined);
			const restored = createSession('session-a', LOCAL_AGENT_HOST_PROVIDER_ID, resourceScheme, undefined, SessionStatus.Completed);
			harness.registerSession(restored);
			customAgents.set(restored.session.sessionId, [alpha]);
			harness.activeSession.set(restored.session, undefined);
			const beforeHydration = restored.mode.get()?.id;
			restored.mode.set({ id: beta.uri, kind: 'agent' }, undefined);
			const afterHydration = restored.mode.get()?.id;
			reopened.push({ beforeHydration, afterHydration });
		}

		assert.deepStrictEqual({
			afterGraduation,
			afterBackgroundSwitches,
			reopened,
			remembered: harness.storageService.get(storageKey, StorageScope.PROFILE),
			setAgentCalls: harness.setAgentCalls,
		}, {
			afterGraduation: beta.uri,
			afterBackgroundSwitches: {
				custom: beta.uri,
				default: undefined,
			},
			reopened: [
				{ beforeHydration: undefined, afterHydration: beta.uri },
				{ beforeHydration: undefined, afterHydration: beta.uri },
				{ beforeHydration: undefined, afterHydration: beta.uri },
			],
			remembered: beta.uri,
			setAgentCalls: [],
		});
	});

	test('preserves a remote session selection while its catalog hydrates', () => {
		const providerId = 'agenthost-ssh-test';
		const session = createSession('remote-session', providerId, 'agent-host-copilotcli-ssh-test', beta.uri, SessionStatus.Completed);
		const customAgents = new Map<string, readonly AgentCustomization[]>([[session.session.sessionId, [alpha]]]);
		const harness = createContributionHarness(providerId, session, [session], customAgents, beta.uri);

		harness.customAgentsChanged.fire();

		assert.deepStrictEqual({
			selected: session.mode.get()?.id,
			setAgentCalls: harness.setAgentCalls,
		}, {
			selected: beta.uri,
			setAgentCalls: [],
		});
	});

	test('still initializes an untitled session from the remembered agent', () => {
		const session = createSession('untitled', LOCAL_AGENT_HOST_PROVIDER_ID, 'agent-host-copilotcli', undefined, SessionStatus.Untitled);
		const customAgents = new Map<string, readonly AgentCustomization[]>([[session.session.sessionId, agents]]);
		const harness = createContributionHarness(LOCAL_AGENT_HOST_PROVIDER_ID, session, [session], customAgents, beta.uri);

		assert.deepStrictEqual({
			selected: session.mode.get()?.id,
			setAgentCalls: harness.setAgentCalls,
		}, {
			selected: beta.uri,
			setAgentCalls: [{ sessionId: session.session.sessionId, agentUri: beta.uri }],
		});
	});
});
