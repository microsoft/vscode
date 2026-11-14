/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { ChatViewHostService } from '../../../../chat/browser/widgetHosts/viewPane/chatViewHostService.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { ChangesMultiDiffSourceResolver } from '../../../../sessionChanges/browser/changesMultiDiffSourceResolver.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { ChatViewContainerId, ChatViewId, IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { ChatViewSessionsListService, IChatViewSessionsListService } from '../../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { ActiveAuxiliaryContext, AuxiliaryBarMaximizeHiddenContext, RemoteNameContext } from '../../../../../common/contextkeys.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../../chat/common/constants.js';
import { EditorWindowChatPartService, IEditorWindowChatPartOptions, IEditorWindowChatPartService } from '../../../browser/agentsView/agentsChatPartContribution.js';
import { ChatViewOpenInChatPartContribution } from '../../../browser/chatView/chatViewOpenInChatPart.contribution.js';
import { IEditorWindowSessionsRuntime, IEditorWindowSessionsRuntimeOptions } from '../../../browser/editorWindow/editorWindowSessionsRuntime.js';

suite('ChatViewOpenInChatPartContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: { remote?: boolean; sessionsWindow?: boolean; setting?: boolean; chatEnabled?: boolean; agentEnabled?: boolean } = {}) {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsOpenInChatPart]: options.setting ?? false, [ChatConfiguration.AgentEnabled]: options.agentEnabled ?? true });
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(options.chatEnabled ?? true);
		RemoteNameContext.bindTo(contextKeyService).set('');
		const chatPartOptions: IEditorWindowChatPartOptions[] = [];
		const runtimeOptions: IEditorWindowSessionsRuntimeOptions[] = [];
		let runtimeHeld = 0;

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ remoteAuthority: options.remote ? 'remote' : undefined, isSessionsWindow: !!options.sessionsWindow }));
		instantiationService.stub(IEditorWindowChatPartService, upcastPartial<IEditorWindowChatPartService>({
			enable: (o: IEditorWindowChatPartOptions): IDisposable => { chatPartOptions.push(o); return toDisposable(() => { }); },
		}));
		instantiationService.stub(IEditorWindowSessionsRuntime, upcastPartial<IEditorWindowSessionsRuntime>({
			enable: (o: IEditorWindowSessionsRuntimeOptions): IDisposable => { runtimeOptions.push(o); runtimeHeld++; return toDisposable(() => runtimeHeld--); },
		}));
		const sessionsList = new ChatViewSessionsListService();
		instantiationService.stub(IChatViewSessionsListService, sessionsList);
		instantiationService.stub(IConfigurationService, configurationService);

		store.add(instantiationService.createInstance(ChatViewOpenInChatPartContribution));
		const state = () => ({
			anchors: chatPartOptions.map(o => ({ anchorViewId: o.anchorViewId, anchorPriority: o.anchorPriority, enabled: o.enabled.get() })),
			runtime: runtimeOptions.map(o => o.viewIds),
			runtimeHeld,
		});
		return { state, configurationService, contextKeyService, chatPartOptions, sessionsList };
	}

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

	test('takes New Chat of the Chat view into the chat part', () => {
		assert.strictEqual(setup({ setting: true }).chatPartOptions[0].ownsNewChat, undefined);
	});

	test('the Chat view shows only its sessions while it is on, and is unchanged while it is off', () => {
		const on = setup({ setting: true }).sessionsList.sessionsOnly.get();
		const off = setup({ setting: false }).sessionsList.sessionsOnly.get();
		assert.deepStrictEqual({ on, off }, { on: true, off: false });
	});

	test('local chat is off by default while it is on, and back once it is off', async () => {
		const { configurationService } = setup({ setting: false });
		const localChat = () => Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationDefaultsOverrides().get(ChatConfiguration.EditorLocalAgentEnabled)?.value;
		const steps = [localChat()];
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		steps.push(localChat());
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		steps.push(localChat());
		assert.deepStrictEqual(steps, [undefined, false, undefined]);
	});

	test('hides Maximize only while the Chat view shows only the sessions', async () => {
		const { contextKeyService, configurationService } = setup({ setting: false });
		ActiveAuxiliaryContext.bindTo(contextKeyService).set(ChatViewContainerId);
		const hidden = () => contextKeyService.getContextKeyValue(AuxiliaryBarMaximizeHiddenContext.key);
		const steps = [hidden()];
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		steps.push(hidden());
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		steps.push(hidden());
		assert.deepStrictEqual(steps, [false, true, false]);
	});

	test('is off while agents are disabled, as the chat part\'s host cannot show chats then', () => {
		assert.strictEqual(setup({ setting: true, agentEnabled: false }).chatPartOptions[0].enabled.get(), false);
	});

	test('follows the setting and AI features', async () => {
		const { state, configurationService, contextKeyService, chatPartOptions, sessionsList } = setup({ setting: false });
		const enabled = (): IObservable<boolean> => chatPartOptions[0].enabled;
		const steps: boolean[] = [enabled().get()];
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenInChatPart, true);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenInChatPart]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenInChatPart }));
		steps.push(enabled().get());
		const sessionsOnly = [sessionsList.sessionsOnly.get()];
		ChatContextKeys.enabled.bindTo(contextKeyService).set(false);
		steps.push(enabled().get());
		sessionsOnly.push(sessionsList.sessionsOnly.get());
		assert.deepStrictEqual({ steps, sessionsOnly, runtimeHeld: state().runtimeHeld }, { steps: [false, true, false], sessionsOnly: [true, false], runtimeHeld: 0 });
	});

	suite('with the services of the chat part', () => {

		const agentSession = URI.parse('agent-host-copilot:/session-1');

		/** The contribution over the real chat part service and Chat view host service, recording where chats are opened. */
		function setupServices(options: { agentEnabled: boolean }) {
			const calls: string[] = [];
			const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsOpenInChatPart]: true, [ChatConfiguration.AgentEnabled]: options.agentEnabled });
			const contextKeyService = store.add(new ContextKeyService(configurationService));
			ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
			RemoteNameContext.bindTo(contextKeyService).set('');
			const instantiationService = store.add(new TestInstantiationService());
			const stub = <T extends object>(id: { toString(): string }, service: Partial<T>) => { instantiationService.stub(id as never, upcastPartial<T>(service)); };

			const chatView = { loadSession: async (resource: URI) => { calls.push(`chat view loads ${resource.scheme}`); }, shownSession: constObservable(undefined), reportShown: () => { }, focusInput: () => { }, widget: undefined };
			stub(IViewsService, { openView: (async () => chatView) as unknown as IViewsService['openView'], isViewVisible: () => false, onDidChangeViewVisibility: Event.None, getViewWithId: (() => null) as IViewsService['getViewWithId'] });
			stub(IViewDescriptorService, { getViewLocationById: () => null });
			stub(IWorkbenchLayoutService, { setChatPartAnchor: () => { }, onDidChangePartVisibility: Event.None, isVisible: () => false, setPartHidden: () => { } });
			stub(IProgressService, {});
			stub(IContextKeyService, contextKeyService);
			stub(IConfigurationService, configurationService);
			stub(IWorkbenchEnvironmentService, { remoteAuthority: undefined, isSessionsWindow: false });
			stub(ILifecycleService, { when: () => new Promise<void>(() => { }) });
			stub(IEditorWindowSessionsRuntime, { enable: () => toDisposable(() => { }) });
			stub(IEditorWindowSessionsPresenterService, { registerPresenter: () => toDisposable(() => { }), registerComposerHolder: () => toDisposable(() => { }) });
			stub(IAgentsChatPartFrame, { get part() { return undefined!; }, contentCreated: constObservable(false) });
			stub(IChatViewSessionsListService, new ChatViewSessionsListService());
			const owner = { session: { resource: agentSession }, chat: { resource: agentSession } };
			stub(IAgentsChatPartService, { openChat: async () => { calls.push('chat part opens'); }, openComposer: async () => { calls.push('chat part composer'); }, activeChat: constObservable(undefined), isShowing: () => false });
			stub(ISessionsManagementService, { getSessionForChatResource: () => owner as never, getSession: () => undefined, getAllSessionTypes: () => [], getSessions: () => [], onDidChangeSession: () => toDisposable(() => { }) });
			stub(IChatWidgetService, { getAllWidgets: () => [upcastPartial<IChatWidget>({ viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: agentSession }) })] });
			stub(IWorkspaceContextService, { getWorkspace: () => ({ folders: [] }) as never });
			stub(IAgentsViewProvidersService, { acquire: () => toDisposable(() => { }) });
			stub(IEditorService, { activeEditor: undefined });
			const loadingModel = new DeferredPromise<void>();
			stub(IChatService, { acquireOrLoadSession: async () => { await loadingModel.p; return { dispose: () => { } } as never; } });
			// The shared chat part contribution can create toolbars that register action view items, depending on what else is merged in
			stub(IActionViewItemService, { onDidChange: Event.None, register: () => toDisposable(() => { }), lookUp: () => undefined });
			stub(INotificationService, { info: () => undefined! });

			// Without the Changes editor's own services
			const createInstance = instantiationService.createInstance.bind(instantiationService) as (ctor: unknown, ...args: unknown[]) => unknown;
			instantiationService.createInstance = ((ctor: unknown, ...args: unknown[]) => ctor === ChangesMultiDiffSourceResolver ? Disposable.None : createInstance(ctor, ...args)) as typeof instantiationService.createInstance;

			const hostService = store.add(instantiationService.createInstance(ChatViewHostService));
			stub(IChatViewHostService, hostService);
			const chatPartService = store.add(instantiationService.createInstance(EditorWindowChatPartService));
			stub(IEditorWindowChatPartService, chatPartService);
			store.add(instantiationService.createInstance(ChatViewOpenInChatPartContribution));
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
});
