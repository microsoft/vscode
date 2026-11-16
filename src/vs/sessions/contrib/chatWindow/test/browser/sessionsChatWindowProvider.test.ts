/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { parse, stringify } from '../../../../../base/common/marshalling.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { $, append } from '../../../../../base/browser/dom.js';
import { createStyleSheet } from '../../../../../base/browser/domStylesheets.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable, derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { getChatWindowMainPartOptions, IChatWindow, IChatWindowChat, IChatWindowOpenOptions, IChatWindowProvider, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ChatWindowsRestoration, OPEN_CHAT_WINDOWS_STORAGE_KEY } from '../../../../../workbench/contrib/chatWindow/browser/chatWindowsRestoration.js';
import { ChatWindowLayoutMode } from '../../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { ChatWindow, ChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindowService.js';
import { ChatWindowDefaults, ChatWindowState } from '../../../../../workbench/contrib/chatWindow/common/chatWindowState.js';
import { IAuxiliaryWindowService } from '../../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { ILifecycleService } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ChatWindowGrid, ChatWindowGridCell } from '../../../../../workbench/contrib/chatWindow/browser/chatWindowGrid.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import '../../../../../workbench/contrib/sessions/browser/parts/media/sessionActivityBar.css';
import '../../../../../workbench/browser/parts/activitybar/media/menuActivityBar.css';
import '../../../../browser/media/workbench.css';
import '../../../../browser/parts/media/editorPart.css';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, LayoutSettings, ModernUIEditorTabStyle } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../../../workbench/services/sessions/browser/chatHostOpener.js';
import { ChatInteractivity, IChat, ISession, ISessionChangeset, ISessionChangesetOperation, ISessionType, ISessionWorkspace, SessionChangesetOperationScope, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { IMarkSessionReadOptions, INewSessionDraftSlot, INewSessionRequestAcceptedEvent, INewSessionRequestEndedEvent, ISessionChange, ISessionsChangeEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISessionReplacedEvent } from '../../../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { ISessionPaneContent } from '../../../../../workbench/services/sessions/common/sessionPane.js';
import { ISessionGroupsService } from '../../../../../workbench/contrib/sessions/browser/sessionGroupsService.js';
import { ChatEditorContent, IChatEditorComposer } from '../../../../../workbench/contrib/sessions/browser/chatEditor/chatEditorContent.js';
import { CHAT_WINDOW_COMPOSERS_STORAGE_KEY } from '../../../../../workbench/contrib/sessions/browser/chatEditor/chatWindowComposer.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../common/chatWindows.js';
import { SESSION_ACTIVITY_BAR_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { SessionChangesEditorFileListContext } from '../../../../../workbench/contrib/sessions/common/changes.js';
import { SessionChangesetOperationsContext } from '../../../changes/browser/changesActions.js';
import { ActiveSessionState, IChangesSessionObservables, IChangesViewService } from '../../../../../workbench/contrib/sessions/common/changesViewService.js';
import { IGitHubService } from '../../../../../workbench/contrib/sessions/browser/github/githubService.js';
import { GitHubPullRequestCIModel } from '../../../../../workbench/contrib/sessions/browser/github/models/githubPullRequestCIModel.js';
import { findSessionActivityBarExternalHost, getSessionActivityBarSize, SessionActivityBarColumn, setSessionActivityBarSize } from '../../../../../workbench/browser/parts/sessions/sessionActivityBarHost.js';
import { MenuActivityBar, MenuActivityBarSize } from '../../../../../workbench/browser/parts/activitybar/menuActivityBar.js';
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { AGENTS_FLOATING_PANEL_GAP } from '../../../../../workbench/contrib/sessions/common/layoutConstants.js';
import { AGENTS_CHAT_WINDOW_CLASS, CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS, focusChatWindowUnlessFocused, SessionsChatWindowProvider } from '../../browser/sessionsChatWindowProvider.js';
import { DesktopMainEditorPart } from '../../../../browser/parts/desktopEditorPart.js';
import { IEditorGroupViewOptions } from '../../../../../workbench/browser/parts/editor/editor.js';
import { EditorInputCapabilities, GroupIdentifier, GroupModelChangeKind } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IGroupModelChangeEvent } from '../../../../../workbench/common/editor/editorGroupModel.js';
import { ITestSessionWithChat, stubSessionHosts, testGridPanes } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ISessionHost } from '../../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionChatViewHost } from '../../../../../workbench/contrib/sessions/browser/chatEditor/chatEditor.js';
import { ITitleService } from '../../../../../workbench/services/title/browser/titleService.js';
import { IAuxiliaryTitlebarPart } from '../../../../../workbench/browser/parts/titlebar/titlebarPart.js';
import { ViewEditorInput } from '../../../../../workbench/browser/parts/editor/viewEditorInput.js';
import { ISizeService, SIZE_CUSTOMIZATIONS_SETTING } from '../../../../../platform/theme/common/sizeService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme } from '../../../../../platform/theme/test/common/testThemeService.js';
import { WorkbenchSizeService } from '../../../../../workbench/services/themes/browser/workbenchSizeService.js';
import { generateColorThemeCSS } from '../../../../../workbench/services/themes/browser/colorThemeCss.js';

