/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, AgentsWindowInvitationState } from '../../../../../platform/chat/common/agentsWindowInvitation.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { EditorCloseContext, IEditorCloseEvent } from '../../../../common/editor.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../../services/assignment/test/common/nullAssignmentService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IAgentSessionsModel } from '../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatInputNotificationActionKind, IChatInputNotification, IChatInputNotificationContext, IChatInputNotificationService } from '../../browser/widget/input/chatInputNotificationService.js';
import { ChatEditorInput } from '../../browser/widgetHosts/editor/chatEditorInput.js';
import { agentsWindowInvitationScenarios, getAgentsWindowInvitationTreatment } from '../../common/agentsWindowInvitation.js';
import { AgentsWindowUsage } from '../../common/agentsWindowUsage.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService, SessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../common/constants.js';
import { IChatChangeEvent, IChatModel, IChatPendingRequest, IChatRequestModel, IChatRequestNeedsInputInfo } from '../../common/model/chatModel.js';
import { IChatViewModel } from '../../common/model/chatViewModel.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { AgentsWindowInvitationContribution } from '../../electron-browser/agentSessions/agentsWindowInvitation.js';
import { AgentHostEditorActivity, IAgentHostEditorActivityService } from '../../electron-browser/agentSessions/agentHostEditorActivity.js';

