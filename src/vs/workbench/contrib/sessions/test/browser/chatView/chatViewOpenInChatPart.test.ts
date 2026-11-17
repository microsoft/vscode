/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IViewDescriptor, IViewDescriptorService, ViewContainer } from '../../../../../common/views.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { IChatViewContribution, IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { ChatViewHostService } from '../../../../chat/browser/widgetHosts/viewPane/chatViewHostService.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { ChangesMultiDiffSourceResolver } from '../../../../sessionChanges/browser/changesMultiDiffSourceResolver.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatViewContainerId, ChatViewId, IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { ILocalChatAvailabilityService, LocalChatAvailabilityService } from '../../../../chat/common/localChatAvailability.js';
import { ActiveAuxiliaryContext, RemoteNameContext } from '../../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { isUntitledChatSession, LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { IChatRequestVariableEntry } from '../../../../chat/common/attachments/chatVariableEntries.js';
import { IChat, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IEditorWindowShownChat, IEditorWindowShownChatService } from '../../../browser/agentsView/editorWindowMainSessionHost.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { EditorWindowChatPartService, IEditorWindowChatPartOptions, IEditorWindowChatPartService } from '../../../browser/agentsView/agentsChatPartContribution.js';
import { isIMenuItem, MenuRegistry, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { agentSessionsOrientationSubmenu, SetAgentSessionsOrientationSideBySideAction, SetAgentSessionsOrientationStackedAction } from '../../../../chat/browser/agentSessions/agentSessionsActions.js';
import { ChatViewOpenInChatPartContribution } from '../../../browser/chatView/chatViewOpenInChatPart.contribution.js';
import { IEditorWindowSessionsRuntime, IEditorWindowSessionsRuntimeOptions } from '../../../browser/editorWindow/editorWindowSessionsRuntime.js';


/** A chat widget's input and attachments, as a handover reads and writes them. */
class FakeChatWidget {
	private _input: string;
	private _attachments: IChatRequestVariableEntry[];
	constructor(input = '', attachments: IChatRequestVariableEntry[] = []) {
		this._input = input;
		this._attachments = attachments;
	}
	getInput(): string { return this._input; }
	setInput(input: string): void { this._input = input; }
	readonly attachmentModel = {
		get attachments(): readonly IChatRequestVariableEntry[] { return this._owner._attachments; },
		addContext: (...entries: IChatRequestVariableEntry[]) => { this._attachments.push(...entries); },
		clearAndSetContext: (...entries: IChatRequestVariableEntry[]) => { this._attachments = [...entries]; },
		clear: () => { this._attachments = []; },
		_owner: this,
	};
	get state() { return { input: this._input, attachments: this._attachments.map(entry => entry.id) }; }
}

suite('ChatViewOpenInChatPartContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: { remote?: boolean; sessionsWindow?: boolean; setting?: boolean; orientation?: string; chatEnabled?: boolean; agentEnabled?: boolean; chatViewShows?: URI; lateHost?: boolean; partDeclinesNewChat?: boolean } = {}) {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsOpenInChatPart]: options.setting ?? false, [ChatConfiguration.ChatViewSessionsOrientation]: options.orientation ?? 'sideBySide', [ChatConfiguration.AgentEnabled]: options.agentEnabled ?? true });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(options.chatEnabled ?? true);
		RemoteNameContext.bindTo(contextKeyService).set('');
		const chatPartOptions: IEditorWindowChatPartOptions[] = [];
		const runtimeOptions: IEditorWindowSessionsRuntimeOptions[] = [];
		let runtimeHeld = 0;
		const registered: IChatViewContribution[] = [];

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: options.remote ? 'remote' : undefined, isSessionsWindow: !!options.sessionsWindow }));
		const handovers: string[] = [];
		instantiationService.stub(IEditorWindowChatPartService, upcastPartial<IEditorWindowChatPartService>({
			enable: (o: IEditorWindowChatPartOptions): IDisposable => { chatPartOptions.push(o); return toDisposable(() => { }); },
			closeChat: async resource => { handovers.push(`part closes ${resource.path}`); },
		}));
		instantiationService.stub(IEditorWindowSessionsRuntime, upcastPartial<IEditorWindowSessionsRuntime>({
			enable: (o: IEditorWindowSessionsRuntimeOptions): IDisposable => { runtimeOptions.push(o); runtimeHeld++; return toDisposable(() => runtimeHeld--); },
		}));
		// The seam owns the rule that the Chat view shows its chat while it hosts one: here, a registration is all that is asked for
		const registrations = observableValue('registrations', 0);
		const sessionsOnly = derived(reader => registrations.read(reader) > 0);
		// The Chat view and, while it is registered, the chat part's host, each with the chat it shows and their chat widgets
		const shown = { view: observableValue<URI | undefined>('view', options.chatViewShows), part: observableValue<URI | undefined>('part', undefined) };
		// The chat part's host registers as chats open in the chat part, or later, where it is late
		const hostReady = observableValue('hostReady', !options.lateHost);
		const replaced = derived(reader => registrations.read(reader) > 0 && hostReady.read(reader));
		const hostInUse = () => replaced.get() ? 'part' : 'view';
		const widgets = new Map<string, FakeChatWidget>();
		const widgetOf = (resource: URI | undefined) => (resource && widgets.get(resource.toString())) as IChatWidget | undefined;
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ getWidgetBySessionResource: resource => widgetOf(resource) }));
		instantiationService.stub(IEditorWindowShownChatService, upcastPartial<IEditorWindowShownChatService>({
			shown: derived(reader => {
				const resource = shown.part.read(reader);
				return resource && upcastPartial<IEditorWindowShownChat>({ session: upcastPartial<ISession>({ status: constObservable(isUntitledChatSession(resource) ? SessionStatus.Untitled : SessionStatus.Completed) }), chat: upcastPartial<IChat>({ resource }) });
			}),
		}));
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({
			sessionsOnly,
			replaced,
			shownSession: derived(reader => {
				const resource = (replaced.read(reader) ? shown.part : shown.view).read(reader);
				return resource && { resource, reason: 'open' as const };
			}),
			openSession: async resource => {
				const host = hostInUse();
				handovers.push(`${host} opens ${resource.path}`);
				shown[host].set(resource, undefined);
				return widgetOf(resource);
			},
			newChat: async (_target, newChatOptions) => {
				const host = hostInUse();
				if (host === 'part' && options.partDeclinesNewChat) {
					handovers.push(`part declines new chat${newChatOptions?.ownChat ? ', the Chat view takes it' : ''}`);
					return false;
				}
				const resource = URI.parse(`agent-host-copilotcli:/untitled-new-in-${host}`);
				handovers.push(`${host} new chat`);
				widgets.set(resource.toString(), new FakeChatWidget());
				shown[host].set(resource, undefined);
				return true;
			},
			reveal: async () => widgetOf(shown[hostInUse()].get()),
			register: (contribution: IChatViewContribution) => {
				registered.push(contribution);
				registrations.set(registrations.get() + 1, undefined);
				return toDisposable(() => registrations.set(registrations.get() - 1, undefined));
			},
		}));
		const localChatAvailability = store.add(new LocalChatAvailabilityService());
		instantiationService.stub(ILocalChatAvailabilityService, localChatAvailability);
		instantiationService.stub(IConfigurationService, configurationService);
		const containerChanged = store.add(new Emitter<{ views: IViewDescriptor[]; from: ViewContainer; to: ViewContainer }>());
		let chatViewContainer = ChatViewContainerId;
		instantiationService.stub(IViewDescriptorService, upcastPartial<IViewDescriptorService>({
			onDidChangeContainer: containerChanged.event,
			getViewContainerByViewId: () => upcastPartial<ViewContainer>({ id: chatViewContainer }),
		}));
		const moveChatView = (id: string) => {
			chatViewContainer = id;
			containerChanged.fire({ views: [upcastPartial<IViewDescriptor>({ id: ChatViewId })], from: upcastPartial<ViewContainer>({}), to: upcastPartial<ViewContainer>({ id }) });
		};

		let maximizeClaims = 0;
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({
			hideAuxiliaryBarMaximize: () => { maximizeClaims++; return toDisposable(() => maximizeClaims--); },
		}));

		store.add(instantiationService.createInstance(ChatViewOpenInChatPartContribution));
		const state = () => ({
			anchors: chatPartOptions.map(o => ({ anchorViewId: o.anchorViewId, anchorPriority: o.anchorPriority, enabled: o.enabled.get() })),
			runtime: runtimeOptions.map(o => o.viewIds),
			runtimeHeld,
		});
		const setSetting = async (value: boolean) => {
			await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, value);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
			// The handover runs once the hosts changed
			await timeout(0);
		};
		return { state, configurationService, contextKeyService, chatPartOptions, sessionsOnly, registered, localChatAvailability, moveChatView, maximizeClaims: () => maximizeClaims, shown, handovers, widgets, setSetting, hostReady };
	}

	test('is on only while the setting is on and the configured orientation is side by side', async () => {
		const enabledFor = (setting: boolean, orientation: string) => setup({ setting, orientation }).chatPartOptions[0].enabled.get();
		assert.deepStrictEqual({
			onSideBySide: enabledFor(true, 'sideBySide'),
			onStacked: enabledFor(true, 'stacked'),
			offSideBySide: enabledFor(false, 'sideBySide'),
			onLegacyChatArea: enabledFor(true, 'chatArea'),
		}, { onSideBySide: true, onStacked: false, offSideBySide: false, onLegacyChatArea: true });
	});

	test('switching the configured orientation to stacked turns it off, and back to side by side turns it on', async () => {
		const { configurationService, chatPartOptions } = setup({ setting: true });
		const steps = [chatPartOptions[0].enabled.get()];
		for (const orientation of ['stacked', 'sideBySide']) {
			await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOrientation, orientation);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOrientation]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOrientation }));
			steps.push(chatPartOptions[0].enabled.get());
		}
		assert.deepStrictEqual(steps, [true, false, true]);
	});

	test('registers nothing in remote and Agents windows', () => {
		assert.deepStrictEqual({ remote: setup({ remote: true, setting: true }).state(), sessions: setup({ sessionsWindow: true, setting: true }).state() }, {
			remote: { anchors: [], runtime: [], runtimeHeld: 0 },
			sessions: { anchors: [], runtime: [], runtimeHeld: 0 },
		});
	});

	test('does nothing while the setting is off, and anchors beside the Chat view while it is on', () => {
		const off = setup({ setting: false }).state();
		const on = setup({ setting: true }).state();
		assert.deepStrictEqual({ off, on }, {
			off: { anchors: [{ anchorViewId: ChatViewId, anchorPriority: 1, enabled: false }], runtime: [], runtimeHeld: 0 },
			on: { anchors: [{ anchorViewId: ChatViewId, anchorPriority: 1, enabled: true }], runtime: [[ChatViewId]], runtimeHeld: 1 },
		});
	});

	test('registers sessions only with the Chat view once, and holds it while on', () => {
		const { registered, sessionsOnly } = setup({ setting: true });
		assert.deepStrictEqual({ registered, sessionsOnly: sessionsOnly.get() }, { registered: [{ sessionsOnly: true }], sessionsOnly: true });
	});

	test('takes New Chat of the Chat view into the chat part', () => {
		assert.strictEqual(setup({ setting: true }).chatPartOptions[0].ownsNewChat, undefined);
	});

	test('the Chat view shows only its sessions while it is on, and is unchanged while it is off', () => {
		const on = setup({ setting: true }).sessionsOnly.get();
		const off = setup({ setting: false }).sessionsOnly.get();
		assert.deepStrictEqual({ on, off }, { on: true, off: false });
	});

	test('local chat is hidden while it is on, and back once it is off', async () => {
		const { configurationService, localChatAvailability } = setup({ setting: false });
		const setSetting = async (value: boolean) => {
			await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, value);
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		};
		const steps = [localChatAvailability.hidden.get()];
		await setSetting(true);
		steps.push(localChatAvailability.hidden.get());
		await setSetting(false);
		steps.push(localChatAvailability.hidden.get());
		assert.deepStrictEqual(steps, [false, true, false]);
	});

	test('holds a Maximize claim only while the Chat view shows only the sessions', async () => {
		const { contextKeyService, configurationService, maximizeClaims } = setup({ setting: false });
		ActiveAuxiliaryContext.bindTo(contextKeyService).set(ChatViewContainerId);
		const hidden = () => maximizeClaims() > 0;
		const steps = [hidden()];
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		steps.push(hidden());
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		steps.push(hidden());
		assert.deepStrictEqual(steps, [false, true, false]);
	});

	test('hides Maximize for the container that now holds the Chat view, not its default one', async () => {
		const { contextKeyService, moveChatView, maximizeClaims } = setup({ setting: true });
		const active = ActiveAuxiliaryContext.bindTo(contextKeyService);
		const hidden = () => maximizeClaims() > 0;
		active.set(ChatViewContainerId);
		const steps = [hidden()];
		moveChatView('other');
		steps.push(hidden());
		active.set('other');
		steps.push(hidden());
		assert.deepStrictEqual(steps, [true, false, true]);
	});

	test('is off while agents are disabled, as the chat part\'s host cannot show chats then', () => {
		assert.strictEqual(setup({ setting: true, agentEnabled: false }).chatPartOptions[0].enabled.get(), false);
	});

	test('follows the setting and AI features', async () => {
		const { state, configurationService, contextKeyService, chatPartOptions, sessionsOnly: sessionsOnlyState } = setup({ setting: false });
		const enabled = (): IObservable<boolean> => chatPartOptions[0].enabled;
		const steps: boolean[] = [enabled().get()];
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		steps.push(enabled().get());
		const sessionsOnly = [sessionsOnlyState.get()];
		ChatContextKeys.enabled.bindTo(contextKeyService).set(false);
		steps.push(enabled().get());
		sessionsOnly.push(sessionsOnlyState.get());
		assert.deepStrictEqual({ steps, sessionsOnly, runtimeHeld: state().runtimeHeld }, { steps: [false, true, false], sessionsOnly: [true, false], runtimeHeld: 0 });
	});

	suite('with the services of the chat part', () => {

		const agentSession = URI.parse('agent-host-copilot:/session-1');

		/** The contribution over the real chat part service and Chat view host service, recording where chats are opened. */
		function setupServices(options: { agentEnabled: boolean; setting?: boolean; orientation?: string; chatViewShows?: URI; chatViewHasView?: boolean }) {
			const calls: string[] = [];
			const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsOpenInChatPart]: options.setting ?? true, [ChatConfiguration.ChatViewSessionsOrientation]: options.orientation ?? 'sideBySide', [ChatConfiguration.AgentEnabled]: options.agentEnabled });
			const contextKeyService = store.add(new ContextKeyService(configurationService));
			ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
			RemoteNameContext.bindTo(contextKeyService).set('');
			const instantiationService = store.add(new TestInstantiationService());
			const stub = <T extends object>(id: { toString(): string }, service: Partial<T>) => { instantiationService.stub(id as never, upcastPartial<T>(service)); };

			const shown = observableValue<{ readonly resource: URI; readonly reason: 'open' } | undefined>('shown', options.chatViewShows && { resource: options.chatViewShows, reason: 'open' as const });
			const chatView = { loadSession: async (resource: URI) => { calls.push(`chat view loads ${resource.scheme}`); }, newChat: async () => { shown.set({ resource: LocalChatSessionUri.forSession('draft'), reason: 'open' }, undefined); return true; }, shownSession: shown, reportShown: () => { }, focusInput: () => { }, widget: undefined };
			stub(IViewsService, { openView: (async () => chatView) as unknown as IViewsService['openView'], isViewVisible: () => false, onDidChangeViewVisibility: Event.None, getViewWithId: (() => options.chatViewShows || options.chatViewHasView ? chatView : null) as IViewsService['getViewWithId'] });
			stub(IViewDescriptorService, { getViewLocationById: () => null, getViewContainerByViewId: () => null, onDidChangeContainer: Event.None });
			stub(IWorkbenchLayoutService, { setChatPartAnchor: () => { }, onDidChangePartVisibility: Event.None, isVisible: () => false, setPartHidden: () => { } });
			stub(IProgressService, {});
			stub(IContextKeyService, contextKeyService);
			stub(IConfigurationService, configurationService);
			stub(IWorkbenchEnvironmentService, { remoteAuthority: undefined, isSessionsWindow: false });
			stub(ILifecycleService, { when: () => new Promise<void>(() => { }) });
			stub(IEditorWindowSessionsRuntime, { enable: () => toDisposable(() => { }) });
			stub(IEditorWindowSessionsPresenterService, { registerPresenter: () => toDisposable(() => { }), registerComposerHolder: () => toDisposable(() => { }) });
			stub(IAgentsChatPartFrame, { get part() { return undefined!; }, contentCreated: constObservable(false) });
			stub(ILocalChatAvailabilityService, store.add(new LocalChatAvailabilityService()));
			const owner = { session: { resource: agentSession }, chat: { resource: agentSession } };
			stub(IAgentsChatPartService, { openChat: async () => { calls.push('chat part opens'); }, openComposer: async () => { calls.push('chat part composer'); }, activeChat: constObservable(undefined), isShowing: () => false });
			stub(ISessionsManagementService, { getSessionForChatResource: (resource: URI) => resource.scheme === agentSession.scheme ? owner as never : undefined, getSession: () => undefined, getAllSessionTypes: () => [], getSessions: () => [], onDidChangeSession: () => toDisposable(() => { }) });
			stub(IChatWidgetService, { getAllWidgets: () => [upcastPartial<IChatWidget>({ viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: agentSession }) })] });
			stub(IWorkspaceContextService, { getWorkspace: () => ({ folders: [] }) as never });
			stub(IAgentsViewProvidersService, { acquire: () => toDisposable(() => { }) });
			stub(IEditorWindowShownChatService, { shown: constObservable(undefined) });
			stub(IEditorService, { activeEditor: undefined });
			const loadingModel = new DeferredPromise<void>();
			stub(IChatService, { acquireOrLoadSession: async () => { await loadingModel.p; return { dispose: () => { } } as never; } });
			// The shared chat part contribution can create toolbars that register action view items, depending on what else is merged in
			stub(IActionViewItemService, { onDidChange: Event.None, register: () => toDisposable(() => { }), lookUp: () => undefined });
			stub(INotificationService, { info: () => undefined! });

			// Without the Changes editor's own services
			const createInstance = instantiationService.createInstance.bind(instantiationService) as (ctor: unknown, ...args: unknown[]) => unknown;
			instantiationService.createInstance = ((ctor: unknown, ...args: unknown[]) => ctor === ChangesMultiDiffSourceResolver ? Disposable.None : createInstance(ctor, ...args)) as typeof instantiationService.createInstance;

			const hostService = instantiationService.createInstance(ChatViewHostService);
			stub(IChatViewHostService, hostService);
			const chatPartService = store.add(instantiationService.createInstance(EditorWindowChatPartService));
			stub(IEditorWindowChatPartService, chatPartService);
			store.add(instantiationService.createInstance(ChatViewOpenInChatPartContribution));
			// The host service goes last, as the hosts that registered in it unregister first
			store.add(hostService);
			const setSetting = async (value: boolean) => {
				await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, value);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
			};
			return { hostService, calls, loadingModel, setSetting };
		}

		test('with agents disabled, no chat part host takes the chats, so an agent session opens in the Chat view', async () => {
			const { hostService, calls } = setupServices({ agentEnabled: false });

			await hostService.openSession(agentSession);

			assert.deepStrictEqual(calls, ['chat view loads agent-host-copilot']);
		});

		test('with agents enabled, the chat part host takes the chats', async () => {
			const { hostService, calls } = setupServices({ agentEnabled: true });

			await hostService.openSession(agentSession);

			assert.deepStrictEqual(calls, ['chat part opens']);
		});

		test('New Chat of the Chat view opens a new chat in the chat part, and stays in the Chat view while the setting is off', async () => {
			const { hostService, calls, setSetting } = setupServices({ agentEnabled: true });

			const on = await hostService.newChat();
			await setSetting(false);
			const off = await hostService.newChat();

			assert.deepStrictEqual({ on, off, calls }, { on: true, off: false, calls: ['chat part composer'] });
		});

		test('a chat that the chat part leaves to the Chat view shows there, not only its sessions, until a chat of the chat part opens or New Chat starts', async () => {
			const { hostService, calls } = setupServices({ agentEnabled: true });
			const localChat = LocalChatSessionUri.forSession('legacy');

			const steps = [hostService.sessionsOnly.get()];
			await hostService.openSession(localChat);
			steps.push(hostService.sessionsOnly.get());
			await hostService.openSession(agentSession);
			steps.push(hostService.sessionsOnly.get());
			await hostService.openSession(localChat);
			await hostService.newChat();
			steps.push(hostService.sessionsOnly.get());

			assert.deepStrictEqual({ steps, calls }, { steps: [true, false, true, true], calls: ['chat view loads vscode-chat-session', 'chat part opens', 'chat view loads vscode-chat-session', 'chat part composer'] });
		});

		test('turning the setting on keeps the local chat that the Chat view shows, until an agent chat opens', async () => {
			const localChat = LocalChatSessionUri.forSession('legacy');
			const { hostService, setSetting } = setupServices({ agentEnabled: true, setting: false, chatViewShows: localChat });

			const steps = [hostService.sessionsOnly.get()];
			await setSetting(true);
			steps.push(hostService.sessionsOnly.get());
			await hostService.openSession(agentSession);
			steps.push(hostService.sessionsOnly.get());

			assert.deepStrictEqual(steps, [false, false, true]);
		});

		test('turning the setting on keeps a local draft that the Chat view started, until an agent chat opens', async () => {
			const { hostService, setSetting } = setupServices({ agentEnabled: true, setting: false, chatViewHasView: true });

			await hostService.newChat(undefined, { ownChat: true });
			const steps = [hostService.sessionsOnly.get()];
			await setSetting(true);
			steps.push(hostService.sessionsOnly.get());
			await hostService.openSession(agentSession);
			steps.push(hostService.sessionsOnly.get());

			assert.deepStrictEqual(steps, [false, false, true]);
		});

		test('a session that starts while the setting turns off does not reopen the chat part', async () => {
			const { hostService, calls, loadingModel, setSetting } = setupServices({ agentEnabled: true });

			const starting = hostService.startSession(agentSession, { local: false, importingConversation: false });
			await setSetting(false);
			loadingModel.complete();
			let cancelled = false;
			try {
				await starting;
			} catch (error) {
				cancelled = isCancellationError(error);
			}

			assert.deepStrictEqual({ cancelled, calls }, { cancelled: true, calls: [] });
		});
	});
	suite('while the window runs, it moves the chat shown to the other host as it turns on or off', () => {

		const session = URI.parse('agent-host-copilotcli:/session-a');
		const draft = URI.parse('agent-host-copilotcli:/untitled-draft');
		const attachment = upcastPartial<IChatRequestVariableEntry>({ id: 'file-a' });

		test('a session moves from the Chat view to the chat part as it turns on, and the chat part\'s active one back as it turns off, which the chat part then no longer keeps', async () => {
			const { setSetting, handovers, shown } = setup({ chatViewShows: session });
			await setSetting(true);
			const onPart = shown.part.get()?.path;
			shown.part.set(URI.parse('agent-host-copilotcli:/session-b'), undefined);
			await setSetting(false);

			assert.deepStrictEqual({ handovers, onPart, onView: shown.view.get()?.path }, {
				handovers: ['part opens /session-a', 'view opens /session-b', 'part closes /session-b'],
				onPart: '/session-a',
				onView: '/session-b',
			});
		});

		test('with no chat shown, the other host shows a new chat; a local chat stays in the Chat view; a chat the target shows already is not opened again', async () => {
			const none = setup();
			await none.setSetting(true);
			const local = setup({ chatViewShows: LocalChatSessionUri.forSession('local-a') });
			await local.setSetting(true);
			// The Chat view shows the chat part's chat already, as it showed it before the chat part did
			const already = setup({ chatViewShows: session, setting: true });
			already.shown.part.set(session, undefined);
			await already.setSetting(false);

			assert.deepStrictEqual({ none: none.handovers, local: local.handovers, already: already.handovers }, {
				none: ['part new chat'],
				local: [],
				already: ['part closes /session-a'],
			});
		});

		test('an unsent new chat moves with its input and attachments, which leave its source only once the target holds them, both ways', async () => {
			const { setSetting, handovers, widgets, shown } = setup({ chatViewShows: draft });
			const source = new FakeChatWidget('hello', [attachment]);
			widgets.set(draft.toString(), source);
			await setSetting(true);
			const onPart = widgets.get(shown.part.get()!.toString())!.state;
			const afterOn = { source: source.state, onPart };
			await setSetting(false);

			assert.deepStrictEqual({ handovers, afterOn, onView: widgets.get(shown.view.get()!.toString())!.state, partDraft: onPart }, {
				handovers: ['part new chat', 'view new chat'],
				afterOn: { source: { input: '', attachments: [] }, onPart: { input: 'hello', attachments: ['file-a'] } },
				onView: { input: 'hello', attachments: ['file-a'] },
				partDraft: { input: 'hello', attachments: ['file-a'] },
			});
		});

		test('as it turns on, it waits for the chat part\'s host to be in use, and does not take the Chat view\'s chat for the chat part\'s', async () => {
			const { setSetting, handovers, hostReady } = setup({ chatViewShows: session, lateHost: true });
			await setSetting(true);
			const beforeHost = [...handovers];
			hostReady.set(true, undefined);
			await timeout(0);

			assert.deepStrictEqual({ beforeHost, afterHost: handovers }, { beforeHost: [], afterHost: ['part opens /session-a'] });
		});

		test('an unsent new chat that the chat part declines to take stays in the Chat view with its input', async () => {
			const { setSetting, handovers, widgets } = setup({ chatViewShows: draft, partDeclinesNewChat: true });
			const source = new FakeChatWidget('hello', [attachment]);
			widgets.set(draft.toString(), source);
			await setSetting(true);

			assert.deepStrictEqual({ handovers, source: source.state }, { handovers: ['part declines new chat'], source: { input: 'hello', attachments: ['file-a'] } });
		});

		test('moves nothing as the window starts, nor as chat itself goes or comes', async () => {
			const atStart = setup({ chatViewShows: session, setting: true });
			await timeout(0);
			const chatGoes = setup({ chatViewShows: session, setting: true });
			chatGoes.shown.part.set(session, undefined);
			ChatContextKeys.enabled.bindTo(chatGoes.contextKeyService).set(false);
			await timeout(0);

			// Chat comes once the window started, such as as its entitlement resolves: not a move
			const chatComes = setup({ chatViewShows: session, setting: true, chatEnabled: false });
			ChatContextKeys.enabled.bindTo(chatComes.contextKeyService).set(true);
			await timeout(0);

			assert.deepStrictEqual({ atStart: atStart.handovers, chatGoes: chatGoes.handovers, chatComes: chatComes.handovers }, { atStart: [], chatGoes: [], chatComes: [] });
		});
	});
});

suite('Sessions orientation submenu', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('lists only Stacked and Side by Side, toggled by the configured value', async () => {
		const registrations = [registerAction2(SetAgentSessionsOrientationStackedAction), registerAction2(SetAgentSessionsOrientationSideBySideAction)];
		const items = MenuRegistry.getMenuItems(agentSessionsOrientationSubmenu).filter(isIMenuItem);
		registrations.forEach(registration => registration.dispose());
		const toggledFor = (orientation: string) => {
			const service = new ContextKeyService(new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsOrientation]: orientation }));
			const result = items.map(item => [typeof item.command.title === 'string' ? item.command.title : item.command.title.original, service.contextMatchesRules(item.command.toggled as ContextKeyExpression)]);
			service.dispose();
			return result.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
		};

		assert.deepStrictEqual({ stacked: toggledFor('stacked'), sideBySide: toggledFor('sideBySide'), legacy: toggledFor('chatArea') }, {
			stacked: [['Side by Side', false], ['Stacked', true]],
			sideBySide: [['Side by Side', true], ['Stacked', false]],
			legacy: [['Side by Side', false], ['Stacked', false]]
		});
	});

});