suite('Sessions chat window provider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createChat(path: string, archived = false): IChat {
		return new class extends mock<IChat>() {
			override readonly resource = URI.parse(`test:/${path}`);
			override readonly title = constObservable(path);
			override readonly isArchived = observableValue('archived', archived);
			override readonly isRead = constObservable(true);
			override readonly interactivity = constObservable(ChatInteractivity.Full);
			override readonly status = constObservable(SessionStatus.Completed);
			override readonly workspace = constObservable(undefined);
			override readonly changes = constObservable([]);
			override readonly changesets = constObservable(undefined);
		}();
	}

	function createSession(name: string, chats: IChat[]): ISession {
		return new class extends mock<ISession>() {
			override readonly sessionId = name;
			override readonly resource = URI.parse(`test:/${name}`);
			override readonly title = constObservable(name);
			override readonly loading = constObservable(false);
			override readonly chats = constObservable(chats);
			override readonly mainChat = constObservable(chats[0]);
			override readonly status = constObservable(SessionStatus.Completed);
			override readonly isArchived = constObservable(false);
			override readonly workspace = constObservable(undefined);
			override readonly capabilities = constObservable({ supportsMultipleChats: false, supportsFork: false, supportsSideChat: false, supportsRename: false, supportsDelete: false });
		}();
	}

	/** The chat window chat behind `chat`: what its editor shows of the provider's session. */
	function asWindowChat(chat: IChatWindowChat): IChatWindowChat & { readonly session: IObservable<ISession | undefined>; readonly shownChat: IObservable<IChat | undefined>; readonly content: IObservable<ISessionPaneContent | undefined> } {
		return chat as IChatWindowChat & { readonly session: IObservable<ISession | undefined>; readonly shownChat: IObservable<IChat | undefined>; readonly content: IObservable<ISessionPaneContent | undefined> };
	}

	/** `beforeProvider` sets up what the provider starts with, such as what it stored as the window last closed. */
	/** With `realChatWindowService`, the chat window service is the actual one, without windows until a test adds them. */
	function createProvider(store: DisposableStore, sessions: ISession[], beforeProvider?: (storage: TestStorageService) => void, options?: { readonly realChatWindowService?: boolean; readonly sizes?: Record<string, number> }) {
		const events: string[] = [];
		// The main window shows another session than those that move into it, such as one whose opening was cancelled
		const mainWindowActiveSession = constObservable<ITestSessionWithChat | undefined>(undefined);
		const onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());
		const onDidReplaceSession = store.add(new Emitter<ISessionReplacedEvent>());
		/** How many times the chats looked their session up. */
		const lookups = { count: 0 };
		const visibleSessions = observableValue<readonly (ITestSessionWithChat | undefined)[]>('visibleSessions', []);
		const configuration = new TestConfigurationService({ [CHAT_WINDOWS_ENABLED_SETTING]: true, [SIZE_CUSTOMIZATIONS_SETTING]: options?.sizes ?? {} });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const sentiment = observableValue<IChatSentiment>('sentiment', {});
		const instantiationService = store.add(new TestInstantiationService());
		stubSessionHosts(instantiationService, store);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(ISizeService, store.add(new WorkbenchSizeService(configuration, store.add(new NullLogService()))));
		instantiationService.stub(IThemeService, new class extends mock<IThemeService>() {
			override readonly onDidColorThemeChange = Event.None;
			override getColorTheme() { return new TestColorTheme(); }
		}());
		const storage = store.add(new TestStorageService());
		instantiationService.stub(IStorageService, storage);
		const editorGroups: IEditorGroup[] = [];
		const editorParts: IEditorPart[] = [];
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override get groups() { return editorGroups; }
			override get parts() { return editorParts; }
			override getGroup(id: GroupIdentifier) { return editorGroups.find(group => group.id === id); }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly mainPart = upcastPartial<IEditorPart>({ activeGroup: upcastPartial<IEditorGroup>({ id: 1 }) });
		}());
		const openEditors = async (editors: readonly { readonly editor: unknown; readonly options?: { readonly inactive?: boolean } }[]) => {
			events.push(`open editors ${editors.map(({ editor, options }) => `${(editor as { name: string }).name}${options?.inactive ? '' : ' (active)'}`).join(', ')}`);
			return [];
		};
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ openEditors: openEditors as unknown as IEditorService['openEditors'] }));
		instantiationService.stub(IWorkbenchLayoutService, upcastPartial<IWorkbenchLayoutService>({ setPartHidden: () => { } }));
		instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
			override readonly sentimentObs = sentiment as IObservable<IChatSentiment>;
		}());
		const onDidAcceptNewSessionRequest = store.add(new Emitter<INewSessionRequestAcceptedEvent>());
		const onDidEndNewSessionRequest = store.add(new Emitter<INewSessionRequestEndedEvent>());
		const slots: (INewSessionDraftSlot & { readonly newSession: ISettableObservable<ISession | undefined> })[] = [];
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			// The Agents window lists every session: its sessions change together as its listed ones do
			override readonly onDidChangeSession: Event<readonly ISessionChange[]> = Event.map(onDidChangeSessions.event, e => [
				...e.added.map(session => ({ session, kind: 'added' as const })),
				...e.removed.map(session => ({ session, kind: 'removed' as const })),
				...e.changed.map(session => ({ session, kind: 'changed' as const })),
			]);
			override readonly onDidAcceptNewSessionRequest = onDidAcceptNewSessionRequest.event;
			override readonly onDidEndNewSessionRequest = onDidEndNewSessionRequest.event;
			override readonly onDidReplaceNewDraftSession = Event.None;
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			override getNewSessionTarget() { return undefined; }
			override isNewSessionTargetAvailable() { return true; }
			override getSessionTypesForFolder() { return [{ providerId: 'first-provider', sessionType: upcastPartial<ISessionType>({ id: 'first-type' }) }, { providerId: 'picked-provider', sessionType: upcastPartial<ISessionType>({ id: 'picked-type' }) }]; }
			override createNewSessionSlot() {
				const id = `slot${slots.length + 1}`;
				const slot = new class extends mock<INewSessionDraftSlot & { readonly newSession: ISettableObservable<ISession | undefined>; dispose(): void }>() {
					override readonly id = id;
					override readonly newSession = observableValue<ISession | undefined>(this, undefined);
					override dispose() { events.push(`dispose ${id}`); }
				}();
				slots.push(slot);
				return slot;
			}
			override getSession(resource: URI) { return sessions.find(session => session.resource.toString() === resource.toString()); }
			override getSessions() { return sessions; }
			override getSessionForChatResource(resource: URI) {
				lookups.count++;
				for (const session of sessions) {
					// A chat is also found by a previous identity of its session, such as before a migration
					const chat = session.chats.get().find(candidate => candidate.resource.toString() === resource.toString() || (candidate as { readonly previousResource?: URI }).previousResource?.toString() === resource.toString());
					if (chat) {
						return { session, chat };
					}
				}
				return undefined;
			}
			override async markRead(session: ISession, options?: IMarkSessionReadOptions) {
				events.push(`read ${session.sessionId} ${session.mainChat.get().resource.path}${options?.preserveExplicitUnread ? ' preserving explicit unread' : ''}`);
				return true;
			}
			override async markChatRead(session: ISession, chat: IChat, options?: IMarkSessionReadOptions) {
				events.push(`read ${session.sessionId} ${chat.resource.path}${options?.preserveExplicitUnread ? ' preserving explicit unread' : ''}`);
				return true;
			}
		}());
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			readonly gridShown = visibleSessions;
			override readonly slotPanes = testGridPanes(this.gridShown);
			override readonly initialRestoreComplete = constObservable(true);
			readonly mainWindowActiveSession = mainWindowActiveSession;
			override async openMovedChats(chats: readonly { readonly session: ISession; readonly chatResource: URI }[]) {
				// A chat that a window still claims would open in that window again, not in the grid
				events.push(`open moved ${chats.map(chat => `${chat.session.sessionId} ${chat.chatResource.path}${chatHostOpenerService.getOpenerOf(chat.chatResource) ? ' (claimed by a window)' : ''}`).join(', ')}`);
			}
			override hideChatFromGrid(session: ISession, chat: URI) {
				events.push(`hide ${session.sessionId} ${chat.path}`);
				return toDisposable(() => events.push(`show ${session.sessionId} ${chat.path}`));
			}
			override async openChat(session: ISession, chat: URI) { events.push(`open ${session.sessionId} ${chat.path}`); }
			override async openChatToSide(session: ISession, chat: URI, options?: { preserveFocus?: boolean; referenceChatResource?: URI }) {
				events.push(`open ${session.sessionId} ${chat.path} beside ${options?.referenceChatResource?.path}${options?.preserveFocus ? ' preserving focus' : ''}`);
			}
		}());
		/** What opening a chat in a window does besides recording it, such as resolving it in the window's content. */
		const opening: { onOpen?: (chat: URI) => Promise<void> } = {};
		let chatWindowService: ChatWindowService | undefined;
		if (options?.realChatWindowService) {
			instantiationService.stub(IContextKeyService, store.add(new ContextKeyService(configuration)));
			instantiationService.stub(IAuxiliaryWindowService, upcastPartial<IAuxiliaryWindowService>({ getWindow: () => undefined }));
			instantiationService.stub(IHostService, upcastPartial<IHostService>({}));
			instantiationService.stub(IDialogService, upcastPartial<IDialogService>({}));
			instantiationService.stub(ILifecycleService, upcastPartial<ILifecycleService>({}));
			chatWindowService = store.add(instantiationService.createInstance(ChatWindowService));
			instantiationService.stub(IChatWindowService, chatWindowService);
		} else {
			instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
				override readonly windows = constObservable([window]);
				// Another window has focus: the chat windows show in the background.
				override readonly activeWindow = undefined;
				override async open(chat: URI, options?: IChatWindowOpenOptions) {
					events.push(`window open ${chat.scheme === 'test' ? chat.path : chat.scheme}${options?.window ? ` in ${options.window.windowId}` : ''}${options?.beside ? ` beside ${options.beside.path}` : ''}${options?.tabOf ? ` tab of ${options.tabOf.scheme === 'test' ? options.tabOf.path : options.tabOf.scheme}` : ''}${options?.preserveFocus ? ' preserving focus' : ''}`);
					await opening.onOpen?.(chat);
					return undefined;
				}
			}());
		}
		instantiationService.stub(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
			override getGroupOfSession(sessionId: string) { return sessionId === 'grouped' ? 'group' : undefined; }
			override setDraftSlotGroup(slotId: string, groupId: string | undefined) {
				events.push(`group ${slotId} ${groupId}`);
				return toDisposable(() => events.push(`ungroup ${slotId}`));
			}
		}());
		const chatHostOpenerService = new ChatHostOpenerService();
		instantiationService.stub(IChatHostOpenerService, chatHostOpenerService);
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = Event.None;
			override getProvider() { return undefined; }
		}());
		instantiationService.stub(ISessionsListModelService, upcastPartial<ISessionsListModelService>({ getStatusIcon: () => Codicon.circleSmallFilled }));
		instantiationService.stub(IChatService, new class extends mock<IChatService>() {
			override acquireExistingSession() { return undefined; }
		}());
		// The changes of the session a window shows: a changeset with an operation on its files.
		const operations = [upcastPartial<ISessionChangesetOperation>({ id: 'discard', label: 'Discard Changes', scopes: [SessionChangesetOperationScope.Resource] })];
		instantiationService.stub(IChangesViewService, upcastPartial<IChangesViewService>({
			getSessionChanges: () => upcastPartial<IChangesSessionObservables>({
				changesetObs: constObservable(upcastPartial<ISessionChangeset>({ id: 'uncommitted', operations: constObservable(operations) })),
				changesetOperationsObs: constObservable(operations),
				changesObs: constObservable([]),
				changesetsLoadingObs: constObservable(false),
				loadingObs: constObservable(false),
				stateObs: constObservable(upcastPartial<ActiveSessionState>({})),
			}),
		}));
		instantiationService.stub(ILogService, new NullLogService());
		// The title bars it creates for its windows
		const titleBars: { readonly container: HTMLElement; readonly editorGroupsContainer: unknown; readonly instantiationService: IInstantiationService; setHeight(height: number): void; readonly layouts: string[]; disposed: boolean }[] = [];
		instantiationService.stub(ITitleService, upcastPartial<ITitleService>({
			createAuxiliaryTitlebarPart: (container, editorGroupsContainer, partInstantiationService) => {
				const onDidChange = store.add(new Emitter<undefined>());
				let height = 44;
				const titleBar = { container, editorGroupsContainer, instantiationService: partInstantiationService, setHeight: (value: number) => { height = value; onDidChange.fire(undefined); }, layouts: [] as string[], disposed: false };
				titleBars.push(titleBar);
				return upcastPartial<IAuxiliaryTitlebarPart>({
					get height() { return height; },
					onDidChange: onDidChange.event,
					layout: (width: number, layoutHeight: number) => { titleBar.layouts.push(`${width}x${layoutHeight}`); },
					dispose: () => { titleBar.disposed = true; },
				});
			},
		}));
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			getSessionPullRequest: () => upcastPartial<ReturnType<IGitHubService['getSessionPullRequest']>>({
				pullRequestCIObs: constObservable(upcastPartial<GitHubPullRequestCIModel>({ checks: constObservable([]), requiredChecks: constObservable(undefined), fixRequested: observableValue('fixRequested', false) })),
			}),
		}));
		beforeProvider?.(storage);
		const provider = store.add(instantiationService.createInstance(SessionsChatWindowProvider));
		return { provider, lookups, chatWindowService, editorParts, storage, events, window, titleBars, opening, slots, onDidAcceptNewSessionRequest, onDidEndNewSessionRequest, windowInstantiationService: store.add(instantiationService.createChild(new ServiceCollection([IContextKeyService, store.add(new ContextKeyService(configuration))]))), onDidChangeSessions, onDidReplaceSession, sentiment, configuration, editorGroups, activeChat, chatHostOpenerService, visibleSessions };
	}

	/** The window the chats show in: its active chat is `activeChat`. */
	const activeChat = observableValue<URI>('activeChat', URI.parse('test:/main'));
	const window = new class extends mock<IChatWindow>() {
		override readonly windowId = 42;
		override readonly mainPart = new class extends mock<IContentPart>() {
			override readonly groups = [];
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
		}();
		override readonly layoutMode = constObservable(ChatWindowLayoutMode.SideBySide);
		override readonly onDidClose = Event.None;
		override readonly chat = activeChat;
		override readonly chats = derived(reader => [activeChat.read(reader)]);
		override readonly openedChats = this.chats;
	}();

	test('a chat window shows each chat of the provider\'s session itself, also of a session by its main chat; it keeps the chat out of the main window\'s grid while it shows it, acts on its active chat and binds its keys, without making its session the active session', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('second')]);
		const { provider, events, windowInstantiationService } = createProvider(store, [session]);

		const unknown = await provider.resolveContent(URI.parse('test:/unknown'));
		const content = (await provider.resolveContent(session.resource))!;
		const ofSession = (await content.resolveChat(session.resource))!;
		const second = (await content.resolveChat(URI.parse('test:/second')))!;
		const shownOf = (chat: IChatWindowChat) => { const shown = asWindowChat(chat); return { session: shown.session.get()?.sessionId, providerSession: shown.session.get() === session, shownChat: shown.shownChat.get()?.resource.path }; };
		store.add(content.bind!(window, windowInstantiationService));
		activeChat.set(URI.parse('test:/second'), undefined);
		const host = content.services!.get(ISessionHost) as ISessionHost;
		const contextKeyService = windowInstantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));
		const shown = {
			chats: [ofSession, second].map(chat => ({ chat: chat.chat.get().path, title: chat.title.get(), ...shownOf(chat) })),
			host: { session: host.session.get()?.sessionId, chat: host.chat.get()?.resource.path },
			changesetOperations: contextKeyService.getContextKeyValue(SessionChangesetOperationsContext.key),
			changesFileList: contextKeyService.getContextKeyValue(SessionChangesEditorFileListContext.key),
		};
		content.dispose();
		activeChat.set(URI.parse('test:/main'), undefined);

		assert.deepStrictEqual({ unknown, shown, events }, {
			unknown: undefined,
			shown: {
				chats: [{ chat: '/main', title: 'main', session: 'session', providerSession: true, shownChat: '/main' }, { chat: '/second', title: 'second', session: 'session', providerSession: true, shownChat: '/second' }],
				host: { session: 'session', chat: '/second' },
				changesetOperations: ['resource:discard'],
				changesFileList: true,
			},
			events: ['hide session /main', 'hide session /second', 'show session /main', 'show session /second'],
		});
	});

	test('a chat stays in the main window\'s grid until its window binds it, so that the editors of its session are there to move into the window; its window then keeps it out', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main')]);
		const { provider, events, windowInstantiationService } = createProvider(store, [session]);

		const content = (await provider.resolveContent(session.resource))!;
		await content.resolveChat(session.resource);
		const beforeBind = [...events];
		const binding = store.add(content.bind!(window, windowInstantiationService));
		const afterBind = [...events];
		binding.dispose();
		const afterUnbind = [...events];
		content.dispose();

		assert.deepStrictEqual({ beforeBind, afterBind, afterUnbind }, { beforeBind: [], afterBind: ['hide session /main'], afterUnbind: ['hide session /main'] });
	});

	test('another resource of a chat a window shows, such as its session\'s, resolves to the entry the window has of it, not to one of its own', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main')]);
		const { provider } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const shown = (await content.resolveChat(URI.parse('test:/main')))!;

		const ofSession = await content.resolveChat(session.resource);

		assert.deepStrictEqual({ same: ofSession === shown }, { same: true });
	});

	test('a session resolves to the chat its grid slot shows, unless the exact chat is asked for, which is its main chat', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('peer')]);
		const { provider, visibleSessions } = createProvider(store, [session]);
		visibleSessions.set([upcastPartial<ITestSessionWithChat>({ sessionId: 'session', activeChat: constObservable(session.chats.get()[1]) })], undefined);
		const content = store.add((await provider.resolveContent(session.resource))!);

		const exact = await content.resolveChat(session.resource, true);
		const substituted = await content.resolveChat(session.resource);

		assert.deepStrictEqual({ exact: exact?.chat.get().path, substituted: substituted?.chat.get().path }, { exact: '/main', substituted: '/peer' });
	});

	test('a chat leaves its window once it is archived, or deleted once its session listed its chats', async () => {
		const store = disposables.add(new DisposableStore());
		const isArchived = observableValue('archived', false);
		const archived = Object.assign(createChat('archived'), { isArchived });
		const chats = observableValue<IChat[]>('chats', [createChat('main'), archived, createChat('deleted')]);
		const session = Object.assign(createSession('session', chats.get()), { chats });
		const { provider, onDidChangeSessions } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const ended: string[] = [];
		for (const resource of ['test:/archived', 'test:/deleted', 'test:/main']) {
			const chat = (await content.resolveChat(URI.parse(resource)))!;
			store.add(chat.onDidEnd(() => ended.push(chat.chat.get().path)));
		}

		isArchived.set(true, undefined);
		chats.set(chats.get().filter(chat => chat.resource.path !== '/deleted'), undefined);
		onDidChangeSessions.fire({ added: [], changed: [session], removed: [] });

		assert.deepStrictEqual(ended, ['/archived', '/deleted']);
	});

	test('a chat leaves its window once its session is removed, such as deleted, also while the session\'s last state still lists it; not as its provider goes away, which removes nothing', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main')]);
		const sessions = [session];
		const { provider, onDidChangeSessions } = createProvider(store, sessions);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const chat = (await content.resolveChat(URI.parse('test:/main')))!;
		const ended: string[] = [];
		store.add(chat.onDidEnd(() => ended.push('ended')));

		// Its provider goes away, which hides its sessions, and comes back
		sessions.length = 0;
		onDidChangeSessions.fire({ added: [], changed: [], removed: [] });
		sessions.push(session);
		onDidChangeSessions.fire({ added: [session], changed: [], removed: [] });
		const afterProviderReturned = [...ended];
		// It is deleted, while its last state still lists the chat
		sessions.length = 0;
		onDidChangeSessions.fire({ added: [], changed: [], removed: [session] });

		assert.deepStrictEqual({ afterProviderReturned, afterRemoved: ended }, { afterProviderReturned: [], afterRemoved: ['ended'] });
	});

	test('a chat whose session its provider replaces, as it registers again, keeps showing until the replacement lists it, and ends once the replacement is archived', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('peer')]);
		const sessions = [session];
		const { provider, onDidChangeSessions } = createProvider(store, sessions);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const chat = asWindowChat((await content.resolveChat(URI.parse('test:/peer')))!);
		const ended: string[] = [];
		store.add(chat.onDidEnd(() => ended.push('ended')));

		// The replacement does not list the chat yet, such as a chat its session's chats publish later
		const isArchived = observableValue('archived', false);
		const replacement = Object.assign(createSession('session', [createChat('main')]), { isArchived });
		sessions[0] = replacement;
		onDidChangeSessions.fire({ added: [replacement], changed: [], removed: [] });
		const whileReplacing = { showsOriginal: chat.session.get() === session, ended: ended.length };
		isArchived.set(true, undefined);

		assert.deepStrictEqual({ whileReplacing, ended }, { whileReplacing: { showsOriginal: true, ended: 0 }, ended: ['ended'] });
	});

	test('a chat whose session is replaced by one with another ID, such as one handed off to another connection of its host and back, follows to the chat of the replacement that continues it rather than ending as the session is removed', async () => {
		const store = disposables.add(new DisposableStore());
		const local = createSession('local', [createChat('local-main'), createChat('local-peer')]);
		const sessions = [local];
		const { provider, onDidChangeSessions, onDidReplaceSession } = createProvider(store, sessions);
		const content = store.add((await provider.resolveContent(local.resource))!);
		const peer = asWindowChat((await content.resolveChat(URI.parse('test:/local-peer')))!);
		const main = asWindowChat((await content.resolveChat(URI.parse('test:/local-main')))!);
		const ended: string[] = [];
		store.add(peer.onDidEnd(() => ended.push('peer')));
		store.add(main.onDidEnd(() => ended.push('main')));
		// The management service announces a replacement before it removes the session that was replaced
		const replace = (from: ISession, to: ISession, chats: [string, string][]) => {
			sessions[0] = to;
			onDidReplaceSession.fire({ from, to, chats: new ResourceMap<URI>(chats.map(([source, target]): [URI, URI] => [URI.parse(`test:/${source}`), URI.parse(`test:/${target}`)])) });
			onDidChangeSessions.fire({ added: [], changed: [to], removed: [from] });
		};
		const shown = () => ({ peer: peer.chat.get().path, peerSession: peer.session.get()?.sessionId, main: main.chat.get().path, mainSession: main.session.get()?.sessionId });

		const relay = createSession('relay', [createChat('relay-main'), createChat('relay-peer')]);
		replace(local, relay, [['local-peer', 'relay-peer']]);
		const handedOff = shown();
		const resolvesToEntry = await content.resolveChat(URI.parse('test:/relay-peer')) === peer;
		const returned = createSession('local-again', [createChat('local-main'), createChat('local-peer')]);
		replace(relay, returned, [['relay-peer', 'local-peer']]);

		assert.deepStrictEqual({ handedOff, resolvesToEntry, returned: shown(), ended }, {
			handedOff: { peer: '/relay-peer', peerSession: 'relay', main: '/relay-main', mainSession: 'relay' },
			resolvesToEntry: true,
			returned: { peer: '/local-peer', peerSession: 'local-again', main: '/local-main', mainSession: 'local-again' },
			ended: [],
		});
	});

	test('a chat that knows its session looks it up again only as sessions are added or removed, not as sessions change, such as while they stream', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main')]);
		const other = createSession('other', [createChat('other-main')]);
		const sessions = [session, other];
		const { provider, onDidChangeSessions, lookups } = createProvider(store, sessions);
		const content = store.add((await provider.resolveContent(session.resource))!);
		await content.resolveChat(URI.parse('test:/main'));
		const before = lookups.count;

		for (let index = 0; index < 5; index++) {
			onDidChangeSessions.fire({ added: [], changed: [other, session], removed: [] });
		}
		const afterChanges = lookups.count - before;
		onDidChangeSessions.fire({ added: [createSession('added', [createChat('added-main')])], changed: [], removed: [] });
		const afterAdded = lookups.count - before;
		// Sessions added together, such as as a provider registers, are looked up once
		onDidChangeSessions.fire({ added: ['a', 'b', 'c'].map(id => createSession(id, [createChat(`${id}-main`)])), changed: [], removed: [] });

		assert.deepStrictEqual({ afterChanges, afterAdded, afterBatch: lookups.count - before }, { afterChanges: 0, afterAdded: 1, afterBatch: 2 });
	});

	test('a chat follows its session as it is replaced by another object with the same ID, such as a pending session that is committed, which comes as a change, also after it is announced as a replacement', async () => {
		const store = disposables.add(new DisposableStore());
		const follows = async (announced: boolean) => {
			const pending = createSession('session', [createChat('main')]);
			const sessions = [pending];
			const { provider, onDidChangeSessions, onDidReplaceSession } = createProvider(store, sessions);
			const content = store.add((await provider.resolveContent(pending.resource))!);
			const chat = asWindowChat((await content.resolveChat(URI.parse('test:/main')))!);
			const before = chat.session.get() === pending;

			const committed = createSession('session', [createChat('main')]);
			sessions[0] = committed;
			if (announced) {
				onDidReplaceSession.fire({ from: pending, to: committed });
			}
			onDidChangeSessions.fire({ added: [], changed: [committed], removed: [] });
			return { before, after: chat.session.get() === committed };
		};

		assert.deepStrictEqual({ changed: await follows(false), announced: await follows(true) }, {
			changed: { before: true, after: true },
			announced: { before: true, after: true },
		});
	});

	test('a chat is read once it shows: while it is the active chat of its window, also of a window without focus, and its editor shows it; a chat marked unread stays unread until its next turn ends, which marks it read while it shows', async () => {
		const store = disposables.add(new DisposableStore());
		const unreadChat = (path: string) => Object.assign(createChat(path), { isRead: observableValue(`${path}.isRead`, false), lastTurnEnd: observableValue<Date | undefined>(`${path}.lastTurnEnd`, new Date(1)), updatedAt: constObservable(new Date(1)) });
		const main = unreadChat('main');
		const side = unreadChat('side');
		const session = createSession('session', [main, side]);
		const { provider, events, windowInstantiationService } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		store.add(content.bind!(window, windowInstantiationService));
		// The views of their editors: the side chat's shows, the main chat's while its layout shows the chat, not EditorOnly.
		const mainVisible = observableValue('mainVisible', false);
		for (const [resource, visible] of [['test:/main', mainVisible], ['test:/side', constObservable(true)]] as const) {
			const chat = (await content.resolveChat(URI.parse(resource)))! as IChatWindowChat & ISessionChatViewHost;
			store.add(chat.attach(upcastPartial<ChatEditorContent>({ visible, primaryChatView: constObservable(undefined) })));
		}
		const step = (name: string, change: () => void) => {
			events.push(name);
			change();
		};
		const turnEnds = (chat: typeof main, time: number) => transaction(tx => {
			chat.lastTurnEnd.set(new Date(time), tx);
			chat.isRead.set(false, tx);
		});

		step('main shows', () => mainVisible.set(true, undefined));
		step('marked read', () => main.isRead.set(true, undefined));
		step('marked unread', () => main.isRead.set(false, undefined));
		step('turn ends', () => turnEnds(main, 2));
		step('main hidden, turn ends', () => {
			main.isRead.set(true, undefined);
			mainVisible.set(false, undefined);
			turnEnds(main, 3);
		});
		step('side active', () => activeChat.set(URI.parse('test:/side'), undefined));
		activeChat.set(URI.parse('test:/main'), undefined);

		assert.deepStrictEqual(events.filter(event => !event.startsWith('hide ')), [
			'main shows',
			'read session /main',
			'marked read',
			'marked unread',
			'turn ends',
			'read session /main preserving explicit unread',
			'main hidden, turn ends',
			'side active',
			'read session /side',
		]);
	});

	test('opening a chat a window shows reveals it there, and a chat opened beside one it shows opens beside it in that window; once the chat\'s editor closed, such as with its window, which is still going away, the window does not show it: it opens elsewhere, not in a new window', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const { provider, events, chatHostOpenerService, editorGroups } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const main = (await content.resolveChat(URI.parse('test:/main')))!;
		// The group of the window that shows the chat's editor
		const group = upcastPartial<IEditorGroup>({ contains: editor => editor === main.input });
		editorGroups.push(group);

		const opener = chatHostOpenerService.getOpenerOf(URI.parse('test:/main'));
		const notShown = chatHostOpenerService.getOpenerOf(URI.parse('test:/subagent'));
		await opener?.reveal(URI.parse('test:/main'));
		await opener?.openBeside(URI.parse('test:/subagent'), URI.parse('test:/main'));
		editorGroups.splice(editorGroups.indexOf(group), 1);
		const afterEditorClosed = chatHostOpenerService.getOpenerOf(URI.parse('test:/main'));

		assert.deepStrictEqual({ shown: !!opener, notShown, afterEditorClosed, events: events.filter(event => event.startsWith('window')) }, {
			shown: true,
			notShown: undefined,
			afterEditorClosed: undefined,
			events: ['window open /main', 'window open /subagent in 42 beside /main'],
		});
	});

	test('a chat its window closed for it to show elsewhere shows there again when restored: in that window, as long as it stays', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const { provider, events, chatHostOpenerService, editorGroups, window, windowInstantiationService } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		store.add(content.bind!(window, windowInstantiationService));
		const subagent = (await content.resolveChat(URI.parse('test:/subagent')))!;
		let open = true;
		editorGroups.push(upcastPartial<IEditorGroup>({
			contains: editor => open && editor === subagent.input,
			closeEditor: async () => {
				open = false;
				return true;
			},
		}));
		const opener = chatHostOpenerService.getOpenerOf(URI.parse('test:/subagent'))!;

		const closed = await opener.close(URI.parse('test:/subagent'));
		await closed?.restore();

		assert.deepStrictEqual({ closed: !!closed, events: events.filter(event => event.startsWith('window')) }, { closed: true, events: ['window open /subagent in 42 preserving focus'] });
	});

	test('a chat whose close its window vetoes is not closed: there is nothing to show it there again', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const { provider, chatHostOpenerService, editorGroups, window, windowInstantiationService } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		store.add(content.bind!(window, windowInstantiationService));
		const subagent = (await content.resolveChat(URI.parse('test:/subagent')))!;
		editorGroups.push(upcastPartial<IEditorGroup>({
			contains: editor => editor === subagent.input,
			closeEditor: async () => false,
		}));

		const closed = await chatHostOpenerService.getOpenerOf(URI.parse('test:/subagent'))!.close(URI.parse('test:/subagent'));

		assert.strictEqual(closed, undefined);
	});

	test('Move to Main Window, once the window closed its chats\' editors as it closes, opens every chat in the grid: no window, which is still going away, claims them, so none opens again', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const other = createSession('other', [createChat('elsewhere')]);
		const { provider, events, editorGroups } = createProvider(store, [session, other]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const shown = await Promise.all(['test:/elsewhere', 'test:/main', 'test:/subagent'].map(async chat => (await content.resolveChat(URI.parse(chat)))!));
		// The chat part of the window, which shows the chats' editors until it closes with the window
		const chatPart = upcastPartial<IEditorGroup>({ contains: editor => shown.some(chat => chat.input === editor) });
		editorGroups.push(chatPart);

		await provider.moveToMainWindow([URI.parse('test:/elsewhere')], {});
		editorGroups.splice(editorGroups.indexOf(chatPart), 1);
		await provider.moveToMainWindow([URI.parse('test:/elsewhere'), URI.parse('test:/main'), URI.parse('test:/subagent')], {});

		assert.deepStrictEqual(events.filter(event => !event.startsWith('hide')), [
			'open moved other /elsewhere (claimed by a window)',
			'open moved other /elsewhere, session /main, session /subagent',
		]);
	});

	test('Move to Main Window shows the chats of the window in the main window, its active one first, also of other sessions; it then opens its other editors there, without waiting for a session that does not become active', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('subagent')]);
		const other = createSession('other', [createChat('elsewhere')]);
		const { provider, events } = createProvider(store, [session, other]);

		await provider.moveToMainWindow([URI.parse('test:/elsewhere'), URI.parse('test:/main'), URI.parse('test:/subagent')], { editors: [{ name: 'file.ts' } as unknown as EditorInput] });

		assert.deepStrictEqual(events, ['open moved other /elsewhere, session /main, session /subagent', 'open editors file.ts (active)']);
	});

	test('a chat follows the chats of its session, which change without the sessions changing: it leaves its window once deleted, and shows the chat that replaces it', async () => {
		const store = disposables.add(new DisposableStore());
		const main = createChat('main');
		const chats = observableValue<IChat[]>('chats', [main, createChat('deleted')]);
		const session = Object.assign(createSession('session', chats.get()), { chats });
		const { provider } = createProvider(store, [session]);
		const content = store.add((await provider.resolveContent(session.resource))!);
		const ended: string[] = [];
		const shown = asWindowChat((await content.resolveChat(URI.parse('test:/main')))!);
		const deleted = (await content.resolveChat(URI.parse('test:/deleted')))!;
		store.add(deleted.onDidEnd(() => ended.push('/deleted')));
		const before = shown.shownChat.get();

		const replacement = createChat('main');
		chats.set([replacement], undefined);

		assert.deepStrictEqual({ ended, before: before === main, after: shown.shownChat.get() === replacement }, { ended: ['/deleted'], before: true, after: true });
	});

	test('a chat window observes the provider\'s session without owning it: as its chat moves to another session, or its window closes, it disposes neither session, and moves its hold on the grid to the session the chat is in', async () => {
		const store = disposables.add(new DisposableStore());
		const disposed: string[] = [];
		const moved = createChat('moved');
		const fromChats = observableValue<IChat[]>('fromChats', [createChat('main'), moved]);
		const toChats = observableValue<IChat[]>('toChats', [createChat('other')]);
		const from = Object.assign(createSession('from', fromChats.get()), { chats: fromChats, dispose: () => disposed.push('from') });
		const to = Object.assign(createSession('to', toChats.get()), { chats: toChats, dispose: () => disposed.push('to') });
		const sessions = [from, to];
		const { provider, events, onDidChangeSessions, windowInstantiationService } = createProvider(store, sessions);
		const content = (await provider.resolveContent(URI.parse('test:/moved')))!;
		const chat = asWindowChat((await content.resolveChat(URI.parse('test:/moved')))!);
		store.add(content.bind!(window, windowInstantiationService));
		const before = chat.session.get() === from;

		transaction(tx => {
			fromChats.set([fromChats.get()[0]], tx);
			toChats.set([...toChats.get(), moved], tx);
		});
		onDidChangeSessions.fire({ added: [], changed: [from, to], removed: [] });
		const after = chat.session.get() === to;
		content.dispose();

		assert.deepStrictEqual({ before, after, disposed, events }, { before: true, after: true, disposed: [], events: ['hide from /moved', 'hide to /moved', 'show from /moved', 'show to /moved'] });
	});

	test('a chat editor\'s pane closes its chat in its window, through the window\'s opener, only while its chat still shows that chat of that session: a content kept past the chat being replaced, or ending, closes nothing', async () => {
		const store = disposables.add(new DisposableStore());
		const isArchived = observableValue('archived', false);
		const main = Object.assign(createChat('main'), { isArchived });
		const chats = observableValue<IChat[]>('chats', [main]);
		const session = Object.assign(createSession('session', chats.get()), { chats });
		const { provider, onDidChangeSessions, chatHostOpenerService } = createProvider(store, [session]);
		const closed: string[] = [];
		store.add(chatHostOpenerService.register({
			showsChat: shown => shown.path === '/main',
			reveal: async () => { },
			openBeside: async () => { },
			close: async shown => { closed.push(shown.path); return undefined; },
		}));
		const content = store.add((await provider.resolveContent(session.resource))!);
		const chat = asWindowChat((await content.resolveChat(URI.parse('test:/main')))!);
		const first = chat.content.get()!;
		first.close();
		const closedFirst = [...closed];

		const replacement = Object.assign(createChat('main'), { isArchived });
		chats.set([replacement], undefined);
		const second = chat.content.get()!;
		first.close();
		const afterStale = [...closed];
		second.close();
		const afterSecond = [...closed];
		isArchived.set(true, undefined);
		onDidChangeSessions.fire({ added: [], changed: [session], removed: [] });
		second.close();

		assert.deepStrictEqual({ closedFirst, replaced: second !== first, detached: second.state.isDetached, afterStale, afterSecond, afterEnded: closed }, {
			closedFirst: ['/main'], replaced: true, detached: true, afterStale: ['/main'], afterSecond: ['/main', '/main'], afterEnded: ['/main', '/main'],
		});
	});

	test('a chat editor\'s pane kept past its window letting go of its chat, as the window closes or the chat moves to another window, closes nothing: not the chat that a window shows again', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main')]);
		const { provider, chatHostOpenerService } = createProvider(store, [session]);
		const closed: string[] = [];
		store.add(chatHostOpenerService.register({
			showsChat: shown => shown.path === '/main',
			reveal: async () => { },
			openBeside: async () => { },
			close: async shown => { closed.push(shown.path); return undefined; },
		}));
		const first = (await provider.resolveContent(session.resource))!;
		const released = asWindowChat((await first.resolveChat(URI.parse('test:/main')))!);
		const kept = released.content.get()!;
		released.dispose();
		first.dispose();
		const second = store.add((await provider.resolveContent(session.resource))!);
		const shownAgain = asWindowChat((await second.resolveChat(URI.parse('test:/main')))!);

		kept.close();
		const afterKept = [...closed];
		shownAgain.content.get()!.close();

		assert.deepStrictEqual({ afterKept, afterShownAgain: closed }, { afterKept: [], afterShownAgain: ['/main'] });
	});

	test('the tab of the last chat of a window, while another editor is beside it in its group, shows the chat\'s title and offers no close action; alone again, it closes as before', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main')]);
		const { provider, windowInstantiationService, editorGroups } = createProvider(store, [session]);
		const content = (await provider.resolveContent(session.resource))!;
		const chat = (await content.resolveChat(session.resource))!;
		const onModelChange = store.add(new Emitter<IGroupModelChangeEvent>());
		const tab = upcastPartial<EditorInput>({});
		const editors: EditorInput[] = [chat.input, tab];
		editorGroups.push(upcastPartial<IEditorGroup>({
			windowId: window.windowId,
			get count() { return editors.length; },
			contains: (editor: EditorInput) => editors.includes(editor),
			onDidModelChange: onModelChange.event,
		}));

		store.add(content.bind!(window, windowInstantiationService));
		const withTab = { name: chat.input.getName(), cannotClose: chat.input.hasCapability(EditorInputCapabilities.CannotClose) };
		editors.pop();
		onModelChange.fire({ kind: GroupModelChangeKind.EDITOR_CLOSE, editor: tab });
		const alone = chat.input.hasCapability(EditorInputCapabilities.CannotClose);
		content.dispose();
		editorGroups.length = 0;

		assert.deepStrictEqual({ withTab, alone }, { withTab: { name: 'main', cannotClose: true }, alone: false });
	});

	test('a chat window restores while its chat is there, and forgets the chats of removed sessions; it restores only while enabled and AI features show', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('archived', true)]);
		const { provider, onDidChangeSessions, sentiment } = createProvider(store, [session]);
		const removed: string[][] = [];
		store.add(provider.onDidRemoveChats(chats => removed.push(chats.map(chat => chat.path))));

		const restores = await Promise.all(['test:/main', 'test:/archived', 'test:/session'].map(resource => provider.canRestore(URI.parse(resource))));
		const enabled = provider.restoreEnabled.get();
		sentiment.set({ hidden: true }, undefined);
		const hidden = provider.restoreEnabled.get();
		onDidChangeSessions.fire({ added: [], changed: [], removed: [session] });

		assert.deepStrictEqual({ restores, enabled, hidden, removed }, {
			restores: [true, false, true],
			enabled: true,
			hidden: false,
			removed: [['/session', '/main', '/archived']],
		});
	});

	test('the main part of a chat window follows the tabs setting, with none showing one tab so that its actions show, and arranges no groups on a double click', () => {
		assert.deepStrictEqual(['multiple', 'single', 'none'].map(getChatWindowMainPartOptions), [
			{ doubleClickTabToToggleEditorGroupSizes: 'off' },
			{ doubleClickTabToToggleEditorGroupSizes: 'off' },
			{ doubleClickTabToToggleEditorGroupSizes: 'off', showTabs: 'single' },
		]);
	});

	for (const connected of [false, true]) {
		test(`chat windows lay out initial and live semantic gaps without changing their exterior gutters with connected tabs ${connected}`, async () => {
			const store = disposables.add(new DisposableStore());
			const { provider, configuration, windowInstantiationService, storage } = createProvider(store, [], undefined, { sizes: { 'agentsWindow.panels.spacing': 16 } });
			await configuration.setUserConfiguration(LayoutSettings.MODERN_UI_EDITOR_TAB_STYLE, connected ? ModernUIEditorTabStyle.Connected : ModernUIEditorTabStyle.Pill);
			const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.chat-gap-test'));
			store.add(toDisposable(() => workbench.remove()));
			if (connected) {
				workbench.classList.add('modern-ui-tabs', 'modern-ui-connected-editor-tabs', 'dock-detail-panel', 'agents-side-pane-multiple-tabs');
			}
			const sizes = store.add(new WorkbenchSizeService(configuration, store.add(new NullLogService())));
			const sheet = createStyleSheet(undefined, undefined, store);
			const updateStyles = () => sheet.textContent = generateColorThemeCSS(new TestColorTheme(), '.chat-gap-test', undefined, undefined, sizes).code;
			updateStyles();
			store.add(sizes.onDidChangeSizes(updateStyles));
			workbench.style.cssText = '--vscode-strokeThickness: 1px; --vscode-cornerRadius-large: 8px;';
			const host = append(workbench, $(`.${AGENTS_CHAT_WINDOW_CLASS}`));
			host.style.cssText = 'position: fixed; top: 0; left: 0; width: 1000px; height: 600px;';
			const part = () => new class extends mock<IContentPart>() {
				override readonly element = $(`.part.editor${connected ? '.editor-tabs-multiple' : ''}`);
				readonly content = append(this.element, $('.content'));
				readonly group = append(this.content, $('.editor-group-container'));
				override readonly minimumWidth = 100;
				override readonly maximumWidth = Number.POSITIVE_INFINITY;
				override readonly minimumHeight = 50;
				override readonly maximumHeight = Number.POSITIVE_INFINITY;
				override readonly onDidChange = Event.None;
				override readonly groups = [new class extends mock<IEditorGroup>() { override readonly isEmpty = false; override readonly onDidModelChange = Event.None; }()];
				override getGroups() { return this.groups; }
				override findGroup() { return undefined; }
				override readonly onDidAddGroup = Event.None;
				override readonly onDidRemoveGroup = Event.None;
				override readonly onDidMoveGroup = Event.None;
				override readonly onWillClose = Event.None;
				override layout(width: number, height: number) {
					this.element.style.width = `${width}px`;
					this.element.style.height = `${height}px`;
					this.content.style.cssText = 'position: relative; width: 100%; height: 100%;';
					this.group.style.cssText = 'position: relative; width: 100%; height: 100%;';
				}
				override setVisible() { }
			}();
			const groups = new class extends mock<IEditorGroupsService>() {
				override getScopedInstantiationService() { return windowInstantiationService; }
			}();
			const stripElement = append(host, $('.chat-window-strip'));
			const strip = store.add(provider.chrome.createStrip!(window, stripElement, windowInstantiationService)!);
			const activityBar = append(stripElement, $('.menu-activity-bar.session-activity-bar.docked'));
			activityBar.classList.toggle('size-compact', getSessionActivityBarSize(storage) === MenuActivityBarSize.Compact);
			const grid = store.add(new ChatWindowGrid(host, {
				main: part(), chat: part(),
				strip: { element: stripElement, visible: strip.visible, size: strip.size, layout: (width, height) => strip.layout(width, height) },
			}, constObservable(ChatWindowLayoutMode.SideBySide), provider.look.gap, undefined, undefined, undefined, groups));
			const read = () => {
				grid.setOuterInsets(provider.look.outerInsets!.get());
				grid.layout(1000, 600);
				const surface = connected ? '.editor-group-container' : '.part-grid-card';
				const chat = host.querySelector<HTMLElement>(`[data-part-grid-cell="chat"] ${surface}`)!.getBoundingClientRect();
				const main = host.querySelector<HTMLElement>(`[data-part-grid-cell="main"] ${surface}`)!.getBoundingClientRect();
				const bar = activityBar.getBoundingClientRect();
				const stripCard = stripElement.closest('.part-grid-card')!.getBoundingClientRect();
				return {
					gap: main.left - chat.right, insets: provider.look.outerInsets!.get(), strip: strip.size.get(),
					activityBar: { width: bar.width, insideCard: bar.left >= stripCard.left && bar.right <= stripCard.right, gap: bar.left - main.right },
				};
			};
			const snapshots = [read()];
			const update = async (key: string, value: unknown) => {
				await configuration.setUserConfiguration(key, value);
				configuration.onDidChangeConfigurationEmitter.fire({
					affectsConfiguration: candidate => candidate === key, source: ConfigurationTarget.USER,
					affectedKeys: new Set([key]), change: { keys: [key], overrides: [] },
				});
			};
			for (const sizes of [{ 'agentsWindow.panels.spacing': 0 }, { 'agentsWindow.panels.spacing': 1 }, { 'panels.spacing': 7 }, {}]) {
				await update(SIZE_CUSTOMIZATIONS_SETTING, sizes);
				snapshots.push(read());
			}
			await update('window.density.layout', 'compact');
			workbench.classList.add('modern-ui-compact');
			snapshots.push(read());
			const stripWidth = MenuActivityBar.getWidth(false, getSessionActivityBarSize(storage));
			const compactStripWidth = MenuActivityBar.getWidth(true, getSessionActivityBarSize(storage));
			assert.deepStrictEqual(snapshots, [
				...[16, 0, 1, 7, 4].map(gap => ({
					gap, insets: { top: 0, right: 4, bottom: 4, left: 4 }, strip: stripWidth + gap - (connected ? Math.min(1, Math.floor(gap / 2)) : 0),
					activityBar: { width: stripWidth, insideCard: true, gap },
				})),
				{
					gap: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 }, strip: compactStripWidth,
					activityBar: { width: compactStripWidth, insideCard: true, gap: 0 },
				},
			]);
		});
	}

	test('chat-window cards and their content use chat, editor and terminal corners independently', async () => {
		const store = disposables.add(new DisposableStore());
		const { configuration } = createProvider(store, []);
		const sizes = store.add(new WorkbenchSizeService(configuration, store.add(new NullLogService())));
		const sheet = createStyleSheet(undefined, undefined, store);
		const updateStyles = () => sheet.textContent = generateColorThemeCSS(new TestColorTheme(), '.chat-radius-test', undefined, undefined, sizes).code;
		updateStyles();
		store.add(sizes.onDidChangeSizes(updateStyles));
		const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.chat-radius-test.modern-ui-tabs.modern-ui-connected-editor-tabs.dock-detail-panel.agents-side-pane-multiple-tabs'));
		store.add(toDisposable(() => root.remove()));
		const host = append(root, $(`.${AGENTS_CHAT_WINDOW_CLASS}`));
		const grid = append(host, $('.monaco-grid-view'));
		const parts = ['chat', 'main', 'terminals', 'created', 'titleRow', 'strip'].map(id => {
			const cell = append(grid, $('.part-grid-cell'));
			cell.dataset.partGridCell = id;
			if (id === 'created') {
				cell.dataset.partGridCreated = '';
			}
			const card = append(cell, $('.part-grid-card'));
			const part = id === 'titleRow' || id === 'strip' ? undefined : append(card, $('.part.editor.editor-tabs-multiple'));
			const group = part && append(append(part, $('.content')), $('.editor-group-container'));
			return { card, part, group };
		});
		const read = () => parts.map(({ card, part, group }) => ({
			radius: mainWindow.getComputedStyle(card).borderRadius,
			contentRadius: part ? mainWindow.getComputedStyle(part).borderTopLeftRadius : undefined,
			frameRadius: group ? mainWindow.getComputedStyle(group, '::after').borderTopLeftRadius : undefined,
		}));
		const baseline = read();
		const snapshots = [];
		for (const value of [
			{ 'agentsWindow.panels.cornerRadius': 0 },
			{ 'agentsWindow.chatPanels.cornerRadius': 2, 'agentsWindow.editorArea.cornerRadius': 6, 'agentsWindow.toolsPanel.cornerRadius': 4 },
			{},
		]) {
			await configuration.setUserConfiguration(SIZE_CUSTOMIZATIONS_SETTING, value);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === SIZE_CUSTOMIZATIONS_SETTING, source: ConfigurationTarget.USER,
				affectedKeys: new Set([SIZE_CUSTOMIZATIONS_SETTING]), change: { keys: [SIZE_CUSTOMIZATIONS_SETTING], overrides: [] },
			});
			snapshots.push(read());
		}
		root.classList.add('modern-ui-compact');
		assert.deepStrictEqual({ snapshots, compact: read() }, {
			snapshots: [
				[0, 0, 0, 0, 0, 0].map((radius, index) => ({
					radius: `${radius}px`, contentRadius: index < 4 ? `${radius}px` : undefined,
					frameRadius: index < 4 ? `${Math.max(0, radius - 1)}px` : undefined,
				})),
				[2, 6, 4, 6, 0, 0].map((radius, index) => ({
					radius: `${radius}px`, contentRadius: index < 4 ? `${radius}px` : undefined,
					frameRadius: index < 4 ? `${Math.max(0, radius - 1)}px` : undefined,
				})),
				baseline,
			],
			compact: parts.map(({ part }) => ({ radius: '0px', contentRadius: part ? '0px' : undefined, frameRadius: part ? '0px' : undefined })),
		});
	});

	test('the Session Activity Bar of a chat window shows in a column of its own at the right of the window, at the size chosen for it and as wide as the main window\'s, whatever the layout mode, never inside the chat', () => {
		const store = disposables.add(new DisposableStore());
		const { provider, storage, windowInstantiationService } = createProvider(store, []);
		const container = append(mainWindow.document.body, $('.chat-window-strip'));
		store.add(toDisposable(() => container.remove()));
		const strip = provider.chrome.createStrip!(window, container, windowInstantiationService)!;
		store.add(strip);
		// A chat view of the window looks for the host among its ancestors.
		const chatView = append(mainWindow.document.body, $('div'));
		store.add(toDisposable(() => chatView.remove()));
		const host = findSessionActivityBarExternalHost(chatView);
		// The main window's column at the default layout density, the gap between its cards included, at each size chosen
		const mainColumn = store.add(new SessionActivityBarColumn(constObservable(true)));
		const sizes: Record<string, { chatWindow: number; mainWindow: number }> = {};
		for (const size of [getSessionActivityBarSize(storage), MenuActivityBarSize.Normal, MenuActivityBarSize.Compact]) {
			setSessionActivityBarSize(storage, size);
			mainColumn.setLayout(AGENTS_FLOATING_PANEL_GAP - 1, false, size);
			sizes[`${Object.keys(sizes).length ? 'then ' : 'initially '}${size}`] = { chatWindow: strip.size.get(), mainWindow: mainColumn.minimumWidth };
		}

		assert.deepStrictEqual({ hostedInStrip: host?.element === container, active: host?.active.get(), fullSize: host?.fullSize, classes: [...container.classList], visible: strip.visible.get() }, {
			hostedInStrip: true,
			active: true,
			fullSize: true,
			// Not the main window's column's: their rules follow the main window's state, whose classes a chat window mirrors
			classes: ['chat-window-strip', 'session-activity-bar-host'],
			visible: true,
		});
		// Compact unless the normal size is chosen, from the context menu of either window's bar
		assert.deepStrictEqual(Object.keys(sizes), ['initially compact', 'then normal', 'then compact']);
		for (const [key, { chatWindow, mainWindow }] of Object.entries(sizes)) {
			assert.strictEqual(chatWindow, mainWindow, key);
		}
	});

	test('the strip of a chat window aligns with the card frames and keeps the main window\'s distances, to the card beside it and to the right edge of the window, inside the card of its column, which clips what it shows, in Default and Compact density, whatever the main window\'s state', () => {
		const store = disposables.add(new DisposableStore());
		const { provider, storage, windowInstantiationService, configuration } = createProvider(store, []);
		const part = (name: string) => new class extends mock<IContentPart>() {
			override readonly element = $(`.${name}`);
			override readonly minimumWidth = 100;
			override readonly maximumWidth = Number.POSITIVE_INFINITY;
			override readonly minimumHeight = 50;
			override readonly maximumHeight = Number.POSITIVE_INFINITY;
			override readonly onDidChange = Event.None;
			override readonly groups = [new class extends mock<IEditorGroup>() { override readonly isEmpty = false; override readonly onDidModelChange = Event.None; }()];
			override getGroups() { return this.groups; }
			override findGroup() { return undefined; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onWillClose = Event.None;
			override layout() { }
			override setVisible() { }
		}();
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override getScopedInstantiationService(): IInstantiationService {
				const contextKeyService = new MockContextKeyService();
				return upcastPartial<IInstantiationService>({ invokeFunction: (<R>(fn: (accessor: ServicesAccessor) => R) => fn(upcastPartial<ServicesAccessor>({ get: <T>() => contextKeyService as T }))) as IInstantiationService['invokeFunction'] });
			}
		}();
		const windowWidth = 1000;
		const windowHeight = 600;
		const rect = (element: Element) => element.getBoundingClientRect();
		// The Agents window's workbench element, with the classes and the theme's tokens its cards and the strip are styled with
		const createWorkbench = (store: DisposableStore, compact: boolean, mainWindowState: readonly string[]) => {
			const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.modern-ui-tabs.modern-ui-connected-editor-tabs.dock-detail-panel.mac'));
			store.add(toDisposable(() => workbench.remove()));
			workbench.classList.toggle('modern-ui-compact', compact);
			workbench.classList.add(...mainWindowState);
			workbench.style.cssText = `--vscode-agents-layout-floatingPanelGap: ${AGENTS_FLOATING_PANEL_GAP}px; --vscode-strokeThickness: 1px; --vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-spacing-size240: 24px; --vscode-cornerRadius-large: 8px; --window-corner-radius: 10px;`;
			return workbench;
		};
		// The strip as the Session Activity Bar docks it in a host that it fills, at the size chosen for it
		const dock = (host: HTMLElement, size: MenuActivityBarSize) => {
			const docked = append(host, $('.menu-activity-bar.session-activity-bar.docked'));
			docked.classList.toggle('size-compact', size === MenuActivityBarSize.Compact);
			return docked;
		};
		// Between the boxes, and as they show: a card that leaves its frame to what it holds shows it inside its border
		const distances = (strip: HTMLElement, column: HTMLElement, card: HTMLElement, frameInset: number) => {
			const stripRect = rect(strip);
			// As wide as the bar says it is, in both windows
			assert.strictEqual(stripRect.width, MenuActivityBar.getWidth(strip.closest('.modern-ui-compact') !== null, strip.classList.contains('size-compact') ? MenuActivityBarSize.Compact : MenuActivityBarSize.Normal));
			const columnCard = column.closest('.part-grid-card') ?? column;
			return {
				width: stripRect.width,
				verticalInsets: [stripRect.top - rect(column).top, rect(column).bottom - stripRect.bottom],
				insideItsCard: stripRect.left >= rect(columnCard).left && stripRect.right <= rect(columnCard).right,
				toCard: stripRect.left - rect(card).right,
				visibleToCard: stripRect.left - rect(card).right + frameInset,
				toEdge: windowWidth - stripRect.right,
			};
		};

		const actual: Record<string, unknown> = {};
		const expected: Record<string, unknown> = {};
		for (const [compact, size] of [false, true].flatMap(compact => [MenuActivityBarSize.Normal, MenuActivityBarSize.Compact].map(size => [compact, size] as const))) {
			const density = `${compact ? 'compact' : 'default'} density, ${size} size`;
			setSessionActivityBarSize(storage, size);

			// The main window, with the side pane closed: as its workbench lays out its grid (`_gridGutter`, `_layoutGrid`), which ends
			// the gap before the right edge of the window, its column at the right of it, right beside the chat's card.
			const mainStore = new DisposableStore();
			const main = createWorkbench(mainStore, compact, ['noeditorpane']);
			const gridGutter = compact ? 0 : AGENTS_FLOATING_PANEL_GAP;
			const mainColumn = mainStore.add(new SessionActivityBarColumn(constObservable(true)));
			mainColumn.setLayout(compact ? 0 : gridGutter - 1, compact, size);
			const columnLeft = windowWidth - gridGutter - mainColumn.minimumWidth;
			const chatCard = append(main, $('div'));
			chatCard.style.cssText = `position: fixed; top: 0; left: 0; width: ${columnLeft}px; height: ${windowHeight}px;`;
			append(main, mainColumn.element).style.cssText = `position: fixed; top: 0; left: ${columnLeft}px; width: ${mainColumn.minimumWidth}px; height: ${windowHeight}px;`;
			// Its chat shows its frame inset within its card (`--agents-session-frame-inset`)
			const frame = append(chatCard, $('div'));
			frame.style.borderRight = 'var(--agents-session-frame-inset) solid transparent';
			const sessionFrameInset = parseFloat(mainWindow.getComputedStyle(frame).borderRightWidth);
			const mainDistances = distances(dock(mainColumn.element, size), mainColumn.element, chatCard, sessionFrameInset);
			expected[density] = mainDistances;
			assert.strictEqual(mainDistances.visibleToCard, mainDistances.toEdge);
			mainStore.dispose();

			// A chat window beside the chat, and beside its main part, whatever the state of the main window, whose classes it mirrors
			configuration.setUserConfiguration('window.density.layout', compact ? 'compact' : 'default');
			for (const [mode, neighbor] of [[ChatWindowLayoutMode.ChatOnly, ChatWindowGridCell.Chat], [ChatWindowLayoutMode.SideBySide, ChatWindowGridCell.Main]] as const) {
				for (const mainWindowState of [['noeditorpane'], ['session-activity-bar-column-visible']]) {
					const windowStore = new DisposableStore();
					const workbench = createWorkbench(windowStore, compact, mainWindowState);
					const host = append(workbench, $(`.${AGENTS_CHAT_WINDOW_CLASS}`));
					host.style.cssText = `position: fixed; top: 0; left: 0; width: ${windowWidth}px; height: ${windowHeight}px;`;
					const stripElement = append(host, $('.chat-window-strip'));
					const strip = windowStore.add(provider.chrome.createStrip!(window, stripElement, windowInstantiationService)!);
					const grid = windowStore.add(new ChatWindowGrid(host, { main: part('main'), chat: part('chat'), strip: { element: stripElement, visible: strip.visible, size: strip.size, layout: (width, height) => strip.layout(width, height) } }, constObservable(mode), provider.look.gap, undefined, undefined, undefined, editorGroupsService));
					grid.setOuterInsets(provider.look.outerInsets!.get());
					grid.layout(windowWidth, windowHeight);
					const card = host.querySelector<HTMLElement>(`[data-part-grid-cell="${neighbor}"] > .part-grid-card`)!;
					const cardStyle = mainWindow.getComputedStyle(card);
					// A card that leaves its frame to what it holds has a transparent border, inside which that frame shows
					const frameInset = cardStyle.borderRightColor === 'rgba(0, 0, 0, 0)' ? parseFloat(cardStyle.borderRightWidth) : 0;
					const docked = dock(stripElement, size);
					// Its corners are its own, as the other cards of a chat window keep theirs, not the main window's rounded corner
					const corners = mainWindow.getComputedStyle(docked).borderBottomRightRadius === mainWindow.getComputedStyle(docked).borderTopRightRadius ? 'its own' : 'the main window\'s';
					actual[`${density}, beside the ${neighbor}, main window ${mainWindowState}`] = { ...distances(docked, stripElement, card, frameInset), corners };
					expected[`${density}, beside the ${neighbor}, main window ${mainWindowState}`] = { ...expected[density] as object, corners: 'its own' };
					windowStore.dispose();
				}
			}
			delete expected[density];
		}

		assert.deepStrictEqual(actual, expected);
	});

	test('the title row of a chat window is the title bar of the Agents window, created into it with the window\'s services, which its command center and actions act on, across its top in every layout: as tall as the title bar is, such as for its density', () => {
		const store = disposables.add(new DisposableStore());
		const { provider, windowInstantiationService, titleBars } = createProvider(store, []);
		const container = $('.chat-window-title-row');
		const row = provider.chrome.createTitleRow!(window, container, windowInstantiationService)!;
		const visible = row.visible.get();
		const sizes = [row.size.get()];
		titleBars[0].setHeight(35);
		sizes.push(row.size.get());
		row.layout(1000, 35);
		row.dispose();

		assert.deepStrictEqual({
			created: titleBars.map(titleBar => ({ container: titleBar.container === container, editorGroups: titleBar.editorGroupsContainer === window.mainPart, services: titleBar.instantiationService === windowInstantiationService })),
			visible,
			sizes,
			layouts: titleBars[0].layouts,
			disposed: titleBars[0].disposed,
		}, {
			created: [{ container: true, editorGroups: true, services: true }],
			visible: true,
			sizes: [44, 35],
			layouts: ['1000x35'],
			disposed: true,
		});
	});

	test('focuses its window only while that window does not have focus, so that a focused chat window is not focused again', () => {
		const focused: boolean[] = [];
		for (const hasFocus of [false, true]) {
			focusChatWindowUnlessFocused({ document: { hasFocus: () => hasFocus } }, () => focused.push(hasFocus));
		}
		assert.deepStrictEqual(focused, [false]);
	});

	test('the cards keep the main window\'s gaps: between them and to the edges of the window but its top, where the title row is, with the strip\'s column or without it', () => {
		const store = disposables.add(new DisposableStore());
		const { provider, configuration } = createProvider(store, []);
		const withStrip = provider.look.outerInsets?.get();
		configuration.setUserConfiguration(SESSION_ACTIVITY_BAR_SETTING, false);

		assert.deepStrictEqual({ gap: provider.look.gap.get(), withStrip, withoutStrip: provider.look.outerInsets?.get() }, {
			gap: 4,
			withStrip: { top: 0, right: 4, bottom: 4, left: 4 },
			withoutStrip: { top: 0, right: 4, bottom: 4, left: 4 },
		});
	});

	test('the main part of a chat window shows the menus of the main window\'s editor area, such as the actions of the Changes editor in its header row', () => {
		// Its menus only: the main window's options read nothing of the part for them.
		const mainWindowOptions = (DesktopMainEditorPart.prototype as unknown as { getGroupViewOptions(this: object): IEditorGroupViewOptions }).getGroupViewOptions.call({});

		assert.deepStrictEqual(CHAT_WINDOW_MAIN_PART_GROUP_VIEW_OPTIONS.menuIds, mainWindowOptions.menuIds);
	});
	/** The composer behind `chat`: what its editor shows while it has not sent its session. */
	function asComposerChat(chat: IChatWindowChat) {
		return chat as ReturnType<typeof asWindowChat> & { readonly composer: IObservable<IChatEditorComposer | undefined> };
	}

	/** A window showing `session`'s main chat, whose New Session opens composers, which the window resolves as it opens them. */
	async function openWindowWithComposers(store: DisposableStore, sessions: ISession[]) {
		const services = createProvider(store, sessions);
		const content = store.add((await services.provider.resolveContent(sessions[0].resource))!);
		await content.resolveChat(URI.parse('test:/main'));
		store.add(content.bind!(window, services.windowInstantiationService));
		const opened: IChatWindowChat[] = [];
		services.opening.onOpen = async chat => {
			const resolved = await content.resolveChat(chat);
			if (resolved) {
				opened.push(resolved);
			}
		};
		return { ...services, content, opened };
	}

	test('New Session in a chat window opens a composer as a tab of its active chat, aimed at that chat\'s session and joining its custom group, in a draft slot of its own; while the active chat is that composer, it focuses it; closing it discards only its slot', async () => {
		const store = disposables.add(new DisposableStore());
		const main = Object.assign(createChat('main'), { modelId: constObservable('model'), mode: constObservable({ id: 'agent', kind: 'agent' }) });
		const session = Object.assign(createSession('grouped', [main]), { providerId: 'provider', sessionType: 'type', workspace: constObservable(upcastPartial<ISessionWorkspace>({ uri: URI.file('/repo'), folders: [] })), isQuickChat: constObservable(false) });
		const { provider, events, opened, slots } = await openWindowWithComposers(store, [session]);

		await provider.openNewChat(window);
		const composer = asComposerChat(opened[0]);
		const draftHost = composer.composer.get()!.draftHost;
		const shown = { scheme: composer.chat.get().scheme, title: composer.title.get(), target: draftHost.requestedTarget?.get(), session: composer.session.get(), content: composer.content.get(), ownSlot: draftHost.slot === slots[0] };
		activeChat.set(composer.chat.get(), undefined);
		await provider.openNewChat(window);
		const again = { opened: opened.length, same: opened[1] === composer, slots: slots.length };
		composer.dispose();
		activeChat.set(URI.parse('test:/main'), undefined);

		assert.deepStrictEqual({ shown, again, events }, {
			shown: { scheme: 'vscode-agents-composer', title: 'New Session', target: { folderUri: URI.file('/repo'), providerId: 'provider', sessionTypeId: 'type', modelId: 'model', modeId: 'agent' }, session: undefined, content: undefined, ownSlot: true },
			again: { opened: 2, same: true, slots: 1 },
			events: ['hide grouped /main', 'group slot1 group', 'window open vscode-agents-composer in 42 tab of /main', 'window open vscode-agents-composer in 42', 'dispose slot1', 'ungroup slot1'],
		});
	});

	test('New Session in a chat window with a folder, such as one picked with New Session in Folder, opens a composer aimed at that folder, with the provider that resolved it and its first session type there, as a tab of the active chat; it replaces an active composer whose closing loses nothing, not one with input or a send under way', async () => {
		const store = disposables.add(new DisposableStore());
		const main = Object.assign(createChat('main'), { modelId: constObservable('model'), mode: constObservable({ id: 'agent', kind: 'agent' }) });
		const session = Object.assign(createSession('session', [main]), { providerId: 'provider', sessionType: 'type', workspace: constObservable(upcastPartial<ISessionWorkspace>({ uri: URI.file('/repo'), folders: [] })), isQuickChat: constObservable(false) });
		const { provider, events, opened, slots, editorGroups, onDidAcceptNewSessionRequest, opening } = await openWindowWithComposers(store, [session]);
		// The editors of the chats it opened show in a group, which closes them as the user would
		editorGroups.push(upcastPartial<IEditorGroup>({
			contains: (editor: unknown) => opened.some(chat => chat.input === editor),
			closeEditor: async (editor: unknown) => {
				const chat = opened.find(candidate => candidate.input === editor)!;
				events.push(`close composer ${opened.indexOf(chat) + 1}`);
				chat.dispose();
				return true;
			},
		}));
		const composerAt = (index: number) => asComposerChat(opened[index]);
		const openFrom = async (index: number | undefined, folder: string, providerId?: string) => {
			activeChat.set(index === undefined ? URI.parse('test:/main') : composerAt(index).chat.get(), undefined);
			events.length = 0;
			await provider.openNewChat(window, { folder: { uri: URI.file(folder), ...(providerId ? { providerId } : {}) } });
			return events.map(event => event.replace(/vscode-agents-composer:\/[^\s]+/g, 'composer'));
		};

		const fromSentChat = await openFrom(undefined, '/picked', 'picked-provider');
		const pickedTarget = composerAt(0).composer.get()?.draftHost.requestedTarget?.get();
		const fromPristineComposer = await openFrom(0, '/other');
		composerAt(1).composer.get()!.draftHost.input!.set({ inputText: 'draft', attachments: [] });
		const fromComposerWithInput = await openFrom(1, '/third');
		const sending = Object.assign(createSession('sending', [createChat('sending-main')]), { status: constObservable(SessionStatus.Untitled) });
		slots[2].newSession.set(sending, undefined);
		onDidAcceptNewSessionRequest.fire({ session: sending, owner: slots[2], background: false });
		const fromSendingComposer = await openFrom(2, '/fourth');
		// The pristine composer it replaces gets input while the new one opens: it stays
		const resolveOpened = opening.onOpen!;
		opening.onOpen = async chat => {
			composerAt(3).composer.get()!.draftHost.input!.set({ inputText: 'typed meanwhile', attachments: [] });
			await resolveOpened(chat);
		};
		const fromComposerTypedInWhileOpening = await openFrom(3, '/fifth');
		opening.onOpen = resolveOpened;
		const targets = opened.slice(1).map(chat => asComposerChat(chat).composer.get()?.draftHost.requestedTarget?.get());
		for (const chat of opened.slice(1)) {
			chat.dispose();
		}
		activeChat.set(URI.parse('test:/main'), undefined);

		assert.deepStrictEqual({ fromSentChat, pickedTarget, fromPristineComposer, fromComposerWithInput, fromSendingComposer, fromComposerTypedInWhileOpening, targets }, {
			fromSentChat: ['group slot1 undefined', 'window open vscode-agents-composer in 42 tab of /main'],
			pickedTarget: { folderUri: URI.file('/picked'), providerId: 'picked-provider', sessionTypeId: 'picked-type' },
			fromPristineComposer: ['group slot2 undefined', 'window open vscode-agents-composer in 42 tab of vscode-agents-composer', 'close composer 1', 'dispose slot1', 'ungroup slot1'],
			fromComposerWithInput: ['group slot3 undefined', 'window open vscode-agents-composer in 42 tab of vscode-agents-composer'],
			fromSendingComposer: ['group slot4 undefined', 'window open vscode-agents-composer in 42 tab of vscode-agents-composer'],
			fromComposerTypedInWhileOpening: ['group slot5 undefined', 'window open vscode-agents-composer in 42 tab of vscode-agents-composer'],
			targets: [
				{ folderUri: URI.file('/other') },
				{ folderUri: URI.file('/third') },
				{ folderUri: URI.file('/fourth') },
				{ folderUri: URI.file('/fifth') },
			],
		});
	});

	test('a composer opened for a folder from a composer that has not sent its session joins the custom group that composer\'s sessions join, which its draft does not tell', async () => {
		const store = disposables.add(new DisposableStore());
		const session = Object.assign(createSession('grouped', [createChat('main')]), { providerId: 'provider', sessionType: 'type', workspace: constObservable(upcastPartial<ISessionWorkspace>({ uri: URI.file('/repo'), folders: [] })), isQuickChat: constObservable(false) });
		const { provider, events, opened } = await openWindowWithComposers(store, [session]);

		await provider.openNewChat(window);
		const composer = asComposerChat(opened[0]);
		composer.composer.get()!.draftHost.input!.set({ inputText: 'kept', attachments: [] });
		activeChat.set(composer.chat.get(), undefined);
		events.length = 0;
		await provider.openNewChat(window, { folder: { uri: URI.file('/picked') } });
		const groups = events.filter(event => event.startsWith('group '));
		for (const chat of opened) {
			chat.dispose();
		}
		activeChat.set(URI.parse('test:/main'), undefined);

		assert.deepStrictEqual(groups, ['group slot2 group']);
	});

	test('New Session in a chat window opens its composer beside the active chat rather than as its tab when asked to, and without focus when asked to; while the active chat is that composer, it shows it, without focus too', async () => {
		const store = disposables.add(new DisposableStore());
		const main = Object.assign(createChat('main'), { modelId: constObservable('model'), mode: constObservable({ id: 'agent', kind: 'agent' }) });
		const session = Object.assign(createSession('session', [main]), { providerId: 'provider', sessionType: 'type', workspace: constObservable(upcastPartial<ISessionWorkspace>({ uri: URI.file('/repo'), folders: [] })), isQuickChat: constObservable(false) });
		const { provider, events, opened } = await openWindowWithComposers(store, [session]);

		await provider.openNewChat(window, { beside: true, preserveFocus: true });
		activeChat.set(opened[0].chat.get(), undefined);
		await provider.openNewChat(window, { beside: true, preserveFocus: true });
		opened[0].dispose();
		activeChat.set(URI.parse('test:/main'), undefined);

		assert.deepStrictEqual(events.filter(event => event.startsWith('window open')), [
			'window open vscode-agents-composer in 42 beside /main preserving focus',
			'window open vscode-agents-composer in 42 preserving focus',
		]);
	});

	test('a composer shows its draft without a chat, and the session of its foreground send once created; its chat becomes that session\'s main chat in the same editor once the send started it, only then held out of the grid, and the composer and its slot go', async () => {
		const store = disposables.add(new DisposableStore());
		const status = observableValue('status', SessionStatus.Untitled);
		const draft = Object.assign(createSession('draft', [createChat('draft-main')]), { status });
		const sessions = [createSession('session', [createChat('main')])];
		const { provider, events, opened, slots, onDidAcceptNewSessionRequest, onDidEndNewSessionRequest } = await openWindowWithComposers(store, sessions);
		await provider.openNewChat(window);
		const composer = asComposerChat(opened[0]);
		const input = composer.input;
		events.length = 0;
		const read = () => ({
			chat: composer.chat.get().scheme === 'test' ? composer.chat.get().path : composer.chat.get().scheme,
			session: composer.session.get()?.sessionId,
			content: composer.content.get()?.chat.get().resource.path,
			composer: !!composer.composer.get(),
			title: composer.title.get(),
			// Its tab shows, with its close, until its session's chat shows.
			rendersTitle: (composer.input as ViewEditorInput).rendersTitle,
		});

		slots[0].newSession.set(draft, undefined);
		const drafting = read();
		onDidAcceptNewSessionRequest.fire({ session: draft, owner: slots[0], background: false });
		slots[0].newSession.set(undefined, undefined);
		const sending = read();
		status.set(SessionStatus.InProgress, undefined);
		const created = read();
		sessions.push(draft);
		onDidEndNewSessionRequest.fire({ session: draft, owner: slots[0], started: true, readopted: false });
		const started = read();

		assert.deepStrictEqual({ drafting, sending, created, started, sameEditor: composer.input === input, events }, {
			drafting: { chat: 'vscode-agents-composer', session: 'draft', content: undefined, composer: true, title: 'New Session', rendersTitle: false },
			sending: { chat: 'vscode-agents-composer', session: 'draft', content: undefined, composer: true, title: 'New Session', rendersTitle: false },
			created: { chat: 'vscode-agents-composer', session: 'draft', content: '/draft-main', composer: true, title: 'New Session', rendersTitle: false },
			started: { chat: '/draft-main', session: 'draft', content: '/draft-main', composer: false, title: 'draft-main', rendersTitle: true },
			sameEditor: true,
			events: ['hide draft /draft-main', 'dispose slot1', 'ungroup slot1'],
		});
	});

	test('a composer that its window did not take, such as when the window went away meanwhile, discards its slot; a composer it does not know resolves to nothing, and is not restored', async () => {
		const store = disposables.add(new DisposableStore());
		const { provider, content, events, opened, opening } = await openWindowWithComposers(store, [createSession('session', [createChat('main')])]);
		events.length = 0;
		opening.onOpen = undefined;
		await provider.openNewChat(window);
		const unknown = await content.resolveChat(URI.parse('vscode-agents-composer:/unknown'));
		const canRestore = await provider.canRestore(URI.parse('vscode-agents-composer:/unknown'));

		assert.deepStrictEqual({ opened: opened.length, unknown, canRestore, events }, {
			opened: 0, unknown: undefined, canRestore: false,
			events: ['group slot1 undefined', 'window open vscode-agents-composer in 42 tab of /main', 'dispose slot1', 'ungroup slot1'],
		});
	});

	test('what a stored chat opens as: while restoring, what it resolved as, such as a session as the chat its grid slot shows; else from what is known, a session as its main chat, a stored composer as the main chat of the created session its send went out with; nothing for a chat, and nothing recorded once restoring finished', async () => {
		const store = disposables.add(new DisposableStore());
		const session = createSession('session', [createChat('main'), createChat('peer')]);
		const started = createSession('started', [createChat('started-main')]);
		const notCreated = Object.assign(createSession('not-created', [createChat('not-created-main')]), { status: constObservable(SessionStatus.Untitled) });
		const composer = (name: string, session?: ISession) => ({
			resource: URI.parse(`vscode-agents-composer:/${name}`),
			input: { inputText: name, attachments: [] },
			attempt: session && { id: name, input: { inputText: name, attachments: [] }, session: session.resource },
		});
		const { provider, visibleSessions } = createProvider(store, [session, started, notCreated], storage => storage.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, stringify([composer('sent', started), composer('unsent'), composer('sending', notCreated)]), StorageScope.WORKSPACE, StorageTarget.MACHINE));
		visibleSessions.set([upcastPartial<ITestSessionWithChat>({ sessionId: 'session', activeChat: constObservable(session.chats.get()[1]) })], undefined);
		const canonical = (resource: string) => provider.canonicalChatOf(URI.parse(resource))?.path;
		const known = ['test:/session', 'test:/peer', 'vscode-agents-composer:/sent', 'vscode-agents-composer:/unsent', 'vscode-agents-composer:/sending'].map(canonical);
		const content = store.add((await provider.resolveContent(session.resource))!);
		await content.resolveChat(session.resource);
		const whileRestoring = canonical('test:/session');
		provider.didFinishRestore([]);
		const afterRestore = canonical('test:/session');
		await content.resolveChat(session.resource);

		assert.deepStrictEqual({ known, whileRestoring, afterRestore, resolvedAfterRestore: canonical('test:/session') }, {
			known: ['/main', undefined, '/started-main', undefined, undefined],
			whileRestoring: '/peer',
			afterRestore: '/main',
			resolvedAfterRestore: '/main',
		});
	});

	test('a stored chat by a previous identity of its session opens as the chat by its current resource, also when its window failed before resolving it, so that restoration retires the stored alias', () => {
		const store = disposables.add(new DisposableStore());
		const peer = Object.assign(createChat('peer'), { previousResource: URI.parse('test:/legacy-peer') });
		const session = createSession('session', [createChat('main'), peer]);
		const { provider } = createProvider(store, [session]);
		const canonical = (resource: string) => provider.canonicalChatOf(URI.parse(resource))?.path;

		assert.deepStrictEqual({ alias: canonical('test:/legacy-peer'), current: canonical('test:/peer'), session: canonical('test:/session') }, { alias: '/peer', current: undefined, session: '/main' });
	});

	test('chat windows that failed to open are retired once the chats their stored chats open as show, a composer whose send started its session as that session\'s main chat and a session stored as such as its main chat, and closing those does not bring them back; an unsent composer beside them stays stored', async () => {
		const store = disposables.add(new DisposableStore());
		const started = createSession('started', [createChat('started-main')]);
		const legacy = createSession('legacy', [createChat('legacy-main')]);
		const composer = (name: string, session?: ISession) => ({
			resource: URI.parse(`vscode-agents-composer:/${name}`),
			input: { inputText: name, attachments: [] },
			attempt: session && { id: name, input: { inputText: name, attachments: [] }, session: session.resource },
		});
		const { provider, windowInstantiationService, storage } = createProvider(store, [started, legacy], beforeStorage => {
			beforeStorage.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, stringify([composer('c', started), composer('b')]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			beforeStorage.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify([{ chat: 'vscode-agents-composer:/c', chats: ['vscode-agents-composer:/b'] }, { session: 'test:/legacy' }]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		});
		const windows = observableValue<readonly IChatWindow[]>('windows', []);
		const windowOf = (...chats: string[]) => {
			const shown = constObservable(chats.map(chat => URI.parse(chat)));
			return upcastPartial<IChatWindow>({ chat: constObservable(URI.parse(chats[0])), chats: shown, openedChats: shown, mainPart: upcastPartial<IContentPart>({ groups: [] }) });
		};
		// The provider, as the restoration uses it, saying when the restoration finished
		const finished = new DeferredPromise<void>();
		const restoring = upcastPartial<IChatWindowProvider>({
			restoreEnabled: provider.restoreEnabled,
			onDidRemoveChats: provider.onDidRemoveChats,
			canRestore: chat => provider.canRestore(chat),
			canonicalChatOf: chat => provider.canonicalChatOf(chat),
			didFinishRestore: claimed => { provider.didFinishRestore(claimed); finished.complete(); },
		});
		store.add(windowInstantiationService.createInstance(ChatWindowsRestoration, {
			provider: constObservable(restoring),
			windows,
			// The windows fail to open, before they resolve their chats
			open: async () => { throw new Error('The window failed to open'); },
			terminalsShown: () => false,
			chatPart: () => undefined,
			createdParts: () => [],
		}));
		await finished.p;
		windows.set([windowOf('test:/started-main', 'test:/legacy-main')], undefined);
		windows.set([], undefined);
		storage.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);

		assert.deepStrictEqual(JSON.parse(storage.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE)!).map((entry: { chat?: string; session?: string; chats?: string[] }) => [entry.chat ?? entry.session, ...(entry.chats ?? [])]), [['vscode-agents-composer:/b']]);
	});

	test('a stored composer whose window fails to open after it restored stays stored with its input, and restores with it after the next reload; once it shows in an open window, it is stored as it is then, and not once it is closed', async () => {
		const sessions = [createSession('session', [createChat('main')])];
		const storedInputs = (storage: TestStorageService) => {
			storage.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
			const raw = storage.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE);
			return raw ? (parse(raw) as { input: { inputText: string } }[]).map(entry => entry.input.inputText) : [];
		};
		const first = disposables.add(new DisposableStore());
		const opening = await openWindowWithComposers(first, sessions);
		await opening.provider.openNewChat(window);
		const resource = opening.opened[0].chat.get();
		asComposerChat(opening.opened[0]).composer.get()!.draftHost.input!.set({ inputText: 'unsent', attachments: [] });
		storedInputs(opening.storage);
		const stored = opening.storage.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE)!;
		first.dispose();

		// After a reload, its window fails to open once it resolved the composer.
		const failing = disposables.add(new DisposableStore());
		const failed = createProvider(failing, sessions, storage => storage.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, stored, StorageScope.WORKSPACE, StorageTarget.MACHINE));
		const failedContent = (await failed.provider.resolveContent(resource))!;
		await failedContent.resolveChat(resource);
		failedContent.dispose();
		const afterFailure = storedInputs(failed.storage);
		const storedAfterFailure = failed.storage.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE)!;
		failing.dispose();

		// After the next reload, it opens.
		const opened = disposables.add(new DisposableStore());
		const reloaded = createProvider(opened, sessions, storage => storage.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, storedAfterFailure, StorageScope.WORKSPACE, StorageTarget.MACHINE));
		const content = opened.add((await reloaded.provider.resolveContent(resource))!);
		const restored = asComposerChat((await content.resolveChat(resource))!);
		const restoredInput = restored.composer.get()?.draftHost.input?.get().input.inputText;
		activeChat.set(resource, undefined);
		restored.composer.get()!.draftHost.input!.set({ inputText: 'edited', attachments: [] });
		const whileOpen = storedInputs(reloaded.storage);
		restored.dispose();
		const afterClose = storedInputs(reloaded.storage);
		activeChat.set(URI.parse('test:/main'), undefined);

		assert.deepStrictEqual({ afterFailure, restoredInput, whileOpen, afterClose }, {
			afterFailure: ['unsent'],
			restoredInput: 'unsent',
			whileOpen: ['edited'],
			afterClose: [],
		});
	});

	/**
	 * A window of the actual chat window service, which shows `chat`, a main chat, in a group of its own; an editor opening
	 * there opens behind the others, or not, as `openEditor` says, which may also fail.
	 */
	async function addChatWindowOfService(services: ReturnType<typeof createProvider>, store: DisposableStore, chat: URI, openEditor: (editor: EditorInput) => Promise<boolean>) {
		const content = store.add((await services.provider.resolveContent(chat))!);
		const firstChat = (await content.resolveChat(chat))!;
		const editors: EditorInput[] = [firstChat.input];
		const group = upcastPartial<IEditorGroup>({
			id: 70,
			windowId: 7,
			get activeEditor() { return editors[0]; },
			get isEmpty() { return editors.length === 0; },
			getEditors: () => [...editors],
			getIndexOfEditor: editor => editors.indexOf(editor),
			contains: (editor, options) => editors.some(candidate => options?.strictEquals ? candidate === editor : candidate.matches(editor)),
			openEditor: async (editor, options) => {
				if (await openEditor(editor)) {
					editors.splice(options?.index ?? editors.length, 0, editor);
				}
				return undefined;
			},
			onDidModelChange: Event.None,
			onDidCloseEditor: Event.None,
			onDidActiveEditorChange: Event.None,
			onWillCloseEditor: Event.None,
			onWillMoveEditor: Event.None,
		});
		const part = (groups: IEditorGroup[]) => upcastPartial<IContentPart>({ groups, activeGroup: groups[0], getGroups: () => groups, onDidAddGroup: Event.None, onDidRemoveGroup: Event.None, onDidMoveGroup: Event.None, onDidChangeActiveGroup: Event.None, onWillMoveGroupOut: Event.None });
		const chatPart = part([group]);
		const mainPart = part([]);
		services.editorGroups.push(group);
		services.editorParts.push(chatPart, mainPart);
		const window = store.add(new ChatWindow(7, content, firstChat, new ChatWindowState(new ChatWindowDefaults(services.storage), { initial: undefined, set: () => { } }), mainPart, chatPart, {
			focusWindow: () => { },
			closeWindow: () => { },
			isUnloading: () => false,
			createTerminalsPart: () => mainPart,
			terminalsVisible: constObservable(false),
			resizing: constObservable(false),
			didMoveChatOut: () => { },
			findGroup: editor => editors.includes(editor) ? group : undefined,
			resetLayout: () => { },
		}));
		(Reflect.get(services.chatWindowService!, '_windows') as ISettableObservable<readonly ChatWindow[]>).set([window], undefined);
		return window;
	}

	test('a stored composer that a chat window restores beside a chat a window of the chat window service shows already stays stored, with its input, until its editor opened there: also while it opens, and when that fails or is refused, also again, for the next reload; once it opened, the window shows it', async () => {
		const composer = URI.parse('vscode-agents-composer:/b');
		const sessions = [createSession('session', [createChat('main')])];
		const restore = async (outcome: 'fails' | 'is refused' | 'opens') => {
			const store = disposables.add(new DisposableStore());
			const services = createProvider(store, sessions, storage => {
				storage.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, stringify([{ resource: composer, input: { inputText: 'unsent', attachments: [] } }]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
				storage.store(OPEN_CHAT_WINDOWS_STORAGE_KEY, JSON.stringify([{ chat: 'test:/main', chats: [composer.toString()] }]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			}, { realChatWindowService: true });
			const { provider, storage } = services;
			let whileOpening: { readonly chats: string[]; readonly opened: string[]; readonly stored: boolean } | undefined;
			const window = await addChatWindowOfService(services, store, URI.parse('test:/main'), async () => {
				whileOpening = { chats: window.chats.get().map(chat => chat.toString()), opened: window.openedChats.get().map(chat => chat.toString()), stored: await provider.canRestore(composer) };
				if (outcome === 'fails') {
					throw new Error('The editor failed to open');
				}
				return outcome === 'opens';
			});
			// The provider, as the service's restoration uses it, saying when the restoration finished
			const finished = new DeferredPromise<void>();
			const reported: string[] = [];
			const original = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(error => reported.push(error instanceof Error ? error.message : String(error)));
			try {
				store.add(services.chatWindowService!.registerProvider(upcastPartial<IChatWindowProvider>({
					restoreEnabled: provider.restoreEnabled,
					onDidRemoveChats: provider.onDidRemoveChats,
					resolveContent: chat => provider.resolveContent(chat),
					canRestore: chat => provider.canRestore(chat),
					canonicalChatOf: chat => provider.canonicalChatOf(chat),
					didFinishRestore: claimed => { provider.didFinishRestore(claimed); finished.complete(); },
				})));
				await finished.p;
				if (outcome !== 'opens') {
					// Opening it in that window again, which does not open its editor there either, does not take it as shown
					await services.chatWindowService!.open(composer, { window, preserveFocus: true }).catch(error => reported.push(error.message));
				}
			} finally {
				setUnexpectedErrorHandler(original);
			}
			const chats = window.chats.get().map(chat => chat.toString());
			const opened = window.openedChats.get().map(chat => chat.toString());
			const storedAfter = await provider.canRestore(composer);
			storage.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
			const windows = (JSON.parse(storage.get(OPEN_CHAT_WINDOWS_STORAGE_KEY, StorageScope.WORKSPACE)!) as { chat?: string; session?: string; chats?: string[] }[]).map(entry => [entry.chat ?? entry.session, ...(entry.chats ?? [])]);
			const storedComposers = storage.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE)!;
			store.dispose();

			// After a reload
			const reloadStore = disposables.add(new DisposableStore());
			const reloaded = createProvider(reloadStore, sessions, reloadedStorage => reloadedStorage.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, storedComposers, StorageScope.WORKSPACE, StorageTarget.MACHINE));
			const content = reloadStore.add((await reloaded.provider.resolveContent(composer))!);
			const restored = asComposerChat((await content.resolveChat(composer))!);
			const reloadedInput = restored.composer.get()?.draftHost.input?.get().input.inputText;
			reloadStore.dispose();
			return { whileOpening, chats, opened, storedAfter, windows, reported, reloadedInput };
		};

		assert.deepStrictEqual({ fails: await restore('fails'), refused: await restore('is refused'), opens: await restore('opens') }, {
			fails: { whileOpening: { chats: ['test:/main', composer.toString()], opened: ['test:/main'], stored: true }, chats: ['test:/main'], opened: ['test:/main'], storedAfter: true, windows: [['test:/main'], [composer.toString()]], reported: ['The editor failed to open', 'The editor failed to open'], reloadedInput: 'unsent' },
			refused: { whileOpening: { chats: ['test:/main', composer.toString()], opened: ['test:/main'], stored: true }, chats: ['test:/main'], opened: ['test:/main'], storedAfter: true, windows: [['test:/main'], [composer.toString()]], reported: [], reloadedInput: 'unsent' },
			opens: { whileOpening: { chats: ['test:/main', composer.toString()], opened: ['test:/main'], stored: true }, chats: ['test:/main', composer.toString()], opened: ['test:/main', composer.toString()], storedAfter: false, windows: [['test:/main', composer.toString()]], reported: [], reloadedInput: 'unsent' },
		});
	});

	test('while the editor of a chat that a window of the chat window service takes opens, opening another chat beside it opens that chat in that window, as before', async () => {
		const store = disposables.add(new DisposableStore());
		const sessions = [createSession('session', [createChat('main'), createChat('second'), createChat('third')])];
		const services = createProvider(store, sessions, undefined, { realChatWindowService: true });
		const opening = new DeferredPromise<void>();
		const reached = new DeferredPromise<void>();
		const opened: string[] = [];
		const window = await addChatWindowOfService(services, store, URI.parse('test:/main'), async editor => {
			const path = window.chatsOfWindow.find(chat => chat.input === editor)?.chat.get().path;
			if (path === '/second') {
				reached.complete();
				await opening.p;
			}
			opened.push(String(path));
			return true;
		});
		store.add(services.chatWindowService!.registerProvider(services.provider));

		const second = services.chatWindowService!.open(URI.parse('test:/second'), { window });
		await reached.p;
		await services.chatHostOpenerService.getOpenerOf(URI.parse('test:/main'))!.openBeside(URI.parse('test:/third'), URI.parse('test:/second'));
		opening.complete();
		await second;

		assert.deepStrictEqual({ chats: window.chats.get().map(chat => chat.path), opened }, { chats: ['/main', '/second', '/third'], opened: ['/third', '/second'] });
	});

	test('the composers of a window restore after a reload in a window opened for them: as a composer with its input and what it aims for, or, for one whose foreground send started its session, as that session\'s main chat', async () => {
		const store = disposables.add(new DisposableStore());
		const started = createSession('started', [createChat('started-main')]);
		const sessions = [createSession('session', [createChat('main')]), started];
		const { provider, opened, storage, onDidAcceptNewSessionRequest, slots } = await openWindowWithComposers(store, sessions);
		await provider.openNewChat(window);
		await provider.openNewChat(window);
		const [typing, sending] = opened.map(chat => asComposerChat(chat).composer.get()!.draftHost);
		typing.input!.set({ inputText: 'draft', attachments: [] });
		sending.input!.beginSendAttempt({ inputText: 'sent', attachments: [] });
		onDidAcceptNewSessionRequest.fire({ session: started, owner: slots[1], background: false });
		const [typingResource, sendingResource] = opened.map(chat => chat.chat.get());
		storage.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
		const stored = storage.get(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, StorageScope.WORKSPACE)!;

		const reloadStore = disposables.add(new DisposableStore());
		const reloaded = createProvider(reloadStore, sessions, reloadedStorage => reloadedStorage.store(CHAT_WINDOW_COMPOSERS_STORAGE_KEY, stored, StorageScope.WORKSPACE, StorageTarget.MACHINE));
		const canRestore = await Promise.all([typingResource, sendingResource, URI.parse('vscode-agents-composer:/unknown')].map(resource => reloaded.provider.canRestore(resource)));
		const content = reloadStore.add((await reloaded.provider.resolveContent(typingResource))!);
		const restoredTyping = asComposerChat((await content.resolveChat(typingResource))!);
		const restoredSending = asWindowChat((await content.resolveChat(sendingResource))!);

		assert.deepStrictEqual({
			canRestore,
			typing: { title: restoredTyping.title.get(), input: restoredTyping.composer.get()?.draftHost.input?.get(), sameResource: restoredTyping.chat.get().toString() === typingResource.toString() },
			sending: { chat: restoredSending.chat.get().path, session: restoredSending.session.get()?.sessionId },
		}, {
			canRestore: [true, true, false],
			typing: { title: 'New Session', input: { input: { inputText: 'draft', attachments: [], references: undefined } }, sameResource: true },
			sending: { chat: '/started-main', session: 'started' },
		});
	});

	test('a composer that has not sent its session stays in its window: its editor refuses other windows and new windows, its window does not move to the main window and says so, and the window knows it holds one; once its send started its session, it moves as any chat', async () => {
		const store = disposables.add(new DisposableStore());
		const status = observableValue('status', SessionStatus.Untitled);
		const draft = Object.assign(createSession('draft', [createChat('draft-main')]), { status });
		const sessions = [createSession('session', [createChat('main')])];
		const { provider, opened, slots, editorGroups, windowInstantiationService, onDidAcceptNewSessionRequest, onDidEndNewSessionRequest } = await openWindowWithComposers(store, sessions);
		editorGroups.push(upcastPartial<IEditorGroup>({ id: 7, windowId: window.windowId, contains: () => false }), upcastPartial<IEditorGroup>({ id: 8, windowId: window.windowId + 1, contains: () => false }));
		await provider.openNewChat(window);
		const composer = asComposerChat(opened[0]);
		const resource = composer.chat.get();
		const hasUnsent = () => windowInstantiationService.invokeFunction(accessor => accessor.get(IContextKeyService)).getContextKeyValue('chatWindowHasUnsentComposer');
		const read = () => ({
			sameWindow: composer.input.canMove(7, 7),
			otherWindow: composer.input.canMove(7, 8),
			newWindow: composer.input.canMoveToNewWindow(7),
			veto: provider.moveVeto([URI.parse('test:/main'), resource]),
			hasUnsent: hasUnsent(),
		});

		const unsent = read();
		slots[0].newSession.set(draft, undefined);
		onDidAcceptNewSessionRequest.fire({ session: draft, owner: slots[0], background: false });
		status.set(SessionStatus.InProgress, undefined);
		sessions.push(draft);
		onDidEndNewSessionRequest.fire({ session: draft, owner: slots[0], started: true, readopted: false });
		const sent = read();

		const reason = 'A new session can\'t leave its window until it\'s sent. Send it, or close it to discard it.';
		assert.deepStrictEqual({ unsent, sent }, {
			unsent: { sameWindow: true, otherWindow: reason, newWindow: reason, veto: reason, hasUnsent: true },
			sent: { sameWindow: true, otherWindow: true, newWindow: true, veto: undefined, hasUnsent: false },
		});
	});
});
