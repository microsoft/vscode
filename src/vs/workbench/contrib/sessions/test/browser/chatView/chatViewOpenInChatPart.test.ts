/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { stubChatViewHostServiceDependencies } from '../../../../chat/test/common/chatViewSessionsListServiceTestUtils.js';
import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
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
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatService } from '../../../../chat/common/chatService/chatService.js';
import { IChatViewContribution, IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { ChatViewHostService } from '../../../../chat/browser/widgetHosts/viewPane/chatViewHostService.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { IEditorWindowSessionsPresenter, IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { ChatEditorInput } from '../../../../chat/browser/widgetHosts/editor/chatEditorInput.js';
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
import { IEditorWindowShownChat, IEditorWindowShownChatBindOptions, IEditorWindowShownChatService } from '../../../browser/agentsView/editorWindowMainSessionHost.js';
import { ChatConfiguration, ChatViewSessionsOpenChatIn, getDefaultNewChatSessionTypeAndReason } from '../../../../chat/common/constants.js';
import { NewChatAction } from '../../../../chat/browser/actions/chatNewActions.js';
import { IChatSessionsService, localChatSessionType, SessionType } from '../../../../chat/common/chatSessionsService.js';
import { MockChatSessionsService } from '../../../../chat/test/common/mockChatSessionsService.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IManagedSettingsService, NullManagedSettingsService } from '../../../../../../platform/policy/common/copilotManagedSettings.js';
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

/** The value of the setting for the chat area being on or off. */
function openChatIn(chatArea: boolean): ChatViewSessionsOpenChatIn {
	return chatArea ? ChatViewSessionsOpenChatIn.ChatArea : ChatViewSessionsOpenChatIn.ChatPanel;
}

suite('ChatViewOpenInChatPartContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options: { remote?: boolean; sessionsWindow?: boolean; setting?: boolean; orientation?: string; chatEnabled?: boolean; agentEnabled?: boolean; chatViewShows?: URI; lateHost?: boolean; partDeclinesNewChat?: boolean; localChatsShown?: boolean; partComposerInput?: string; viewOpenShows?: URI | null; duringNewChat?: () => void; duringReveal?: () => void; partParks?: boolean; chatOpenIn?: string; chatPartEnabledByOther?: boolean } = {}) {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsOpenChatIn]: options.chatOpenIn ?? openChatIn(options.setting ?? false), [ChatConfiguration.ChatViewSessionsOrientation]: options.orientation ?? 'sideBySide', [ChatConfiguration.AgentEnabled]: options.agentEnabled ?? true });
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
			enabled: constObservable(!!options.chatPartEnabledByOther),
			enable: (o: IEditorWindowChatPartOptions): IDisposable => { chatPartOptions.push(o); return toDisposable(() => { }); },
			closeChat: async resource => { handovers.push(`part closes ${resource.path}`); },
			parkComposerInput: () => {
				handovers.push(options.partParks === false ? 'part keeps its composer input' : 'part parks its composer input');
				return options.partParks !== false;
			},
		}));
		instantiationService.stub(IEditorWindowSessionsRuntime, upcastPartial<IEditorWindowSessionsRuntime>({
			enable: (o: IEditorWindowSessionsRuntimeOptions): IDisposable => { runtimeOptions.push(o); runtimeHeld++; return toDisposable(() => runtimeHeld--); },
		}));
		// The seam owns the rule that the Chat view shows its chat while it hosts one: here, a registration is all that is asked for
		const registrations = observableValue('registrations', 0);
		// While the Chat view hosts a new chat of its own, it shows its composer rather than only its sessions
		const viewHostsNewChat = observableValue('viewHostsNewChat', false);
		const sessionsOnly = derived(reader => registrations.read(reader) > 0 && !viewHostsNewChat.read(reader));
		// The Chat view and, while it is registered, the chat part's host, each with the chat it shows and their chat widgets
		const shown = { view: observableValue<URI | undefined>('view', options.chatViewShows), part: observableValue<URI | undefined>('part', undefined) };
		// Why the Chat view shows its chat: `commit` once the first request of its new chat made it the session it became
		const viewReason = observableValue<'open' | 'commit'>('viewReason', 'open');
		// The chat part's host registers as chats open in the chat part, or later, where it is late
		const hostReady = observableValue('hostReady', !options.lateHost);
		const replaced = derived(reader => registrations.read(reader) > 0 && hostReady.read(reader) && chatPartOptions.some(o => o.enabled.read(reader)));
		const hostInUse = () => replaced.get() ? 'part' : 'view';
		// What asked the hosts to show something, as the seam counts it
		const requests = observableValue('requests', 0);
		const request = () => requests.set(requests.get() + 1, undefined);
		// The chat part's one new-session composer, which its New Chat reuses, with what was typed in it
		const partComposer = options.partComposerInput !== undefined ? new FakeChatWidget(options.partComposerInput) : undefined;
		const widgets = new Map<string, FakeChatWidget>();
		const widgetOf = (resource: URI | undefined) => (resource && widgets.get(resource.toString())) as IChatWidget | undefined;
		const editorOpens: { resource: URI; target: unknown; revealIfOpened: boolean | undefined; pinned?: boolean }[] = [];
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			getWidgetBySessionResource: resource => widgetOf(resource),
			openSession: async (resource, target, openOptions) => { editorOpens.push({ resource, target, revealIfOpened: openOptions?.revealIfOpened, pinned: openOptions?.pinned }); return undefined; },
		}));
		const presenters: IEditorWindowSessionsPresenter[] = [];
		instantiationService.stub(IEditorWindowSessionsPresenterService, upcastPartial<IEditorWindowSessionsPresenterService>({
			registerPresenter: presenter => { presenters.push(presenter); return toDisposable(() => presenters.splice(presenters.indexOf(presenter), 1)); },
		}));
		// The chat editors that are open, the active one last, with the chat they show
		const chatEditors: { editor: ChatEditorInput }[] = [];
		const closedEditors: string[] = [];
		const activeEditorChanged = store.add(new Emitter<void>());
		const chatOfResource = (resource: URI) => upcastPartial<IEditorWindowShownChat>({ session: upcastPartial<ISession>({ mainChat: constObservable(upcastPartial<IChat>({ resource })), loading: constObservable(true) }), chat: upcastPartial<IChat>({ resource, isRead: constObservable(true) }) });
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			onDidActiveEditorChange: activeEditorChanged.event,
			get activeEditor() { return chatEditors.at(-1)?.editor; },
			getEditors: () => chatEditors.map(({ editor }) => ({ editor, groupId: 1 })),
			closeEditors: async editors => { closedEditors.push(...editors.map(({ editor }) => (editor as ChatEditorInput).sessionResource!.path)); },
		}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			onDidChangeSession: Event.None,
			getSessionForChatResource: chatOfResource,
			markRead: async () => true,
		}));
		const bindings: { shown: IObservable<IEditorWindowShownChat | undefined>; options: IEditorWindowShownChatBindOptions | undefined }[] = [];
		instantiationService.stub(IEditorWindowShownChatService, upcastPartial<IEditorWindowShownChatService>({
			bind: (shown, bindOptions) => { bindings.push({ shown, options: bindOptions }); return toDisposable(() => bindings.splice(bindings.findIndex(binding => binding.shown === shown), 1)); },
			shown: derived(reader => {
				const resource = shown.part.read(reader);
				return resource && upcastPartial<IEditorWindowShownChat>({ session: upcastPartial<ISession>({ status: constObservable(isUntitledChatSession(resource) ? SessionStatus.Untitled : SessionStatus.Completed) }), chat: upcastPartial<IChat>({ resource }) });
			}),
		}));
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({
			sessionsOnly,
			replaced,
			requests,
			chatViewHosts: derived(reader => !replaced.read(reader)),
			shownSession: derived(reader => {
				const inPart = replaced.read(reader);
				const resource = (inPart ? shown.part : shown.view).read(reader);
				return resource && { resource, reason: inPart ? 'open' as const : viewReason.read(reader) };
			}),
			openSession: async resource => {
				request();
				const host = hostInUse();
				handovers.push(`${host} opens ${resource.path}`);
				// What the Chat view shows once it opened it: nothing new where opening failed, or another chat a later open showed
				const showing = host === 'view' && options.viewOpenShows !== undefined ? options.viewOpenShows ?? shown.view.get() : resource;
				shown[host].set(showing, undefined);
				return widgetOf(showing);
			},
			newChat: async (_target, newChatOptions) => {
				request();
				options.duringNewChat?.();
				const host = hostInUse();
				if (host === 'part' && options.partDeclinesNewChat) {
					handovers.push(`part declines new chat${newChatOptions?.ownChat ? ', the Chat view takes it' : ''}`);
					return false;
				}
				const resource = URI.parse(`agent-host-copilotcli:/untitled-new-in-${host}`);
				handovers.push(`${host} new chat`);
				widgets.set(resource.toString(), host === 'part' && partComposer ? partComposer : new FakeChatWidget());
				shown[host].set(resource, undefined);
				return true;
			},
			reveal: async () => {
				request();
				options.duringReveal?.();
				return widgetOf(shown[hostInUse()].get());
			},
			register: (contribution: IChatViewContribution) => {
				registered.push(contribution);
				registrations.set(registrations.get() + 1, undefined);
				return toDisposable(() => registrations.set(registrations.get() - 1, undefined));
			},
		}));
		const localChatAvailability = store.add(new LocalChatAvailabilityService());
		// Local chats can stay shown although the chat part holds them hidden, such as while another rule offers them
		instantiationService.stub(ILocalChatAvailabilityService, options.localChatsShown ? upcastPartial<ILocalChatAvailabilityService>({ hidden: constObservable(false), hide: () => toDisposable(() => { }) }) : localChatAvailability);
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
			await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenChatIn, openChatIn(value));
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenChatIn]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenChatIn }));
			// The handover runs once the hosts changed
			await timeout(0);
		};
		const activateChatEditor = (resource: URI | undefined) => {
			if (!resource) {
				chatEditors.length = 0;
			} else {
				chatEditors.push({ editor: Object.assign(Object.create(ChatEditorInput.prototype) as ChatEditorInput, { _sessionResource: resource }) });
			}
			activeEditorChanged.fire();
		};
		return { state, configurationService, contextKeyService, chatPartOptions, sessionsOnly, viewHostsNewChat, viewReason, registered, localChatAvailability, moveChatView, maximizeClaims: () => maximizeClaims, shown, handovers, widgets, setSetting, hostReady, request, partComposer, presenters, editorOpens, bindings, closedEditors, activateChatEditor };
	}

	test('editorArea opens the chats of sessions as editors, revealing one that is open, and does not use the chat part', async () => {
		const chat = URI.parse('agent-host-copilot:/session-1');
		const session = upcastPartial<ISession>({ mainChat: constObservable(upcastPartial<IChat>({ resource: chat })) });
		const run = async (value: string, window?: { remote?: boolean; sessionsWindow?: boolean }) => {
			const fixture = setup({ ...window });
			await fixture.configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenChatIn, value);
			fixture.configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenChatIn]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenChatIn }));
			await fixture.presenters.at(-1)?.openChat(session, undefined);
			await fixture.presenters.at(-1)?.openChat(session, undefined, { sideBySide: true });
			return { presenters: fixture.presenters.length, chatPartOn: fixture.chatPartOptions[0].enabled.get(), opens: fixture.editorOpens.map(open => `${open.resource.path} ${open.target === SIDE_GROUP ? 'side' : open.target === ACTIVE_GROUP ? 'active' : 'other'} ${open.revealIfOpened}`) };
		};
		assert.deepStrictEqual({
			editorArea: await run('editorArea'),
			chatArea: await run('chatArea'),
			chatPanel: await run('chatPanel'),
		}, {
			editorArea: { presenters: 1, chatPartOn: false, opens: ['/session-1 active true', '/session-1 side false'] },
			chatArea: { presenters: 0, chatPartOn: true, opens: [] },
			chatPanel: { presenters: 0, chatPartOn: false, opens: [] },
		});
	});

	test('editorArea shows the Chat view as chatArea does, only its sessions, and chatPanel keeps its chat', () => {
		const shows = (chatOpenIn: string) => {
			const fixture = setup({ chatOpenIn });
			return { registered: fixture.registered, sessionsOnly: fixture.sessionsOnly.get(), localChatHidden: fixture.localChatAvailability.hidden.get() };
		};
		const chatArea = shows('chatArea');
		assert.deepStrictEqual({ editorArea: shows('editorArea'), chatArea, chatPanel: shows('chatPanel') }, {
			editorArea: chatArea,
			chatArea: { registered: [{ chatsOpenElsewhere: true }], sessionsOnly: true, localChatHidden: true },
			chatPanel: { registered: [], sessionsOnly: false, localChatHidden: false },
		});
	});

	test('editorArea opens the chat that the first request of the Chat view\'s new chat commits as a pinned editor, also of a new chat revealed before its request', () => {
		const run = (chatOpenIn: string) => {
			const { shown, viewHostsNewChat, viewReason, editorOpens } = setup({ chatOpenIn });
			// New Chat shows the composer, whose first request commits the chat
			transaction(tx => {
				viewHostsNewChat.set(true, tx);
				shown.view.set(URI.parse('agent-host-copilot:/untitled-new'), tx);
			});
			transaction(tx => {
				viewHostsNewChat.set(false, tx);
				viewReason.set('commit', tx);
				shown.view.set(URI.parse('agent-host-copilot:/session-1'), tx);
			});
			// Run Prompt in New Chat: the composer is revealed, the Chat view showing only its sessions already, before its request commits
			transaction(tx => {
				viewReason.set('open', tx);
				shown.view.set(URI.parse('agent-host-copilot:/untitled-revealed'), tx);
			});
			transaction(tx => {
				viewReason.set('commit', tx);
				shown.view.set(URI.parse('agent-host-copilot:/session-2'), tx);
			});
			// A chat that the Chat view opens, rather than commits, stays where it shows
			transaction(tx => {
				viewReason.set('open', tx);
				shown.view.set(URI.parse('agent-host-copilot:/session-3'), tx);
			});
			return editorOpens.map(open => `${open.resource.path} ${open.target === ACTIVE_GROUP ? 'active' : 'other'} pinned=${open.pinned}`);
		};
		assert.deepStrictEqual({ editorArea: run('editorArea'), chatArea: run('chatArea'), chatPanel: run('chatPanel') }, {
			editorArea: ['/session-1 active pinned=true', '/session-2 active pinned=true'],
			chatArea: [],
			chatPanel: [],
		});
	});

	test('editorArea shows the chat of the active chat editor as the window chat, and closes the editors of a chat', () => {
		const first = URI.parse('agent-host-copilot:/session-1');
		const second = URI.parse('agent-host-copilot:/session-2');
		const fixture = setup({ chatOpenIn: 'editorArea', chatViewShows: URI.parse('agent-host-copilot:/in-chat-view') });
		const shown = () => fixture.bindings.at(-1)?.shown.get()?.chat.resource.path;
		const states = [shown()];
		fixture.activateChatEditor(first);
		states.push(shown());
		fixture.activateChatEditor(undefined);
		states.push(shown());
		fixture.activateChatEditor(first);
		fixture.activateChatEditor(second);
		states.push(shown());
		return fixture.presenters[0].closeChat(first).then(() => {
			assert.deepStrictEqual({ states, options: fixture.bindings.map(binding => binding.options), isShowingFirst: fixture.presenters[0].isShowing(first), isShowingSecond: fixture.presenters[0].isShowing(second), closed: fixture.closedEditors }, {
				states: ['/in-chat-view', '/session-1', '/in-chat-view', '/session-2'],
				options: [{ override: true, priority: 1 }],
				isShowingFirst: true,
				isShowingSecond: true,
				closed: ['/session-1'],
			});
		});
	});

	test('editorArea does not take over from the presenter of a chat part that another feature enabled', () => {
		assert.deepStrictEqual({
			free: setup({ chatOpenIn: 'editorArea' }).presenters.length,
			chatPartEnabledByOther: setup({ chatOpenIn: 'editorArea', chatPartEnabledByOther: true }).presenters.length,
		}, { free: 1, chatPartEnabledByOther: 0 });
	});

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
		assert.deepStrictEqual({ registered, sessionsOnly: sessionsOnly.get() }, { registered: [{ chatsOpenElsewhere: true }], sessionsOnly: true });
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
			await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenChatIn, openChatIn(value));
			configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenChatIn]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenChatIn }));
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
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenChatIn, openChatIn(true));
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenChatIn]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenChatIn }));
		steps.push(hidden());
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenChatIn, openChatIn(false));
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenChatIn]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenChatIn }));
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
		await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenChatIn, openChatIn(true));
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenChatIn]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenChatIn }));
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
		function setupServices(options: { agentEnabled: boolean; setting?: boolean; orientation?: string; chatViewShows?: URI; chatViewNewChat?: () => Promise<void>; chatViewHasView?: boolean; localDefault?: boolean }) {
			const calls: string[] = [];
			const configurationService = new TestConfigurationService({ [ChatConfiguration.ChatViewSessionsOpenChatIn]: openChatIn(options.setting ?? true), [ChatConfiguration.ChatViewSessionsOrientation]: options.orientation ?? 'sideBySide', [ChatConfiguration.AgentEnabled]: options.agentEnabled, [ChatConfiguration.DefaultToCopilotHarness]: !options.localDefault });
			const contextKeyService = store.add(new ContextKeyService(configurationService));
			ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
			RemoteNameContext.bindTo(contextKeyService).set('');
			const instantiationService = store.add(new TestInstantiationService());
			const stub = <T extends object>(id: { toString(): string }, service: Partial<T>) => { instantiationService.stub(id as never, upcastPartial<T>(service)); };

			const shown = observableValue<{ readonly resource: URI; readonly reason: 'open' } | undefined>('shown', options.chatViewShows && { resource: options.chatViewShows, reason: 'open' as const });
			// The Chat view's widget, and the widgets of chats by their resource
			const chatViewWidget = new FakeChatWidget();
			const widgets = new Map<string, FakeChatWidget>();
			const chatView = {
				loadSession: async (resource: URI) => { calls.push(`chat view loads ${resource.scheme}`); },
				newChat: async () => {
					await options.chatViewNewChat?.();
					calls.push('chat view new chat');
					shown.set({ resource: LocalChatSessionUri.forSession('draft'), reason: 'open' }, undefined);
					return true;
				},
				shownSession: shown, reportShown: () => { }, focusInput: () => { }, widget: chatViewWidget as unknown as IChatWidget,
			};
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
			stub(IChatWidgetService, { getAllWidgets: () => [upcastPartial<IChatWidget>({ viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: agentSession }) })], getWidgetBySessionResource: (resource: URI) => widgets.get(resource.toString()) as IChatWidget | undefined });
			stub(IWorkspaceContextService, { getWorkspace: () => ({ folders: [] }) as never });
			stub(IAgentsViewProvidersService, { acquire: () => toDisposable(() => { }) });
			// What the chat part shows: an unsent new session's draft, where a test says
			const partShows = observableValue<IEditorWindowShownChat | undefined>('partShows', undefined);
			stub(IEditorWindowShownChatService, { shown: partShows });
			stub(IEditorService, { activeEditor: undefined });
			// What the default type of new chats resolves from: local chat, unless the Copilot agent is the default
			const chatSessionsService = new MockChatSessionsService();
			chatSessionsService.setContributions([{ type: SessionType.AgentHostClaude, name: 'claude', displayName: 'Claude', description: 'Claude' }]);
			instantiationService.stub(IChatSessionsService, chatSessionsService);
			instantiationService.stub(IStorageService, store.add(new TestStorageService()));
			stub(IAgentHostEnablementService, { enabled: constObservable(true), managedSandboxEnforced: constObservable(false) });
			instantiationService.stub(IManagedSettingsService, new NullManagedSettingsService());
			const loadingModel = new DeferredPromise<void>();
			stub(IChatService, { acquireOrLoadSession: async () => { await loadingModel.p; return { dispose: () => { } } as never; } });
			// The shared chat part contribution can create toolbars that register action view items, depending on what else is merged in
			stub(IActionViewItemService, { onDidChange: Event.None, register: () => toDisposable(() => { }), lookUp: () => undefined });
			stub(INotificationService, { info: () => undefined! });

			// Without the Changes editor's own services
			const createInstance = instantiationService.createInstance.bind(instantiationService) as (ctor: unknown, ...args: unknown[]) => unknown;
			instantiationService.createInstance = ((ctor: unknown, ...args: unknown[]) => ctor === ChangesMultiDiffSourceResolver ? Disposable.None : createInstance(ctor, ...args)) as typeof instantiationService.createInstance;

			stubChatViewHostServiceDependencies(instantiationService, { environmentStubbed: true });
			const hostService = instantiationService.createInstance(ChatViewHostService);
			stub(IChatViewHostService, hostService);
			const chatPartService = store.add(instantiationService.createInstance(EditorWindowChatPartService));
			stub(IEditorWindowChatPartService, chatPartService);
			store.add(instantiationService.createInstance(ChatViewOpenInChatPartContribution));
			// The host service goes last, as the hosts that registered in it unregister first
			store.add(hostService);
			const setSetting = async (value: boolean) => {
				await configurationService.setUserConfiguration(ChatConfiguration.ChatViewSessionsOpenChatIn, openChatIn(value));
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectedKeys: new Set([ChatConfiguration.ChatViewSessionsOpenChatIn]), affectsConfiguration: key => key === ChatConfiguration.ChatViewSessionsOpenChatIn }));
			};
			return { hostService, calls, loadingModel, setSetting, chatViewWidget, widgets, partShows, instantiationService };
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

		test('with local chats on by their setting, New Chat opens the chat part\'s composer and new chats are not local, so that the Chat view shows only its sessions', async () => {
			const { hostService, calls, instantiationService } = setupServices({ agentEnabled: true, localDefault: true });

			await instantiationService.invokeFunction(accessor => new NewChatAction().run(accessor));
			const defaultType = instantiationService.invokeFunction(accessor => getDefaultNewChatSessionTypeAndReason(accessor).sessionType);

			assert.deepStrictEqual({ calls, sessionsOnly: hostService.sessionsOnly.get(), localDefault: defaultType === localChatSessionType }, { calls: ['chat part composer'], sessionsOnly: true, localDefault: false });
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

		test('turning the setting on closes the local chat that the Chat view shows: the Chat view shows only its sessions, and the chat part a new chat', async () => {
			const localChat = LocalChatSessionUri.forSession('legacy');
			const { hostService, calls, setSetting } = setupServices({ agentEnabled: true, setting: false, chatViewShows: localChat });

			const steps = [hostService.sessionsOnly.get()];
			await setSetting(true);
			await timeout(0);
			steps.push(hostService.sessionsOnly.get());

			assert.deepStrictEqual({ steps, calls }, { steps: [false, true], calls: ['chat part composer'] });
		});

		test('the input of an unsent new chat does not move into the Chat view once the user opens a chat while it starts its new chat', async () => {
			const opening = new DeferredPromise<void>();
			const { hostService, calls, setSetting, chatViewWidget, widgets, partShows } = setupServices({ agentEnabled: true, chatViewNewChat: () => opening.p });
			const draftChat = URI.parse('agent-host-copilot:/untitled-draft');
			const source = new FakeChatWidget('hello');
			widgets.set(draftChat.toString(), source);
			partShows.set(upcastPartial<IEditorWindowShownChat>({ session: upcastPartial<ISession>({ status: constObservable(SessionStatus.Untitled) }), chat: upcastPartial<IChat>({ resource: draftChat }) }), undefined);

			await setSetting(false);
			await timeout(0);
			await hostService.openSession(agentSession);
			opening.complete();
			await timeout(0);

			assert.deepStrictEqual({ calls, source: source.state, target: chatViewWidget.state }, {
				calls: ['chat view loads agent-host-copilot', 'chat view new chat'],
				source: { input: 'hello', attachments: [] },
				target: { input: '', attachments: [] },
			});
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

			// The Chat view starts a new chat in its place, as the chat part showed none
			assert.deepStrictEqual({ cancelled, calls }, { cancelled: true, calls: ['chat view new chat'] });
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

		test('with no chat shown, the other host shows a new chat; a local chat gives way to a new chat of the chat part; a chat the target shows already is not opened again', async () => {
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
				local: ['part new chat'],
				already: ['part closes /session-a'],
			});
		});

		test('the input typed in a local chat moves to the new chat of the chat part as it turns on', async () => {
			const localChat = LocalChatSessionUri.forSession('local-a');
			const { setSetting, handovers, widgets, shown } = setup({ chatViewShows: localChat });
			const source = new FakeChatWidget('hello', [attachment]);
			widgets.set(localChat.toString(), source);
			await setSetting(true);

			assert.deepStrictEqual({ handovers, source: source.state, onPart: widgets.get(shown.part.get()!.toString())!.state }, {
				handovers: ['part new chat'],
				source: { input: '', attachments: [] },
				onPart: { input: 'hello', attachments: ['file-a'] },
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

		test('a local chat stays in the Chat view with its input while local chats are not hidden', async () => {
			const localChat = LocalChatSessionUri.forSession('local-a');
			const { setSetting, handovers, widgets, shown } = setup({ chatViewShows: localChat, localChatsShown: true });
			const source = new FakeChatWidget('hello', [attachment]);
			widgets.set(localChat.toString(), source);
			await setSetting(true);

			assert.deepStrictEqual({ handovers, source: source.state, onPart: shown.part.get() }, { handovers: [], source: { input: 'hello', attachments: ['file-a'] }, onPart: undefined });
		});

		test('as it turns on, it waits for the chat part\'s host to be in use, and does not take the Chat view\'s chat for the chat part\'s', async () => {
			const { setSetting, handovers, hostReady } = setup({ chatViewShows: session, lateHost: true });
			await setSetting(true);
			const beforeHost = [...handovers];
			hostReady.set(true, undefined);
			await timeout(0);

			assert.deepStrictEqual({ beforeHost, afterHost: handovers }, { beforeHost: [], afterHost: ['part opens /session-a'] });
		});

		test('turning on, the newer draft of the Chat view takes the chat part\'s composer, which parks its older one; neither moves where it cannot park, nor once a later request superseded the move', async () => {
			const newer = async (partParks: boolean) => {
				const fixture = setup({ chatViewShows: draft, partComposerInput: 'D', partParks });
				const source = new FakeChatWidget('E', [attachment]);
				fixture.widgets.set(draft.toString(), source);
				await fixture.setSetting(true);
				return { handovers: fixture.handovers, composer: fixture.partComposer!.state, source: source.state };
			};
			const parked = await newer(true);
			const notParked = await newer(false);

			// The user opens a chat while the chat part starts its new chat
			const superseding = { request: () => { } };
			const superseded = setup({ chatViewShows: draft, duringNewChat: () => superseding.request() });
			superseding.request = superseded.request;
			const sourceS = new FakeChatWidget('hello', [attachment]);
			superseded.widgets.set(draft.toString(), sourceS);
			await superseded.setSetting(true);

			assert.deepStrictEqual({
				parked,
				notParked,
				superseded: { handovers: superseded.handovers, target: superseded.widgets.get(superseded.shown.part.get()!.toString())!.state, source: sourceS.state },
			}, {
				parked: { handovers: ['part new chat', 'part parks its composer input'], composer: { input: 'E', attachments: ['file-a'] }, source: { input: '', attachments: [] } },
				notParked: { handovers: ['part new chat', 'part keeps its composer input'], composer: { input: 'D', attachments: [] }, source: { input: 'E', attachments: ['file-a'] } },
				superseded: { handovers: ['part new chat'], target: { input: '', attachments: [] }, source: { input: 'hello', attachments: ['file-a'] } },
			});
		});

		test('an unsent new chat does not move once its attachments changed meanwhile, also with the same text: its source keeps its current ones', async () => {
			const resolved = upcastPartial<IChatRequestVariableEntry>({ id: 'image-a' });
			const run = async (change: (source: FakeChatWidget) => void, during: 'newChat' | 'reveal') => {
				const source = new FakeChatWidget('hello', [attachment]);
				const fixture = setup({ chatViewShows: draft, [during === 'newChat' ? 'duringNewChat' : 'duringReveal']: () => change(source) });
				fixture.widgets.set(draft.toString(), source);
				await fixture.setSetting(true);
				return { source: source.state, target: fixture.widgets.get(fixture.shown.part.get()!.toString())!.state };
			};

			assert.deepStrictEqual({
				added: await run(source => source.attachmentModel.addContext(resolved), 'newChat'),
				removed: await run(source => source.attachmentModel.clear(), 'reveal'),
				// The same attachment, as it resolves to another value
				updated: await run(source => source.attachmentModel.clearAndSetContext(upcastPartial<IChatRequestVariableEntry>({ id: 'file-a' })), 'reveal'),
			}, {
				added: { source: { input: 'hello', attachments: ['file-a', 'image-a'] }, target: { input: '', attachments: [] } },
				removed: { source: { input: 'hello', attachments: [] }, target: { input: '', attachments: [] } },
				updated: { source: { input: 'hello', attachments: ['file-a'] }, target: { input: '', attachments: [] } },
			});
		});

		test('as it turns off, the chat part keeps the chat that moves until the Chat view shows it: not when opening it failed or another chat shows', async () => {
			const run = async (viewOpenShows: URI | null) => {
				const fixture = setup({ setting: true, viewOpenShows });
				fixture.shown.part.set(URI.parse('agent-host-copilotcli:/session-b'), undefined);
				await fixture.setSetting(false);
				return fixture.handovers;
			};

			assert.deepStrictEqual({ failed: await run(null), other: await run(URI.parse('agent-host-copilotcli:/session-c')) }, {
				failed: ['view opens /session-b'],
				other: ['view opens /session-b'],
			});
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