suite('AgentsWindowInvitation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options: { enabled?: boolean; developerMode?: boolean; autoShow?: boolean; claimDelay?: Promise<void>; isSessionsWindow?: boolean } = {}) {
		const instantiation = store.add(new TestInstantiationService());
		const storage = store.add(new InMemoryStorageService());
		const coordinator = store.add(new AgentsWindowInvitationState(Date.now, storage));
		const focused = store.add(new Emitter<void>());
		const added = store.add(new Emitter<IChatWidget>());
		const removed = store.add(new Emitter<IChatWidget>());
		const closed = store.add(new Emitter<IEditorCloseEvent>());
		const accepted = store.add(new Emitter<IChatRequestAcceptedEvent>());
		const refetched = store.add(new Emitter<void>());
		const configuration = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown): Promise<void> {
				await this.setUserConfiguration(key, value);
				this.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: section => section === key }));
			}
		}({
			[ChatConfiguration.AgentsWindowBannerEnabled]: options.enabled ?? true,
			[ChatConfiguration.AgentsWindowBannerDeveloperMode]: options.developerMode ?? false,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const treatments = new Map<string, string | number | boolean>();
		const models = observableValue<Iterable<IChatModel>>(store, []);
		const widgets: IChatWidget[] = [];
		const events: { name: string | undefined; data: object | undefined }[] = [];
		const opens: (IOpenAgentsWindowOptions | undefined)[] = [];
		const warnings: string[] = [];
		const claims: URI[] = [];
		let focusedWidget: IChatWidget | undefined;
		let notification: IChatInputNotification | undefined;
		let allowed = true;
		let hostFocused = true;
		let autoShow = options.autoShow ?? true;
		const context = upcastPartial<IContextKeyService>({ contextMatchesRules: () => allowed, onDidChangeContext: Event.None });
		const telemetry = new class extends TestExperimentTriggerTelemetryService {
			override publicLog2(name?: string, data?: object): void {
				super.publicLog2(name, data);
				events.push({ name, data });
			}
		}();
		const native = upcastPartial<INativeHostService>({
			windowId: 1,
			onDidChangeAgentHostEditorState: coordinator.onDidChange,
			getAgentHostEditorState: async count => coordinator.initialize(count),
			updateAgentHostEditorState: async update => coordinator.update(1, update),
			claimAgentsWindowInvitation: async (resource, developerMode) => {
				claims.push(URI.revive(resource));
				const invitation = coordinator.claim(1, URI.revive(resource), developerMode);
				if (options.claimDelay) {
					await options.claimDelay;
				}
				return invitation;
			},
			markAgentsWindowInvitationShown: async id => coordinator.markShown(1, id),
			releaseAgentsWindowInvitation: async id => coordinator.release(1, id),
			openAgentsWindow: async options => { opens.push(options); },
		});
		instantiation.stub(INativeHostService, native);
		instantiation.stub(IStorageService, storage);
		instantiation.stub(IConfigurationService, configuration);
		instantiation.stub(IContextKeyService, context);
		instantiation.stub(ITelemetryService, telemetry);
		instantiation.stub(ILogService, new class extends NullLogService {
			override error(message: string | Error): void { warnings.push(String(message)); }
			override warn(message: string): void { warnings.push(message); }
		}());
		instantiation.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: options.isSessionsWindow ?? false }));
		instantiation.stub(IEditorService, upcastPartial<IEditorService>({ onDidCloseEditor: closed.event }));
		instantiation.stub(IHostService, upcastPartial<IHostService>({ get hasFocus() { return hostFocused; }, onDidChangeFocus: Event.map(focused.event, () => hostFocused) }));
		instantiation.stub(ILifecycleService, upcastPartial<ILifecycleService>({ onWillShutdown: Event.None }));
		instantiation.stub(IChatService, upcastPartial<IChatService>({
			chatModels: models, onDidAcceptRequest: accepted.event, onDidDisposeSession: Event.None,
		}));
		instantiation.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ onDidCommitSession: Event.None }));
		instantiation.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			model: upcastPartial<IAgentSessionsModel>({ onDidChangeSessions: Event.None, getSession: () => undefined }),
		}));
		instantiation.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			get lastFocusedWidget() { return focusedWidget; },
			getAllWidgets: () => widgets,
			onDidChangeFocusedSession: focused.event,
			onDidAddWidget: added.event,
			onDidRemoveWidget: removed.event,
			onDidChangeWidgetVisibility: Event.None,
		}));
		const notificationContext = (): IChatInputNotificationContext => {
			const resource = focusedWidget?.viewModel?.sessionResource;
			return {
				inputUri: focusedWidget?.inputPart.inputUri,
				sessionType: resource ? getChatSessionType(resource) : undefined,
				sessionResource: resource,
				deferredNotificationsEnabled: true,
				isTransientChat: false,
				sessionStarted: focusedWidget?.viewModel?.model.hasRequests ?? false,
				modelState: { currentModel: undefined, models: [] },
			};
		};
		instantiation.stub(IChatInputNotificationService, upcastPartial<IChatInputNotificationService>({
			setNotification: value => {
				notification = value;
				if (autoShow) {
					value.onDidShow?.(notificationContext());
				}
			},
			deleteNotification: () => { notification = undefined; },
		}));
		instantiation.stub(IWorkbenchAssignmentService, new class extends NullWorkbenchAssignmentService {
			override readonly onDidRefetchAssignments = refetched.event;
			override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
				return treatments.get(name) as T | undefined;
			}
		}());

		const addChat = (path: string, sessionType: string = SessionType.AgentHostCopilot, overrides: Partial<IChatWidget> = {}) => {
			const resource = URI.from({ scheme: sessionType, path });
			const requests: IChatRequestModel[] = [];
			const pending: IChatPendingRequest[] = [];
			const changed = store.add(new Emitter<IChatChangeEvent>());
			const pendingChanged = store.add(new Emitter<void>());
			const inProgress = observableValue(store, false);
			const needsInput = observableValue<IChatRequestNeedsInputInfo | undefined>(store, undefined);
			const model = upcastPartial<IChatModel>({
				sessionResource: resource,
				get hasRequests() { return requests.length > 0; },
				getRequests: () => requests,
				getPendingRequests: () => pending,
				onDidChange: changed.event,
				onDidChangePendingRequests: pendingChanged.event,
				requestInProgress: inProgress,
				requestNeedsInput: needsInput,
			});
			const widget = upcastPartial<IChatWidget>({
				domNode: mainWindow.document.createElement('div'),
				location: ChatAgentLocation.Chat,
				visible: true,
				viewContext: { viewId: 'workbench.panel.chat.view' },
				viewModel: upcastPartial<IChatViewModel>({ sessionResource: resource, model }),
				inputPart: upcastPartial<IChatWidget['inputPart']>({ inputUri: URI.from({ scheme: 'chat-input', path }) }),
				scopedContextKeyService: context,
				onDidChangeViewModel: Event.None,
				...overrides,
			});
			models.set([...models.get(), model], undefined);
			widgets.push(widget);
			added.fire(widget);
			return {
				widget, resource, inProgress, needsInput,
				send: (timestamp = Date.now(), isNewSession = requests.length === 0, isSystemInitiated = false) => {
					const request = upcastPartial<IChatRequestModel>({ timestamp, isSystemInitiated });
					requests.push(request);
					inProgress.set(true, undefined);
					if (!isSystemInitiated) {
						accepted.fire({ chatSessionResource: resource, isNewSession });
					}
					changed.fire({ kind: 'addRequest', request });
				},
				queue: () => {
					pending.push(upcastPartial<IChatPendingRequest>({ request: upcastPartial<IChatRequestModel>({ timestamp: Date.now() }) }));
					pendingChanged.fire();
				},
			};
		};
		const activity = store.add(instantiation.createInstance(AgentHostEditorActivity));
		instantiation.stub(IAgentHostEditorActivityService, activity);
		const contribution = store.add(instantiation.createInstance(AgentsWindowInvitationContribution));
		return {
			addChat, coordinator, storage, treatments, configuration, telemetry, events, opens, warnings, claims, contribution, activity,
			get notification() { return notification; },
			get scenario() { return notification?.telemetryId; },
			set allowed(value: boolean) { allowed = value; focused.fire(); },
			set hostFocused(value: boolean) { hostFocused = value; focused.fire(); },
			focus: (widget: IChatWidget) => { focusedWidget = widget; focused.fire(); },
			close: (widget: IChatWidget) => {
				widgets.splice(widgets.indexOf(widget), 1);
				removed.fire(widget);
			},
			closeEditor: (resource: URI, context = EditorCloseContext.UNKNOWN) => {
				instantiation.stub(IDialogService, {});
				instantiation.stub(IWorkspaceContextService, {});
				instantiation.stub(IAgentHostEnablementService, {});
				instantiation.stub(IAgentHostConnectionsService, {});
				instantiation.stub(IProgressService, {});
				const editor = store.add(instantiation.createInstance(ChatEditorInput, resource, {}));
				closed.fire({ editor, groupId: 1, context, index: 0, sticky: false });
			},
			show: () => { autoShow = true; notification?.onDidShow?.(notificationContext()); },
			refetch: async () => { refetched.fire(); await timeout(0); },
			configure: async (key: string, value: boolean) => {
				await configuration.setUserConfiguration(key, value);
				configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: section => section === key }));
				await timeout(0);
			},
			otherSession: (windowId = 2) => {
				if (windowId === 1) {
					addChat('/other-1').send();
					return;
				}
				const resource = URI.from({ scheme: SessionType.AgentHostCopilot, path: `/other-${windowId}` });
				coordinator.update(windowId, { kind: 'request', resource, isNewSession: true });
				coordinator.update(windowId, { kind: 'sessions', sessions: [{ resource, inProgress: true, needsInput: false }] });
			},
			click: async (index: number) => {
				const action = notification?.actions[index];
				assert.ok(action && action.kind === ChatInputNotificationActionKind.Command);
				const command = CommandsRegistry.getCommand(action.commandId);
				assert.ok(command);
				await instantiation.invokeFunction(accessor => command.handler(accessor, ...action.commandArgs ?? []));
				await timeout(0);
			},
		};
	}

	test('records harness impressions after queued session creation updates', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send();
		await h.activity.recordCopilotHarnessIntroductionShown();
		assert.deepStrictEqual({
			count: h.coordinator.getState().editorSessionCount,
			harnessLastShown: h.coordinator.getState().lastCopilotHarnessIntroductionSessionCount,
			invitationLastShown: h.coordinator.getState().lastShown,
			warnings: h.warnings,
		}, { count: 1, harnessLastShown: 1, invitationLastShown: undefined, warnings: [] });
	}));

	for (const scenario of agentsWindowInvitationScenarios) {
		test(`shows ${scenario.id} at its exact latest-message delay and opens that session`, () => runWithFakedTimers({ startTime: 100_000 }, async () => {
			const h = createHarness();
			const chat = h.addChat('/current');
			h.focus(chat.widget);
			chat.send();
			await timeout(0);
			if (scenario.id !== 'continueInAgentsWindow') {
				h.otherSession(scenario.id === 'parallelWorkSameWindow' ? 1 : 2);
			}
			await timeout(scenario.delaySeconds * 1000 - 1);
			const before = h.scenario;
			await timeout(1);
			const shown = {
				scenario: h.scenario,
				title: h.notification?.message,
				description: h.notification?.description,
				actions: h.notification?.actions.map(({ label, primary }) => ({ label, primary })),
			};
			await h.click(0);
			assert.deepStrictEqual({ before, shown, opens: h.opens, notification: h.notification, warnings: h.warnings }, {
				before: undefined,
				shown: {
					scenario: scenario.id,
					title: scenario.title,
					description: scenario.description,
					actions: [
						{ label: scenario.actionLabel, primary: true },
						{ label: 'Don\'t Show Again', primary: false },
					],
				},
				opens: [{ sessionResource: chat.resource.toJSON(), onboardingSessionResource: chat.resource.toJSON(), source: scenario.source }],
				notification: undefined, warnings: [],
			});
		}));

		for (const revealCurrentSession of [false, true]) {
			test(`${scenario.id} preserves its spotlight target with session reveal ${revealCurrentSession} and triggers only on click`, () => runWithFakedTimers({ startTime: 100_000 }, async () => {
				const h = createHarness();
				await h.configure(ChatConfiguration.AgentsWindowBannerRevealCurrentSession, revealCurrentSession);
				const chat = h.addChat('/current');
				h.focus(chat.widget);
				if (scenario.id !== 'continueInAgentsWindow') {
					h.otherSession(scenario.id === 'parallelWorkSameWindow' ? 1 : 2);
				}
				chat.send();
				await timeout(0);
				await timeout(scenario.delaySeconds * 1000);
				const treatment = `config.${ChatConfiguration.AgentsWindowBannerRevealCurrentSession}`;
				const triggeredBeforeClick = h.telemetry.triggers.includes(treatment);
				await h.click(0);
				assert.deepStrictEqual({
					opens: h.opens, triggeredBeforeClick, triggeredAfterClick: h.telemetry.triggers.includes(treatment),
				}, {
					opens: [{
						sessionResource: revealCurrentSession ? chat.resource.toJSON() : undefined,
						onboardingSessionResource: chat.resource.toJSON(),
						source: scenario.source,
					}],
					triggeredBeforeClick: false, triggeredAfterClick: true,
				});
			}));
		}

		test(`suppresses ${scenario.id} until exactly five new sessions after the harness introduction`, () => runWithFakedTimers({ startTime: 100_000 }, async () => {
			const h = createHarness();
			const chat = h.addChat('/current');
			h.focus(chat.widget);
			chat.send();
			if (scenario.id !== 'continueInAgentsWindow') {
				h.otherSession(scenario.id === 'parallelWorkSameWindow' ? 1 : 2);
			}
			await h.activity.recordCopilotHarnessIntroductionShown();
			await timeout(scenario.delaySeconds * 1000);
			const notifications = [h.scenario];
			for (let index = 0; index < 5; index++) {
				const additional = h.addChat(`/additional-${index}`);
				additional.send();
				additional.inProgress.set(false, undefined);
				await timeout(0);
				notifications.push(h.scenario);
			}
			assert.deepStrictEqual(notifications, [undefined, undefined, undefined, undefined, undefined, scenario.id]);
		}));

		test(`suppresses ${scenario.id} for active Agents Window users until the exact 30-day boundary`, () => runWithFakedTimers({ startTime: 60 * 24 * 60 * 60 * 1000 }, async () => {
			const h = createHarness();
			h.storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 3, StorageScope.APPLICATION, StorageTarget.MACHINE);
			h.storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, Date.now() - 30 * 24 * 60 * 60 * 1000 + 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
			const chat = h.addChat('/current');
			h.focus(chat.widget);
			chat.send(Date.now() - 30_000);
			if (scenario.id !== 'continueInAgentsWindow') {
				h.otherSession(scenario.id === 'parallelWorkSameWindow' ? 1 : 2);
			}
			await timeout(0);
			const before = { notification: h.notification, claim: h.coordinator.getState().invitation, history: h.coordinator.getState().lastShown };
			h.hostFocused = false;
			await timeout(1);
			h.hostFocused = true;
			await timeout(0);
			assert.deepStrictEqual({ before, after: h.scenario }, {
				before: { notification: undefined, claim: undefined, history: undefined },
				after: scenario.id,
			});
		}));

		test(`developer mode previews ${scenario.id} for active Agents Window users after the harness introduction`, () => runWithFakedTimers({ startTime: 100_000 }, async () => {
			const h = createHarness({ developerMode: true });
			const usage = new AgentsWindowUsage(h.storage);
			for (let index = 0; index < 3; index++) {
				usage.recordSessionCreated();
			}
			const chat = h.addChat('/current');
			h.focus(chat.widget);
			if (scenario.id !== 'continueInAgentsWindow') {
				h.otherSession(scenario.id === 'parallelWorkSameWindow' ? 1 : 2);
			}
			await timeout(0);
			await h.activity.recordCopilotHarnessIntroductionShown();
			chat.send(Date.now() - scenario.delaySeconds * 1000);
			await timeout(0);
			assert.deepStrictEqual({
				title: h.notification?.message, description: h.notification?.description,
				history: h.coordinator.getState().lastShown, triggers: h.telemetry.triggers,
			}, {
				title: scenario.title, description: scenario.description, history: undefined, triggers: [],
			});
		}));
	}

	for (const developerMode of [false, true]) {
		test(`a date-only Agents Window update suppresses an existing invitation unless developer mode is enabled (${developerMode})`, () => runWithFakedTimers({ startTime: 60 * 24 * 60 * 60 * 1000 }, async () => {
			const h = createHarness({ developerMode });
			h.storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 4, StorageScope.APPLICATION, StorageTarget.MACHINE);
			h.storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, 1, StorageScope.APPLICATION, StorageTarget.MACHINE);
			const chat = h.addChat('/current');
			h.focus(chat.widget);
			chat.send(Date.now() - 30_000);
			await timeout(0);
			const original = h.notification;
			const history = h.coordinator.getState().lastShown;
			h.hostFocused = false;
			h.storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, Date.now(), StorageScope.APPLICATION, StorageTarget.MACHINE);
			const visibleBeforeReturn = !!h.notification;
			h.hostFocused = true;
			await timeout(0);
			assert.deepStrictEqual({
				originallyShown: !!original, visibleBeforeReturn,
				retained: h.notification === original, visibleAfterReturn: !!h.notification,
				claimed: !!h.coordinator.getState().invitation, history: h.coordinator.getState().lastShown,
			}, {
				originallyShown: true, visibleBeforeReturn: developerMode,
				retained: developerMode, visibleAfterReturn: developerMode, claimed: developerMode, history,
			});
		}));
	}

	for (const [autoShow, developerMode] of [[false, false], [true, false], [true, true]] as const) {
		test(`a harness impression in another window invalidates normal invitations but preserves previews (${autoShow}, ${developerMode})`, () => runWithFakedTimers({ startTime: 100_000 }, async () => {
			const h = createHarness({ autoShow, developerMode });
			const chat = h.addChat('/current');
			h.focus(chat.widget);
			chat.send(Date.now() - 30_000);
			await timeout(0);
			const original = h.notification;
			const history = h.coordinator.getState().lastShown;
			h.coordinator.update(2, { kind: 'copilotHarnessIntroductionShown' });
			await timeout(0);
			assert.deepStrictEqual({
				originallyPosted: !!original,
				retained: h.notification === original,
				visible: !!h.notification,
				claimed: !!h.coordinator.getState().invitation,
				history: h.coordinator.getState().lastShown,
			}, { originallyPosted: true, retained: developerMode, visible: developerMode, claimed: developerMode, history });
		}));
	}

	test('a harness impression invalidates an outstanding asynchronous claim', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const gate = new DeferredPromise<void>();
		const h = createHarness({ claimDelay: gate.p });
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		await timeout(0);
		h.coordinator.update(2, { kind: 'copilotHarnessIntroductionShown' });
		await gate.complete();
		await timeout(0);
		assert.deepStrictEqual({ notification: h.notification, invitation: h.coordinator.getState().invitation, history: h.coordinator.getState().lastShown }, {
			notification: undefined, invitation: undefined, history: undefined,
		});
	}));

	test('reevaluates focus after releasing a superseded asynchronous claim without another event', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const gate = new DeferredPromise<void>();
		const h = createHarness({ claimDelay: gate.p });
		const first = h.addChat('/first');
		const second = h.addChat('/second');
		first.send(Date.now() - 60_000);
		second.send(Date.now() - 60_000);
		await timeout(0);
		h.focus(first.widget);
		await timeout(0);
		h.focus(second.widget);
		await gate.complete();
		await timeout(0);
		assert.deepStrictEqual({
			claims: h.claims.map(resource => resource.path),
			invited: URI.revive(h.coordinator.getState().invitation?.resource)?.path,
			visible: !!h.notification,
		}, { claims: ['/first', '/second'], invited: '/second', visible: true });
	}));

	test('auxiliary chat widgets cannot claim, trigger experiments, or consume an impression', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const document = mainWindow.document.implementation.createHTMLDocument();
		const chat = h.addChat('/auxiliary', SessionType.AgentHostCopilot, { domNode: document.createElement('div') });
		h.focus(chat.widget);
		chat.send(Date.now() - 60_000);
		await timeout(0);
		assert.deepStrictEqual({ claims: h.claims, events: h.events, notification: h.notification, history: h.coordinator.getState().lastShown }, {
			claims: [], events: [], notification: undefined, history: undefined,
		});
	}));

	test('a visible invitation is not moved to an auxiliary widget displaying the same chat', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		let visible = true;
		const chat = h.addChat('/current');
		Object.defineProperty(chat.widget, 'visible', { get: () => visible });
		h.focus(chat.widget);
		chat.send(Date.now() - 60_000);
		await timeout(0);
		const history = h.coordinator.getState().lastShown;
		assert.ok(h.notification);
		const document = mainWindow.document.implementation.createHTMLDocument();
		const auxiliary = h.addChat('/current', SessionType.AgentHostCopilot, { domNode: document.createElement('div') });
		visible = false;
		h.focus(auxiliary.widget);
		assert.deepStrictEqual({ visible: !!h.notification, history: h.coordinator.getState().lastShown, claims: h.claims.length }, {
			visible: false, history, claims: 1,
		});
	}));

	test('rechecks Agents Window usage when an outstanding claim resolves', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const gate = new DeferredPromise<void>();
		const h = createHarness({ claimDelay: gate.p });
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		await timeout(0);
		const usage = new AgentsWindowUsage(h.storage);
		for (let index = 0; index < 3; index++) {
			usage.recordSessionCreated();
		}
		await gate.complete();
		await timeout(0);
		assert.deepStrictEqual({ notification: h.notification, invitation: h.coordinator.getState().invitation, history: h.coordinator.getState().lastShown }, {
			notification: undefined, invitation: undefined, history: undefined,
		});
	}));

	test('returning to a chat does not restart the delay', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const chat = h.addChat('/current');
		const other = h.addChat('/idle');
		h.focus(chat.widget);
		chat.send();
		await timeout(0);
		h.otherSession();
		h.focus(other.widget);
		await timeout(20_000);
		const away = h.scenario;
		h.focus(chat.widget);
		await timeout(0);
		assert.deepStrictEqual({ away, returned: h.scenario }, { away: undefined, returned: 'parallelWorkAllWindows' });
	}));

	test('the latest message resets eligibility, but never dismisses a displayed banner', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send();
		await timeout(20_000);
		chat.send();
		await timeout(29_999);
		const before = h.scenario;
		await timeout(1);
		const visible = h.notification;
		chat.send();
		chat.inProgress.set(false, undefined);
		await timeout(0);
		assert.deepStrictEqual({ before, samePresentation: h.notification === visible, scenario: h.scenario }, {
			before: undefined, samePresentation: true, scenario: 'continueInAgentsWindow',
		});
	}));

	test('system messages do not restart the timer, while queued user messages do', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send();
		await timeout(20_000);
		chat.queue();
		await timeout(20_000);
		chat.send(Date.now(), false, true);
		await timeout(9_999);
		const before = h.scenario;
		await timeout(1);
		assert.deepStrictEqual({ before, scenario: h.scenario }, { before: undefined, scenario: 'continueInAgentsWindow' });
	}));

	for (const change of ['input', 'idle', 'focus', 'experience'] as const) {
		test(`releases an unrendered invitation without an impression when ${change} changes eligibility`, () => runWithFakedTimers({ startTime: 100_000 }, async () => {
			const h = createHarness({ autoShow: false });
			const chat = h.addChat('/current');
			h.focus(chat.widget);
			chat.send(Date.now() - 30_000);
			await timeout(0);
			assert.ok(h.notification);
			if (change === 'input') { chat.needsInput.set({ title: 'Input required' }, undefined); }
			if (change === 'idle') { chat.inProgress.set(false, undefined); }
			if (change === 'focus') { h.hostFocused = false; }
			if (change === 'experience') { h.storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 4, StorageScope.APPLICATION, StorageTarget.MACHINE); }
			await timeout(0);
			assert.deepStrictEqual({ notification: h.notification, invitation: h.coordinator.getState().invitation, history: h.coordinator.getState().lastShown }, {
				notification: undefined, invitation: undefined, history: undefined,
			});
		}));
	}

	test('does not resurrect a closed widget after an asynchronous claim resolves', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const gate = new DeferredPromise<void>();
		const h = createHarness({ claimDelay: gate.p });
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		await timeout(0);
		h.close(chat.widget);
		await gate.complete();
		await timeout(0);
		assert.deepStrictEqual({ notification: h.notification, invitation: h.coordinator.getState().invitation, history: h.coordinator.getState().lastShown }, {
			notification: undefined, invitation: undefined, history: undefined,
		});
	}));

	test('closing an editor releases its invitation even when the editor pane keeps its widget', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		await timeout(0);
		const original = h.notification;
		h.closeEditor(chat.resource, EditorCloseContext.MOVE);
		const moved = h.notification === original;
		h.closeEditor(chat.resource);
		await timeout(0);
		assert.deepStrictEqual({ moved, notification: h.notification, claim: h.coordinator.getState().invitation }, { moved: true, notification: undefined, claim: undefined });
	}));

	for (const surface of ['quick', 'inline', 'hidden', 'sessions'] as const) {
		test(`does not claim an invitation on the ${surface} surface, even in developer mode`, () => runWithFakedTimers({ startTime: 100_000 }, async () => {
			const h = createHarness({ developerMode: true, isSessionsWindow: surface === 'sessions' });
			const chat = h.addChat('/current', SessionType.AgentHostCopilot, {
				visible: surface !== 'hidden',
				viewContext: { resource: URI.parse('test:/chat'), isQuickChat: surface === 'quick', isInlineChat: surface === 'inline' },
			});
			h.focus(chat.widget);
			chat.send(Date.now() - 30_000);
			await timeout(0);
			assert.deepStrictEqual({ notification: h.notification, claim: h.coordinator.getState().invitation, triggers: h.telemetry.triggers }, {
				notification: undefined, claim: undefined, triggers: [],
			});
		}));
	}

	test('freezes copy and scenario, and temporarily hides for input without a second impression', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		await timeout(0);
		const title = h.notification?.message;
		const history = h.coordinator.getState().lastShown;
		h.otherSession();
		h.treatments.set('chatAgentsWindowBanner.continueInAgentsWindow.title', 'Refetched title');
		await h.refetch();
		chat.needsInput.set({ title: 'Approval required' }, undefined);
		const hidden = h.notification;
		chat.inProgress.set(false, undefined);
		chat.needsInput.set(undefined, undefined);
		await timeout(0);
		assert.deepStrictEqual({
			title, hidden, restored: h.notification?.message, scenario: h.scenario,
			history: h.coordinator.getState().lastShown,
			shown: h.events.filter(event => event.name === 'agentsWindowInvitation').map(event => event.data),
		}, {
			title: 'Continue in the Agents Window', hidden: undefined, restored: title,
			scenario: 'continueInAgentsWindow', history, shown: [{ scenario: 'continueInAgentsWindow', action: 'shown' }],
		});
	}));

	test('uses scenario copy treatments and falls back through disabled higher-priority scenarios', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		h.treatments.set('chatAgentsWindowBanner.parallelWorkAllWindows.enabled', false);
		h.treatments.set('chatAgentsWindowBanner.parallelWorkSameWindow.enabled', false);
		h.treatments.set('chatAgentsWindowBanner.continueInAgentsWindow.title', 'Custom title');
		h.treatments.set('chatAgentsWindowBanner.continueInAgentsWindow.description', 'Custom description');
		h.treatments.set('chatAgentsWindowBanner.continueInAgentsWindow.actionLabel', 'Custom action');
		await h.refetch();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		h.otherSession(1);
		h.otherSession(2);
		await timeout(0);
		assert.deepStrictEqual({ scenario: h.scenario, title: h.notification?.message, description: h.notification?.description, action: h.notification?.actions[0].label }, {
			scenario: 'continueInAgentsWindow', title: 'Custom title', description: 'Custom description', action: 'Custom action',
		});
	}));

	for (const enabled of [false, true]) {
		test(`triggers opportunity in the ${enabled ? 'enabled' : 'control'} arm, but copy only on display`, () => runWithFakedTimers({ startTime: 100_000 }, async () => {
			const h = createHarness({ enabled, autoShow: false });
			const chat = h.addChat('/current');
			h.focus(chat.widget);
			chat.send(Date.now() - 30_000);
			await timeout(0);
			const beforeDisplay = [...h.telemetry.triggers];
			const beforeHistory = h.coordinator.getState().lastShown;
			h.show();
			await timeout(0);
			assert.deepStrictEqual({
				opportunity: beforeDisplay.includes(`config.${ChatConfiguration.AgentsWindowBannerEnabled}`),
				enablement: beforeDisplay.includes('chatAgentsWindowBanner.continueInAgentsWindow.enabled'),
				copyBefore: beforeDisplay.includes('chatAgentsWindowBanner.continueInAgentsWindow.title'),
				copyAfter: h.telemetry.triggers.includes('chatAgentsWindowBanner.continueInAgentsWindow.title'),
				beforeHistory, hasHistory: !!h.coordinator.getState().lastShown,
			}, {
				opportunity: true, enablement: true, copyBefore: false, copyAfter: enabled,
				beforeHistory: undefined, hasHistory: enabled,
			});
		}));
	}

	test('delay treatments trigger before the delay and honor a zero-second override', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send();
		await timeout(0);
		const before = { shown: h.scenario, delay: h.telemetry.triggers.includes('chatAgentsWindowBanner.continueInAgentsWindow.delaySeconds') };
		h.treatments.set('chatAgentsWindowBanner.continueInAgentsWindow.delaySeconds', 0);
		await h.refetch();
		assert.deepStrictEqual({ before, after: h.scenario }, {
			before: { shown: undefined, delay: true }, after: 'continueInAgentsWindow',
		});
	}));

	test('an outstanding invitation stays on its original chat and is released on close', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const first = h.addChat('/first');
		const second = h.addChat('/second');
		h.focus(first.widget);
		first.send(Date.now() - 30_000);
		await timeout(0);
		const original = h.notification;
		second.send(Date.now() - 30_000);
		h.focus(second.widget);
		await timeout(0);
		const retained = h.notification === original;
		h.close(first.widget);
		await timeout(0);
		assert.deepStrictEqual({ retained, notification: h.notification, claim: h.coordinator.getState().invitation }, {
			retained: true, notification: undefined, claim: undefined,
		});
	}));

	test('X preserves enablement and cooldown history; mute disables all scenarios', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		await timeout(0);
		h.notification?.onDismiss?.();
		await timeout(0);
		const dismissed = {
			enabled: h.configuration.getValue(ChatConfiguration.AgentsWindowBannerEnabled),
			notification: h.notification, history: !!h.coordinator.getState().lastShown,
		};
		await h.configure(ChatConfiguration.AgentsWindowBannerDeveloperMode, true);
		await h.click(1);
		assert.deepStrictEqual({
			dismissed,
			previewDidNotMute: h.configuration.getValue(ChatConfiguration.AgentsWindowBannerEnabled),
			notification: h.notification,
		}, {
			dismissed: { enabled: true, notification: undefined, history: true },
			previewDidNotMute: true, notification: undefined,
		});
	}));

	test('Don\'t Show Again writes the unified preference', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		await timeout(0);
		await h.click(1);
		assert.deepStrictEqual({ enabled: h.configuration.getValue(ChatConfiguration.AgentsWindowBannerEnabled), notification: h.notification }, {
			enabled: false, notification: undefined,
		});
	}));

	test('developer mode honors disabled session reveal without experiment telemetry', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness({ developerMode: true });
		await h.configure(ChatConfiguration.AgentsWindowBannerRevealCurrentSession, false);
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		await timeout(0);
		await h.click(0);
		assert.deepStrictEqual({
			session: h.opens[0]?.sessionResource,
			spotlight: h.opens[0]?.onboardingSessionResource,
			triggers: h.telemetry.triggers,
		}, { session: undefined, spotlight: chat.resource.toJSON(), triggers: [] });
	}));

	test('developer mode forces scenarios without exposure telemetry, usage gating, or history writes', () => runWithFakedTimers({ startTime: 100_000 }, async () => {
		const h = createHarness({ enabled: false, developerMode: true });
		h.storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 10, StorageScope.APPLICATION, StorageTarget.MACHINE);
		h.storage.store(AGENTS_WINDOW_LAST_SESSION_CREATED_STORAGE_KEY, Date.now(), StorageScope.APPLICATION, StorageTarget.MACHINE);
		for (const scenario of agentsWindowInvitationScenarios) {
			h.treatments.set(getAgentsWindowInvitationTreatment(scenario, 'enabled'), false);
		}
		await h.refetch();
		const chat = h.addChat('/current');
		h.focus(chat.widget);
		chat.send(Date.now() - 30_000);
		await timeout(0);
		const title = h.notification?.message;
		h.notification?.onDismiss?.();
		h.focus(chat.widget);
		await timeout(0);
		assert.deepStrictEqual({
			title, history: h.coordinator.getState().lastShown, triggers: h.telemetry.triggers,
			events: h.events.filter(event => event.name === 'agentsWindowInvitation'), repeated: h.notification,
		}, {
			title: 'Continue in the Agents Window', history: undefined, triggers: [], events: [], repeated: undefined,
		});
	}));

	for (const condition of ['idle', 'input', 'hidden', 'background', 'draft', 'local', 'experienced'] as const) {
		test(`does not initially show for ${condition}`, () => runWithFakedTimers({ startTime: 100_000 }, async () => {
			const h = createHarness();
			const chat = h.addChat(condition === 'draft' ? '/untitled-draft' : '/current', condition === 'local' ? SessionType.Local : SessionType.AgentHostCopilot);
			h.focus(chat.widget);
			chat.send(Date.now() - 30_000);
			if (condition === 'idle') { chat.inProgress.set(false, undefined); }
			if (condition === 'input') { chat.needsInput.set({ title: 'Input required' }, undefined); }
			if (condition === 'hidden') { h.allowed = false; }
			if (condition === 'background') { h.hostFocused = false; }
			if (condition === 'experienced') { h.storage.store(AGENTS_WINDOW_TOTAL_SESSIONS_STORAGE_KEY, 3, StorageScope.APPLICATION, StorageTarget.MACHINE); }
			await timeout(0);
			assert.deepStrictEqual({ notification: h.notification, history: h.coordinator.getState().lastShown }, { notification: undefined, history: undefined });
		}));
	}
});
