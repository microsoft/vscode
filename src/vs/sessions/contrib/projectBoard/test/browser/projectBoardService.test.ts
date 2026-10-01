/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { CodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IAction, SubmenuAction, toAction } from '../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService, OpenOptions } from '../../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatInteractivity, ChatOriginKind, IChat, IGitHubInfo, ISession, ISessionArtifact, ISessionWorkspace, SessionArtifactKind, SessionRemoteConnectionFailureReason, SessionRemoteConnectionStatus, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ProjectBoardService } from '../../browser/projectBoardService.js';
import { IProjectBoardDraft, ProjectBoardChatWindows } from '../../browser/projectBoardNavigation.js';
import { IProjectBoardNewSessionOptions, ProjectBoardNewSessionDialog } from '../../browser/projectBoardNewSessionDialog.js';
import { getProjectBoardCardId, getProjectBoardSessionKey, IProjectBoardCard } from '../../common/projectBoardModel.js';
import { IProjectBoardPendingQuestion, ProjectBoardQuestionPreview, ProjectBoardQuestionPreviewState } from '../../browser/projectBoardQuestions.js';
import { ProjectBoardState } from '../../browser/projectBoardState.js';
import { ProjectBoardCatalogService } from '../../browser/projectBoardCatalog.js';
import { ProjectBoardPreviewPool } from '../../browser/projectBoardPreviewPool.js';
import { DEFAULT_PROJECT_BOARD_ID, IProjectBoardCatalogService } from '../../common/projectBoardCatalog.js';
import { projectBoardIdentityLabelLimit } from '../../common/projectBoardConfiguration.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { IProjectBoardInputConfiguration, IProjectBoardMetadata, ProjectBoardMetadata } from '../../browser/projectBoardMetadata.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IProjectBoardPendingActions } from '../../common/projectBoardActions.js';
import { ProjectBoardChatActions } from '../../browser/projectBoardChatActions.js';
import { ProjectBoardWindow } from '../../browser/projectBoardWindow.js';
import { IChatQuestionAnswers, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { submitChatQuestionCarousel } from '../../../../../workbench/contrib/chat/common/chatService/chatQuestionCarouselHelpers.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatRequestModel, IChatChangeEvent, IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { SessionsDataTransfers } from '../../../../browser/dnd.js';
import { ProjectBoardChatSidePanel } from '../../browser/projectBoardChatSidePanel.js';
import { createListHarness, createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';

class TestChat extends mock<IChat>() {
	override readonly capabilities = observableValue('capabilities', { canRename: false, canDelete: true });
	override readonly title = observableValue('title', this.name);
	override readonly status = observableValue<SessionStatus>('status', SessionStatus.InProgress);
	override readonly changes = constObservable([]);
	override readonly changesets = constObservable([]);
	override readonly workspace = observableValue<ISessionWorkspace | undefined>('chatWorkspace', undefined);
	override readonly isRead = observableValue('read', false);
	override readonly isArchived = observableValue('archived', false);
	override readonly interactivity = observableValue('interactivity', ChatInteractivity.Full);
	override readonly description = observableValue<IMarkdownString | undefined>('description', undefined);
	override readonly modelId = observableValue<string | undefined>('modelId', undefined);
	override readonly mode = observableValue<{ id: string; kind: string } | undefined>('mode', undefined);
	override readonly resource = URI.parse(`test-chat:session#${this.name}`);
	override readonly updatedAt = constObservable(new Date());

	constructor(private readonly name: string) { super(); }
}

class TestBoardSession extends mock<ISession>() {
	override readonly sessionId = `test-${this.name}`;
	override readonly resource = URI.parse(`test-session:${this.name}`);
	override readonly providerId = 'test';
	override readonly title = observableValue('session-title', 'Owning session');
	override readonly workspace = observableValue<ISessionWorkspace | undefined>('workspace', undefined);
	override readonly chats = observableValue<readonly IChat[]>('chats', this.initialChats);
	override readonly mainChat = constObservable(this.initialChats[0] ?? new TestChat('Empty session main'));
	override readonly isArchived = observableValue('archived', false);
	override readonly artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', []);
	override readonly status = observableValue('sessionStatus', SessionStatus.Untitled);
	override readonly remoteConnectionStatus = observableValue<SessionRemoteConnectionStatus>('connection', { kind: 'connected' });
	override readonly capabilities = observableValue('capabilities', { supportsMultipleChats: true, supportsDelete: true });

	constructor(private readonly initialChats: readonly IChat[], private readonly name = 'session') { super(); }
}

suite('ProjectBoardService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createBoardDocument() {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const document = frame.contentDocument!;
		const nativeFocus = sinon.stub(document, 'hasFocus').returns(true);
		store.add(toDisposable(() => nativeFocus.restore()));
		return { document, nativeFocus };
	}

	function createBoard(document: Document, chats: readonly IChat[] = [], storage = store.add(new InMemoryStorageService()), withSessionLists = false) {
		const container = mainWindow.document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const session = new TestBoardSession(chats);
		const initialSessions: ISession[] = chats.length ? [session] : [];
		const state = {
			focusCount: 0,
			ownerFocusCount: 0,
			openCount: 0,
			disposeCount: 0,
			createdCount: 0,
			createdSession: new TestBoardSession([new TestChat('new-session')], 'new-session') as ISession | undefined,
			creationOptions: undefined as IProjectBoardNewSessionOptions | undefined,
			creationPlacement: undefined as { rowId: string; columnId: string } | undefined,
			creationBarrier: undefined as DeferredPromise<void> | undefined,
			sidePanelCloseCount: 0,
			sessions: initialSessions,
			navigationError: undefined as Error | undefined,
			deletionError: undefined as Error | undefined,
			closedResource: undefined as URI | undefined,
			deletedSessions: [] as ISession[],
			deletedDrafts: [] as string[],
			renameError: undefined as Error | undefined,
			renamedChats: [] as { session: ISession; resource: URI; title: string }[],
			archiveAttempts: [] as ISession[],
			archiveErrors: new Set<string>(),
			archiveBarrier: undefined as DeferredPromise<void> | undefined,
			providerAvailable: true,
		};
		const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		const sessionReplaced = store.add(new Emitter<{ from: ISession; to: ISession }>());
		const newSession = observableValue<ISession | undefined>('newSession', undefined);
		const sessionDrafts = observableValue<ReadonlySet<ISession>>('sessionDrafts', new Set());
		const opened: URI[] = [];
		const sidePanelOpened: URI[] = [];
		const activeSidePanelCardId = observableValue<string | undefined>('activeSidePanelCardId', undefined);
		let sidePanelFocusRestorer: (() => void) | undefined;
		const openedDrafts: string[] = [];
		const drafts = observableValue<readonly IProjectBoardDraft[]>('drafts', []);
		const contextMenu = new class extends mock<IContextMenuService>() {
			delegate: IContextMenuDelegate | undefined;
			override showContextMenu(delegate: IContextMenuDelegate): void {
				const wrapAction = (action: IAction): IAction => action instanceof SubmenuAction
					? new SubmenuAction(action.id, action.label, action.actions.map(wrapAction))
					: toAction({
						id: action.id, label: action.label, enabled: action.enabled, checked: action.checked,
						run: async () => {
							delegate.onHide?.(false);
							await action.run();
						},
					});
				this.delegate = {
					...delegate,
					getActions: () => delegate.getActions().map(wrapAction),
				};
			}
		}();
		const onOpened = store.add(new Emitter<URI>());
		const errors = store.add(new Emitter<string>());
		const instantiationService = withSessionLists ? createListHarness(store, state.sessions).instantiationService : workbenchInstantiationService(undefined, store);
		const actionWidget = store.add(instantiationService.createInstance(ActionWidgetService));
		instantiationService.stub(IActionWidgetService, actionWidget);
		const copy = sinon.stub().resolves();
		instantiationService.stub(IClipboardService, { writeText: copy });
		const popup = () => instantiationService.get(IContextViewService).getContextViewElement();
		const quickInput = { selectedLabel: undefined as string | undefined, labels: [] as string[], inputValues: [] as string[] };
		const pick = sinon.stub().callsFake((items: IQuickPickItem[]) => {
			quickInput.labels = items.map(item => item.label);
			return Promise.resolve(items.find(item => item.label === quickInput.selectedLabel));
		});
		instantiationService.stub(IQuickInputService, { pick, input: async () => quickInput.inputValues.shift() });
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ICustomViewService, { showCustomView() { } });
		const catalog = store.add(instantiationService.createInstance(ProjectBoardCatalogService));
		instantiationService.stub(IProjectBoardCatalogService, catalog);
		const loadedModels = observableValue<Iterable<IChatModel>>('models', []);
		instantiationService.stub(IChatService, { chatModels: loadedModels });
		instantiationService.stub(IChatSessionsService, { getMaterializedSessionResource: () => undefined });
		const metadata = observableValue<IProjectBoardMetadata>('metadata', { kind: 'unavailable', message: 'Prompt unavailable' });
		const credits = observableValue<number | undefined>('credits', undefined);
		const creditsError = observableValue<string | undefined>('creditsError', undefined);
		const configuration = observableValue<IProjectBoardInputConfiguration | undefined>('configuration', undefined);
		const actions = observableValue<IProjectBoardPendingActions | undefined>('actions', undefined);
		const includeCredits = sinon.spy();
		instantiationService.stubInstance(ProjectBoardMetadata, { metadata, credits, creditsError, configuration, actions, setIncludeConfiguration() { }, setIncludeCredits: includeCredits, dispose() { } });
		const providersChanged = store.add(new Emitter<ISessionsProvidersChangeEvent>());
		const provider: ISessionsProvider = new class extends mock<ISessionsProvider>() {
			override readonly id = 'test';
			override readonly sessionTypes = [];
			override readonly onDidChangeModels = Event.None;
			override getModelsSnapshot() { return { models: [], desiredModelResolution: { kind: 'notRequested' as const }, modelTarget: undefined }; }
		}();
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override readonly onDidChangeProviders = providersChanged.event;
			override getProvider<T extends ISessionsProvider>(): T | undefined {
				return (state.providerAvailable ? provider : undefined) as T | undefined;
			}
		}());
		const openedContext: string[] = [];
		instantiationService.stub(IOpenerService, {
			open: async (resource, options: OpenOptions | undefined) => {
				const external = options?.openExternal;
				assert.deepStrictEqual(options, { fromUserGesture: true, allowCommands: false, ...(external ? { openExternal: true } : {}) });
				openedContext.push(resource.toString());
				return true;
			},
		});
		const questionPreview = observableValue<ProjectBoardQuestionPreviewState>('questionPreview', { kind: 'inactive' });
		const questionCarousels = observableValue<readonly IProjectBoardPendingQuestion[]>('questionCarousels', []);
		const submittedAnswers: { requestId: string; resolveId: string; answers: IChatQuestionAnswers | undefined }[] = [];
		instantiationService.stubInstance(ProjectBoardQuestionPreview, {
			preview: questionPreview, questionCarousels, dispose() { },
			submit(question, answers) {
				const result = submitChatQuestionCarousel(question.carousel, question.requestId, answers, {
					notifyQuestionCarouselAnswer: (requestId, resolveId, answers) => submittedAnswers.push({ requestId, resolveId, answers }),
				});
				if (result) {
					questionCarousels.set([], undefined);
					questionPreview.set({ kind: 'unavailable', reason: 'noPendingInput', message: 'Answered' }, undefined);
				}
				return result;
			},
		});
		instantiationService.stubInstance(ProjectBoardChatWindows, {
			drafts,
			dispose() { },
			async closeActiveSession() { return state.closedResource; },
			async openDraft(id: string): Promise<void> {
				if (state.navigationError) {
					throw state.navigationError;
				}
				openedDrafts.push(id);
			},
			async deleteDraft(id: string): Promise<boolean> {
				state.deletedDrafts.push(id);
				drafts.set(drafts.get().filter(draft => draft.id !== id), undefined);
				return true;
			},
			async open(card: IProjectBoardCard): Promise<void> {
				if (state.navigationError) {
					throw state.navigationError;
				}
				opened.push(card.chat.resource);
				onOpened.fire(card.chat.resource);
			}
		});
		instantiationService.stubInstance(ProjectBoardNewSessionDialog, {
			async show(options) {
				state.createdCount++;
				state.creationOptions = options;
				if (state.creationBarrier) {
					await state.creationBarrier.p;
				}
				if (state.createdSession) {
					options.onDidCreate(state.createdSession, state.creationPlacement);
				}
				return state.createdSession;
			},
			dispose() { },
		});
		instantiationService.stubInstance(ProjectBoardChatSidePanel, {
			activeCardId: activeSidePanelCardId,
			dispose() { },
			async open(card: IProjectBoardCard, onClose: () => void): Promise<void> {
				activeSidePanelCardId.set(undefined, undefined);
				if (state.navigationError) {
					throw state.navigationError;
				}
				sidePanelOpened.push(card.chat.resource);
				sidePanelFocusRestorer = onClose;
				activeSidePanelCardId.set(getProjectBoardCardId(card.session, card.chat), undefined);
				onOpened.fire(card.chat.resource);
			},
			close(): void {
				activeSidePanelCardId.set(undefined, undefined);
				state.sidePanelCloseCount++;
				const restore = sidePanelFocusRestorer;
				sidePanelFocusRestorer = undefined;
				restore?.();
			},
		});
		let auxiliaryWindow: IAuxiliaryWindow | undefined;
		const auxiliaryWindows: IAuxiliaryWindow[] = [];
		instantiationService.stubInstance(ProjectBoardWindow, {
			get content() { return auxiliaryWindow?.container ?? container; },
			setTitle() { },
			dispose() { },
		});
		let unload: Emitter<void>;
		const service = store.add(new ProjectBoardService(
			new class extends mock<IAuxiliaryWindowService>() {
				override async open() {
					const targetContainer = state.openCount++ === 0 ? container : mainWindow.document.createElement('div');
					if (targetContainer !== container) {
						document.body.appendChild(targetContainer);
						store.add(toDisposable(() => targetContainer.remove()));
					}
					unload = store.add(new Emitter<void>());
					auxiliaryWindow = new class extends mock<IAuxiliaryWindow>() {
						override readonly window = new class extends mock<CodeWindow>() {
							override readonly document = document;
							override readonly focus = () => { };
						}();
						override readonly container = targetContainer;
						override readonly whenStylesHaveLoaded = Promise.resolve();
						override readonly onUnload = unload.event;
						override dispose(): void { state.disposeCount++; targetContainer.remove(); }
					}();
					auxiliaryWindows.push(auxiliaryWindow);
					return auxiliaryWindow;
				}
			}(),
			new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = sessionsChanged.event;
				override readonly onDidReplaceSession = sessionReplaced.event;
				override readonly newSession = newSession;
				override readonly sessionDrafts = sessionDrafts;
				override getSessions() { return state.sessions; }
				override async archiveSession(archived: ISession): Promise<void> {
					state.archiveAttempts.push(archived);
					await state.archiveBarrier?.p;
					if (state.archiveErrors.has(archived.sessionId)) {
						throw new Error('Archive failed');
					}
					assert.ok(archived instanceof TestBoardSession);
					archived.isArchived.set(true, undefined);
					sessionsChanged.fire({ added: [], removed: [], changed: [archived] });
				}
				override async deleteSession(deleted: ISession): Promise<void> {
					if (state.deletionError) {
						throw state.deletionError;
					}
					state.deletedSessions.push(deleted);
					state.sessions = state.sessions.filter(candidate => candidate !== deleted);
					sessionsChanged.fire({ added: [], removed: [deleted], changed: [] });
				}
				override async renameChat(renamed: ISession, resource: URI, title: string): Promise<void> {
					if (state.renameError) {
						throw state.renameError;
					}
					const chat = renamed.chats.get().find(chat => chat.resource.toString() === resource.toString());
					assert.ok(chat instanceof TestChat);
					state.renamedChats.push({ session: renamed, resource, title });
					chat.title.set(title, undefined);
					sessionsChanged.fire({ added: [], removed: [], changed: [renamed] });
				}
			}(),
			instantiationService,
			new class extends mock<INotificationService>() {
				override error(message: string): void { errors.fire(message); }
				override warn(message: string): void { errors.fire(message); }
			}(),
			store.add(new NullLogService()),
			new class extends mock<IHostService>() {
				override async focus(target: Window): Promise<void> {
					if (target === mainWindow) {
						state.ownerFocusCount++;
					} else {
						assert.ok(auxiliaryWindows.some(window => target === window.window));
						state.focusCount++;
					}
				}
			}(),
			contextMenu,
			catalog,
			instantiationService.get(IQuickInputService),
			instantiationService.get(IDialogService),
			instantiationService.get(ICustomViewService),
		));
		return {
			service, catalog, auxiliaryWindows, container, state, opened, sidePanelOpened, activeSidePanelCardId, openedDrafts, drafts, contextMenu, onOpened, errors, session, sessionsChanged, sessionReplaced, providersChanged, provider, newSession, sessionDrafts, questionPreview, questionCarousels, submittedAnswers, openedContext, instantiationService, metadata, credits, creditsError, actions, includeCredits, loadedModels, quickInput, pick, actionWidget, popup, copy,
			async moveViaPicker(label: string, resource?: URI) {
				quickInput.selectedLabel = label;
				const target = [...(auxiliaryWindow?.container ?? container).querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => !resource || element.dataset.chatResource === resource.toString())!;
				const before = pick.callCount;
				target.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 77, ctrlKey: !isMacintosh, metaKey: isMacintosh, shiftKey: true, bubbles: true, cancelable: true }));
				assert.strictEqual(pick.callCount, before + 1);
				await pick.lastCall.returnValue;
				await Promise.resolve();
			},
			closeBoard: () => unload.fire(),
			get currentContainer() { return auxiliaryWindow?.container ?? container; },
		};
	}

	function createIndependentChatBoard(document: Document, chats: readonly TestChat[]) {
		const h = createBoard(document, chats);
		h.state.sessions = chats.map((chat, index) => new TestBoardSession([chat], `independent-${String(index).padStart(3, '0')}`));
		return h;
	}

	test('PB-01 renders in an auxiliary document and reuses the window', async () => {
		const document = mainWindow.document.implementation.createHTMLDocument();
		document.createElement = () => { throw new Error('Auxiliary documents prohibit createElement'); };
		const { service, container, state } = createBoard(document);
		await service.open();
		assert.ok(container.querySelector('.project-board'));
		assert.strictEqual(container.querySelector('h1')?.textContent, 'Agents Hub — Default');
		assert.ok(service.getAccessibleContent().startsWith('Agents Hub — Default\n'));
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.project-board-column-heading'), element => element.textContent), ['P0', 'P1', 'P2', 'P3']);
		const firstFocusCount = state.focusCount;
		await service.open();
		assert.strictEqual(state.openCount, 1);
		assert.ok(state.focusCount > firstFocusCount);
	});

	suite('child chat cards', () => {
		function workerChat(name: string, parent: IChat): IChat {
			return {
				...new TestChat(name),
				origin: { kind: ChatOriginKind.Tool, parentChat: parent.resource },
				interactivity: constObservable(ChatInteractivity.ReadOnly),
			};
		}

		test('delegated workers nest recursively, inherit placement, and remain included in collapsed state totals', async () => {
			const main = new TestChat('Main');
			const peer = new TestChat('Peer');
			const worker = workerChat('Worker', peer);
			const nested = workerChat('Nested worker', worker);
			const h = createBoard(mainWindow.document, [main, peer, worker, nested]);
			store.add(h.service.createView(h.container));
			await h.moveViaPicker('General, P0', main.resource);
			h.service.toggleAutoIncludeSessions();
			const cell = () => h.container.querySelector<HTMLElement>('[aria-label="General, P0"]')!;
			const nestedFamily = cell().querySelector('.project-board-card-family .project-board-card-family .project-board-card-family')!;
			assert.deepStrictEqual({
				unassigned: h.container.querySelectorAll('.project-board-unassigned .project-board-card').length,
				titles: [...cell().querySelectorAll('h4')].map(element => element.textContent),
				nested: nestedFamily.querySelector(':scope > .project-board-child-cards > .project-board-card h4')?.textContent,
				summary: cell().querySelector('.project-board-child-summary')?.textContent,
				readOnly: cell().querySelectorAll('.project-board-card-lifecycle').length,
			}, { unassigned: 0, titles: ['Main', 'Peer', 'Worker', 'Nested worker'], nested: 'Nested worker', summary: '3 child chats · 🏃 3 Busy', readOnly: 2 });
			h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p0"]')!.click();
			assert.strictEqual(cell().querySelector('.project-board-collapsed-summary')?.textContent, '4 sessions · 🏃 4 Busy');
			assert.ok(h.service.getAccessibleContent().includes('Nested worker, Busy'));
			h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p0"]')!.click();
			await h.moveViaPicker('General, P1', worker.resource);
			assert.deepStrictEqual(
				[...h.container.querySelectorAll('[aria-label="General, P1"] h4')].map(element => element.textContent),
				['Worker', 'Nested worker'],
			);
			await h.moveViaPicker('Follow Parent', worker.resource);
			assert.strictEqual(cell().querySelectorAll('.project-board-card').length, 4);
			assert.strictEqual(h.catalog.boards.get()[0].configuration.placements.length, 1);
			assert.deepStrictEqual(h.opened, []);
		});

		test('returning from a nested delegated worker expands every ancestor and opens the exact resource', async () => {
			const { document } = createBoardDocument();
			const parent = new TestChat('Parent');
			const worker = workerChat('Worker', parent);
			const nested = workerChat('Nested worker', worker);
			const h = createBoard(document, [parent, worker, nested]);
			await h.service.open();
			await h.moveViaPicker('General, P0', parent.resource);
			for (const title of ['Parent', 'Worker']) {
				h.container.querySelector<HTMLElement>(`[aria-label="Expand Child chats of ${title}"]`)!.click();
			}
			const card = [...h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => element.dataset.chatResource === nested.resource.toString())!;
			card.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
			for (const title of ['Worker', 'Parent']) {
				h.container.querySelector<HTMLElement>(`[aria-label="Collapse Child chats of ${title}"]`)!.click();
			}
			h.container.querySelector<HTMLElement>('[data-board-control="collapse:row:general"]')!.click();
			h.state.closedResource = nested.resource;
			await h.service.closeSession(12345);
			assert.deepStrictEqual({
				opened: h.opened.map(resource => resource.toString()),
				focused: document.activeElement?.getAttribute('data-chat-resource'),
				collapsed: h.container.querySelectorAll('.project-board-child-cards[hidden], [aria-label="General, P0"] .project-board-card-list[hidden]').length,
			}, { opened: [nested.resource.toString()], focused: nested.resource.toString(), collapsed: 0 });
		});

		test('folded ancestors name a monitored grandchild without painting the ancestors current', () => {
			const main = new TestChat('Main');
			const worker = workerChat('Worker', main);
			const nested = workerChat('Nested worker', worker);
			const h = createBoard(mainWindow.document, [main, worker, nested]);
			store.add(h.service.createView(h.container));
			assert.strictEqual(h.container.querySelectorAll('.project-board-child-cards[hidden]').length, 2);
			h.activeSidePanelCardId.set(getProjectBoardCardId(h.session, nested), undefined);
			assert.deepStrictEqual({
				current: [...h.container.querySelectorAll<HTMLElement>('[aria-current="true"]')].map(element => element.dataset.chatResource),
				cues: [...h.container.querySelectorAll('.project-board-monitored-child-label:not([hidden])')].map(element => element.textContent),
				labelVisible: h.container.querySelectorAll('.project-board-card-active-chat-label:not([hidden])').length,
			}, { current: [nested.resource.toString()], cues: ['Open in Side Panel: Nested worker', 'Open in Side Panel: Nested worker'], labelVisible: 0 });
		});

		test('child groups start collapsed, retain live summaries, and open the exact child after expansion', async () => {
			const parent = new TestChat('Parent');
			const child = new TestChat('Child');
			const h = createBoard(mainWindow.document, [parent, child]);
			await h.service.open();
			const disclosure = () => h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!;
			const children = () => h.container.querySelector<HTMLElement>('.project-board-child-cards')!;
			assert.deepStrictEqual({
				families: h.container.querySelectorAll('.project-board-card-family').length,
				cards: h.container.querySelectorAll('.project-board-card').length,
				child: children().querySelector('h4')?.textContent,
				expanded: disclosure().getAttribute('aria-expanded'),
			}, { families: 1, cards: 2, child: 'Child', expanded: 'false' });
			const collapsed = { hidden: children().hidden, expanded: disclosure().getAttribute('aria-expanded'), opened: [...h.opened] };
			child.status.set(SessionStatus.NeedsInput, undefined);
			assert.deepStrictEqual({
				collapsed, stillHidden: children().hidden, summary: h.container.querySelector('.project-board-child-summary')?.textContent,
			}, { collapsed: { hidden: true, expanded: 'false', opened: [] }, stillHidden: true, summary: '1 child chat · 🙋 1 Needs Input' });
			assert.ok(h.service.getAccessibleContent().includes('(collapsed)'));
			disclosure().click();
			h.session.chats.set([parent, child, new TestChat('New child')], undefined);
			assert.strictEqual(children().hidden, false, 'Live additions preserve an explicitly expanded family');
			children().querySelector<HTMLElement>('.project-board-card')!.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
			assert.deepStrictEqual(h.opened, [child.resource]);
			assert.deepStrictEqual([parent.isRead.get(), child.isRead.get()], [false, false]);
		});

		test('navigation skips folded children and returning from a child reveals its parent', async () => {
			const { document } = createBoardDocument();
			const parent = new TestChat('Parent');
			const child = new TestChat('Child');
			const h = createBoard(document, [parent, child]);
			await h.service.open();
			h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
			h.container.querySelector<HTMLElement>('.project-board-child-cards .project-board-card')!.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
			h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
			const parentElement = h.container.querySelector<HTMLElement>('.project-board-card')!;
			parentElement.focus();
			parentElement.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 35, bubbles: true, cancelable: true }));
			assert.strictEqual(document.activeElement, parentElement);
			h.state.closedResource = child.resource;
			await h.service.closeSession(12345);
			assert.deepStrictEqual({
				hidden: h.container.querySelector<HTMLElement>('.project-board-child-cards')!.hidden,
				focused: document.activeElement?.getAttribute('data-chat-resource'),
			}, { hidden: false, focused: child.resource.toString() });
		});

		test('new children follow placed parents, explicit child moves detach and clearing rejoins', async () => {
			const parent = new TestChat('Parent');
			const h = createBoard(mainWindow.document, [parent]);
			store.add(h.service.createView(h.container));
			await h.moveViaPicker('General, P0', parent.resource);
			h.service.toggleAutoIncludeSessions();
			const child = new TestChat('Child');
			h.session.chats.set([parent, child], undefined);
			const inCell = (cell: string) => [...h.container.querySelectorAll(`[aria-label="${cell}"] .project-board-card h4`)].map(e => e.textContent);
			assert.deepStrictEqual(inCell('General, P0'), ['Parent', 'Child']);
			assert.strictEqual(h.container.querySelector<HTMLElement>('.project-board-child-cards')!.hidden, true);
			await h.moveViaPicker('General, P1', child.resource);
			assert.deepStrictEqual({ p0: inCell('General, P0'), p1: inCell('General, P1') }, { p0: ['Parent'], p1: ['Child'] });
			await h.moveViaPicker('Follow Parent', child.resource);
			assert.deepStrictEqual({ p0: inCell('General, P0'), p1: inCell('General, P1'), unassigned: inCell('Unassigned') }, {
				p0: ['Parent', 'Child'], p1: [], unassigned: [],
			});
		});

		test('keeps a child mounted while native focus leaves its parent', async () => {
			const { document } = createBoardDocument();
			const parent = new TestChat('Parent');
			const h = createBoard(document, [parent, new TestChat('Child')]);
			await h.service.open();
			h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
			h.container.querySelector<HTMLElement>('.project-board-card')!.focus();
			parent.title.set('Updated parent', undefined);
			const parentElement = h.container.querySelector<HTMLElement>('.project-board-card')!;
			const childElement = h.container.querySelector<HTMLElement>('.project-board-child-cards .project-board-card')!;
			// Native focus dispatch can run microtasks before the incoming target receives focus.
			const activeElement = sinon.stub(document, 'activeElement').get(() => document.body);
			try {
				parentElement.dispatchEvent(new mainWindow.FocusEvent('focusout', { bubbles: true, relatedTarget: childElement }));
				await Promise.resolve();
				assert.ok(childElement.isConnected);
			} finally {
				activeElement.restore();
			}
			childElement.focus();
			assert.strictEqual(document.activeElement, childElement);
		});

		test('returning to an overflow child reveals its family beyond the cell cap', async () => {
			const { document } = createBoardDocument();
			const parents = Array.from({ length: 4 }, (_, index) => new TestChat(`Parent ${index}`));
			const h = createIndependentChatBoard(document, parents);
			const child = workerChat('Delegated chat', parents[3]);
			const nested = workerChat('Nested delegated chat', child);
			const session = h.state.sessions[3];
			assert.ok(session instanceof TestBoardSession);
			session.chats.set([parents[3], child, nested], undefined);
			await h.service.open();
			for (const title of ['Parent 3', 'Delegated chat']) {
				h.container.querySelector<HTMLElement>(`[aria-label="Expand Child chats of ${title}"]`)!.click();
			}
			[...h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => element.dataset.chatResource === nested.resource.toString())!
				.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
			for (const parent of parents) {
				await h.moveViaPicker('General, P0', parent.resource);
			}
			h.container.querySelector<HTMLElement>('.project-board-less')!.click();
			assert.strictEqual(h.container.querySelector('.project-board-child-cards'), null);
			assert.ok(h.container.querySelector('.project-board-recency-warning')?.textContent?.includes('3 hidden chats'));
			h.state.closedResource = nested.resource;
			await h.service.closeSession(12345);
			assert.deepStrictEqual({
				cards: h.container.querySelectorAll('[aria-label="General, P0"] .project-board-card').length,
				focus: document.activeElement?.getAttribute('data-chat-resource'),
			}, { cards: 6, focus: nested.resource.toString() });
		});

		test('embedded and standalone views fold the same family independently', async () => {
			const { document } = createBoardDocument();
			const h = createBoard(document, [new TestChat('Parent'), new TestChat('Child')]);
			const embedded = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(embedded);
			store.add(toDisposable(() => embedded.remove()));
			store.add(h.service.createView(embedded));
			await h.service.open();
			assert.ok(h.container.querySelector<HTMLElement>('.project-board-child-cards')!.hidden);
			assert.ok(embedded.querySelector<HTMLElement>('.project-board-child-cards')!.hidden);
			h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
			assert.deepStrictEqual({
				standalone: h.container.querySelector<HTMLElement>('.project-board-child-cards')!.hidden,
				embedded: embedded.querySelector<HTMLElement>('.project-board-child-cards')!.hidden,
			}, { standalone: false, embedded: true });
			h.closeBoard();
			await h.service.open();
			assert.strictEqual(h.currentContainer.querySelector<HTMLElement>('.project-board-child-cards')!.hidden, true, 'Recreated views start collapsed');
		});

		test('folded axes count nested child activity without hiding it in the parent total', async () => {
			const parent = new TestChat('Parent');
			const child = new TestChat('Child');
			child.status.set(SessionStatus.NeedsInput, undefined);
			const h = createBoard(mainWindow.document, [parent, child]);
			await h.service.open();
			await h.moveViaPicker('General, P0', parent.resource);
			h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p0"]')!.click();
			assert.deepStrictEqual({
				axis: h.container.querySelector('.project-board-column-heading .project-board-collapsed-summary')?.textContent,
				cell: h.container.querySelector('[aria-label="General, P0"] .project-board-collapsed-summary')?.textContent,
				attention: h.container.querySelector('[aria-label="General, P0"] .project-board-attention')?.textContent,
			}, { axis: '2 sessions · 🏃 1 Busy · 🙋 1 Needs Input', cell: '2 sessions · 🏃 1 Busy · 🙋 1 Needs Input', attention: undefined });
		});

		test('archiving or losing a parent preserves its visible children and folds survive live additions', async () => {
			const parent = new TestChat('Parent');
			const child = new TestChat('Child');
			const h = createBoard(mainWindow.document, [parent, child]);
			await h.service.open();
			const another = new TestChat('Another child');
			h.session.chats.set([parent, child, another], undefined);
			assert.deepStrictEqual({
				hidden: h.container.querySelector<HTMLElement>('.project-board-child-cards')!.hidden,
				children: h.container.querySelectorAll('.project-board-child-cards .project-board-card').length,
			}, { hidden: true, children: 2 });
			parent.isArchived.set(true, undefined);
			assert.deepStrictEqual([...h.container.querySelectorAll('.project-board-card h4')].map(e => e.textContent), ['Another child', 'Child']);
			h.container.querySelector<HTMLElement>('[data-board-control="show-archived"]')!.click();
			assert.strictEqual(h.container.querySelector<HTMLElement>('.project-board-child-cards')!.hidden, true);
			h.session.chats.set([child, another], undefined);
			assert.deepStrictEqual({
				children: h.container.querySelector('.project-board-child-cards'),
				cards: h.container.querySelectorAll('.project-board-card').length,
			}, { children: null, cards: 2 });
		});

		test('folded child answers retain their DOM and draft through live updates', async () => {
			const parent = new TestChat('Parent');
			parent.status.set(SessionStatus.Completed, undefined);
			const child = new TestChat('Child question');
			child.status.set(SessionStatus.NeedsInput, undefined);
			const h = createBoard(mainWindow.document, [parent, child]);
			const carousel = new ChatQuestionCarouselData([{
				id: 'choice', type: 'singleSelect', title: 'Choice', options: [{ id: 'one', label: 'One', value: 'one' }], allowFreeformInput: true,
			}], false, 'child-question');
			h.questionPreview.set({ kind: 'ready', questions: [], permissions: [], unsupported: [], truncated: false }, undefined);
			h.questionCarousels.set([{ carousel, requestId: 'child-request' }], undefined);
			await h.service.open();
			h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
			const textarea = h.container.querySelector<HTMLTextAreaElement>('.project-board-child-cards textarea')!;
			textarea.value = 'My answer';
			textarea.setSelectionRange(1, 4);
			textarea.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
			h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
			child.title.set('Renamed child question', undefined);
			assert.deepStrictEqual({
				same: h.container.querySelector('textarea') === textarea,
				hidden: !!textarea.closest('[hidden]'), value: textarea.value,
				selection: [textarea.selectionStart, textarea.selectionEnd], submissions: h.submittedAnswers,
			}, { same: true, hidden: true, value: 'My answer', selection: [1, 4], submissions: [] });
			h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
			assert.strictEqual(h.container.querySelector('textarea'), textarea);
		});
	});

	suite('Mark as Done', () => {
		function card(container: HTMLElement, chat: IChat): HTMLElement {
			return [...container.querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => element.dataset.chatResource === chat.resource.toString())!;
		}

		function checkbox(container: HTMLElement, chat: IChat): HTMLElement {
			return card(container, chat).querySelector<HTMLElement>('.project-board-card-select')!;
		}

		function select(container: HTMLElement, chat: IChat): void {
			checkbox(container, chat).click();
		}

		function count(container: HTMLElement): string | null | undefined {
			return container.querySelector('.project-board-selection-count')?.textContent;
		}

		function done(container: HTMLElement): HTMLElement {
			return container.querySelector<HTMLElement>('[data-board-control="mark-done"]')!;
		}

		test('archives multiple selected conversations once per session without deleting, moving or marking read', async () => {
			const chats = [new TestChat('First'), new TestChat('Selected sibling'), new TestChat('Unselected sibling'), new TestChat('Other session')];
			const h = createBoard(mainWindow.document, chats.slice(0, 3));
			const other = new TestBoardSession([chats[3]], 'other');
			h.state.sessions.push(other);
			h.catalog.updateBoard(DEFAULT_PROJECT_BOARD_ID, configuration => ({
				...configuration,
				placements: [{ cardId: getProjectBoardCardId(h.session, chats[0]), rowId: 'general', columnId: 'p1' }],
			}));
			await h.service.open();
			const configuration = h.catalog.boards.get();
			for (const chat of [chats[0], chats[1], chats[3]]) {
				select(h.container, chat);
			}
			assert.deepStrictEqual({
				count: count(h.container), selected: h.container.querySelectorAll('.project-board-card-selected').length,
				enabled: done(h.container).getAttribute('aria-disabled'), opened: h.opened, read: chats.map(chat => chat.isRead.get()),
			}, { count: '3 conversations selected', selected: 3, enabled: 'false', opened: [], read: [false, false, false, false] });
			done(h.container).click();
			await timeout(0);
			assert.deepStrictEqual({
				attempts: h.state.archiveAttempts, archived: [h.session.isArchived.get(), other.isArchived.get()],
				count: count(h.container), cards: h.container.querySelectorAll('[data-chat-resource]').length,
				deleted: h.state.deletedSessions, configuration: h.catalog.boards.get(), read: chats.map(chat => chat.isRead.get()),
			}, {
				attempts: [h.session, other], archived: [true, true], count: '0 conversations selected', cards: 0,
				deleted: [], configuration, read: [false, false, false, false],
			});
			h.container.querySelector<HTMLElement>('[data-board-control="show-archived"]')!.click();
			assert.deepStrictEqual({
				cards: h.container.querySelectorAll('[data-chat-resource]').length,
				selectable: h.container.querySelectorAll('.project-board-card-select').length,
			}, { cards: 4, selectable: 0 });
		});

		test('checkboxes expose selection and session scope accessibly without opening or dragging chats', async () => {
			const chat = new TestChat('Keyboard selection');
			const h = createBoard(mainWindow.document, [chat]);
			await h.service.open();
			const control = checkbox(h.container, chat);
			control.focus();
			control.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 32, bubbles: true, cancelable: true }));
			control.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, repeat: true, bubbles: true, cancelable: true }));
			control.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
			const drag = new mainWindow.DragEvent('dragstart', { bubbles: true, cancelable: true });
			control.dispatchEvent(drag);
			const describedBy = done(h.container).getAttribute('aria-describedby')!;
			assert.deepStrictEqual({
				role: control.getAttribute('role'), label: control.getAttribute('aria-label'), checked: control.getAttribute('aria-checked'),
				cardRole: card(h.container, chat).getAttribute('role'), focus: mainWindow.document.activeElement === control,
				countRole: h.container.querySelector('.project-board-selection-count')?.getAttribute('role'),
				description: mainWindow.document.getElementById(describedBy)?.textContent,
				help: card(h.container, chat).getAttribute('aria-description')?.includes('Tab to the conversation checkbox'),
				content: h.service.getAccessibleContent().includes('1 conversation selected') && h.service.getAccessibleContent().includes('  Selected'),
				drag: drag.defaultPrevented, opened: h.opened, read: chat.isRead.get(),
			}, {
				role: 'checkbox', label: 'Select Keyboard selection', checked: 'true', cardRole: 'group', focus: true,
				countRole: 'status', description: 'Archives the selected conversations\' sessions, including their other chats. No conversations are deleted.',
				help: true, content: true, drag: true, opened: [], read: false,
			});
			control.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, bubbles: true, cancelable: true }));
			assert.strictEqual(count(h.container), '0 conversations selected');
			assert.strictEqual(done(h.container).getAttribute('aria-disabled'), 'true');
		});

		test('nested form controls keep their interaction and never select, open or show the card menu', async () => {
			const chat = new TestChat('Nested controls');
			const h = createBoard(mainWindow.document, [chat]);
			await h.service.open();
			select(h.container, chat);
			const element = card(h.container, chat);
			for (const tag of ['input', 'textarea', 'select', 'button', 'a']) {
				const control = mainWindow.document.createElement(tag);
				element.appendChild(control);
				control.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
				const key = new mainWindow.KeyboardEvent('keydown', { keyCode: 32, bubbles: true, cancelable: true });
				control.dispatchEvent(key);
				const menu = new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
				control.dispatchEvent(menu);
				const drag = new mainWindow.DragEvent('dragstart', { bubbles: true, cancelable: true });
				control.dispatchEvent(drag);
				assert.deepStrictEqual({ tag, key: key.defaultPrevented, menu: menu.defaultPrevented, drag: drag.defaultPrevented },
					{ tag, key: false, menu: false, drag: true });
			}
			assert.deepStrictEqual({ selected: count(h.container), opened: h.opened, menu: h.contextMenu.delegate },
				{ selected: '1 conversation selected', opened: [], menu: undefined });
		});

		test('partial failure leaves only failed conversations selected and retries without duplicate operations', async () => {
			const failed = new TestChat('Failed');
			const success = new TestChat('Success');
			const h = createBoard(mainWindow.document, [failed]);
			const other = new TestBoardSession([success], 'success');
			h.state.sessions.push(other);
			h.state.archiveErrors.add(h.session.sessionId);
			const barrier = h.state.archiveBarrier = new DeferredPromise<void>();
			const errors: string[] = [];
			store.add(h.errors.event(error => errors.push(error)));
			await h.service.open();
			select(h.container, failed);
			select(h.container, success);
			done(h.container).click();
			done(h.container).click();
			select(h.container, failed);
			h.container.querySelector<HTMLElement>('[data-board-control="clear-selection"]')!.click();
			card(h.container, failed).dispatchEvent(new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			const action = h.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.card.markDone')!;
			assert.strictEqual(action.enabled, false);
			await action.run();
			assert.deepStrictEqual({
				attempts: h.state.archiveAttempts, count: count(h.container), disabled: done(h.container).getAttribute('aria-disabled'),
				checked: checkbox(h.container, failed).getAttribute('aria-checked'), checkboxDisabled: checkbox(h.container, failed).getAttribute('aria-disabled'),
				cardDisabled: card(h.container, failed).querySelector('[aria-label="Mark as Done"]')?.getAttribute('aria-disabled'),
			}, { attempts: [h.session], count: 'Marking conversations as done…', disabled: 'true', checked: 'true', checkboxDisabled: 'true', cardDisabled: 'true' });
			await barrier.complete();
			await timeout(0);
			assert.deepStrictEqual({
				attempts: h.state.archiveAttempts, selected: count(h.container), checked: checkbox(h.container, failed).getAttribute('aria-checked'),
				archived: other.isArchived.get(), errors,
			}, {
				attempts: [h.session, other], selected: '1 conversation selected', checked: 'true', archived: true,
				errors: ['1 of 2 sessions could not be marked as done. The remaining selected conversations can be retried.'],
			});
			h.state.archiveErrors.clear();
			done(h.container).click();
			await timeout(0);
			assert.deepStrictEqual({ attempts: h.state.archiveAttempts, selected: count(h.container), archived: h.session.isArchived.get() },
				{ attempts: [h.session, other, h.session], selected: '0 conversations selected', archived: true });
		});

		test('selection and checkbox focus survive live rerenders, moves and collapsed groups', async () => {
			const { document } = createBoardDocument();
			const chat = new TestChat('Retained');
			const h = createBoard(document, [chat]);
			await h.service.open();
			select(h.container, chat);
			checkbox(h.container, chat).focus();
			assert.strictEqual(document.activeElement, checkbox(h.container, chat));
			chat.title.set('Renamed selection', undefined);
			assert.strictEqual(document.activeElement, checkbox(h.container, chat));
			assert.strictEqual(checkbox(h.container, chat).getAttribute('aria-label'), 'Select Renamed selection');
			await h.moveViaPicker('General, P1', chat.resource);
			const collapse = h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p1"]')!;
			collapse.click();
			chat.status.set(SessionStatus.Completed, undefined);
			assert.deepStrictEqual({
				count: count(h.container), checked: checkbox(h.container, chat).getAttribute('aria-checked'),
				hidden: !!card(h.container, chat).closest('[hidden]'),
			}, { count: '1 conversation selected', checked: 'true', hidden: true });
			h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p1"]')!.click();
			assert.strictEqual(checkbox(h.container, chat).getAttribute('aria-checked'), 'true');
			h.container.querySelector<HTMLElement>('[data-board-control="clear-selection"]')!.click();
			assert.deepStrictEqual({
				count: count(h.container), checked: checkbox(h.container, chat).getAttribute('aria-checked'), enabled: done(h.container).getAttribute('aria-disabled'),
			}, { count: '0 conversations selected', checked: 'false', enabled: 'true' });
		});

		test('stale selections are removed for archived, hidden and removed chats and excluded placements', async () => {
			const chats = [new TestChat('Archived externally'), new TestChat('Hidden'), new TestChat('Removed'), new TestChat('Excluded')];
			const h = createBoard(mainWindow.document, chats);
			await h.service.open();
			chats.forEach(chat => select(h.container, chat));
			chats[0].isArchived.set(true, undefined);
			chats[1].interactivity.set(ChatInteractivity.Hidden, undefined);
			h.session.chats.set([chats[0], chats[1], chats[3]], undefined);
			assert.strictEqual(count(h.container), '1 conversation selected');
			const toggleAutoInclude = async () => {
				h.container.querySelector<HTMLElement>('[data-board-control="settings"]')!.click();
				await h.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.settings.autoIncludeSessions')!.run();
			};
			await toggleAutoInclude();
			assert.strictEqual(count(h.container), '0 conversations selected');
			await toggleAutoInclude();
			h.session.chats.set(chats, undefined);
			chats[0].isArchived.set(false, undefined);
			chats[1].interactivity.set(ChatInteractivity.Full, undefined);
			assert.deepStrictEqual({
				checked: [...h.container.querySelectorAll('.project-board-card-select')].map(control => control.getAttribute('aria-checked')),
				attempts: h.state.archiveAttempts,
			}, { checked: ['false', 'false', 'false', 'false'], attempts: [] });
		});

		test('drafts and unavailable conversations cannot be selected and reconnecting never restores stale selection', async () => {
			const chat = new TestChat('Available');
			const untitled = new TestChat('Untitled');
			untitled.status.set(SessionStatus.Untitled, undefined);
			const h = createBoard(mainWindow.document, [chat, untitled]);
			h.drafts.set([{ id: 'draft', resource: URI.parse('test-draft:/draft'), submitted: false, hasContent: true }], undefined);
			h.catalog.updateBoard(DEFAULT_PROJECT_BOARD_ID, configuration => ({
				...configuration,
				placements: [{ cardId: 'missing', rowId: 'general', columnId: 'p1' }],
			}));
			await h.service.open();
			assert.deepStrictEqual({
				selectable: h.container.querySelectorAll('.project-board-card-select').length,
				draft: h.container.querySelector('.project-board-card-draft .project-board-card-select'),
				missing: h.container.querySelector('.project-board-card-unavailable .project-board-card-select'),
				doneActions: h.container.querySelectorAll('.project-board-card [aria-label="Mark as Done"]').length,
			}, { selectable: 1, draft: null, missing: null, doneActions: 1 });
			select(h.container, chat);
			h.session.remoteConnectionStatus.set({ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.Unknown }, undefined);
			assert.strictEqual(count(h.container), '0 conversations selected');
			assert.strictEqual(h.container.querySelectorAll('.project-board-card-select').length, 0);
			assert.strictEqual(h.container.querySelectorAll('.project-board-card [aria-label="Mark as Done"]').length, 0);
			h.session.remoteConnectionStatus.set({ kind: 'connected' }, undefined);
			select(h.container, chat);
			h.state.providerAvailable = false;
			h.providersChanged.fire({ added: [], removed: [h.provider] });
			assert.strictEqual(count(h.container), '0 conversations selected');
			assert.strictEqual(h.container.querySelectorAll('.project-board-card-select').length, 0);
			assert.strictEqual(h.container.querySelectorAll('.project-board-card [aria-label="Mark as Done"]').length, 0);
			h.state.providerAvailable = true;
			h.providersChanged.fire({ added: [h.provider], removed: [] });
			assert.strictEqual(checkbox(h.container, chat).getAttribute('aria-checked'), 'false');
		});

		test('context actions target the selection only when invoked on a selected card', async () => {
			const first = new TestChat('Selected');
			const second = new TestChat('Also selected');
			const third = new TestChat('Not selected');
			const h = createBoard(mainWindow.document, [first]);
			const secondSession = new TestBoardSession([second], 'second');
			const thirdSession = new TestBoardSession([third], 'third');
			h.state.sessions.push(secondSession, thirdSession);
			await h.service.open();
			select(h.container, first);
			select(h.container, second);
			card(h.container, third).dispatchEvent(new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			const single = h.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.card.markDone')!;
			assert.strictEqual(single.label, 'Mark as Done');
			await single.run();
			assert.deepStrictEqual({ attempts: h.state.archiveAttempts, selected: count(h.container) },
				{ attempts: [thirdSession], selected: '2 conversations selected' });
			card(h.container, first).dispatchEvent(new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			const multiple = h.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.card.markDone')!;
			assert.strictEqual(multiple.label, 'Mark 2 Selected as Done');
			await multiple.run();
			assert.deepStrictEqual(h.state.archiveAttempts, [thirdSession, h.session, secondSession]);
		});

		test('selection is view-local, retained on board switches and discarded when the view closes', async () => {
			const chat = new TestChat('Shared');
			const h = createBoard(mainWindow.document, [chat]);
			const other = h.catalog.createBoard('Other');
			await h.service.open(DEFAULT_PROJECT_BOARD_ID);
			select(h.container, chat);
			await h.service.open(other);
			assert.strictEqual(count(h.currentContainer), '0 conversations selected');
			select(h.currentContainer, chat);
			h.currentContainer.querySelector<HTMLElement>('[data-board-control="clear-selection"]')!.click();
			assert.strictEqual(count(h.container), '1 conversation selected');
			h.closeBoard();
			await h.service.open(other);
			assert.strictEqual(count(h.currentContainer), '0 conversations selected');
			const embedded = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(embedded);
			store.add(toDisposable(() => embedded.remove()));
			h.catalog.selectBoard(DEFAULT_PROJECT_BOARD_ID);
			store.add(h.service.createView(embedded));
			select(embedded, chat);
			h.catalog.selectBoard(other);
			assert.strictEqual(count(embedded.querySelector<HTMLElement>('.project-board-view-container:not([hidden])')!), '0 conversations selected');
			h.catalog.selectBoard(DEFAULT_PROJECT_BOARD_ID);
			assert.strictEqual(count(embedded.querySelector<HTMLElement>('.project-board-view-container:not([hidden])')!), '1 conversation selected');
		});

		test('an open context menu revalidates targets removed before activation', async () => {
			const chat = new TestChat('Removed');
			const h = createBoard(mainWindow.document, [chat]);
			await h.service.open();
			select(h.container, chat);
			card(h.container, chat).dispatchEvent(new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			const action = h.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.card.markDone')!;
			h.state.sessions = [];
			h.sessionsChanged.fire({ added: [], removed: [h.session], changed: [] });
			await action.run();
			assert.deepStrictEqual({ attempts: h.state.archiveAttempts, selected: count(h.container) },
				{ attempts: [], selected: '0 conversations selected' });
		});

		test('closing a view during archiving does not start additional session operations', async () => {
			const first = new TestChat('First');
			const second = new TestChat('Second');
			const h = createBoard(mainWindow.document, [first]);
			h.state.sessions.push(new TestBoardSession([second], 'second'));
			const barrier = h.state.archiveBarrier = new DeferredPromise<void>();
			await h.service.open();
			select(h.container, first);
			select(h.container, second);
			done(h.container).click();
			h.closeBoard();
			await barrier.complete();
			await timeout(0);
			assert.deepStrictEqual(h.state.archiveAttempts, [h.session]);
		});

		test('a queued target archived externally does not archive its remaining sibling chats', async () => {
			const first = new TestChat('First');
			const stale = new TestChat('Stale');
			const sibling = new TestChat('Still active');
			const h = createBoard(mainWindow.document, [first]);
			const other = new TestBoardSession([stale, sibling], 'other');
			h.state.sessions.push(other);
			const barrier = h.state.archiveBarrier = new DeferredPromise<void>();
			const errors: string[] = [];
			store.add(h.errors.event(error => errors.push(error)));
			await h.service.open();
			select(h.container, first);
			select(h.container, stale);
			done(h.container).click();
			stale.isArchived.set(true, undefined);
			await barrier.complete();
			await timeout(0);
			assert.deepStrictEqual({
				attempts: h.state.archiveAttempts, otherArchived: other.isArchived.get(), selected: count(h.container), errors: errors.length,
			}, { attempts: [h.session], otherArchived: false, selected: '0 conversations selected', errors: 1 });
		});

		test('concurrent views share a pending session archive and can retry a shared failure', async () => {
			const chat = new TestChat('Shared pending archive');
			const h = createBoard(mainWindow.document, [chat]);
			const other = h.catalog.createBoard('Other');
			const barrier = h.state.archiveBarrier = new DeferredPromise<void>();
			h.state.archiveErrors.add(h.session.sessionId);
			await h.service.open(DEFAULT_PROJECT_BOARD_ID);
			card(h.container, chat).querySelector<HTMLElement>('[aria-label="Mark as Done"]')!.click();
			await h.service.open(other);
			select(h.currentContainer, chat);
			done(h.currentContainer).click();
			assert.deepStrictEqual(h.state.archiveAttempts, [h.session]);
			await barrier.complete();
			await timeout(0);
			assert.deepStrictEqual([count(h.container), count(h.currentContainer)], ['1 conversation selected', '1 conversation selected']);
			h.state.archiveErrors.clear();
			done(h.currentContainer).click();
			await timeout(0);
			assert.deepStrictEqual({
				attempts: h.state.archiveAttempts, counts: [count(h.container), count(h.currentContainer)],
			}, { attempts: [h.session, h.session], counts: ['0 conversations selected', '0 conversations selected'] });
		});
	});

	test('multiple board windows share live chats but isolate placements, settings and selection', async () => {
		const chat = new TestChat('Shared conversation');
		const h = createBoard(mainWindow.document, [chat]);
		h.metadata.set({ kind: 'ready', prompt: 'Shared prompt', context: [] }, undefined);
		const releaseId = h.catalog.createBoard('Release');
		await h.service.open(DEFAULT_PROJECT_BOARD_ID);
		await h.service.open(releaseId);
		const first = h.auxiliaryWindows[0].container;
		const second = h.auxiliaryWindows[1].container;
		assert.strictEqual(h.state.openCount, 2);
		const release = store.add(h.instantiationService.createInstance(ProjectBoardState, releaseId));
		release.moveCard(getProjectBoardCardId(h.session, chat), { rowId: 'general', columnId: 'p1' });
		release.setDisplayOption('showLastPrompt', false);
		assert.ok(first.querySelector('.project-board-unassigned [data-chat-resource]'));
		assert.ok(second.querySelector('[aria-label="General, P1"] [data-chat-resource]'));
		assert.ok(first.querySelector('.project-board-card-prompt'));
		assert.strictEqual(second.querySelector('.project-board-card-prompt'), null);
		chat.status.set(SessionStatus.NeedsInput, undefined);
		assert.ok(first.querySelector('.project-board-card-needs-input'));
		assert.ok(second.querySelector('.project-board-card-needs-input'));
		h.catalog.renameBoard(releaseId, 'Release readiness');
		assert.strictEqual(second.querySelector('h1')?.textContent, 'Agents Hub — Release readiness');
		h.catalog.selectBoard(DEFAULT_PROJECT_BOARD_ID);
		await h.service.open(releaseId);
		assert.strictEqual(h.state.openCount, 2, 'Reopening a board reuses only its own window');
		assert.strictEqual(first.querySelector('h1')?.textContent, 'Agents Hub — Default');
	});

	test('selection and unrelated board edits do not rebuild the current board or a standalone board', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('No redundant render')]);
		const second = h.catalog.createBoard('Second');
		await h.service.open(DEFAULT_PROJECT_BOARD_ID);
		const nativeGrid = h.container.querySelector('.project-board-grid');
		const embedded = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(embedded);
		store.add(toDisposable(() => embedded.remove()));
		store.add(h.service.createView(embedded));
		const embeddedGrid = embedded.querySelector('.project-board-grid');
		h.catalog.renameBoard(second, 'Renamed');
		assert.strictEqual(embedded.querySelector('.project-board-grid'), embeddedGrid, 'Unrelated catalog changes must not reactivate the current view');
		assert.strictEqual(h.container.querySelector('.project-board-grid'), nativeGrid);
		h.catalog.selectBoard(second);
		assert.strictEqual(h.container.querySelector('.project-board-grid'), nativeGrid, 'Embedded selection must not invalidate a standalone board');
	});

	test('history and prompt preview bursts coalesce rendering without delaying direct chat changes', () => {
		const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		store.add(toDisposable(() => clock.restore()));
		const chat = new TestChat('Coalesced preview');
		const h = createBoard(mainWindow.document, [chat]);
		const changed = store.add(new Emitter<IChatChangeEvent>());
		const model = new class extends mock<IChatModel>() {
			override readonly sessionResource = chat.resource;
			override readonly onDidChange = changed.event;
			override readonly lastRequestObs = observableValue('last', undefined);
			override readonly lastRequest = undefined;
		}();
		h.loadedModels.set([model], undefined);
		const view = store.add(h.service.createView(h.container));
		let renders = 0;
		store.add(view.onDidChangeContentSize(() => renders++));
		for (let i = 0; i < 20; i++) {
			changed.fire({ kind: 'setCustomTitle', title: String(i) });
		}
		assert.strictEqual(renders, 0, 'Restoring history must not rebuild the board for every model event');
		clock.tick(0);
		assert.strictEqual(renders, 1);
		for (const prompt of ['First preview', 'Final preview']) {
			h.metadata.set({ kind: 'ready', prompt, context: [] }, undefined);
		}
		assert.strictEqual(renders, 1);
		clock.tick(0);
		assert.strictEqual(renders, 2);
		assert.strictEqual(h.container.querySelector('.project-board-card-prompt')?.textContent, 'Final preview');
		chat.title.set('Immediate title', undefined);
		assert.strictEqual(h.container.querySelector('h4')?.textContent, 'Immediate title');
	});

	test('closing the last Hub surface clears idle previews without flushing another open board', async () => {
		const clear = sinon.spy(ProjectBoardPreviewPool.prototype, 'clearIdleMetadata');
		store.add(toDisposable(() => clear.restore()));
		const h = createBoard(mainWindow.document, [new TestChat('Cached model')]);
		h.metadata.set({ kind: 'ready', prompt: 'Ready preview', context: [] }, undefined);
		await h.service.open();
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const embedded = store.add(h.service.createView(container));
		h.closeBoard();
		await Promise.resolve();
		assert.strictEqual(clear.callCount, 0, 'The embedded Hub is still using the shared cache');
		embedded.dispose();
		assert.strictEqual(clear.callCount, 1);
	});

	test('embedded board switching preserves local folding and returns a chat to its originating board', async () => {
		const chat = new TestChat('Return to source board');
		const h = createBoard(mainWindow.document, [chat]);
		const other = h.catalog.createBoard('Other');
		store.add(h.service.createView(h.container));
		const defaultBoard = h.container.querySelector<HTMLElement>('[data-board-id="default"]')!;
		defaultBoard.querySelector<HTMLElement>('[data-board-control="collapse:row:general"]')!.click();
		const card = defaultBoard.querySelector<HTMLElement>('[data-chat-resource]')!;
		card.focus();
		card.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();
		h.catalog.selectBoard(other);
		assert.strictEqual(defaultBoard.parentElement!.hidden, true);
		h.state.closedResource = chat.resource;
		await h.service.closeSession(99);
		assert.strictEqual(h.catalog.selectedBoardId.get(), DEFAULT_PROJECT_BOARD_ID);
		assert.strictEqual(defaultBoard.parentElement!.hidden, false);
		assert.strictEqual(defaultBoard.querySelector('[data-board-control="collapse:row:general"]')?.getAttribute('aria-expanded'), 'false');
		assert.strictEqual(mainWindow.document.activeElement, defaultBoard.querySelector('[data-chat-resource]'));
		assert.deepStrictEqual(h.state.deletedSessions, []);
	});

	test('deleting a board closes only its window and never deletes conversations or recreates it on chat close', async () => {
		const chat = new TestChat('Keep conversation');
		const h = createBoard(mainWindow.document, [chat]);
		const other = h.catalog.createBoard('Keep this board');
		await h.service.open(DEFAULT_PROJECT_BOARD_ID);
		const original = h.auxiliaryWindows[0].container;
		const card = original.querySelector<HTMLElement>('[data-chat-resource]')!;
		card.focus();
		card.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		await Promise.resolve();
		await Promise.resolve();
		await h.service.open(other);
		h.catalog.deleteBoard(DEFAULT_PROJECT_BOARD_ID);
		assert.strictEqual(original.isConnected, false);
		assert.ok(h.auxiliaryWindows[1].container.isConnected);
		h.state.closedResource = chat.resource;
		await h.service.closeSession(99);
		assert.strictEqual(h.state.openCount, 2);
		assert.deepStrictEqual(h.state.deletedSessions, []);
		assert.strictEqual(h.catalog.boards.get().length, 1);
	});

	test('newly discovered conversations appear independently in every auto-including board', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Existing')]);
		const other = h.catalog.createBoard('Another board');
		await h.service.open(DEFAULT_PROJECT_BOARD_ID);
		await h.service.open(other);
		const added = new TestChat('Discovered later');
		h.session.chats.set([...h.session.chats.get(), added], undefined);
		for (const window of h.auxiliaryWindows) {
			assert.strictEqual(window.container.querySelectorAll('.project-board-unassigned [data-chat-resource]').length, 2);
		}
		const otherState = store.add(h.instantiationService.createInstance(ProjectBoardState, other));
		otherState.setAutoIncludeSessions(false);
		assert.strictEqual(h.auxiliaryWindows[0].container.querySelectorAll('[data-chat-resource]').length, 2);
		assert.strictEqual(h.auxiliaryWindows[1].container.querySelectorAll('[data-chat-resource]').length, 0);
	});

	test('marking a card done preserves known and unavailable placements on every board', async () => {
		const chat = new TestChat('Done everywhere');
		const h = createBoard(mainWindow.document, [chat]);
		const other = h.catalog.createBoard('Other');
		const firstState = store.add(h.instantiationService.createInstance(ProjectBoardState, DEFAULT_PROJECT_BOARD_ID));
		const otherState = store.add(h.instantiationService.createInstance(ProjectBoardState, other));
		firstState.moveCard(getProjectBoardCardId(h.session, chat), { rowId: 'general', columnId: 'p0' });
		otherState.moveCard(`${getProjectBoardSessionKey(h.session)}\0missing-child`, { rowId: 'general', columnId: 'p1' });
		otherState.moveCard('unrelated-session-chat', { rowId: 'general', columnId: 'p2' });
		await h.service.open(DEFAULT_PROJECT_BOARD_ID);
		const configuration = h.catalog.boards.get();
		h.container.querySelector<HTMLElement>('.project-board-card [aria-label="Mark as Done"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			archived: h.session.isArchived.get(), deleted: h.state.deletedSessions, configuration: h.catalog.boards.get(),
		}, { archived: true, deleted: [], configuration });
	});

	test('deleting the last board offers a focused New Board action without deleting chats', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Surviving chat')]);
		const view = store.add(h.service.createView(h.container));
		h.catalog.deleteBoard(DEFAULT_PROJECT_BOARD_ID);
		view.focus();
		const create = h.container.querySelector<HTMLElement>('[data-board-control="new-board"]')!;
		assert.strictEqual(mainWindow.document.activeElement, create);
		assert.strictEqual(h.container.querySelector('.project-board'), null);
		const reset = h.container.querySelector<HTMLElement>('[data-board-control="reset-hub"]')!;
		assert.strictEqual(mainWindow.getComputedStyle(reset).display, 'none');
		h.quickInput.inputValues.push('Fresh board');
		await h.service.createBoard();
		assert.strictEqual(h.catalog.boards.get()[0].name, 'Fresh board');
		assert.ok(h.container.querySelector('[data-chat-resource]'));
		assert.deepStrictEqual(h.state.deletedSessions, []);
		assert.strictEqual(h.state.createdCount, 0, 'Creating a board must not create a conversation');
	});

	suite('session list presentation', () => {
		function createSessionBoard(document = mainWindow.document) {
			const storage = store.add(new InMemoryStorageService());
			const h = createBoard(document, [], storage, true);
			h.container.style.width = '1400px';
			const first = new TestChat('Main chat');
			const second = new TestChat('Nested chat');
			const base = createTestSession('Shared session');
			const chats = observableValue<readonly IChat[]>('chats', [first, second]);
			const session: ISession = {
				...base.session,
				chats,
				mainChat: constObservable(first),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			h.state.sessions = [session];
			const view = store.add(h.service.createView(h.container));
			h.service.toggleDisplayOption('showSessionList');
			view.layout(1400, 800);
			const rows = (cell: string) => h.container.querySelector(`[aria-label="${cell}"]`)!.querySelectorAll('.session-item').length;
			const expandChildren = (cell: string) => {
				const row = [...h.container.querySelectorAll<HTMLElement>(`[aria-label="${cell}"] .monaco-list-row`)]
					.find(row => row.querySelector('.session-title')?.textContent === 'Shared session')!;
				if (row.getAttribute('aria-expanded') === 'false') {
					row.querySelector<HTMLElement>('.monaco-tl-twistie')!.click();
				}
			};
			const drop = (cell: string, source?: HTMLElement, draggedSession = session) => {
				const dataTransfer = new mainWindow.DataTransfer();
				if (source) {
					source.dispatchEvent(new mainWindow.DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
				} else {
					dataTransfer.setData(SessionsDataTransfers.SESSION, JSON.stringify({ sessionId: draggedSession.sessionId, resource: draggedSession.resource.toString() }));
				}
				const group = h.container.querySelector(`[aria-label="${cell}"]`)!;
				const target = group.classList.contains('project-board-card-group-collapsed') ? group : group.querySelector('.monaco-list-row') ?? group;
				target.dispatchEvent(new mainWindow.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
				target.dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
			};
			return { ...h, storage, session, chats, first, second, view, rows, drop, expandChildren };
		}

		test('native child rows start collapsed and restore the card renderer', () => {
			const h = createSessionBoard();
			const row = h.container.querySelector('.session-item');
			assert.ok(row);
			const list = {
				sessions: h.rows('Unassigned'),
				groups: h.container.querySelectorAll('.session-section').length,
				nested: h.container.querySelectorAll('.session-chat-item').length,
				cards: h.container.querySelectorAll('.project-board-card').length,
			};
			h.service.toggleDisplayOption('showSessionList');
			assert.deepStrictEqual({ list, cards: h.container.querySelectorAll('.project-board-card').length }, {
				list: { sessions: 1, groups: 0, nested: 0, cards: 0 }, cards: 2,
			});
			h.container.querySelector<HTMLElement>('.project-board-card-select')!.click();
			assert.strictEqual(h.container.querySelector('.project-board-selection-count')?.textContent, '1 conversation selected');
			h.service.toggleDisplayOption('showSessionList');
			assert.strictEqual(h.container.querySelector('.project-board-selection-tools'), null);
			h.service.toggleDisplayOption('showSessionList');
			assert.strictEqual(h.container.querySelector('.project-board-selection-count')?.textContent, '0 conversations selected');
		});

		test('session drags move rather than copy, including collapsed cells and Unassigned', () => {
			const h = createSessionBoard();
			h.service.toggleAutoIncludeSessions();
			const hidden = h.rows('Unassigned');
			h.drop('General, P0');
			const otherChat = new TestChat('Other main');
			const other: ISession = {
				...createTestSession('Other session').session,
				mainChat: constObservable(otherChat), chats: constObservable([otherChat]),
			};
			h.state.sessions.push(other);
			h.sessionsChanged.fire({ added: [other], removed: [], changed: [] });
			h.drop('General, P1', undefined, other);
			h.expandChildren('General, P0');
			const source = h.container.querySelector<HTMLElement>('[aria-label="General, P0"] .session-chat-item')!.closest<HTMLElement>('.monaco-list-row')!;
			h.drop('General, P1', source);
			const moved = [h.rows('General, P0'), h.rows('General, P1'), h.rows('Unassigned')];
			h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p0"]')!.click();
			h.expandChildren('General, P1');
			h.drop('General, P0', h.container.querySelector<HTMLElement>('[aria-label="General, P1"] .session-chat-item')!.closest<HTMLElement>('.monaco-list-row')!);
			const expanded = h.container.querySelector('[data-board-control="collapse:column:p0"]')!.getAttribute('aria-expanded');
			h.service.toggleDisplayOption('showSessionList');
			const cardCount = h.container.querySelectorAll('[aria-label="General, P0"] .project-board-card').length;
			h.service.toggleDisplayOption('showSessionList');
			h.service.toggleAutoIncludeSessions();
			const returnedRow = h.container.querySelector<HTMLElement>('[aria-label="General, P0"] .monaco-list-row')!;
			h.drop('Unassigned', returnedRow);
			assert.deepStrictEqual({ hidden, moved, expanded, cardCount, returned: [h.rows('General, P1'), h.rows('Unassigned')] }, {
				hidden: 0, moved: [0, 2, 0], expanded: 'true', cardCount: 2, returned: [1, 1],
			});
		});

		test('live updates retain the list and new chats stay in the session cell', () => {
			const h = createSessionBoard();
			h.drop('General, P0');
			const originalTree = h.container.querySelector('[aria-label="General, P0"] .monaco-list');
			h.first.title.set('Renamed chat', undefined);
			h.chats.set([h.first, h.second, new TestChat('Third chat')], undefined);
			h.view.layout(1200, 600);
			assert.deepStrictEqual({
				sameTree: originalTree === h.container.querySelector('[aria-label="General, P0"] .monaco-list'),
				placed: h.rows('General, P0'), unassigned: h.rows('Unassigned'),
			}, { sameTree: true, placed: 1, unassigned: 0 });
		});

		test('opening nested chats honors side-panel routing and restores focus', async () => {
			const h = createSessionBoard();
			h.expandChildren('Unassigned');
			h.service.toggleOpenChatInSidePanel();
			const child = h.container.querySelector<HTMLElement>('.session-chat-item')!;
			assert.ok(child);
			child.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true, button: 0 }));
			await Promise.resolve();
			await Promise.resolve();
			h.service.toggleOpenChatInSidePanel();
			assert.deepStrictEqual({
				opened: h.sidePanelOpened.map(resource => resource.toString()),
				focusedChat: h.container.querySelector('.monaco-list-row.focused .session-chat-title')?.textContent,
			}, { opened: [h.second.resource.toString()], focusedChat: 'Nested chat' });
		});

		test('side-panel identity never changes tree selection and follows the exact child when returning to cards', () => {
			const h = createSessionBoard();
			const tree = h.container.querySelector('.monaco-list')!;
			const rows = [...tree.querySelectorAll('.monaco-list-row')];
			const selection = rows.map(row => row.getAttribute('aria-selected'));
			h.activeSidePanelCardId.set(getProjectBoardCardId(h.session, h.second), undefined);
			assert.match(h.service.getAccessibleContent(), /Nested chat, [^\n]*\n {2}Open in Side Panel/);
			assert.deepStrictEqual({
				sameTree: h.container.querySelector('.monaco-list') === tree,
				selection: rows.map(row => row.getAttribute('aria-selected')),
				opened: h.opened, sidePanel: h.sidePanelOpened,
			}, { sameTree: true, selection, opened: [], sidePanel: [] });
			h.service.toggleDisplayOption('showSessionList');
			assert.deepStrictEqual([...h.container.querySelectorAll<HTMLElement>('[aria-current="true"]')].map(element => element.dataset.chatResource), [h.second.resource.toString()]);
			h.service.toggleDisplayOption('showSessionList');
			h.activeSidePanelCardId.set(undefined, undefined);
			h.service.toggleDisplayOption('showSessionList');
			assert.strictEqual(h.container.querySelector('[aria-current]'), null);
			assert.ok(!h.service.getAccessibleContent().includes('Open in Side Panel'));
		});

		test('keyboard movement relocates the entire session and preserves focus', async () => {
			const frame = mainWindow.document.createElement('iframe');
			mainWindow.document.body.appendChild(frame);
			store.add(toDisposable(() => frame.remove()));
			const document = frame.contentDocument!;
			const h = createSessionBoard(document);
			document.hasFocus = () => true;
			h.view.focus();
			h.quickInput.selectedLabel = 'General, P2';
			h.container.querySelector<HTMLElement>('[role="tree"]')!.dispatchEvent(new mainWindow.KeyboardEvent('keydown', {
				keyCode: 77, ctrlKey: !isMacintosh, metaKey: isMacintosh, shiftKey: true, bubbles: true, cancelable: true,
			}));
			assert.strictEqual(h.pick.callCount, 1);
			await h.pick.lastCall.returnValue;
			await Promise.resolve();
			const focused = h.container.querySelector('[aria-label="General, P2"] .monaco-list-row.focused .session-title')?.textContent;
			const focusedRole = document.activeElement?.getAttribute('role');
			h.service.toggleDisplayOption('showSessionList');
			assert.deepStrictEqual({
				focused, focusedRole,
				movedChats: h.container.querySelectorAll('[aria-label="General, P2"] .project-board-card').length,
				unassigned: h.container.querySelectorAll('.project-board-unassigned .project-board-card').length,
			}, { focused: 'Shared session', focusedRole: 'tree', movedChats: 2, unassigned: 0 });
		});
	});

	test('PB-21 board notifies content size changes so the host can rescan after +more expands a column', async () => {
		const chats = Array.from({ length: 5 }, (_, index) => new TestChat(`Card ${index}`));
		const h = createIndependentChatBoard(mainWindow.document, chats);
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const view = store.add(h.service.createView(container));

		for (const chat of chats) {
			const card = [...container.querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => element.dataset.chatResource === chat.resource.toString())!;
			const transfer = new mainWindow.DataTransfer();
			card.dispatchEvent(new mainWindow.DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
			container.querySelector('[aria-label="General, P0"]')!.dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
		}

		let notified = 0;
		store.add(view.onDidChangeContentSize(() => notified++));
		const before = notified;
		container.querySelector<HTMLElement>('[aria-label="General, P0"] .project-board-more')!.click();
		assert.ok(notified > before, 'Expanding a column with "+more" must notify the host so its scroll container rescans immediately');
	});

	test('embedded board leaves header actions to the custom view chrome', () => {
		const h = createBoard(mainWindow.document, [new TestChat('Embedded')]);
		const embeddedContainer = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(embeddedContainer);
		store.add(toDisposable(() => embeddedContainer.remove()));
		store.add(h.service.createView(embeddedContainer));

		assert.deepStrictEqual({
			hasBoard: !!embeddedContainer.querySelector('.project-board'),
			hasInlineHeader: !!embeddedContainer.querySelector('.project-board-header'),
			hasOwnScrollbar: !!embeddedContainer.querySelector('.project-board-scrollable'),
			inlineControls: embeddedContainer.querySelectorAll('[data-board-control="add-row"], [data-board-control="add-column"], [data-board-control="show-archived"], [data-board-control="new-session"], [data-board-control="settings"]').length,
		}, {
			hasBoard: true,
			hasInlineHeader: false,
			hasOwnScrollbar: false,
			inlineControls: 0,
		});
	});

	test('embedded card activation follows the side-panel preference and disabling returns focus', async () => {
		const chat = new TestChat('child');
		const { document } = createBoardDocument();
		const h = createBoard(document, [chat]);
		store.add(h.service.createView(h.container));
		const activate = (keyCode?: number) => h.container.querySelector<HTMLElement>('.project-board-card')!.dispatchEvent(keyCode
			? new mainWindow.KeyboardEvent('keydown', { keyCode, bubbles: true, cancelable: true })
			: new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		activate();
		h.service.toggleOpenChatInSidePanel();
		activate();
		assert.strictEqual(h.container.querySelector('.project-board-card')?.getAttribute('aria-current'), 'true');
		activate(13);
		activate(32);
		h.service.toggleOpenChatInSidePanel();
		assert.strictEqual(h.container.querySelector('[aria-current]'), null);
		assert.strictEqual(document.activeElement, h.container.querySelector('.project-board-card'));
		activate();
		assert.deepStrictEqual({ windows: h.opened, sidePanel: h.sidePanelOpened }, {
			windows: [chat.resource, chat.resource],
			sidePanel: [chat.resource, chat.resource, chat.resource],
		});
	});

	suite('current side-panel card', () => {
		function current(container: HTMLElement): HTMLElement | null {
			return container.querySelector<HTMLElement>('.project-board-card-active-chat');
		}

		test('matches provider, owning session and exact child, independently of focus and selection', () => {
			const main = new TestChat('Main');
			const child = new TestChat('Child');
			const { document } = createBoardDocument();
			const h = createBoard(document, [main, child]);
			const otherSessionChat: IChat = { ...child, title: constObservable('Other session') };
			const otherProviderChat: IChat = { ...child, title: constObservable('Other provider') };
			const otherSession = new TestBoardSession([otherSessionChat], 'other');
			const otherProvider: ISession = { ...h.session, providerId: 'other', mainChat: constObservable(otherProviderChat), chats: constObservable([otherProviderChat]) };
			h.state.sessions.push(otherSession, otherProvider);
			store.add(h.service.createView(h.container));
			const cards = [...h.container.querySelectorAll<HTMLElement>('.project-board-card')];
			const card = (title: string) => cards.find(element => element.querySelector('h4')?.textContent === title)!;
			card('Main').querySelector<HTMLElement>('.project-board-card-select')!.click();
			card('Main').focus();
			h.activeSidePanelCardId.set(getProjectBoardCardId(h.session, child), undefined);
			const first = current(h.container);
			assert.ok(h.service.getAccessibleContent().includes('Open in Side Panel'));
			h.activeSidePanelCardId.set(getProjectBoardCardId(otherSession, otherSessionChat), undefined);
			const second = current(h.container);
			h.activeSidePanelCardId.set(getProjectBoardCardId(otherProvider, otherProviderChat), undefined);
			assert.deepStrictEqual({
				first: first?.querySelector('h4')?.textContent, second: second?.querySelector('h4')?.textContent,
				current: current(h.container)?.querySelector('h4')?.textContent,
				count: h.container.querySelectorAll('[aria-current="true"]').length,
				focused: document.activeElement === card('Main'),
				selected: cards.filter(element => element.classList.contains('project-board-card-selected')).map(element => element.querySelector('h4')?.textContent),
				read: [main.isRead.get(), child.isRead.get()], opened: h.opened, sidePanel: h.sidePanelOpened,
			}, { first: 'Child', second: 'Other session', current: 'Other provider', count: 1, focused: true, selected: ['Main'], read: [false, false], opened: [], sidePanel: [] });
			for (const element of cards) {
				const indicator = element.querySelector<HTMLElement>('.project-board-card-active-chat-label')!;
				assert.strictEqual(indicator.hidden, true, 'The current-chat frame must not add a visible label');
				assert.strictEqual(mainWindow.getComputedStyle(indicator).display, 'none');
				assert.strictEqual(element.getAttribute('aria-describedby')?.split(' ').includes(indicator.id), element === current(h.container));
			}
			h.activeSidePanelCardId.set(undefined, undefined);
			assert.strictEqual(h.container.querySelector('[aria-current], .project-board-card-active-chat'), null);
			assert.deepStrictEqual([...h.container.querySelectorAll('.project-board-card')], cards);
		});

		test('updates only card decoration without losing a pending answer, selection or focus', () => {
			const { document } = createBoardDocument();
			const chat = new TestChat('Question');
			chat.status.set(SessionStatus.NeedsInput, undefined);
			const h = createBoard(document, [chat]);
			const carousel = new ChatQuestionCarouselData([{ id: 'answer', type: 'text', title: 'Your answer' }], false, 'current-question');
			h.questionPreview.set({ kind: 'ready', questions: [], permissions: [], unsupported: [], truncated: false }, undefined);
			h.questionCarousels.set([{ carousel, requestId: 'current-request' }], undefined);
			const view = store.add(h.service.createView(h.container));
			let resizeNotifications = 0;
			store.add(view.onDidChangeContentSize(() => resizeNotifications++));
			const card = h.container.querySelector<HTMLElement>('.project-board-card')!;
			card.querySelector<HTMLElement>('.project-board-card-select')!.click();
			const input = card.querySelector<HTMLInputElement>('input[type="text"]')!;
			input.value = 'Keep this answer';
			input.setSelectionRange(2, 6);
			input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
			input.focus();
			h.activeSidePanelCardId.set(getProjectBoardCardId(h.session, chat), undefined);
			h.activeSidePanelCardId.set(undefined, undefined);
			assert.deepStrictEqual({
				sameCard: h.container.querySelector('.project-board-card') === card,
				sameInput: card.querySelector('input[type="text"]') === input, focused: document.activeElement === input,
				answer: input.value, selection: [input.selectionStart, input.selectionEnd],
				selected: card.classList.contains('project-board-card-selected'), resizeNotifications, submitted: h.submittedAnswers,
			}, { sameCard: true, sameInput: true, focused: true, answer: 'Keep this answer', selection: [2, 6], selected: true, resizeNotifications: 2, submitted: [] });
		});

		test('a folded parent names the exact monitored child without becoming current or moving focus', () => {
			const { document } = createBoardDocument();
			const main = new TestChat('Parent');
			const first = new TestChat('First child');
			const second = new TestChat('Second child');
			const h = createBoard(document, [main, first, second]);
			store.add(h.service.createView(h.container));
			const disclosure = h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!;
			const children = h.container.querySelector<HTMLElement>('.project-board-child-cards')!;
			const parent = h.container.querySelector<HTMLElement>('.project-board-card-family > .project-board-card')!;
			const context = h.container.querySelector<HTMLElement>('.project-board-monitored-child-label')!;
			disclosure.focus();
			h.activeSidePanelCardId.set(getProjectBoardCardId(h.session, first), undefined);
			const firstContext = context.textContent;
			h.activeSidePanelCardId.set(getProjectBoardCardId(h.session, second), undefined);
			assert.deepStrictEqual({
				firstContext, currentContext: context.textContent, contextHidden: context.hidden,
				description: disclosure.getAttribute('aria-describedby'), folded: children.hidden,
				focused: document.activeElement === disclosure, parentCurrent: parent.getAttribute('aria-current'),
				currentChats: [...h.container.querySelectorAll<HTMLElement>('[aria-current="true"]')].map(element => element.dataset.chatResource),
				opened: h.opened, sidePanel: h.sidePanelOpened, read: [first.isRead.get(), second.isRead.get()],
			}, {
				firstContext: 'Open in Side Panel: First child', currentContext: 'Open in Side Panel: Second child', contextHidden: false,
				description: context.id, folded: true, focused: true, parentCurrent: null,
				currentChats: [second.resource.toString()], opened: [], sidePanel: [], read: [false, false],
			});
			h.activeSidePanelCardId.set(undefined, undefined);
			assert.deepStrictEqual({
				contextHidden: context.hidden, context: context.textContent, description: disclosure.getAttribute('aria-describedby'),
				folded: children.hidden, focused: document.activeElement === disclosure,
			}, { contextHidden: true, context: '', description: null, folded: true, focused: true });
			h.activeSidePanelCardId.set(getProjectBoardCardId(h.session, second), undefined);
			disclosure.click();
			assert.deepStrictEqual({
				contextHidden: h.container.querySelector<HTMLElement>('.project-board-monitored-child-label')!.hidden,
				folded: h.container.querySelector<HTMLElement>('.project-board-child-cards')!.hidden,
				current: current(h.container)?.dataset.chatResource,
			}, { contextHidden: true, folded: false, current: second.resource.toString() });
		});

		test('only decorates the embedded surface and clears cached boards on switch and reopen', async () => {
			const chat = new TestChat('Shared');
			const h = createBoard(mainWindow.document, [chat]);
			const embedded = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(embedded);
			store.add(toDisposable(() => embedded.remove()));
			const view = store.add(h.service.createView(embedded));
			const first = embedded.querySelector('.project-board')!;
			await h.service.open();
			const cardId = getProjectBoardCardId(h.session, chat);
			h.activeSidePanelCardId.set(cardId, undefined);
			assert.ok(current(embedded));
			assert.strictEqual(current(h.currentContainer), null);
			const second = h.catalog.createBoard('Second');
			h.catalog.selectBoard(second);
			assert.strictEqual(embedded.querySelector('[aria-current]'), null);
			h.activeSidePanelCardId.set(cardId, undefined);
			assert.strictEqual(first.querySelector('[aria-current]'), null);
			assert.ok(embedded.querySelector(`[data-board-id="${second}"] [aria-current="true"]`));
			h.catalog.selectBoard(DEFAULT_PROJECT_BOARD_ID);
			assert.strictEqual(embedded.querySelector('[aria-current]'), null);
			h.activeSidePanelCardId.set(cardId, undefined);
			chat.title.set('Renamed while monitored', undefined);
			assert.strictEqual(current(embedded)?.querySelector('h4')?.textContent, 'Renamed while monitored');
			view.dispose();
			store.add(h.service.createView(embedded));
			assert.strictEqual(current(embedded), null);
			h.activeSidePanelCardId.set(cardId, undefined);
			assert.ok(current(embedded));
			assert.strictEqual(current(h.currentContainer), null);
		});

		test('retains the status stripe and uses contrast-aware borders without replacing selection or focus outlines', () => {
			const h = createBoard(mainWindow.document, [new TestChat('Contrast')]);
			store.add(h.service.createView(h.container));
			h.container.style.setProperty('--vscode-focusBorder', 'rgb(1, 2, 3)');
			h.container.style.setProperty('--vscode-strokeThickness', '1px');
			h.container.style.setProperty('--vscode-progressBar-background', 'rgb(4, 5, 6)');
			h.container.style.setProperty('--vscode-contrastActiveBorder', 'rgb(7, 8, 9)');
			h.activeSidePanelCardId.set(getProjectBoardCardId(h.session, h.session.mainChat.get()), undefined);
			const card = current(h.container)!;
			card.querySelector<HTMLElement>('.project-board-card-select')!.click();
			card.focus();
			const style = mainWindow.getComputedStyle(card);
			assert.deepStrictEqual({
				border: style.borderTopColor, status: style.borderLeftColor, outline: style.outlineColor,
				indicator: card.querySelector<HTMLElement>('.project-board-card-active-chat-label')!.hidden,
				selected: card.classList.contains('project-board-card-selected'),
			}, { border: 'rgb(7, 8, 9)', status: 'rgb(4, 5, 6)', outline: 'rgb(1, 2, 3)', indicator: true, selected: true });
			h.container.style.setProperty('--vscode-contrastActiveBorder', 'initial');
			assert.strictEqual(mainWindow.getComputedStyle(card).borderTopColor, 'rgb(1, 2, 3)');
		});
	});

	test('side-panel preference persists across embedded views but never changes the separate board', async () => {
		const chat = new TestChat('child');
		const h = createBoard(mainWindow.document, [chat]);
		const embeddedContainer = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(embeddedContainer);
		store.add(toDisposable(() => embeddedContainer.remove()));
		const embedded = store.add(h.service.createView(embeddedContainer));
		h.service.toggleOpenChatInSidePanel();
		embedded.dispose();
		embeddedContainer.replaceChildren();
		store.add(h.service.createView(embeddedContainer));
		embeddedContainer.querySelector('.project-board-card')!.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		await h.service.open();
		h.currentContainer.querySelector('.project-board-card')!.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		assert.deepStrictEqual({ windows: h.opened, sidePanel: h.sidePanelOpened }, { windows: [chat.resource], sidePanel: [chat.resource] });
	});

	test('embedded side-panel opening failures notify without opening a standalone fallback', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('child')]);
		store.add(h.service.createView(h.container));
		h.service.toggleOpenChatInSidePanel();
		h.state.navigationError = new Error('Sidebar unavailable');
		const notification = Event.toPromise(h.errors.event);
		h.container.querySelector('.project-board-card')!.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		assert.deepStrictEqual({ error: await notification, windows: h.opened, sidePanel: h.sidePanelOpened }, {
			error: 'The chat could not be opened.', windows: [], sidePanel: [],
		});
	});

	test('PB-20 live action controls retain focus across updates and never open or drag the card', async () => {
		const { document } = createBoardDocument();
		const chat = new TestChat('Pending approval');
		const h = createBoard(document, [chat]);
		const pending = new class extends mock<IProjectBoardPendingActions>() { }();
		const actionElement = mainWindow.document.createElement('div');
		actionElement.className = 'project-board-live-actions';
		const button = mainWindow.document.createElement('button');
		button.textContent = 'Approval boundary';
		actionElement.appendChild(button);
		let disposed = false;
		h.instantiationService.stubInstance(ProjectBoardChatActions, {
			source: pending, element: actionElement, rendersTools: true,
			update() { }, dispose() { disposed = true; },
		});
		h.actions.set(pending, undefined);
		await h.service.open();
		button.focus();
		chat.title.set('Updated approval card', undefined);
		assert.strictEqual(h.container.querySelector('.project-board-live-actions'), actionElement);
		assert.strictEqual(document.activeElement, button);
		const collapse = () => h.container.querySelector<HTMLElement>('[data-board-control="collapse:unassigned"]')!;
		collapse().focus();
		collapse().click();
		assert.ok(actionElement.closest('.project-board-card-list[hidden]'));
		assert.strictEqual(disposed, false, 'Collapsing must retain pending action controls');
		collapse().click();
		assert.strictEqual(h.container.querySelector('.project-board-live-actions'), actionElement);
		button.focus();
		button.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		const drag = new mainWindow.DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new mainWindow.DataTransfer() });
		button.dispatchEvent(drag);
		assert.strictEqual(drag.defaultPrevented, true);
		assert.deepStrictEqual(h.opened, []);
		chat.interactivity.set(ChatInteractivity.ReadOnly, undefined);
		assert.strictEqual(h.container.querySelector('.project-board-live-actions'), null);
		assert.strictEqual(disposed, true);
		assert.strictEqual(chat.isRead.get(), false);
	});

	test('PB-22 collapse controls follow labels at the right edge and axis buttons are frameless', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Header controls')]);
		h.container.style.setProperty('--vscode-button-border', 'red');
		h.container.style.setProperty('--vscode-button-secondaryBorder', 'red');
		h.container.style.setProperty('--vscode-focusBorder', 'rgb(0, 255, 0)');
		await h.service.open();
		for (const header of h.container.querySelectorAll<HTMLElement>('.project-board-axis-controls, .project-board-tray-heading')) {
			const collapse = header.querySelector<HTMLElement>('.project-board-collapse')!;
			assert.strictEqual(header.lastElementChild, collapse, 'DOM and tab order must match the right-side position');
			assert.ok(collapse.getBoundingClientRect().left >= header.firstElementChild!.getBoundingClientRect().right);
			assert.ok(Math.abs(collapse.getBoundingClientRect().right - header.getBoundingClientRect().right) < 1);
			for (const button of header.querySelectorAll<HTMLElement>('.monaco-button')) {
				assert.strictEqual(mainWindow.getComputedStyle(button).borderTopWidth, '0px');
				assert.strictEqual(mainWindow.getComputedStyle(button).backgroundColor, 'rgba(0, 0, 0, 0)');
			}
			collapse.focus();
			assert.strictEqual(mainWindow.document.activeElement, collapse, 'Frameless controls remain keyboard-focusable');
			collapse.blur();
		}
	});

	test('PB-22 collapsed Unassigned retains counts, live attention and drafts without changing chats', async () => {
		const chats = [new TestChat('First'), new TestChat('Second')];
		const h = createBoard(mainWindow.document, chats);
		h.drafts.set([{ id: 'draft', resource: URI.parse('test-draft:/collapse'), hasContent: true, submitted: false }], undefined);
		await h.service.open();
		const tray = () => h.currentContainer.querySelector<HTMLElement>('.project-board-unassigned')!;
		const toggle = () => h.currentContainer.querySelector<HTMLElement>('[data-board-control="collapse:unassigned"]')!;
		toggle().click();
		assert.strictEqual(toggle().getAttribute('aria-expanded'), 'false');
		assert.strictEqual(toggle().getAttribute('aria-controls'), tray().querySelector('.project-board-card-list')!.id);
		assert.strictEqual(mainWindow.getComputedStyle(tray().querySelector('.project-board-card-list')!).display, 'none');
		assert.strictEqual(tray().querySelector('.project-board-collapsed-summary')?.textContent, '3 sessions · 🏃 2 Busy · ✏️ 1 Draft');
		chats[1].status.set(SessionStatus.NeedsInput, undefined);
		assert.strictEqual(tray().querySelector('.project-board-collapsed-summary')?.textContent, '3 sessions · 🏃 1 Busy · 🙋 1 Needs Input · ✏️ 1 Draft');
		assert.strictEqual(tray().querySelector('.project-board-attention'), null);
		assert.strictEqual(toggle().getAttribute('aria-expanded'), 'false');
		toggle().click();
		assert.strictEqual(tray().querySelector<HTMLElement>('.project-board-card-list')!.hidden, false);
		assert.strictEqual(tray().querySelectorAll('.project-board-card').length, 3);
		assert.deepStrictEqual(h.opened, []);
		assert.ok(chats.every(chat => !chat.isRead.get()));
		toggle().click();
		h.closeBoard();
		await h.service.open();
		assert.strictEqual(toggle().getAttribute('aria-expanded'), 'true', 'Collapse is local to the view lifetime');
	});

	test('PB-22 rows and columns collapse independently, reduce layout and retain placements', async () => {
		const chats = [new TestChat('P0 card'), new TestChat('P1 card')];
		const h = createBoard(mainWindow.document, chats);
		h.container.style.cssText = 'width: 1200px; height: 600px; position: relative;';
		await h.service.open();
		await h.moveViaPicker('General, P0', chats[0].resource);
		await h.moveViaPicker('General, P1', chats[1].resource);
		const cell = (column: string) => h.container.querySelector<HTMLElement>(`[aria-label="General, ${column}"]`)!;
		const toggle = (key: string) => h.container.querySelector<HTMLElement>(`[data-board-control="collapse:${key}"]`)!.click();
		const height = cell('P0').getBoundingClientRect().height;
		const width = cell('P1').getBoundingClientRect().width;
		toggle('row:general');
		assert.ok(cell('P0').getBoundingClientRect().height < height);
		assert.ok(cell('P0').querySelector<HTMLElement>('.project-board-card-list')!.hidden);
		toggle('column:p1');
		assert.ok(cell('P1').getBoundingClientRect().width < width);
		assert.strictEqual(cell('P1').querySelector('.project-board-collapsed-summary')?.textContent, '1 session · 🏃 1 Busy');
		toggle('row:general');
		assert.strictEqual(cell('P0').querySelector<HTMLElement>('.project-board-card-list')!.hidden, false);
		assert.strictEqual(cell('P1').querySelector<HTMLElement>('.project-board-card-list')!.hidden, true);
		const p0 = cell('P0').querySelector<HTMLElement>('[data-chat-resource]')!;
		p0.focus();
		p0.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 35, bubbles: true, cancelable: true }));
		assert.notStrictEqual(mainWindow.document.activeElement, cell('P1').querySelector('[data-chat-resource]'), 'End cannot select a collapsed card');
		assert.ok(h.service.getAccessibleContent().includes('General, P1 (collapsed)'));
		toggle('column:p1');
		assert.strictEqual(cell('P1').querySelector('h4')?.textContent, 'P1 card');
		assert.deepStrictEqual(h.opened, []);
	});

	test('collapsed state totals include nested and overflow chats, drafts, and unavailable placements', async () => {
		const chats = ['Busy', 'Input', 'Error', 'Idle', 'Starting', 'Archived'].map(title => new TestChat(title));
		[SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Error, SessionStatus.Completed, SessionStatus.Untitled, SessionStatus.Completed]
			.forEach((status, index) => chats[index].status.set(status, undefined));
		chats[5].isArchived.set(true, undefined);
		const h = createIndependentChatBoard(mainWindow.document, chats);
		const parent = h.state.sessions[0];
		const child = new TestChat('Nested error');
		child.status.set(SessionStatus.Error, undefined);
		assert.ok(parent instanceof TestBoardSession);
		parent.chats.set([chats[0], child], undefined);
		h.drafts.set([
			{ id: 'draft', resource: URI.parse('test-draft:/summary'), hasContent: true, submitted: false },
			{ id: 'starting', resource: URI.parse('test-draft:/starting'), hasContent: true, submitted: true },
		], undefined);
		await h.service.open();
		const toggle = (key: string) => h.container.querySelector<HTMLElement>(`[data-board-control="collapse:${key}"]`)!.click();
		const summary = (selector: string) => h.container.querySelector(`${selector} .project-board-collapsed-summary`)?.textContent;
		toggle('unassigned');
		assert.strictEqual(summary('.project-board-unassigned'), '8 sessions · 🏃 1 Busy · 🙋 1 Needs Input · ⚠️ 2 Error · 😴 1 Idle · ⏳ 2 Starting · ✏️ 1 Draft');
		assert.deepStrictEqual(
			[...h.container.querySelectorAll('.project-board-unassigned > .project-board-collapsed-summary .project-board-state-count-icon')].map(icon => [icon.textContent, icon.getAttribute('aria-hidden')]),
			[['🏃', 'true'], ['🙋', 'true'], ['⚠️', 'true'], ['😴', 'true'], ['⏳', 'true'], ['✏️', 'true']],
		);
		h.catalog.updateBoard(DEFAULT_PROJECT_BOARD_ID, configuration => ({
			...configuration,
			placements: [
				...h.state.sessions.map(session => ({ cardId: getProjectBoardCardId(session, session.mainChat.get()), rowId: 'general', columnId: 'p0' })),
				{ cardId: 'missing', rowId: 'general', columnId: 'p0' },
			],
		}));
		assert.strictEqual(h.container.querySelectorAll('[aria-label="General, P0"] > .project-board-card-list > .project-board-card, [aria-label="General, P0"] > .project-board-card-list > .project-board-card-family').length, 3);
		toggle('row:general');
		toggle('column:p0');
		const expected = '7 sessions · 🏃 1 Busy · 🙋 1 Needs Input · ⚠️ 2 Error · 😴 1 Idle · ⏳ 1 Starting · 🚫 1 Unavailable';
		for (const selector of ['.project-board-row-heading', '.project-board-column-heading', '[aria-label="General, P0"]']) {
			assert.strictEqual(summary(selector), expected);
		}
		assert.strictEqual(summary('.project-board-unassigned'), '2 sessions · ⏳ 1 Starting · ✏️ 1 Draft');
		assert.ok(h.service.getAccessibleContent().includes('7 sessions · 1 Busy · 1 Needs Input · 2 Error · 1 Idle · 1 Starting · 1 Unavailable'));
		assert.ok([...h.container.querySelectorAll('.project-board-state-count-icon')].every(icon => icon.getAttribute('aria-hidden') === 'true'));
		chats[0].status.set(SessionStatus.Completed, undefined);
		child.status.set(SessionStatus.Completed, undefined);
		assert.strictEqual(summary('[aria-label="General, P0"]'), '7 sessions · 🙋 1 Needs Input · ⚠️ 1 Error · 😴 3 Idle · ⏳ 1 Starting · 🚫 1 Unavailable');
		assert.strictEqual(h.container.querySelector('.project-board-child-summary')?.textContent, '1 child chat · 😴 1 Idle');
		assert.deepStrictEqual(h.opened, []);
		assert.ok([...chats, child].every(chat => !chat.isRead.get()));
	});

	test('collapsed list summaries count owning session states instead of nested chat states', () => {
		const h = createBoard(mainWindow.document, [], store.add(new InMemoryStorageService()), true);
		const status = observableValue('summaryStatus', SessionStatus.NeedsInput);
		const chats = [new TestChat('Main'), new TestChat('Child')];
		h.state.sessions = [{ ...createTestSession('Summary session').session, status, chats: constObservable(chats), mainChat: constObservable(chats[0]) }];
		store.add(h.service.createView(h.container));
		h.service.toggleDisplayOption('showSessionList');
		h.container.querySelector<HTMLElement>('[data-board-control="collapse:unassigned"]')!.click();
		const summary = () => h.container.querySelector('.project-board-unassigned .project-board-collapsed-summary')?.textContent;
		assert.strictEqual(summary(), '1 session · 🙋 1 Needs Input');
		status.set(SessionStatus.Completed, undefined);
		assert.strictEqual(summary(), '1 session · 😴 1 Idle');
		h.service.toggleDisplayOption('showSessionList');
		assert.strictEqual(summary(), '2 sessions · 🏃 2 Busy');
	});

	test('PB-22 dropping into a collapsed cell expands its axes and returning from chat reveals its card', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Reveal moved card')]);
		await h.service.open();
		for (const key of ['row:general', 'column:p1']) {
			h.container.querySelector<HTMLElement>(`[data-board-control="collapse:${key}"]`)!.click();
		}
		const transfer = new mainWindow.DataTransfer();
		h.container.querySelector('[data-chat-resource]')!.dispatchEvent(new mainWindow.DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
		h.container.querySelector('[aria-label="General, P1"]')!.dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
		assert.strictEqual(h.container.querySelector('[aria-label="General, P1"] h4')?.textContent, 'Reveal moved card');
		for (const key of ['row:general', 'column:p1']) {
			assert.strictEqual(h.container.querySelector(`[data-board-control="collapse:${key}"]`)?.getAttribute('aria-expanded'), 'true');
			h.container.querySelector<HTMLElement>(`[data-board-control="collapse:${key}"]`)!.click();
		}
		h.state.closedResource = h.session.chats.get()[0].resource;
		await h.service.closeSession(12345);
		assert.strictEqual(h.container.querySelector<HTMLElement>('[aria-label="General, P1"] .project-board-card-list')!.hidden, false);
		assert.deepStrictEqual(h.opened, []);
	});

	test('PB-22 embedded and auxiliary collapse independently while sharing card data', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Both surfaces')]);
		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		store.add(h.service.createView(container));
		await h.service.open();
		container.querySelector<HTMLElement>('[data-board-control="collapse:unassigned"]')!.click();
		assert.strictEqual(container.querySelector<HTMLElement>('.project-board-card-list')!.hidden, true);
		assert.strictEqual(h.container.querySelector<HTMLElement>('.project-board-card-list')!.hidden, false);
		assert.notStrictEqual(container.querySelector('.project-board-unassigned')!.id, h.container.querySelector('.project-board-unassigned')!.id);
	});

	test('PB-18 top-right settings independently toggle metrics and restore across board reopen', async () => {
		const { document } = createBoardDocument();
		const chat = new TestChat('Metrics');
		const h = createBoard(document, [chat]);
		await h.service.open();
		assert.strictEqual(h.container.querySelector('.project-board-header > :last-child')?.getAttribute('data-board-control'), 'settings');
		const settings = h.container.querySelector('[data-board-control="settings"]')!;
		assert.strictEqual(settings.textContent, '');
		assert.ok(settings.classList.contains('codicon-settings-gear'));
		assert.strictEqual(settings.getAttribute('aria-label'), 'Board settings');
		assert.strictEqual(h.container.querySelector('.project-board-card-duration, .project-board-card-credits'), null);
		const toggle = async (id: string, checked: boolean) => {
			const button = h.currentContainer.querySelector<HTMLElement>('[data-board-control="settings"]')!;
			button.focus();
			button.click();
			assert.strictEqual(h.contextMenu.delegate?.domForShadowRoot, h.currentContainer);
			const action = h.contextMenu.delegate!.getActions().find(action => action.id === id)!;
			assert.strictEqual(action.checked, checked);
			await action.run();
		};
		await toggle('projectBoard.settings.stateDuration', false);
		assert.ok(h.container.querySelector('.project-board-card-duration'));
		assert.strictEqual(h.container.querySelector('.project-board-card-credits'), null);
		await toggle('projectBoard.settings.credits', false);
		assert.strictEqual(h.container.querySelector('.project-board-card-credits')?.getAttribute('aria-label'), 'AI credits: unavailable');
		for (const [value, amount] of [[0, '0 credits'], [1, '1 credit'], [100, '100 credits'], [1234, '1,234 credits'], [12.5, '12.5 credits']] as const) {
			h.credits.set(value, undefined);
			const credits = h.container.querySelector('.project-board-card-credits')!;
			assert.deepStrictEqual({
				text: credits.textContent,
				label: credits.getAttribute('aria-label'),
			}, {
				text: amount,
				label: `AI credits: ${amount}`,
			});
		}
		const metrics = h.container.querySelector('.project-board-card-metrics')!;
		assert.ok(metrics.parentElement?.classList.contains('project-board-card-status-bar'));
		assert.strictEqual(metrics.parentElement?.lastElementChild, metrics);
		assert.strictEqual(metrics.parentElement?.parentElement?.lastElementChild, metrics.parentElement);
		assert.strictEqual(metrics.querySelector('.project-board-card-credits')?.textContent, '12.5 credits');
		assert.ok(metrics.querySelector('.codicon-credit-card[aria-hidden="true"]'));
		assert.ok(metrics.querySelector('.codicon-clock[aria-hidden="true"]'));
		assert.strictEqual(document.activeElement?.getAttribute('data-board-control'), 'settings');
		await toggle('projectBoard.settings.stateDuration', true);
		assert.strictEqual(h.container.querySelector('.project-board-card-duration'), null);
		h.closeBoard();
		await h.service.open();
		assert.strictEqual(h.currentContainer.querySelector('.project-board-card-duration'), null);
		assert.strictEqual(h.currentContainer.querySelector('.project-board-card-credits')?.getAttribute('aria-label'), 'AI credits: 12.5 credits');
		await toggle('projectBoard.settings.credits', true);
		assert.strictEqual(h.currentContainer.querySelector('.project-board-card-credits'), null);
		assert.ok(h.includeCredits.calledWith(false));
		assert.deepStrictEqual(h.opened, []);
		assert.strictEqual(chat.isRead.get(), false);
	});

	test('PB-22 collapsed tray counts honor auto-include without discarding drafts', () => {
		const h = createBoard(mainWindow.document, [new TestChat('Unplaced chat')]);
		h.drafts.set([{ id: 'draft', resource: URI.parse('test-draft:/inclusion'), hasContent: true, submitted: false }], undefined);
		store.add(h.service.createView(h.container));
		h.container.querySelector<HTMLElement>('[data-board-control="collapse:unassigned"]')!.click();
		const summary = () => h.container.querySelector('.project-board-unassigned .project-board-collapsed-summary')?.textContent;
		assert.strictEqual(summary(), '2 sessions · 🏃 1 Busy · ✏️ 1 Draft');
		h.service.toggleAutoIncludeSessions();
		assert.strictEqual(summary(), '0 sessions');
		assert.strictEqual(h.container.querySelectorAll('.project-board-unassigned .project-board-card').length, 0);
		assert.strictEqual(h.drafts.get().length, 1);
		h.service.toggleAutoIncludeSessions();
		assert.strictEqual(summary(), '2 sessions · 🏃 1 Busy · ✏️ 1 Draft');
		assert.strictEqual(h.container.querySelectorAll('.project-board-unassigned .project-board-card').length, 2);
		assert.strictEqual(h.container.querySelector<HTMLElement>('.project-board-unassigned .project-board-card-list')!.hidden, true);
		assert.deepStrictEqual(h.state.deletedDrafts, []);
	});

	test('auto-include sessions hides unplaced chats and a Sessions list drop reveals and places them in a collapsed cell', () => {
		const chats = [new TestChat('First chat'), new TestChat('Second chat')];
		const h = createBoard(mainWindow.document, chats);
		store.add(h.service.createView(h.container));
		assert.strictEqual(h.container.querySelectorAll('.project-board-unassigned .project-board-card').length, 2);

		h.service.toggleAutoIncludeSessions();
		assert.strictEqual(h.container.querySelectorAll('.project-board-card').length, 0);
		assert.ok(h.container.querySelector('.project-board-unassigned'));

		const dataTransfer = new mainWindow.DataTransfer();
		dataTransfer.setData(SessionsDataTransfers.SESSION, JSON.stringify({
			sessionId: h.session.sessionId,
			resource: h.session.resource.toString(),
		}));

		h.container.querySelector<HTMLElement>('[data-board-control="collapse:row:general"]')!.click();
		h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p1"]')!.click();
		const target = h.container.querySelector<HTMLElement>('[aria-label="General, P1"]')!;
		const dragOver = new mainWindow.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer });
		target.dispatchEvent(dragOver);
		target.dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));

		assert.deepStrictEqual({
			accepted: dragOver.defaultPrevented,
			placed: [...h.container.querySelectorAll('[aria-label="General, P1"] h4')].map(element => element.textContent),
			unassigned: h.container.querySelectorAll('.project-board-unassigned .project-board-card').length,
		}, {
			accepted: true,
			placed: ['First chat', 'Second chat'],
			unassigned: 0,
		});
		assert.strictEqual(h.container.querySelector<HTMLElement>('[aria-label="General, P1"] .project-board-card-list')!.hidden, false);
		assert.strictEqual(h.container.querySelector('[data-board-control="collapse:row:general"]')!.getAttribute('aria-expanded'), 'true');
		assert.strictEqual(h.container.querySelector('[data-board-control="collapse:column:p1"]')!.getAttribute('aria-expanded'), 'true');
	});

	test('PB-18 reported credit increments remain visible while the session is running', async () => {
		const chat = new TestChat('Live credits');
		const h = createBoard(mainWindow.document, [chat]);
		h.credits.set(12.5, undefined);
		await h.service.open();
		h.container.querySelector<HTMLElement>('[data-board-control="settings"]')!.click();
		await h.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.settings.credits')!.run();
		const label = () => h.container.querySelector('.project-board-card-credits')!.textContent;
		const previous = label();
		h.credits.set(12.6, undefined);
		assert.notStrictEqual(label(), previous, 'A reported credit increment must not disappear through dollar conversion and rounding');
		assert.strictEqual(label(), '12.6 credits');
		assert.strictEqual(chat.status.get(), SessionStatus.InProgress);
		assert.deepStrictEqual(h.opened, []);
	});

	test('PB-18 bottom status bar wraps transparent metrics after the timestamp and retains credit hover', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Metrics layout')]);
		const hover = sinon.spy(h.instantiationService.invokeFunction(accessor => accessor.get(IHoverService)), 'setupDelayedHover');
		store.add(toDisposable(() => hover.restore()));
		h.credits.set(12.5, undefined);
		await h.service.open();
		for (const id of ['projectBoard.settings.stateDuration', 'projectBoard.settings.credits']) {
			h.container.querySelector<HTMLElement>('[data-board-control="settings"]')!.click();
			await h.contextMenu.delegate!.getActions().find(action => action.id === id)!.run();
		}
		const card = h.container.querySelector<HTMLElement>('[data-chat-resource]')!;
		const metrics = card.querySelector<HTMLElement>('.project-board-card-metrics')!;
		const credits = metrics.querySelector<HTMLElement>('.project-board-card-credits')!;
		const statusBar = card.querySelector<HTMLElement>('.project-board-card-status-bar')!;
		const timestamp = statusBar.querySelector<HTMLElement>('.project-board-card-recency')!;
		assert.strictEqual(card.lastElementChild, statusBar);
		assert.strictEqual(statusBar.firstElementChild, timestamp);
		const options = hover.getCalls().findLast(call => call.args[0] === credits)?.args[1];
		const hoverContent = (typeof options === 'function' ? options() : options)?.content;
		assert.ok(typeof hoverContent === 'string');
		assert.ok(hoverContent.includes('AI credits: 12.5 credits'));
		assert.ok(hoverContent.includes('including subagents'));
		assert.ok(hoverContent.includes('after each model call or when a turn ends'));
		assert.ok(hoverContent.includes('not currency'));
		for (const width of [260, 180, 140]) {
			card.style.width = `${width}px`;
			const bounds = metrics.getBoundingClientRect();
			const pills = [...metrics.children].map(pill => pill.getBoundingClientRect());
			assert.ok(pills.every(pill => pill.left >= bounds.left && pill.right <= bounds.right + 1));
			assert.ok(card.querySelector('h4')!.getBoundingClientRect().bottom <= bounds.top);
			assert.ok(timestamp.getBoundingClientRect().left < bounds.left || timestamp.getBoundingClientRect().bottom <= bounds.top);
			assert.ok(bounds.right <= statusBar.getBoundingClientRect().right + 1);
			assert.ok(Math.max(...pills.map(pill => pill.right)) >= bounds.right - 1, 'Pills align to the right');
		}
		assert.strictEqual(mainWindow.getComputedStyle(metrics).flexWrap, 'wrap');
		for (const pill of metrics.children) {
			assert.strictEqual(mainWindow.getComputedStyle(pill).backgroundColor, 'rgba(0, 0, 0, 0)');
		}
		assert.deepStrictEqual(h.opened, []);
	});

	test('PB-18 last prompt toggle controls the visible prompt and restores without hiding status or timestamp', async () => {
		const chat = new TestChat('Last prompt');
		const h = createBoard(mainWindow.document, [chat]);
		h.metadata.set({ kind: 'ready', prompt: 'The visible user prompt', submittedAt: 1000, context: [] }, undefined);
		await h.service.open();
		assert.strictEqual(h.container.querySelector('.project-board-card-prompt')?.textContent, 'The visible user prompt');
		const toggle = async (expected: boolean) => {
			h.currentContainer.querySelector<HTMLElement>('[data-board-control="settings"]')!.click();
			assert.ok(!h.contextMenu.delegate!.getActions().some(action => action.id === 'projectBoard.settings.description'));
			const action = h.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.settings.lastPrompt')!;
			assert.strictEqual(action.checked, expected);
			await action.run();
		};
		await toggle(true);
		h.metadata.set({ kind: 'ready', prompt: 'Updated while hidden', submittedAt: 2000, context: [] }, undefined);
		await timeout(0);
		assert.strictEqual(h.container.querySelector('.project-board-card-prompt'), null);
		assert.ok(h.container.querySelector('[data-submitted-at="2000"]'));
		assert.ok(h.container.querySelector('.project-board-card-status'));
		assert.strictEqual(h.container.querySelector('.project-board-card-metrics'), null);
		h.closeBoard();
		await h.service.open();
		assert.strictEqual(h.currentContainer.querySelector('.project-board-card-prompt'), null);
		await toggle(false);
		assert.strictEqual(h.currentContainer.querySelector('.project-board-card-prompt')?.textContent, 'Updated while hidden');
		assert.deepStrictEqual(h.opened, []);
		assert.strictEqual(chat.isRead.get(), false);
	});

	test('PB-19 model and permission detail rows toggle independently without opening chats', async () => {
		const chat = new TestChat('Configuration rows');
		chat.modelId.set('model-specific-to-this-chat', undefined);
		chat.mode.set({ id: 'reviewer', kind: 'agent' }, undefined);
		const h = createBoard(mainWindow.document, [chat]);
		await h.service.open();
		assert.strictEqual(h.container.querySelector('.project-board-card-configuration'), null);
		const toggle = async (id: string) => {
			h.currentContainer.querySelector<HTMLElement>('[data-board-control="settings"]')!.click();
			await h.contextMenu.delegate!.getActions().find(action => action.id === id)!.run();
		};
		await toggle('projectBoard.settings.modelDetails');
		assert.ok(h.container.querySelector('.project-board-card-model')?.textContent?.includes('model-specific-to-this-chat'));
		assert.strictEqual(h.container.querySelector('.project-board-card-permissions'), null);
		await toggle('projectBoard.settings.permissionDetails');
		assert.ok(h.container.querySelector('.project-board-card-permissions')?.textContent?.includes('reviewer'));
		for (const row of h.container.querySelectorAll<HTMLElement>('.project-board-card-configuration')) {
			assert.strictEqual(mainWindow.getComputedStyle(row).whiteSpace, 'nowrap', 'Each detail group is one compact row');
		}
		chat.modelId.set('updated-model', undefined);
		assert.ok(h.container.querySelector('.project-board-card-model')?.textContent?.includes('updated-model'));
		h.closeBoard();
		await h.service.open();
		assert.strictEqual(h.currentContainer.querySelectorAll('.project-board-card-configuration').length, 2);
		await toggle('projectBoard.settings.modelDetails');
		assert.strictEqual(h.currentContainer.querySelector('.project-board-card-model'), null);
		assert.ok(h.currentContainer.querySelector('.project-board-card-permissions'));
		assert.deepStrictEqual(h.opened, []);
		assert.strictEqual(chat.isRead.get(), false);
	});

	test('PB-18 relative prompt times refresh without the state timer and retain the full timestamp hover', async () => {
		const { document } = createBoardDocument();
		const submittedAt = new Date('2026-09-29T20:00:00Z').getTime();
		const clock = sinon.useFakeTimers({ now: submittedAt + 3600000, toFake: ['Date'] });
		store.add(toDisposable(() => clock.restore()));
		const h = createBoard(document, [new TestChat('Relative timestamp')]);
		h.metadata.set({ kind: 'ready', prompt: 'Known prompt', submittedAt, context: [] }, undefined);
		const hover = sinon.spy(h.instantiationService.invokeFunction(accessor => accessor.get(IHoverService)), 'setupDelayedHover');
		const interval = sinon.spy(document.defaultView!, 'setInterval');
		const clearInterval = sinon.spy(document.defaultView!, 'clearInterval');
		store.add(toDisposable(() => { hover.restore(); interval.restore(); clearInterval.restore(); }));
		await h.service.open();
		const card = h.container.querySelector<HTMLElement>('[data-chat-resource]')!;
		const recency = card.querySelector<HTMLElement>('.project-board-card-recency')!;
		const fullTimestamp = `Last prompt: ${new Date(submittedAt).toLocaleString()}`;
		const options = hover.getCalls().findLast(call => call.args[0] === recency)?.args[1];
		assert.deepStrictEqual({
			text: recency.textContent,
			aria: recency.getAttribute('aria-label'),
			time: recency.dataset.submittedAt,
			hover: (typeof options === 'function' ? options() : options)?.content,
			stateTimer: card.querySelector('.project-board-card-duration'),
		}, { text: '1 hour ago', aria: fullTimestamp, time: String(submittedAt), hover: fullTimestamp, stateTimer: null });
		card.focus();
		clock.tick(3600000);
		interval.lastCall.args[0]();
		assert.deepStrictEqual({
			text: recency.textContent,
			cardPreserved: h.container.querySelector('[data-chat-resource]') === card,
			focused: document.activeElement === card,
			aria: recency.getAttribute('aria-label'),
		}, { text: '2 hours ago', cardPreserved: true, focused: true, aria: fullTimestamp });
		h.metadata.set({ kind: 'ready', prompt: 'Newer prompt', submittedAt: Date.now() - 60000, context: [] }, undefined);
		await timeout(0);
		assert.strictEqual(h.container.querySelector('.project-board-card-recency')?.textContent, '1 minute ago');
		h.metadata.set({ kind: 'ready', prompt: 'Unknown time', context: [] }, undefined);
		await timeout(0);
		const unknown = h.container.querySelector('.project-board-card-recency')!;
		assert.deepStrictEqual({ text: unknown.textContent, aria: unknown.getAttribute('aria-label') }, { text: 'Recency unavailable', aria: null });
		h.closeBoard();
		await Promise.resolve();
		assert.strictEqual(clearInterval.callCount, interval.callCount);
		assert.deepStrictEqual(h.opened, []);
	});

	test('PB-18 busy timer colors cross strict thresholds on ticks and reset with state changes', async () => {
		const clock = sinon.useFakeTimers({ now: 10000, toFake: ['Date'] });
		store.add(toDisposable(() => clock.restore()));
		const chat = new TestChat('Busy thresholds');
		const h = createBoard(mainWindow.document, [chat]);
		h.container.style.setProperty('--vscode-descriptionForeground', 'rgb(128, 128, 128)');
		h.container.style.setProperty('--vscode-agentsHub-busyTimerWarningForeground', 'rgb(209, 134, 22)');
		h.container.style.setProperty('--vscode-editorError-foreground', 'rgb(241, 76, 76)');
		const interval = sinon.spy(mainWindow, 'setInterval');
		store.add(toDisposable(() => interval.restore()));
		await h.service.open();
		h.container.querySelector<HTMLElement>('[data-board-control="settings"]')!.click();
		await h.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.settings.stateDuration')!.run();
		const card = h.container.querySelector('[data-chat-resource]')!;
		const duration = card.querySelector('.project-board-card-duration')!;
		const tick = interval.lastCall.args[0];
		let elapsed = 0;
		for (const [next, warning, error, color] of [
			[1800000, false, false, 'rgb(128, 128, 128)'],
			[1800001, true, false, 'rgb(209, 134, 22)'],
			[7200000, true, false, 'rgb(209, 134, 22)'],
			[7200001, false, true, 'rgb(241, 76, 76)'],
		] as const) {
			clock.tick(next - elapsed);
			elapsed = next;
			tick();
			assert.deepStrictEqual({
				warning: duration.classList.contains('project-board-card-duration-warning'),
				error: duration.classList.contains('project-board-card-duration-error'),
				color: mainWindow.getComputedStyle(duration).color,
				cardPreserved: h.container.querySelector('[data-chat-resource]') === card,
				iconPreserved: !!duration.querySelector('.codicon-clock'),
			}, { warning, error, color, cardPreserved: true, iconPreserved: true });
		}
		h.container.style.setProperty('--vscode-agentsHub-busyTimerWarningForeground', 'rgb(255, 204, 0)');
		h.container.style.setProperty('--vscode-editorError-foreground', 'rgb(255, 0, 0)');
		clock.setSystemTime(10000 + 1800001);
		tick();
		assert.strictEqual(mainWindow.getComputedStyle(duration).color, 'rgb(255, 204, 0)', 'Timer responds to high-contrast theme colors');
		clock.setSystemTime(10000 + 7200001);
		tick();
		assert.strictEqual(mainWindow.getComputedStyle(duration).color, 'rgb(255, 0, 0)', 'Timer responds to the error foreground');
		chat.title.set('Renamed while busy', undefined);
		assert.ok(h.container.querySelector('.project-board-card-duration-error'), 'Rerender keeps the observed busy age and severity');
		chat.status.set(SessionStatus.NeedsInput, undefined);
		assert.strictEqual(h.container.querySelector('.project-board-card-duration-warning, .project-board-card-duration-error'), null);
		clock.tick(8000000);
		interval.lastCall.args[0]();
		assert.strictEqual(h.container.querySelector('.project-board-card-duration-warning, .project-board-card-duration-error'), null);
		chat.status.set(SessionStatus.InProgress, undefined);
		assert.strictEqual(h.container.querySelector('.project-board-card-duration')?.textContent, '00:00');
		assert.strictEqual(h.container.querySelector('.project-board-card-duration-warning, .project-board-card-duration-error'), null);
	});

	test('PB-18 timer ticks update only text and preserve focused cards, state age and scroll', async () => {
		const { document } = createBoardDocument();
		const clock = sinon.useFakeTimers({ now: 10000, toFake: ['Date'] });
		store.add(toDisposable(() => clock.restore()));
		const chat = new TestChat('Timer');
		const h = createBoard(document, [chat]);
		const interval = sinon.spy(document.defaultView!, 'setInterval');
		const clearInterval = sinon.spy(document.defaultView!, 'clearInterval');
		store.add(toDisposable(() => { interval.restore(); clearInterval.restore(); }));
		await h.service.open();
		assert.strictEqual(interval.callCount, 0);
		h.container.querySelector<HTMLElement>('[data-board-control="settings"]')!.click();
		await h.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.settings.stateDuration')!.run();
		const card = h.container.querySelector<HTMLElement>('[data-chat-resource]')!;
		card.focus();
		const duration = card.querySelector('.project-board-card-duration')!;
		const board = h.container.querySelector<HTMLElement>('.project-board')!;
		board.style.height = '80px';
		board.scrollTop = 20;
		const scrollTop = board.scrollTop;
		clock.tick(61000);
		interval.lastCall.args[0]();
		assert.strictEqual(duration.textContent, '≥ 01:01');
		assert.strictEqual(duration.getAttribute('aria-label'), 'Time in state: at least 01:01');
		assert.ok(duration.querySelector('.codicon-clock'), 'Timer updates must preserve the icon');
		assert.strictEqual(h.container.querySelector('[data-chat-resource]'), card);
		assert.strictEqual(document.activeElement, card);
		assert.strictEqual(board.scrollTop, scrollTop);
		chat.status.set(SessionStatus.NeedsInput, undefined);
		assert.strictEqual(h.container.querySelector('.project-board-card-duration')?.textContent, '00:00');
		clock.tick(2000);
		chat.title.set('Renamed', undefined);
		assert.strictEqual(h.container.querySelector('.project-board-card-duration')?.textContent, '00:02');
		h.closeBoard();
		await Promise.resolve();
		assert.strictEqual(clearInterval.callCount, interval.callCount);
		assert.deepStrictEqual(h.opened, []);
		assert.strictEqual(chat.isRead.get(), false);
	});

	test('PB-18 drafts have no metrics, archived cards have no timer, and credit failures notify once', async () => {
		const chat = new TestChat('Billing');
		const h = createBoard(mainWindow.document, [chat]);
		h.drafts.set([{ id: 'draft', resource: URI.parse('test-draft:session'), hasContent: true, submitted: false }], undefined);
		const notifications: string[] = [];
		store.add(h.errors.event(message => notifications.push(message)));
		await h.service.open();
		for (const id of ['projectBoard.settings.stateDuration', 'projectBoard.settings.credits']) {
			h.container.querySelector<HTMLElement>('[data-board-control="settings"]')!.click();
			await h.contextMenu.delegate!.getActions().find(action => action.id === id)!.run();
		}
		assert.strictEqual(h.container.querySelector('.project-board-card-draft .project-board-card-duration, .project-board-card-draft .project-board-card-credits'), null);
		h.creditsError.set('Invalid reported usage', undefined);
		chat.title.set('Renamed billing', undefined);
		assert.deepStrictEqual(notifications, ['Could not read AI credit usage for "Billing".']);
		assert.strictEqual(h.container.querySelector('.project-board-card-credits')?.getAttribute('aria-label'), 'AI credits: unavailable');
		chat.isArchived.set(true, undefined);
		h.container.querySelector<HTMLElement>('[data-board-control="show-archived"]')!.click();
		assert.strictEqual(h.container.querySelector('.project-board-card-duration'), null);
		assert.ok(h.container.querySelector('.project-board-card-credits'));
	});

	test('PB-01 disposes the window and its live observers', async () => {
		const chat = new TestChat('child');
		const { service, container, state } = createBoard(mainWindow.document.implementation.createHTMLDocument(), [chat]);
		await service.open();
		service.dispose();
		const rendered = container.textContent;
		chat.title.set('After disposal', undefined);
		assert.strictEqual(state.disposeCount, 1);
		assert.strictEqual(container.textContent, rendered);
	});

	test('PB-02/PB-16 an Agents draft stays hidden until it becomes one live unassigned chat', async () => {
		const chat = new TestChat('Agents-created chat');
		const h = createBoard(mainWindow.document);
		await h.service.open();
		h.session.title.set('Agents draft', undefined);
		h.session.chats.set([chat], undefined);
		h.newSession.set(h.session, undefined);
		assert.strictEqual(h.container.querySelectorAll('.project-board-card').length, 0);
		assert.ok(h.container.querySelector('.project-board-unassigned .project-board-empty'));
		assert.strictEqual(h.newSession.get(), h.session);
		assert.strictEqual(h.session.title.get(), 'Agents draft');
		assert.strictEqual(h.container.querySelector('[data-chat-resource]'), null, 'Unsent Agents drafts must not load or open a new backend chat');
		h.state.sessions = [h.session];
		h.sessionsChanged.fire({ added: [h.session], removed: [], changed: [] });
		assert.strictEqual(h.container.querySelectorAll('.project-board-card').length, 0);
		h.newSession.set(undefined, undefined);
		assert.deepStrictEqual({
			cards: h.container.querySelectorAll('.project-board-card').length,
			title: h.container.querySelector('.project-board-unassigned h4')?.textContent,
			resource: h.container.querySelector('[data-chat-resource]')?.getAttribute('data-chat-resource'),
			ownedDrafts: h.drafts.get().length,
			opened: h.opened.length,
			read: chat.isRead.get(),
		}, { cards: 1, title: 'Agents-created chat', resource: chat.resource.toString(), ownedDrafts: 0, opened: 0, read: false });
	});

	test('PB-02 an Agents draft is excluded from collapsed counts and discarding it leaves the board unchanged', async () => {
		const h = createBoard(mainWindow.document);
		await h.service.open();
		h.newSession.set(h.session, undefined);
		h.container.querySelector<HTMLElement>('[data-board-control="collapse:unassigned"]')!.click();
		assert.strictEqual(h.container.querySelector('.project-board-unassigned .project-board-collapsed-summary')?.textContent, '0 sessions');
		h.newSession.set(undefined, undefined);
		assert.deepStrictEqual({
			cards: h.container.querySelectorAll('.project-board-card').length,
			ownedDrafts: h.drafts.get().length,
			opened: h.opened.length,
		}, { cards: 0, ownedDrafts: 0, opened: 0 });
	});

	test('PB-03 card context menus offer axis moves; keyboard movement retains its searchable picker', async () => {
		const chat = new TestChat('Keyboard movement');
		const h = createBoard(mainWindow.document, [chat]);
		await h.service.open();
		const event = new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		h.container.querySelector('.project-board-card')!.dispatchEvent(event);
		assert.deepStrictEqual(h.contextMenu.delegate?.getActions().map(action => action.label), ['Mark as Done', 'Move to row', 'Move to column']);
		assert.strictEqual(event.defaultPrevented, true);
		h.contextMenu.delegate!.onHide?.(true);
		for (const key of [{ keyCode: 121, shiftKey: true }, { keyCode: 93 }]) {
			const event = new mainWindow.KeyboardEvent('keydown', { ...key, bubbles: true, cancelable: true });
			h.container.querySelector('.project-board-card')!.dispatchEvent(event);
			assert.strictEqual(event.defaultPrevented, false);
		}
		assert.strictEqual(h.pick.callCount, 0);
		await h.moveViaPicker('General, P1');
		assert.deepStrictEqual(h.quickInput.labels, ['Unassigned', 'General, P0', 'General, P1', 'General, P2', 'General, P3']);
		assert.strictEqual(h.container.querySelector('[aria-label="General, P1"] h4')?.textContent, 'Keyboard movement');
		await h.moveViaPicker('Unassigned');
		assert.strictEqual(h.container.querySelector('.project-board-unassigned h4')?.textContent, 'Keyboard movement');
		h.quickInput.selectedLabel = undefined;
		await h.moveViaPicker('Cancel picker');
		assert.strictEqual(h.container.querySelector('.project-board-unassigned h4')?.textContent, 'Keyboard movement');
		assert.strictEqual(chat.isRead.get(), false);
	});

	suite('card axis move menus', () => {
		function openMenu(h: ReturnType<typeof createBoard>, chat: IChat) {
			const card = [...h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => element.dataset.chatResource === chat.resource.toString())!;
			card.dispatchEvent(new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			return h.contextMenu.delegate!.getActions();
		}

		function moveAction(h: ReturnType<typeof createBoard>, chat: IChat, kind: 'row' | 'column', label: string) {
			const submenu = openMenu(h, chat).find(action => action.id === `projectBoard.card.move.${kind}`);
			assert.ok(submenu instanceof SubmenuAction);
			const action = submenu.actions.find(action => action.label === label);
			assert.ok(action);
			return action;
		}

		function addRow(h: ReturnType<typeof createBoard>) {
			h.catalog.updateBoard(DEFAULT_PROJECT_BOARD_ID, configuration => ({
				...configuration, rows: [...configuration.rows, { id: 'backlog', label: 'Backlog' }],
			}));
		}

		function placements(h: ReturnType<typeof createBoard>) {
			return h.catalog.boards.get()[0].configuration.placements.map(({ cardId, rowId, columnId }) => ({ cardId, rowId, columnId }));
		}

		test('excludes current axes, preserves the other coordinate, expands destinations and restores focus', async () => {
			const { document } = createBoardDocument();
			document.hasFocus = () => true;
			const chat = new TestChat('Move me');
			const h = createBoard(document, [chat]);
			addRow(h);
			await h.service.open();
			await moveAction(h, chat, 'column', 'P2').run();
			const menus = openMenu(h, chat).filter((action): action is SubmenuAction => action instanceof SubmenuAction);
			assert.deepStrictEqual(menus.map(menu => [menu.label, menu.actions.map(action => action.label)]), [
				['Move to row', ['Backlog']], ['Move to column', ['P0', 'P1', 'P3']],
			]);
			h.contextMenu.delegate!.onHide?.(true);
			h.container.querySelector<HTMLElement>('[data-board-control="collapse:row:backlog"]')!.click();
			await moveAction(h, chat, 'row', 'Backlog').run();
			assert.strictEqual(h.container.querySelector('[data-board-control="collapse:row:backlog"]')?.getAttribute('aria-expanded'), 'true');
			h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p3"]')!.click();
			await moveAction(h, chat, 'column', 'P3').run();
			assert.deepStrictEqual(placements(h), [{ cardId: getProjectBoardCardId(h.session, chat), rowId: 'backlog', columnId: 'p3' }]);
			assert.strictEqual(h.container.querySelector('[data-board-control="collapse:column:p3"]')?.getAttribute('aria-expanded'), 'true');
			assert.strictEqual(document.activeElement?.getAttribute('data-chat-resource'), chat.resource.toString());
			assert.deepStrictEqual(h.opened, []);
			assert.strictEqual(chat.isRead.get(), false);
		});

		test('an Unassigned row move uses the first column and leaves other boards unchanged', async () => {
			const chat = new TestChat('Unassigned');
			const h = createBoard(mainWindow.document, [chat]);
			addRow(h);
			const other = h.catalog.createBoard('Other');
			await h.service.open();
			await moveAction(h, chat, 'row', 'Backlog').run();
			assert.deepStrictEqual(placements(h), [{ cardId: getProjectBoardCardId(h.session, chat), rowId: 'backlog', columnId: 'p0' }]);
			assert.deepStrictEqual(h.catalog.boards.get().find(board => board.id === other)!.configuration.placements, []);
		});

		test('menu-restored card focus does not remove a header before its incoming click', async () => {
			const { document } = createBoardDocument();
			document.hasFocus = () => true;
			const chat = new TestChat('Move then collapse');
			const h = createBoard(document, [chat]);
			await h.service.open();
			await moveAction(h, chat, 'column', 'P3').run();
			chat.title.set('Moved', undefined);
			const card = h.container.querySelector<HTMLElement>('[data-chat-resource]')!;
			const control = h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p3"]')!;
			const activeElement = sinon.stub(document, 'activeElement').get(() => document.body);
			try {
				card.dispatchEvent(new mainWindow.FocusEvent('focusout', { bubbles: true, relatedTarget: control }));
				await Promise.resolve();
				assert.ok(control.isConnected, 'The pending native click must retain its original target');
			} finally {
				activeElement.restore();
			}
			control.focus();
			control.click();
			assert.strictEqual(h.container.querySelector('[data-board-control="collapse:column:p3"]')?.getAttribute('aria-expanded'), 'false');
		});

		test('child axis moves use inherited coordinates and create only that child override', async () => {
			const parent = new TestChat('Parent');
			const child = new TestChat('Child');
			const h = createBoard(mainWindow.document, [parent, child]);
			addRow(h);
			await h.service.open();
			await moveAction(h, parent, 'column', 'P1').run();
			await moveAction(h, child, 'row', 'Backlog').run();
			await moveAction(h, parent, 'column', 'P2').run();
			assert.deepStrictEqual(placements(h), [
				{ cardId: getProjectBoardCardId(h.session, child), rowId: 'backlog', columnId: 'p1' },
				{ cardId: getProjectBoardCardId(h.session, parent), rowId: 'general', columnId: 'p2' },
			]);
			assert.strictEqual(h.container.querySelectorAll('.project-board-child-cards').length, 0);
		});

		test('moves cards without rename or archive actions and disables axes with no alternatives', async () => {
			const chat = new TestChat('Starting');
			chat.status.set(SessionStatus.Untitled, undefined);
			const h = createBoard(mainWindow.document, [chat]);
			await h.service.open();
			assert.deepStrictEqual(openMenu(h, chat).map(action => action.label), ['Move to row', 'Move to column']);
			await moveAction(h, chat, 'column', 'P1').run();
			assert.strictEqual(openMenu(h, chat).find(action => action.label === 'Move to row')?.enabled, false);
			h.contextMenu.delegate!.onHide?.(true);
			h.contextMenu.delegate = undefined;
			assert.strictEqual(h.container.querySelector('.project-board-card .monaco-button'), null, 'Unsent cards have neither Done nor Delete');
			chat.status.set(SessionStatus.Completed, undefined);
			const control = h.container.querySelector('.project-board-card .monaco-button')!;
			const event = new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
			control.dispatchEvent(event);
			assert.strictEqual(event.defaultPrevented, false);
			assert.strictEqual(h.contextMenu.delegate, undefined, 'Nested controls retain their own context menu');
		});

		test('uses the latest counterpart coordinate when a menu was opened before another move', async () => {
			const chat = new TestChat('Concurrent move');
			const h = createBoard(mainWindow.document, [chat]);
			addRow(h);
			await h.service.open();
			const action = moveAction(h, chat, 'row', 'Backlog');
			h.catalog.updateBoard(DEFAULT_PROJECT_BOARD_ID, configuration => ({
				...configuration, placements: [{ cardId: getProjectBoardCardId(h.session, chat), rowId: 'general', columnId: 'p3' }],
			}));
			await action.run();
			assert.deepStrictEqual(placements(h), [{ cardId: getProjectBoardCardId(h.session, chat), rowId: 'backlog', columnId: 'p3' }]);
		});

		test('reports stale axes and missing chats without creating placements', async () => {
			const chat = new TestChat('Stale target');
			const h = createBoard(mainWindow.document, [chat]);
			addRow(h);
			const errors: string[] = [];
			store.add(h.errors.event(error => errors.push(error)));
			await h.service.open();
			const rowAction = moveAction(h, chat, 'row', 'Backlog');
			h.catalog.updateBoard(DEFAULT_PROJECT_BOARD_ID, configuration => ({ ...configuration, rows: configuration.rows.filter(row => row.id !== 'backlog') }));
			await rowAction.run();
			assert.deepStrictEqual(placements(h), []);
			assert.ok(errors.includes('The chat could not be moved in Agents Hub.'));
			errors.length = 0;
			const columnAction = moveAction(h, chat, 'column', 'P1');
			h.state.sessions = [];
			h.sessionsChanged.fire({ added: [], removed: [h.session], changed: [] });
			await columnAction.run();
			assert.deepStrictEqual(placements(h), []);
			assert.deepStrictEqual(errors, ['This chat is no longer available.']);
		});

		test('disables moves on read-only boards and ignores actions after view disposal', async () => {
			const chat = new TestChat('Unavailable move');
			const h = createBoard(mainWindow.document, [chat]);
			const errors: string[] = [];
			store.add(h.errors.event(error => errors.push(error)));
			await h.service.open();
			const action = moveAction(h, chat, 'column', 'P1');
			h.contextMenu.delegate!.onHide?.(true);
			const editable = sinon.stub(h.catalog, 'canEdit').get(() => false);
			try {
				const menus = openMenu(h, chat).filter(action => action.id.startsWith('projectBoard.card.move.'));
				assert.strictEqual(menus.length, 2);
				assert.ok(menus.every(action => !action.enabled));
				h.contextMenu.delegate!.onHide?.(true);
				await action.run();
				assert.deepStrictEqual(placements(h), []);
				assert.deepStrictEqual(errors, ['Board editing is unavailable until the saved board data is recovered.']);
			} finally {
				editable.restore();
			}
			h.closeBoard();
			await Promise.resolve();
			await action.run();
			assert.deepStrictEqual(placements(h), []);
		});
	});

	test('card rename updates the visible chat title without renaming its session or sibling', async () => {
		const chat = new TestChat('Rename me');
		const sibling = new TestChat('Sibling');
		chat.capabilities.set({ canRename: true, canDelete: true }, undefined);
		const h = createBoard(mainWindow.document, [sibling, chat]);
		h.instantiationService.stub(IQuickInputService, {
			input: async options => {
				assert.strictEqual(options?.value, 'Rename me');
				return '  Renamed via menu  ';
			},
		});
		await h.service.open();
		const card = Array.from(h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')).find(element => element.dataset.chatResource === chat.resource.toString())!;
		assert.ok(card.getAttribute('aria-keyshortcuts')?.includes('F2'));

		const event = new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		card.dispatchEvent(event);
		assert.strictEqual(event.defaultPrevented, true);
		assert.deepStrictEqual(h.contextMenu.delegate?.getActions().map(action => action.label), ['Rename...', 'Mark as Done', 'Move to row', 'Move to column']);
		await h.contextMenu.delegate!.getActions()[0].run();
		const headings = () => [sibling, chat].map(chat => Array.from(h.currentContainer.querySelectorAll<HTMLElement>('[data-chat-resource]')).find(element => element.dataset.chatResource === chat.resource.toString())?.querySelector('h4')?.textContent);
		assert.deepStrictEqual({
			renamed: h.state.renamedChats,
			headings: headings(),
			sessionTitle: h.session.title.get(),
			opened: h.opened,
		}, {
			renamed: [{ session: h.session, resource: chat.resource, title: 'Renamed via menu' }],
			headings: ['Sibling', 'Renamed via menu'],
			sessionTitle: 'Owning session',
			opened: [],
		});
		h.closeBoard();
		await h.service.open();
		assert.deepStrictEqual(headings(), ['Sibling', 'Renamed via menu']);
	});

	test('F2 renames the visible card', async () => {
		const chat = new TestChat('Renamable');
		chat.capabilities.set({ canRename: true, canDelete: true }, undefined);
		const h = createBoard(mainWindow.document, [chat]);
		await h.service.open();
		h.quickInput.inputValues = ['Renamed with F2'];
		const renamed = Event.toPromise(h.sessionsChanged.event);
		const card = h.container.querySelector<HTMLElement>('[data-chat-resource]')!;
		const f2Event = new mainWindow.KeyboardEvent('keydown', { keyCode: 113, bubbles: true, cancelable: true });
		card.dispatchEvent(f2Event);
		assert.strictEqual(f2Event.defaultPrevented, true);
		await renamed;
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(h.container.querySelector('[data-chat-resource] h4')?.textContent, 'Renamed with F2');
	});

	test('card context menu omits rename when the chat does not support it', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('No rename')]);
		await h.service.open();
		const card = h.container.querySelector<HTMLElement>('[data-chat-resource]')!;
		assert.strictEqual(card.getAttribute('aria-keyshortcuts')?.includes('F2') ?? false, false);
		const event = new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		card.dispatchEvent(event);
		assert.strictEqual(event.defaultPrevented, true);
		assert.deepStrictEqual(h.contextMenu.delegate?.getActions().map(action => action.label), ['Mark as Done', 'Move to row', 'Move to column']);
		h.contextMenu.delegate!.onHide?.(true);
		const f2Event = new mainWindow.KeyboardEvent('keydown', { keyCode: 113, bubbles: true, cancelable: true });
		card.dispatchEvent(f2Event);
		assert.strictEqual(f2Event.defaultPrevented, false);
		assert.deepStrictEqual(h.state.renamedChats, []);
	});

	test('card rename cancellation, unchanged titles and failures preserve the heading', async () => {
		const chat = new TestChat('Keep this title');
		chat.capabilities.set({ canRename: true, canDelete: true }, undefined);
		const h = createBoard(mainWindow.document, [chat]);
		await h.service.open();
		const rename = async () => {
			h.container.querySelector('[data-chat-resource]')!.dispatchEvent(new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
			await h.contextMenu.delegate!.getActions()[0].run();
		};
		await rename();
		h.quickInput.inputValues = ['  Keep this title  ', '   ', 'Failed rename'];
		await rename();
		await rename();
		h.state.renameError = new Error('Rename failed');
		const errors: string[] = [];
		store.add(h.errors.event(error => errors.push(error)));
		await rename();
		assert.deepStrictEqual({
			renamed: h.state.renamedChats,
			title: h.container.querySelector('[data-chat-resource] h4')?.textContent,
			errors,
		}, { renamed: [], title: 'Keep this title', errors: ['The chat could not be renamed.'] });
	});

	test('card rename availability follows changing chat capabilities', async () => {
		const chat = new TestChat('Changing capabilities');
		const h = createBoard(mainWindow.document, [chat]);
		await h.service.open();
		const canRename = () => h.container.querySelector('[data-chat-resource]')?.getAttribute('aria-keyshortcuts')?.includes('F2') ?? false;
		const availability = [canRename()];
		chat.capabilities.set({ canRename: true, canDelete: true }, undefined);
		availability.push(canRename());
		chat.capabilities.set({ canRename: false, canDelete: true }, undefined);
		availability.push(canRename());
		assert.deepStrictEqual(availability, [false, true, false]);
	});

	test('PB-03 a destination picker rejects a chat removed while it was open', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Removed during selection')]);
		await h.service.open();
		const pending = new DeferredPromise<IQuickPickItem | undefined>();
		h.pick.callsFake(() => pending.p);
		const errors: string[] = [];
		store.add(h.errors.event(error => errors.push(error)));
		const moving = h.moveViaPicker('General, P1');
		h.state.sessions = [];
		h.sessionsChanged.fire({ added: [], removed: [h.session], changed: [] });
		await pending.complete(h.pick.lastCall.args[0][2]);
		await moving;
		assert.deepStrictEqual(errors, ['The chat could not be moved in Agents Hub.']);
		assert.strictEqual(h.container.querySelectorAll('.project-board-card').length, 0);
		h.state.sessions = [h.session];
		h.sessionsChanged.fire({ added: [h.session], removed: [], changed: [] });
		assert.ok(h.container.querySelector('.project-board-unassigned h4'));
	});

	test('PB-03/PB-13 closing the board cancels its destination picker without moving a chat', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Cancelled movement')]);
		await h.service.open();
		const pending = new DeferredPromise<IQuickPickItem | undefined>();
		h.pick.callsFake(() => pending.p);
		const moving = h.moveViaPicker('General, P1');
		h.closeBoard();
		await Promise.resolve();
		assert.strictEqual(h.pick.lastCall.args[2].isCancellationRequested, true);
		await pending.complete(h.pick.lastCall.args[0][2]);
		await moving;
		await h.service.open();
		assert.strictEqual(h.currentContainer.querySelector('.project-board-unassigned h4')?.textContent, 'Cancelled movement');
	});

	test('PB-13 close/reopen preserves placements, resets expansion and releases the old view', async () => {
		const chats = Array.from({ length: 8 }, (_, index) => new TestChat(`Lifecycle ${index}`));
		const h = createIndependentChatBoard(mainWindow.document, chats);
		await h.service.open();
		for (const chat of chats) {
			const card = [...h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => element.dataset.chatResource === chat.resource.toString())!;
			const dataTransfer = new mainWindow.DataTransfer();
			card.dispatchEvent(new mainWindow.DragEvent('dragstart', { bubbles: true, dataTransfer }));
			h.container.querySelector('[aria-label="General, P1"]')!.dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		}
		h.container.querySelector<HTMLElement>('[aria-label="General, P1"] .project-board-more')!.click();
		assert.strictEqual(h.container.querySelectorAll('[aria-label="General, P1"] .project-board-card').length, 6);
		h.closeBoard();
		await Promise.resolve();
		const closedText = h.container.textContent;
		chats[0].title.set('Changed while board closed', undefined);
		assert.strictEqual(h.container.textContent, closedText);
		await h.service.open();
		await h.service.open();
		const reopened = h.currentContainer;
		assert.notStrictEqual(reopened, h.container);
		assert.deepStrictEqual({
			openCount: h.state.openCount,
			disposeCount: h.state.disposeCount,
			boards: reopened.querySelectorAll('.project-board').length,
			cards: reopened.querySelectorAll('[aria-label="General, P1"] .project-board-card').length,
			more: reopened.querySelector('[aria-label="General, P1"] .project-board-more')?.textContent,
			firstTitle: reopened.querySelector('[aria-label="General, P1"] h4')?.textContent,
			openedChats: h.opened.length,
			read: chats.some(chat => chat.isRead.get()),
		}, { openCount: 2, disposeCount: 1, boards: 1, cards: 3, more: '+5 more', firstTitle: 'Changed while board closed', openedChats: 0, read: false });
		chats[0].title.set('Fresh view update', undefined);
		assert.strictEqual(reopened.querySelector('[aria-label="General, P1"] h4')?.textContent, 'Fresh view update');
		assert.strictEqual(h.container.textContent, closedText);
	});

	test('unavailable placements retain the last known chat identity across board reopen', async () => {
		const storage = store.add(new InMemoryStorageService());
		const chat = new TestChat('Investigate build failures');
		const h = createBoard(mainWindow.document, [chat], storage);
		h.session.workspace.set(new class extends mock<ISessionWorkspace>() {
			override readonly label = 'Build tools';
			override readonly folders = [];
		}(), undefined);
		await h.service.open();
		await h.moveViaPicker('General, P1');
		chat.title.set('Investigate build failures - updated', undefined);
		h.state.sessions = [];
		h.sessionsChanged.fire({ added: [], removed: [h.session], changed: [] });
		const unavailable = h.container.querySelector('.project-board-card-unavailable')!;
		assert.strictEqual(unavailable.querySelector('h4')?.textContent, 'Investigate build failures - updated');
		for (const text of ['Owning session', 'Build tools', 'Provider: test', 'Unavailable - last known details', 'not currently listed by its provider']) {
			assert.ok(unavailable.textContent?.includes(text), text);
			assert.ok(h.service.getAccessibleContent().includes(text), text);
		}
		h.closeBoard();
		await Promise.resolve();
		const reopened = createBoard(mainWindow.document, [], storage);
		await reopened.service.open();
		assert.strictEqual(reopened.container.querySelector('.project-board-card-unavailable h4')?.textContent, 'Investigate build failures - updated');
		chat.title.set('Recovered and renamed', undefined);
		reopened.state.sessions = [h.session];
		reopened.sessionsChanged.fire({ added: [h.session], removed: [], changed: [] });
		assert.strictEqual(reopened.container.querySelectorAll('.project-board-card').length, 1);
		assert.strictEqual(reopened.container.querySelector('.project-board-card-unavailable'), null);
		assert.strictEqual(reopened.container.querySelector('[aria-label="General, P1"] h4')?.textContent, 'Recovered and renamed');
		assert.strictEqual(reopened.opened.length, 0);
		assert.strictEqual(chat.isRead.get(), false);
	});

	test('legacy unavailable placements show their identifier in card, list and accessible views', async () => {
		const h = createBoard(mainWindow.document);
		const cardId = 'remote-test\0test-session:older\0test-chat:older';
		h.catalog.updateBoard(DEFAULT_PROJECT_BOARD_ID, configuration => ({
			...configuration, placements: [{ cardId, rowId: 'general', columnId: 'p1' }],
		}));
		await h.service.open();
		const assertDetails = () => {
			const unavailable = h.container.querySelector('.project-board-card-unavailable')!;
			for (const text of ['Unavailable - no saved title', 'Provider: remote-test', 'Chat: test-chat:older']) {
				assert.ok(unavailable.textContent?.includes(text), text);
				assert.ok(h.service.getAccessibleContent().includes(text), text);
			}
		};
		assertDetails();
		h.catalog.updateBoard(DEFAULT_PROJECT_BOARD_ID, configuration => ({
			...configuration, display: { showSessionList: true, showCredits: false, showStateDuration: false },
		}));
		assertDetails();
	});

	test('identity snapshots stay bounded, update across boards while closed and ignore runtime activity', async () => {
		const storage = store.add(new InMemoryStorageService());
		const chat = new TestChat('Identity');
		const h = createBoard(mainWindow.document, [chat], storage);
		const other = h.catalog.createBoard('Other');
		await h.service.open();
		await h.moveViaPicker('General, P1');
		h.catalog.updateBoard(other, configuration => ({
			...configuration, placements: [{ cardId: getProjectBoardCardId(h.session, chat), rowId: 'general', columnId: 'p3' }],
		}));
		h.closeBoard();
		await Promise.resolve();
		const writes = sinon.spy(storage, 'store');
		try {
			chat.status.set(SessionStatus.NeedsInput, undefined);
			chat.isRead.set(true, undefined);
			chat.description.set({ value: 'Streaming output, not an identity label' }, undefined);
			h.sessionsChanged.fire({ added: [], removed: [], changed: [h.session] });
			assert.strictEqual(writes.callCount, 0);
			chat.title.set('x'.repeat(projectBoardIdentityLabelLimit + 100), undefined);
			assert.strictEqual(writes.callCount, 1);
			for (const board of h.catalog.boards.get()) {
				assert.deepStrictEqual(board.configuration.placements[0].lastKnown, { title: 'x'.repeat(projectBoardIdentityLabelLimit), sessionTitle: 'Owning session' });
			}
			assert.ok(!storage.get(ProjectBoardCatalogService.STORAGE_KEY, StorageScope.PROFILE)!.includes('Streaming output'));
		} finally {
			writes.restore();
		}
	});

	test('another window identity update does not trigger stale snapshot writeback', async () => {
		const storage = store.add(new InMemoryStorageService());
		const chat = new TestChat('Shared title');
		const first = createBoard(mainWindow.document, [chat], storage);
		await first.service.open();
		await first.moveViaPicker('General, P1');
		const second = createBoard(mainWindow.document, [new TestChat('Shared title')], storage);
		const writes = sinon.spy(storage, 'store');
		try {
			chat.title.set('Renamed in first window', undefined);
			second.sessionsChanged.fire({ added: [], removed: [], changed: [second.session] });
			assert.strictEqual(writes.callCount, 1);
			assert.strictEqual(second.catalog.boards.get()[0].configuration.placements[0].lastKnown?.title, 'Renamed in first window');
		} finally {
			writes.restore();
		}
	});

	test('identity save failures retain the previous snapshot without breaking live updates', async () => {
		const chat = new TestChat('Saved title');
		const h = createBoard(mainWindow.document, [chat]);
		await h.service.open();
		await h.moveViaPicker('General, P1');
		const update = sinon.stub(h.catalog, 'updateCardIdentities').throws(new Error('Identity save failed'));
		try {
			chat.title.set('Unsaved live title', undefined);
			assert.strictEqual(h.container.querySelector('[data-chat-resource] h4')?.textContent, 'Unsaved live title');
			assert.strictEqual(h.catalog.boards.get()[0].configuration.placements[0].lastKnown?.title, 'Saved title');
			assert.strictEqual(update.callCount, 1);
		} finally {
			update.restore();
		}
		chat.title.set('Retry on next identity change', undefined);
		assert.strictEqual(h.catalog.boards.get()[0].configuration.placements[0].lastKnown?.title, 'Retry on next identity change');
	});

	test('PB-12 disconnect/reconnect preserves runtime state, identity and placement without duplicate cards', async () => {
		const chat = new TestChat('Remote work');
		const h = createBoard(mainWindow.document, [chat]);
		h.metadata.set({ kind: 'ready', prompt: 'Known prompt', submittedAt: 1000, context: [] }, undefined);
		await h.service.open();
		await h.moveViaPicker('General, P1');
		for (const connection of [
			{ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.Unknown },
			{ kind: 'reconnecting' },
			{ kind: 'connected' },
		] satisfies SessionRemoteConnectionStatus[]) {
			h.session.remoteConnectionStatus.set(connection, undefined);
			const card = h.container.querySelector('[aria-label="General, P1"] .project-board-card')!;
			assert.deepStrictEqual({
				count: h.container.querySelectorAll('.project-board-card').length,
				resource: card.getAttribute('data-chat-resource'),
				title: card.querySelector('h4')?.textContent,
				status: card.querySelector('.project-board-card-status-label')?.textContent,
				warning: card.querySelector('.project-board-card-warning')?.textContent ?? null,
				read: chat.isRead.get(),
				opened: h.opened.length,
			}, {
				count: 1, resource: chat.resource.toString(), title: 'Remote work', status: 'Busy',
				warning: connection.kind === 'connected' ? null : `Provider unavailable (${connection.kind}); state may be stale.`,
				read: false, opened: 0,
			});
		}
	});

	test('PB-14 fifty chats retain cell caps, hidden attention counts and focused identity during drag updates', async () => {
		const { document } = createBoardDocument();
		const chats = Array.from({ length: 50 }, (_, index) => new TestChat(`Load ${String(index).padStart(2, '0')}`));
		for (const chat of chats) {
			chat.status.set(SessionStatus.Completed, undefined);
		}
		const h = createIndependentChatBoard(document, chats);
		await h.service.open();
		for (const [index, chat] of chats.entries()) {
			const card = [...h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => element.dataset.chatResource === chat.resource.toString())!;
			const transfer = new mainWindow.DataTransfer();
			card.dispatchEvent(new mainWindow.DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
			h.container.querySelector(`[aria-label="General, P${index % 4}"]`)!.dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
		}
		assert.deepStrictEqual({
			visible: h.container.querySelectorAll('.project-board-card').length,
			overflow: [...h.container.querySelectorAll('.project-board-more')].map(element => element.textContent),
		}, { visible: 12, overflow: ['+10 more', '+10 more', '+9 more', '+9 more'] });
		const dragged = h.container.querySelector<HTMLElement>('[aria-label="General, P0"] .project-board-card')!;
		dragged.focus();
		const transfer = new mainWindow.DataTransfer();
		dragged.dispatchEvent(new mainWindow.DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
		chats[0].title.set('Updated while dragging', undefined);
		chats[0].status.set(SessionStatus.NeedsInput, undefined);
		assert.strictEqual(h.container.querySelector('[aria-label="General, P0"] .project-board-card'), dragged);
		assert.strictEqual(dragged.querySelector('h4')?.textContent, 'Load 00');
		const destination = () => h.container.querySelector('[aria-label="General, P1"]')!;
		destination().dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
		chats[49].status.set(SessionStatus.NeedsInput, undefined);
		const moved = destination().querySelector('.project-board-card')!;
		assert.deepStrictEqual({
			resource: moved.getAttribute('data-chat-resource'), title: moved.querySelector('h4')?.textContent,
			focused: document.activeElement === moved, visible: h.container.querySelectorAll('.project-board-card').length,
			attention: destination().querySelector('.project-board-attention')?.textContent,
			opened: h.opened.length, read: chats.some(chat => chat.isRead.get()),
		}, { resource: chats[0].resource.toString(), title: 'Updated while dragging', focused: true, visible: 12, attention: '2 Needs Input', opened: 0, read: false });
		destination().querySelector<HTMLElement>('.project-board-more')!.click();
		const visible = [...h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')].map(element => element.dataset.chatResource);
		assert.strictEqual(destination().querySelectorAll('.project-board-card').length, 6);
		assert.strictEqual(new Set(visible).size, visible.length);
	});

	test('PB-14 board-owned scrolling survives host class mirroring and live updates', async () => {
		const chats = Array.from({ length: 20 }, (_, index) => new TestChat(`Scrollable ${index}`));
		const h = createBoard(mainWindow.document, chats);
		h.container.style.cssText = 'height: 240px; width: 480px; display: flex; flex-direction: column; overflow: hidden; position: relative;';
		await h.service.open();
		// The auxiliary service mirrors the main workbench's classes after opening.
		h.container.className = 'monaco-workbench';
		const board = () => h.container.querySelector<HTMLElement>('.project-board')!;
		const scrollable = board().parentElement!;
		assert.ok(scrollable.classList.contains('monaco-scrollable-element'), 'Standalone scrolling uses the workbench scrollbar, not a native light gutter');
		assert.strictEqual(mainWindow.getComputedStyle(board()).overflow, 'hidden');
		assert.strictEqual(h.container.querySelectorAll('.project-board-scrollable').length, 1);
		const verticalSlider = scrollable.querySelector<HTMLElement>(':scope > .scrollbar.vertical > .slider')!;
		const horizontalSlider = scrollable.querySelector<HTMLElement>(':scope > .scrollbar.horizontal > .slider')!;
		assert.ok(verticalSlider && horizontalSlider);
		assert.ok(board().clientHeight <= h.container.clientHeight, 'The scroll viewport must fit its auxiliary host');
		assert.ok(board().scrollHeight > board().clientHeight);
		assert.ok(board().scrollWidth > board().clientWidth);
		board().scrollTop = board().scrollHeight;
		board().scrollLeft = board().scrollWidth;
		board().dispatchEvent(new mainWindow.Event('scroll'));
		const position = { top: board().scrollTop, left: board().scrollLeft };
		assert.ok(position.top > 0 && position.left > 0);
		assert.ok(parseFloat(verticalSlider.style.top) > 0 && parseFloat(horizontalSlider.style.left) > 0, 'Thumbs follow native/programmatic scroll on both axes');
		const lastCell = h.container.querySelector('[aria-label="General, P3"]')!;
		assert.ok(lastCell.getBoundingClientRect().bottom <= board().getBoundingClientRect().bottom);
		assert.ok(lastCell.getBoundingClientRect().right <= board().getBoundingClientRect().right);
		chats[0].title.set('Updated while scrolled', undefined);
		assert.deepStrictEqual({ top: board().scrollTop, left: board().scrollLeft }, position);
		assert.strictEqual(board().parentElement, scrollable, 'Live updates retain the active scrollbar');
		assert.strictEqual(scrollable.querySelector(':scope > .scrollbar.vertical > .slider'), verticalSlider);
		h.container.style.setProperty('--vscode-scrollbar-background', 'transparent');
		for (const color of ['rgb(121, 121, 121)', 'rgb(80, 80, 80)']) {
			h.container.style.setProperty('--vscode-scrollbarSlider-background', color);
			assert.strictEqual(mainWindow.getComputedStyle(verticalSlider).backgroundColor, color, 'Scrollbars react to workbench theme tokens');
		}
		assert.strictEqual(mainWindow.getComputedStyle(verticalSlider.parentElement!).backgroundColor, 'rgba(0, 0, 0, 0)');
		h.container.querySelector<HTMLElement>('[data-board-control="collapse:unassigned"]')!.click();
		assert.ok(Math.abs(board().scrollTop - (board().scrollHeight - board().clientHeight)) < 1, 'Collapsing clamps the old scroll position to the new range');
		assert.ok(parseFloat(verticalSlider.style.height) > 0);
	});

	test('PB-05/PB-11 arrows follow card geometry, reveal focus, and Enter opens exactly that chat', async () => {
		const chats = Array.from({ length: 4 }, (_, index) => new TestChat(`Navigate ${index}`));
		const h = createIndependentChatBoard(mainWindow.document, chats);
		h.container.style.cssText = 'height: 240px; width: 900px; position: relative;';
		await h.service.open();
		const cards = [...h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')];
		const press = (keyCode: number) => mainWindow.document.activeElement!.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode, bubbles: true, cancelable: true }));
		cards[0].focus();
		press(39);
		assert.strictEqual(mainWindow.document.activeElement, cards[1]);
		press(37);
		assert.strictEqual(mainWindow.document.activeElement, cards[0]);
		press(40);
		assert.strictEqual(mainWindow.document.activeElement, cards[3]);
		assert.ok(h.container.querySelector('.project-board')!.scrollTop > 0, 'Keyboard focus reveals below-fold cards');
		press(38);
		assert.strictEqual(mainWindow.document.activeElement, cards[0]);
		press(35);
		assert.strictEqual(mainWindow.document.activeElement, cards[3]);
		press(36);
		assert.strictEqual(mainWindow.document.activeElement, cards[0]);
		press(39);
		press(13);
		assert.deepStrictEqual(h.opened, [chats[1].resource]);
		assert.ok(chats.every(chat => !chat.isRead.get()), 'Navigation itself never marks read');
	});

	test('PB-14 standalone scrollbars rescan late content growth and viewport resizing', async () => {
		const observers: { observed: Map<Element, ResizeObserverOptions | undefined>; resize: () => void }[] = [];
		const resizeObserver = sinon.stub(mainWindow, 'ResizeObserver').callsFake(callback => {
			const observed = new Map<Element, ResizeObserverOptions | undefined>();
			const observer: ResizeObserver = {
				observe: (target, options) => { observed.set(target, options); },
				unobserve: target => { observed.delete(target); },
				disconnect: () => observed.clear(),
			};
			observers.push({ observed, resize: () => callback([], observer) });
			return observer;
		});
		store.add(toDisposable(() => resizeObserver.restore()));
		const h = createBoard(mainWindow.document, Array.from({ length: 8 }, (_, index) => new TestChat(`Resize ${index}`)));
		h.container.style.cssText = 'height: 400px; width: 600px; position: relative;';
		await h.service.open();
		const board = h.container.querySelector<HTMLElement>('.project-board')!;
		const scrollable = board.parentElement!;
		const slider = scrollable.querySelector<HTMLElement>(':scope > .scrollbar.vertical > .slider')!;
		const observer = observers.find(observer => observer.observed.has(board))!;
		assert.ok(observer);
		const grid = h.container.querySelector<HTMLElement>('.project-board-grid')!;
		assert.strictEqual(observer.observed.get(grid)?.box, 'border-box');
		const initialHeight = parseFloat(slider.style.height);
		const initialScrollHeight = board.scrollHeight;
		// Question and tool widgets can grow without a board model change.
		grid.style.paddingBottom = '800px';
		observer.resize();
		assert.ok(board.scrollHeight > initialScrollHeight);
		assert.ok(parseFloat(slider.style.height) < initialHeight, `Content resizing updates the thumb without another board render: ${initialHeight} -> ${slider.style.height}, content ${initialScrollHeight} -> ${board.scrollHeight}`);
		h.container.style.height = '180px';
		h.container.style.width = '420px';
		observer.resize();
		assert.strictEqual(parseFloat(slider.parentElement!.style.height), board.clientHeight);
		assert.ok(board.clientHeight <= 180 && board.clientWidth <= 420);
		const horizontal = scrollable.querySelector<HTMLElement>(':scope > .scrollbar.horizontal')!;
		assert.ok(parseFloat(horizontal.style.width) <= board.clientWidth);
		h.closeBoard();
		await Promise.resolve();
		assert.strictEqual(h.container.querySelector('.project-board-scrollable'), null, 'Closing disposes the viewport and its resize listeners');
		assert.strictEqual(observer.observed.size, 0);
	});

	for (const surface of ['embedded', 'standalone'] as const) {
		test(`${surface} card Done action archives only its owning session and preserves history for restoration`, async () => {
			const chat = new TestChat('Keep my history');
			const worker = new class extends TestChat {
				override readonly origin = { kind: ChatOriginKind.Tool, parentChat: chat.resource };
			}('Worker');
			worker.interactivity.set(ChatInteractivity.ReadOnly, undefined);
			const otherChat = new TestChat('Unrelated selection');
			const h = createBoard(mainWindow.document, [chat, worker]);
			const other = new TestBoardSession([otherChat], 'other');
			h.state.sessions.push(other);
			if (surface === 'embedded') {
				store.add(h.service.createView(h.container));
			} else {
				await h.service.open();
			}
			const card = (target: IChat) => [...h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')]
				.find(element => element.dataset.chatResource === target.resource.toString())!;
			h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
			card(worker).querySelector<HTMLElement>('.project-board-card-select')!.click();
			card(otherChat).querySelector<HTMLElement>('.project-board-card-select')!.click();
			const button = card(worker).querySelector<HTMLElement>('[aria-label="Mark as Done"]')!;
			assert.ok(button.classList.contains('codicon-check'));
			assert.ok(button.getAttribute('aria-description')?.includes('entire session'));
			button.focus();
			assert.strictEqual(mainWindow.getComputedStyle(button.parentElement!).opacity, '1');
			button.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, bubbles: true, cancelable: true }));
			await timeout(0);
			assert.deepStrictEqual({
				attempts: h.state.archiveAttempts, archived: [h.session.isArchived.get(), other.isArchived.get()],
				deleted: h.state.deletedSessions, opened: h.opened, chats: h.session.chats.get(),
				cardCount: h.container.querySelectorAll('[data-chat-resource]').length,
				selected: card(otherChat).querySelector('.project-board-card-select')?.getAttribute('aria-checked'),
				deleteActions: h.container.querySelectorAll('[aria-label="Delete Session"]').length,
				read: [chat.isRead.get(), worker.isRead.get(), otherChat.isRead.get()],
			}, {
				attempts: [h.session], archived: [true, false], deleted: [], opened: [], chats: [chat, worker],
				cardCount: 1, selected: 'true', deleteActions: 0, read: [false, false, false],
			});
			if (surface === 'embedded') {
				h.service.toggleArchived();
			} else {
				h.container.querySelector<HTMLElement>('[data-board-control="show-archived"]')!.click();
			}
			assert.strictEqual(card(worker).querySelector('[aria-label="Mark as Done"]'), null);
			h.session.isArchived.set(false, undefined);
			assert.ok(card(worker).querySelector('[aria-label="Mark as Done"]'), 'Restoring the session restores its Done action');
		});
	}

	test('session card Done action reports archive failure, remains retryable and keeps focus through rerenders', async () => {
		const { document } = createBoardDocument();
		const chat = new TestChat('Keep me');
		const h = createBoard(document, [chat]);
		h.state.archiveErrors.add(h.session.sessionId);
		await h.service.open();
		const button = () => h.container.querySelector<HTMLElement>('.project-board-card [aria-label="Mark as Done"]')!;
		button().focus();
		chat.title.set('Renamed while focused', undefined);
		assert.strictEqual(document.activeElement, button());
		const notification = Event.toPromise(h.errors.event);
		button().click();
		assert.strictEqual(await notification, '1 of 1 sessions could not be marked as done. The remaining selected conversations can be retried.');
		assert.deepStrictEqual({
			deleted: h.state.deletedSessions, archived: h.session.isArchived.get(), enabled: button().getAttribute('aria-disabled'),
		}, { deleted: [], archived: false, enabled: 'false' });
		h.state.archiveErrors.clear();
		button().click();
		await timeout(0);
		assert.deepStrictEqual({ attempts: h.state.archiveAttempts, archived: h.session.isArchived.get(), deleted: h.state.deletedSessions },
			{ attempts: [h.session, h.session], archived: true, deleted: [] });
	});

	test('session card Done action does not require provider deletion support', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Read only')]);
		h.session.capabilities.set({ supportsMultipleChats: true, supportsDelete: false }, undefined);
		await h.service.open();
		assert.strictEqual(h.container.querySelector('[aria-label="Delete Session"]'), null);
		h.container.querySelector<HTMLElement>('.project-board-card [aria-label="Mark as Done"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({ attempts: h.state.archiveAttempts, deleted: h.state.deletedSessions },
			{ attempts: [h.session], deleted: [] });
	});

	test('PB-16 top-right New Session delegates creation without owner navigation', async () => {
		const { service, container, state, opened } = createBoard(mainWindow.document.implementation.createHTMLDocument());
		await service.open();
		const button = container.querySelector<HTMLElement>('[data-board-control="new-session"]')!;
		assert.strictEqual(button.textContent, 'New Session');
		button.click();
		assert.strictEqual(state.createdCount, 1);
		assert.deepStrictEqual(opened, []);
		await timeout(0);
		assert.deepStrictEqual(opened, [state.createdSession!.mainChat.get().resource], 'Only standalone creation opens a chat window after sending');
		assert.strictEqual(state.ownerFocusCount, 0);
	});

	test('PB-16 cancelling New Session does not record an open chat or report a navigation error', async () => {
		const h = createBoard(mainWindow.document);
		const errors: string[] = [];
		store.add(h.errors.event(error => errors.push(error)));
		h.state.createdSession = undefined;
		await h.service.open();
		h.container.querySelector<HTMLElement>('[data-board-control="new-session"]')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			created: h.state.createdCount, opened: h.opened, errors,
			enabled: h.container.querySelector('[data-board-control="new-session"]')?.getAttribute('aria-disabled'),
		}, { created: 1, opened: [], errors: [], enabled: 'false' });
		h.state.createdSession = new TestBoardSession([new TestChat('retry')], 'retry');
		h.container.querySelector<HTMLElement>('[data-board-control="new-session"]')!.click();
		await timeout(0);
		assert.strictEqual(h.state.createdCount, 2, 'Cancellation must release the creation guard');
	});

	for (const embedded of [true, false]) {
		test(`double-clicking an empty cell opens one dialog with its destination in ${embedded ? 'embedded' : 'standalone'} mode`, async () => {
			const h = createBoard(mainWindow.document);
			h.state.createdSession = undefined;
			if (embedded) {
				store.add(h.service.createView(h.container));
			} else {
				await h.service.open();
			}
			const barrier = new DeferredPromise<void>();
			h.state.creationBarrier = barrier;
			const cell = h.container.querySelector<HTMLElement>('[aria-label="General, P2"]')!;
			const trigger = (element: Element) => element.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
			trigger(cell.querySelector('.project-board-empty')!);
			trigger(cell);
			assert.deepStrictEqual({
				count: h.state.createdCount, placement: h.state.creationOptions?.initialPlacement,
				board: h.state.creationOptions?.boardState.boardId, opened: h.opened, sidePanel: h.sidePanelOpened,
			}, { count: 1, placement: { rowId: 'general', columnId: 'p2' }, board: DEFAULT_PROJECT_BOARD_ID, opened: [], sidePanel: [] });
			await barrier.complete();
			await timeout(0);
			trigger(h.container.querySelector('[aria-label="General, P1"] h3')!);
			await timeout(0);
			assert.strictEqual(h.state.createdCount, 2);
			assert.deepStrictEqual(h.state.creationOptions?.initialPlacement, { rowId: 'general', columnId: 'p1' });
			h.service.toggleDisplayOption('showSessionList');
			trigger(h.container.querySelector('[aria-label="General, P3"] .project-board-card-list')!);
			await timeout(0);
			assert.strictEqual(h.state.createdCount, 3);
			assert.deepStrictEqual(h.state.creationOptions?.initialPlacement, { rowId: 'general', columnId: 'p3' });
		});
	}

	test('cell double-click leaves existing chats and nested controls alone', async () => {
		const parent = new TestChat('Parent');
		const child = new TestChat('Child');
		const h = createBoard(mainWindow.document, [parent, child]);
		await h.service.open();
		await h.moveViaPicker('General, P0', parent.resource);
		const cell = h.container.querySelector('[aria-label="General, P0"]')!;
		for (const title of cell.querySelectorAll('h4')) {
			title.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		}
		for (const control of cell.querySelectorAll('[role="checkbox"], [role="button"]')) {
			control.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		}
		assert.deepStrictEqual({ opened: h.opened, created: h.state.createdCount }, { opened: [parent.resource, child.resource], created: 0 });
	});

	test('Unassigned, collapsed cells and read-only boards do not start cell creation', async () => {
		const h = createBoard(mainWindow.document);
		await h.service.open();
		const trigger = (selector: string) => h.container.querySelector(selector)!.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		trigger('.project-board-unassigned .project-board-empty');
		h.container.querySelector<HTMLElement>('[data-board-control="collapse:column:p0"]')!.click();
		trigger('[aria-label="General, P0"]');
		const editable = sinon.stub(h.catalog, 'canEdit').get(() => false);
		try {
			trigger('[aria-label="General, P1"]');
			assert.strictEqual(h.state.createdCount, 0);
		} finally {
			editable.restore();
		}
	});

	test('embedded creation immediately opens its running chat in the side panel without changing existing-card preferences', async () => {
		const h = createBoard(mainWindow.document);
		const origin = h.catalog.createBoard('Creation target');
		h.catalog.selectBoard(origin);
		h.catalog.updateBoard(origin, configuration => ({ ...configuration, openChatInSidePanel: false }));
		const session = h.state.createdSession!;
		h.state.sessions = [session];
		const view = store.add(h.service.createView(h.container));
		view.layout(1200, 800);
		h.service.toggleAutoIncludeSessions();
		h.state.creationPlacement = { rowId: 'general', columnId: 'p2' };
		await h.service.createSession();
		await timeout(0);
		const expected = {
			cardId: getProjectBoardCardId(session, session.mainChat.get()), rowId: 'general', columnId: 'p2',
			lastKnown: { title: session.mainChat.get().title.get(), sessionTitle: session.title.get() },
		};
		assert.deepStrictEqual({
			origin: h.state.creationOptions?.boardState.boardId,
			windows: h.state.openCount,
			opened: h.opened,
			sidePanel: h.sidePanelOpened,
			status: session.mainChat.get().status.get(),
			existingCardPreference: h.catalog.boards.get().find(board => board.id === origin)!.configuration.openChatInSidePanel,
			current: [...h.container.querySelectorAll<HTMLElement>('[aria-current="true"]')].map(element => element.dataset.chatResource),
			placements: h.catalog.boards.get().find(board => board.id === origin)!.configuration.placements,
			sibling: h.catalog.boards.get().find(board => board.id === DEFAULT_PROJECT_BOARD_ID)!.configuration.placements,
		}, { origin, windows: 0, opened: [], sidePanel: [session.mainChat.get().resource], status: SessionStatus.InProgress, existingCardPreference: false, current: [session.mainChat.get().resource.toString()], placements: [expected], sibling: [] });
		const closeCount = h.state.sidePanelCloseCount;
		h.service.toggleDisplayOption('showCredits');
		h.catalog.renameBoard(DEFAULT_PROJECT_BOARD_ID, 'Sibling renamed');
		assert.strictEqual(h.state.sidePanelCloseCount, closeCount, 'The newly created chat remains open across unrelated catalog edits');
		h.catalog.selectBoard(DEFAULT_PROJECT_BOARD_ID);
		h.state.creationOptions!.onDidCreate(session, { rowId: 'general', columnId: 'p3' });
		assert.deepStrictEqual(h.catalog.boards.get().find(board => board.id === origin)!.configuration.placements, [{ ...expected, columnId: 'p3' }], 'A delayed callback must never follow the globally selected board');
	});

	test('changing boards during creation retains the original placement without opening a panel on the wrong board', async () => {
		const h = createBoard(mainWindow.document);
		store.add(h.service.createView(h.container));
		const barrier = new DeferredPromise<void>();
		h.state.creationBarrier = barrier;
		h.state.creationPlacement = { rowId: 'general', columnId: 'p1' };
		const creating = h.service.createSession();
		const other = h.catalog.createBoard('Other');
		h.catalog.selectBoard(other);
		await barrier.complete();
		await creating;
		assert.deepStrictEqual({
			windows: h.opened, panels: h.sidePanelOpened,
			sourcePlacements: h.catalog.boards.get().find(board => board.id === DEFAULT_PROJECT_BOARD_ID)!.configuration.placements.length,
			selected: h.catalog.selectedBoardId.get(),
		}, { windows: [], panels: [], sourcePlacements: 1, selected: other });
	});

	test('canonical handoff preserves moves made after opening without stealing focus or opening another chat', async () => {
		const h = createBoard(mainWindow.document);
		store.add(h.service.createView(h.container));
		h.state.creationPlacement = { rowId: 'general', columnId: 'p0' };
		await h.service.createSession();
		const provisional = h.state.createdSession!;
		const from = getProjectBoardCardId(provisional, provisional.mainChat.get());
		const canonical = new TestBoardSession([new TestChat('canonical')], 'canonical');
		const to = getProjectBoardCardId(canonical, canonical.mainChat.get());
		h.catalog.updateBoard(DEFAULT_PROJECT_BOARD_ID, configuration => ({
			...configuration, placements: [{ cardId: from, rowId: 'general', columnId: 'p2' }],
		}));
		const other = h.catalog.createBoard('Other');
		h.catalog.selectBoard(other);
		h.sessionReplaced.fire({ from: provisional, to: canonical });
		assert.deepStrictEqual(h.catalog.boards.get()[0].configuration.placements, [{ cardId: to, rowId: 'general', columnId: 'p2' }]);
		h.state.creationOptions!.onDidResolve!(provisional, canonical);
		assert.deepStrictEqual(h.catalog.boards.get()[0].configuration.placements, [{ cardId: to, rowId: 'general', columnId: 'p2' }]);
		assert.strictEqual(h.catalog.selectedBoardId.get(), other);
		assert.deepStrictEqual(h.sidePanelOpened, [provisional.mainChat.get().resource]);
		assert.deepStrictEqual(h.opened, []);
	});

	test('an accepted detached draft appears before discovery and deduplicates against provider publication', () => {
		const h = createBoard(mainWindow.document);
		store.add(h.service.createView(h.container));
		const draft = new TestBoardSession([new TestChat('detached')], 'detached');
		const cards = () => h.container.querySelectorAll(`[data-chat-resource="${draft.mainChat.get().resource}"]`).length;
		h.sessionDrafts.set(new Set([draft]), undefined);
		assert.strictEqual(cards(), 0, 'Unsubmitted modal drafts stay private');
		draft.status.set(SessionStatus.InProgress, undefined);
		assert.strictEqual(cards(), 1, 'Use the existing identity while canonical discovery is pending');
		h.state.sessions = [draft];
		h.sessionsChanged.fire({ added: [draft], removed: [], changed: [] });
		assert.strictEqual(cards(), 1);
		h.sessionDrafts.set(new Set(), undefined);
		assert.strictEqual(cards(), 1);
	});

	test('coalesces draft publication bursts while handing off the new-session composer', async () => {
		const chat = new TestChat('existing');
		const h = createBoard(mainWindow.document, [chat]);
		store.add(h.service.createView(h.container));
		const card = h.container.querySelector(`[data-chat-resource="${chat.resource}"]`);
		assert.ok(card);
		const barrier = new DeferredPromise<void>();
		h.state.creationBarrier = barrier;
		h.state.createdSession = undefined;
		const creating = h.service.createSession();
		for (let i = 0; i < 10; i++) {
			chat.title.set(`Updated ${i}`, undefined);
		}
		assert.strictEqual(h.container.querySelector(`[data-chat-resource="${chat.resource}"]`), card);
		await timeout(0);
		assert.match(h.container.querySelector(`[data-chat-resource="${chat.resource}"]`)!.textContent!, /Updated 9/);
		await barrier.complete();
		await creating;
	});

	test('failed post-creation side-panel opening reports the error without a standalone fallback', async () => {
		const h = createBoard(mainWindow.document);
		store.add(h.service.createView(h.container));
		h.state.navigationError = new Error('Panel unavailable');
		const notification = Event.toPromise(h.errors.event);
		await h.service.createSession();
		assert.deepStrictEqual({ error: await notification, windows: h.opened, panels: h.sidePanelOpened, created: h.state.createdCount }, {
			error: 'The new session could not be opened.', windows: [], panels: [], created: 1,
		});
	});

	test('a completed submission does not recreate a deleted destination board or use its sibling', async () => {
		const h = createBoard(mainWindow.document);
		const origin = h.catalog.createBoard('Deleted destination');
		h.catalog.selectBoard(origin);
		store.add(h.service.createView(h.container));
		await h.service.createSession();
		const options = h.state.creationOptions!;
		h.catalog.deleteBoard(origin);
		const errors: string[] = [];
		store.add(h.errors.event(error => errors.push(error)));
		options.onDidCreate(h.state.createdSession!, { rowId: 'general', columnId: 'p2' });
		assert.deepStrictEqual({
			boards: h.catalog.boards.get().map(board => ({ id: board.id, placements: board.configuration.placements })),
			opened: h.opened,
			deleted: h.state.deletedSessions,
		}, { boards: [{ id: DEFAULT_PROJECT_BOARD_ID, placements: [] }], opened: [], deleted: [] });
		assert.ok(errors.some(error => error.includes('session was created')), 'The committed conversation survives with an explicit placement failure');
	});

	test('PB-05 closing a session returns focus to its card but never reopens a closed board', async () => {
		const { document } = createBoardDocument();
		const chat = new TestChat('Return here');
		const h = createBoard(document, [chat]);
		await h.service.open();
		h.state.closedResource = chat.resource;
		await h.service.closeSession(12345);
		assert.strictEqual(document.activeElement?.getAttribute('data-chat-resource'), chat.resource.toString());
		assert.strictEqual(h.state.ownerFocusCount, 0);
		h.closeBoard();
		await Promise.resolve();
		await h.service.closeSession(12345);
		assert.strictEqual(h.state.openCount, 1);
	});

	test('PB-06 embedded Kanban keeps accessibility and focus when an auxiliary board also exists', async () => {
		const nativeFocus = sinon.stub(mainWindow.document, 'hasFocus').returns(true);
		store.add(toDisposable(() => nativeFocus.restore()));
		const chat = new TestChat('Shared surface chat');
		const h = createBoard(mainWindow.document, [chat]);
		const embeddedContainer = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(embeddedContainer);
		store.add(toDisposable(() => embeddedContainer.remove()));
		const embedded = store.add(h.service.createView(embeddedContainer));
		await h.service.open();
		await h.service.createSession();
		assert.strictEqual(h.state.createdCount, 1, 'The contributed toolbar creates through the custom view');
		h.state.closedResource = chat.resource;
		await h.service.closeSession(12345);
		assert.ok(embeddedContainer.contains(mainWindow.document.activeElement), 'Toolbar creation returns to the custom view');
		embedded.focus();
		embeddedContainer.querySelector<HTMLElement>('[data-chat-resource]')!.focus();
		assert.ok(embeddedContainer.contains(mainWindow.document.activeElement), 'Embedded focus is established before closing the chat');
		h.state.closedResource = chat.resource;
		await h.service.closeSession(12345);
		assert.strictEqual(h.state.ownerFocusCount, 2, 'Close targets the owner hosting the embedded board');
		assert.ok(embeddedContainer.contains(mainWindow.document.activeElement), 'Return to the focused embedded board, not a different surface');
		h.closeBoard();
		await Promise.resolve();
		assert.ok(h.service.getAccessibleContent().includes('Shared surface chat'));
		embedded.dispose();
		assert.strictEqual(h.service.getAccessibleContent(), 'Agents Hub is not currently open.');
	});

	test('PB-05 a closing draft restores focus by its stable ID after its model resource changes', async () => {
		const { document } = createBoardDocument();
		const h = createBoard(document);
		const original = URI.parse('test-draft:/original');
		h.drafts.set([{ id: original.toString(), resource: URI.parse('test-draft:/rebound'), hasContent: true, submitted: false }], undefined);
		await h.service.open();
		h.state.closedResource = original;
		await h.service.closeSession(12345);
		assert.strictEqual(document.activeElement?.getAttribute('data-draft-id'), original.toString());
	});

	test('PB-16 draft cards use glyphs and card activation without an Open button', async () => {
		const { document } = createBoardDocument();
		const { service, container, drafts, openedDrafts, state } = createBoard(document);
		const draft: IProjectBoardDraft = { id: 'draft', resource: URI.parse('test-draft:session'), hasContent: false, submitted: false };
		drafts.set([draft], undefined);
		await service.open();
		const card = container.querySelector<HTMLElement>('.project-board-card-draft')!;
		assert.ok(card.querySelector('[aria-label="Delete Session Draft"]')?.classList.contains('codicon-trash'));
		assert.strictEqual(card.querySelector('.project-board-card-status-icon')!.textContent, '\u270F\uFE0F');
		assert.strictEqual(card.querySelector('.project-board-card-status-label')!.textContent, 'Draft');
		assert.strictEqual(card.querySelector('.project-board-card-status-running'), null);
		card.click();
		assert.deepStrictEqual(openedDrafts, []);
		card.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		card.focus();
		card.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, bubbles: true }));
		card.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 32, bubbles: true }));
		drafts.set([{ ...draft, hasContent: true, submitted: true }], undefined);
		assert.strictEqual(document.activeElement, container.querySelector('.project-board-card-draft'));
		assert.strictEqual(container.querySelector('.project-board-card-status-icon')!.textContent, '\u{1F3C3}');
		assert.strictEqual(container.querySelector('.project-board-card-status-label')!.textContent, 'Starting…');
		assert.ok(container.querySelector('.project-board-card-status-running'));
		assert.deepStrictEqual(openedDrafts, ['draft', 'draft', 'draft']);
		assert.strictEqual(state.ownerFocusCount, 0);
	});

	test('PB-16 draft delete action confirms and discards the draft without opening it', async () => {
		const h = createBoard(mainWindow.document);
		h.instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: true }) });
		h.drafts.set([{ id: 'draft', resource: URI.parse('test-draft:session'), hasContent: true, submitted: false }], undefined);
		await h.service.open();
		h.container.querySelector<HTMLElement>('[aria-label="Delete Session Draft"]')!.click();
		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual({
			deletedDrafts: h.state.deletedDrafts,
			openedDrafts: h.openedDrafts,
			cardCount: h.container.querySelectorAll('.project-board-card-draft').length,
		}, {
			deletedDrafts: ['draft'],
			openedDrafts: [],
			cardCount: 0,
		});
	});

	test('PB-16 draft card activation surfaces navigation failures', async () => {
		const { service, container, drafts, state, errors } = createBoard(mainWindow.document);
		drafts.set([{ id: 'draft', resource: URI.parse('test-draft:session'), hasContent: true, submitted: false }], undefined);
		await service.open();
		state.navigationError = new Error('Draft navigation failed');
		const notification = Event.toPromise(errors.event);
		container.querySelector('.project-board-card-draft')!.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		assert.strictEqual(await notification, 'The session draft could not be opened.');
	});

	test('PB-02 newly discovered external chats automatically enter Unassigned exactly once', async () => {
		const { service, container, state, session, sessionsChanged } = createBoard(mainWindow.document.implementation.createHTMLDocument());
		await service.open();
		const chat = new TestChat('Discovered elsewhere');
		session.chats.set([chat], undefined);
		state.sessions = [session];
		sessionsChanged.fire({ added: [session], removed: [], changed: [] });
		sessionsChanged.fire({ added: [], removed: [], changed: [session] });
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.project-board-unassigned h4'), element => element.textContent), ['Discovered elsewhere']);
	});

	test('PB-04 distinct state colors accompany text, including unread idle', async () => {
		const chat = new TestChat('State colors');
		const { service, container } = createBoard(mainWindow.document, [chat]);
		container.style.setProperty('--vscode-progressBar-background', 'rgb(1, 2, 3)');
		container.style.setProperty('--vscode-notificationsWarningIcon-foreground', 'rgb(4, 5, 6)');
		container.style.setProperty('--vscode-notificationsErrorIcon-foreground', 'rgb(7, 8, 9)');
		container.style.setProperty('--vscode-list-highlightForeground', 'rgb(10, 11, 12)');
		container.style.setProperty('--vscode-descriptionForeground', 'rgb(13, 14, 15)');
		await service.open();
		const colors: string[] = [];
		for (const status of [SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Error, SessionStatus.Completed]) {
			chat.status.set(status, undefined);
			colors.push(mainWindow.getComputedStyle(container.querySelector('.project-board-card')!).borderLeftColor);
		}
		chat.isRead.set(true, undefined);
		colors.push(mainWindow.getComputedStyle(container.querySelector('.project-board-card')!).borderLeftColor);
		assert.deepStrictEqual(colors, ['rgb(1, 2, 3)', 'rgb(4, 5, 6)', 'rgb(7, 8, 9)', 'rgb(10, 11, 12)', 'rgb(13, 14, 15)']);
	});

	test('PB-02 renders distinct visible chats and updates only the changed title', async () => {
		const main = new TestChat('main');
		const child = new TestChat('child');
		child.interactivity.set(ChatInteractivity.ReadOnly, undefined);
		const hidden = new TestChat('hidden');
		hidden.interactivity.set(ChatInteractivity.Hidden, undefined);
		const { service, container } = createBoard(mainWindow.document.implementation.createHTMLDocument(), [main, child, hidden]);
		await service.open();
		child.title.set('Renamed child', undefined);
		assert.deepStrictEqual(Array.from(container.querySelectorAll('h4'), element => element.textContent), ['main', 'Renamed child']);
		assert.strictEqual(container.querySelectorAll('.project-board-card-session').length, 0);
		assert.ok([...container.querySelectorAll('[data-chat-resource]')].every(card => card.getAttribute('aria-label')?.includes('Owning session')));
	});

	test('PB-03 preserves keyboard focus across movement and live updates', async () => {
		const { document } = createBoardDocument();
		const chat = new TestChat('child');
		const h = createBoard(document, [chat]);
		const { service, container, opened } = h;
		await service.open();
		const card = container.querySelector<HTMLElement>('.project-board-card')!;
		card.focus();
		await h.moveViaPicker('General, P1');
		assert.strictEqual(h.pick.lastCall.args[1].activeItem.label, 'Unassigned');
		assert.strictEqual(document.activeElement, container.querySelector('.project-board-card'));
		assert.strictEqual(container.querySelector('.project-board-card-group[aria-label="General, P1"] h4')!.textContent, 'child');
		chat.status.set(SessionStatus.NeedsInput, undefined);
		assert.strictEqual(document.activeElement, container.querySelector('.project-board-card'));
		assert.strictEqual(container.querySelector('.project-board-card-status-label')!.textContent, 'Needs Input');
		await h.moveViaPicker('Unassigned');
		assert.strictEqual(h.pick.lastCall.args[1].activeItem.label, 'General, P1');
		assert.strictEqual(container.querySelector('.project-board-unassigned h4')!.textContent, 'child');
		assert.strictEqual(container.querySelectorAll('.project-board-card').length, 1);
		assert.strictEqual(chat.isRead.get(), false);
		assert.deepStrictEqual(opened, []);
	});

	test('PB-05 background updates do not reclaim focus from the opened chat window', async () => {
		const { document, nativeFocus } = createBoardDocument();
		const chat = new TestChat('Focus handoff');
		const h = createBoard(document, [chat]);
		const { service, container } = h;
		await service.open();
		let restoredFocus = 0;
		store.add(addDisposableListener(container, 'focusin', () => restoredFocus++));

		for (const selector of ['.project-board-card', '[data-board-control="new-session"]', '[data-board-control="show-archived"]']) {
			nativeFocus.returns(true);
			const control = container.querySelector<HTMLElement>(selector)!;
			control.focus();
			restoredFocus = 0;
			// Native window deactivation retains its document's active element, unlike iframe blur.
			nativeFocus.returns(false);
			assert.strictEqual(document.activeElement, control, `Retained active element: ${selector}`);
			assert.strictEqual(document.hasFocus(), false, `Focus left board: ${selector}`);

			chat.title.set(`Updated ${selector}`, undefined);

			assert.strictEqual(restoredFocus, 0, `Background refresh must not steal focus: ${selector}`);
		}

		nativeFocus.returns(true);
		const card = container.querySelector<HTMLElement>('.project-board-card')!;
		card.focus();
		const pendingPick = new DeferredPromise<IQuickPickItem | undefined>();
		h.pick.callsFake(() => pendingPick.p);
		card.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 77, ctrlKey: !isMacintosh, metaKey: isMacintosh, shiftKey: true, bubbles: true, cancelable: true }));
		card.blur();
		restoredFocus = 0;
		nativeFocus.returns(false);
		await pendingPick.complete(undefined);
		await Promise.resolve();
		assert.strictEqual(restoredFocus, 0, 'Closing a background destination picker must not steal focus');

		nativeFocus.returns(true);
		container.querySelector<HTMLElement>('.project-board-card')!.focus();
		restoredFocus = 0;
		nativeFocus.resetHistory();
		nativeFocus.onFirstCall().returns(true);
		nativeFocus.onSecondCall().returns(false);
		chat.title.set('Focus transferred during render', undefined);
		assert.strictEqual(restoredFocus, 0, 'A focus transfer during render must also be respected');
	});

	test('PB-03 drag and drop still moves a card and returns it to Unassigned', async () => {
		const chat = new TestChat('Dragged chat');
		const { service, container, opened } = createBoard(mainWindow.document, [chat]);
		await service.open();
		for (const target of ['.project-board-card-group[aria-label="General, P2"]', '.project-board-unassigned']) {
			const dataTransfer = new mainWindow.DataTransfer();
			container.querySelector('.project-board-card')!.dispatchEvent(new mainWindow.DragEvent('dragstart', { bubbles: true, dataTransfer }));
			container.querySelector(target)!.dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
			assert.strictEqual(container.querySelector(`${target} h4`)!.textContent, 'Dragged chat');
			assert.strictEqual(container.querySelectorAll('.project-board-card').length, 1);
		}
		assert.strictEqual(chat.isRead.get(), false);
		assert.deepStrictEqual(opened, []);
	});

	test('PB-04 reflects live runtime and read state without opening chats', async () => {
		const chat = new TestChat('child');
		const { service, container, opened, state } = createBoard(mainWindow.document.implementation.createHTMLDocument(), [chat]);
		await service.open();
		const labels = [container.querySelector('.project-board-card-status-label')!.textContent];
		for (const status of [SessionStatus.NeedsInput, SessionStatus.Completed]) {
			chat.status.set(status, undefined);
			labels.push(container.querySelector('.project-board-card-status-label')!.textContent);
		}
		assert.deepStrictEqual(labels, ['Busy', 'Needs Input', 'Idle, unvisited']);
		assert.strictEqual(chat.isRead.get(), false);
		assert.deepStrictEqual(opened, []);
		assert.strictEqual(state.ownerFocusCount, 0);
	});

	test('PB-04 busy animation loads locally and reduced motion retains the static runner', async () => {
		const chat = new TestChat('Animated runner');
		const { service, container } = createBoard(mainWindow.document, [chat]);
		await service.open();
		const icon = container.querySelector<HTMLElement>('.project-board-card-status-running')!;
		const reducedMotion = mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!reducedMotion) {
			const animation = mainWindow.getComputedStyle(icon, '::before');
			assert.ok(animation.backgroundImage.endsWith('/running-person.gif")'));
			assert.strictEqual(animation.display, 'block');
			assert.strictEqual(mainWindow.getComputedStyle(icon).fontSize, '0px');
			const image = mainWindow.document.createElement('img');
			image.src = animation.backgroundImage.slice(5, -2);
			await image.decode();
			assert.deepStrictEqual([image.naturalWidth, image.naturalHeight], [48, 48]);
		}
		container.classList.add('monaco-reduce-motion');
		assert.deepStrictEqual({
			display: mainWindow.getComputedStyle(icon, '::before').display,
			background: mainWindow.getComputedStyle(icon, '::before').backgroundImage,
			glyph: icon.textContent,
			hidden: icon.getAttribute('aria-hidden'),
		}, { display: 'none', background: 'none', glyph: '\u{1F3C3}', hidden: 'true' });
		assert.notStrictEqual(mainWindow.getComputedStyle(icon).fontSize, '0px');
		container.classList.remove('monaco-reduce-motion');
		assert.strictEqual(mainWindow.getComputedStyle(icon, '::before').display, reducedMotion ? 'none' : 'block');
		chat.status.set(SessionStatus.Completed, undefined);
		assert.strictEqual(container.querySelector('.project-board-card-status-running'), null);
	});

	test('PB-04 status glyphs accompany accessible text for every runtime and read state', async () => {
		const chat = new TestChat('Status glyphs');
		const { service, container } = createBoard(mainWindow.document, [chat]);
		await service.open();
		for (const [status, isRead, glyph, label] of [
			[SessionStatus.InProgress, false, '\u{1F3C3}', 'Busy'],
			[SessionStatus.NeedsInput, false, '\u{1F64B}', 'Needs Input'],
			[SessionStatus.Error, false, '\u26A0\uFE0F', 'Error'],
			[SessionStatus.Completed, false, '\u{1F440}', 'Idle, unvisited'],
			[SessionStatus.Completed, true, '\u{1F634}', 'Idle, visited'],
		] as const) {
			chat.status.set(status, undefined);
			chat.isRead.set(isRead, undefined);
			const icon = container.querySelector('.project-board-card-status-icon')!;
			assert.strictEqual(icon.classList.contains('project-board-card-status-running'), status === SessionStatus.InProgress);
			assert.deepStrictEqual({
				glyph: icon.textContent,
				hidden: icon.getAttribute('aria-hidden'),
				label: container.querySelector('.project-board-card-status-label')!.textContent,
				cardLabel: container.querySelector('.project-board-card')!.getAttribute('aria-label'),
			}, { glyph, hidden: 'true', label, cardLabel: `Status glyphs, Owning session, ${label}` });
		}
	});

	test('PB-05 cards only have their Done action and double-click opens the exact child', async () => {
		const main = new TestChat('main');
		const child = new TestChat('child');
		const { service, container, opened, onOpened, state } = createBoard(mainWindow.document.implementation.createHTMLDocument(), [main, child]);
		await service.open();
		const card = [...container.querySelectorAll<HTMLElement>('.project-board-card')].find(element => element.querySelector('h4')?.textContent === 'child')!;
		assert.deepStrictEqual({
			doneActions: container.querySelectorAll('.project-board-card [aria-label="Mark as Done"]').length,
			otherControls: container.querySelectorAll('.project-board-card button, .project-board-card select, .project-board-card .monaco-button:not([aria-label="Mark as Done"])').length,
		}, { doneActions: 2, otherControls: 0 });
		card.click();
		assert.deepStrictEqual(opened, []);
		assert.strictEqual(child.isRead.get(), false);
		for (const target of ['h4', '.project-board-card-status-icon']) {
			const doubleClickOpened = Event.toPromise(onOpened.event);
			card.querySelector(target)!.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
			await doubleClickOpened;
		}
		assert.deepStrictEqual(opened, [child.resource, child.resource]);
		assert.strictEqual(state.ownerFocusCount, 0);
	});

	test('PB-05 Enter and Space open a focused card without repeated or modified activation', async () => {
		const child = new TestChat('Keyboard chat');
		const { service, container, opened, state } = createBoard(mainWindow.document, [child]);
		await service.open();
		const card = container.querySelector<HTMLElement>('.project-board-card')!;
		assert.strictEqual(card.getAttribute('role'), 'group');
		assert.strictEqual(card.tabIndex, 0);
		card.focus();
		for (const keyCode of [13, 32]) {
			const event = new mainWindow.KeyboardEvent('keydown', { keyCode, bubbles: true, cancelable: true });
			card.dispatchEvent(event);
			assert.strictEqual(event.defaultPrevented, true);
		}
		card.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, repeat: true, bubbles: true }));
		card.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, ctrlKey: true, bubbles: true }));
		assert.deepStrictEqual(opened, [child.resource, child.resource]);
		assert.strictEqual(state.ownerFocusCount, 0);
	});

	test('PB-05 nested links do not open the chat', async () => {
		const { service, container, opened } = createBoard(mainWindow.document, [new TestChat('Linked chat')]);
		await service.open();
		const link = mainWindow.document.createElement('a');
		link.textContent = 'Related pull request';
		const icon = mainWindow.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		link.appendChild(icon);
		container.querySelector('.project-board-card')!.appendChild(link);
		link.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		icon.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		link.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, bubbles: true }));
		assert.deepStrictEqual(opened, []);
	});

	test('PB-05 surfaces navigation failures as notifications', async () => {
		const { service, container, state, errors } = createBoard(mainWindow.document.implementation.createHTMLDocument(), [new TestChat('child')]);
		await service.open();
		state.navigationError = new Error('Navigation failed');
		const notification = Event.toPromise(errors.event);
		container.querySelector('.project-board-card')!.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		assert.strictEqual(await notification, 'The chat could not be opened.');
	});

	test('PB-15 reuses Ask User question presentation read-only and clears after input', async () => {
		const chat = new TestChat('Question');
		chat.status.set(SessionStatus.NeedsInput, undefined);
		const { service, container, questionPreview, opened } = createBoard(mainWindow.document.implementation.createHTMLDocument(), [chat]);
		questionPreview.set({
			kind: 'ready', questions: [{
				id: 'layout', type: 'singleSelect', title: 'Layout', text: 'Choose a layout', description: 'Choose what to build first.',
				detailedMessage: 'Consider **accessibility**.',
				options: [{ id: 'list', label: 'List - Dense scan' }, { id: 'grid', label: 'Grid - Visual overview' }],
				allowFreeformInput: false, allowSkip: false,
			}], permissions: [], unsupported: [], truncated: false
		}, undefined);
		await service.open();
		const preview = container.querySelector('.project-board-card-input')!;
		assert.deepStrictEqual({
			title: preview.querySelector('.chat-question-heading')?.textContent,
			message: preview.querySelector('.chat-question-title')?.textContent,
			description: preview.querySelector('.chat-question-description')?.textContent,
			details: preview.querySelector('.chat-question-detailed-message strong')?.textContent,
			options: Array.from(preview.querySelectorAll('.chat-question-list-label-title'), element => element.textContent),
			optionDescriptions: Array.from(preview.querySelectorAll('.chat-question-list-label-desc'), element => element.textContent),
			controls: preview.querySelectorAll('input, textarea, button, [role="listbox"]').length,
			described: container.querySelector('.project-board-card')?.getAttribute('aria-describedby')?.split(' ').includes(preview.id),
		}, {
			title: 'Layout', message: 'Choose a layout', description: 'Choose what to build first.', details: 'accessibility',
			options: ['List', 'Grid'], optionDescriptions: ['Dense scan', 'Visual overview'], controls: 0, described: true,
		});
		preview.querySelector('.chat-question-list-item')!.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true }));
		assert.deepStrictEqual(opened, []);
		assert.strictEqual(chat.isRead.get(), false);
		chat.status.set(SessionStatus.Completed, undefined);
		assert.strictEqual(container.querySelector('.project-board-card-input'), null);
	});

	test('PB-15 limits observed question previews and reports load errors once', async () => {
		const chats = Array.from({ length: 9 }, (_, i) => new TestChat(`Question ${i}`));
		for (const chat of chats) {
			chat.status.set(SessionStatus.NeedsInput, undefined);
		}
		const { service, container, questionPreview, errors, sessionsChanged } = createBoard(mainWindow.document.implementation.createHTMLDocument(), chats);
		const notifications: string[] = [];
		store.add(errors.event(message => notifications.push(message)));
		questionPreview.set({ kind: 'error', message: 'Question preview unavailable', error: 'Failed model load' }, undefined);
		await service.open();
		assert.strictEqual(notifications.length, 8);
		assert.ok(container.querySelectorAll('.project-board-card-input')[8].textContent?.includes('Open this chat'));
		sessionsChanged.fire({ added: [], removed: [], changed: [] });
		assert.strictEqual(notifications.length, 8);
	});

	test('PB-15 pending questions offer selectable options and a custom answer textbox', async () => {
		const chat = new TestChat('Interactive question');
		chat.status.set(SessionStatus.NeedsInput, undefined);
		const h = createBoard(mainWindow.document, [chat]);
		h.questionPreview.set({
			kind: 'ready', questions: [{
				id: 'layout', type: 'singleSelect', title: 'Layout', text: 'Choose a layout', description: undefined,
				options: [{ id: 'list', label: 'List' }, { id: 'grid', label: 'Grid' }],
				allowFreeformInput: true, allowSkip: false,
			}], permissions: [], unsupported: [], truncated: false
		}, undefined);
		const carousel = new ChatQuestionCarouselData([{
			id: 'layout', type: 'singleSelect', title: 'Layout', message: 'Choose a layout',
			options: [{ id: 'list', label: 'List', value: 'list-value' }, { id: 'grid', label: 'Grid', value: 'grid-value' }],
			allowFreeformInput: true,
		}], false, 'resolve-layout');
		h.questionCarousels.set([{ carousel, requestId: 'request-layout' }], undefined);
		await h.service.open();
		assert.ok(h.container.querySelector('.chat-question-freeform-textarea'), 'The shared Ask User widget must expose its custom-answer input');
		assert.strictEqual(h.container.querySelectorAll('[role="option"]').length, 2);
		h.container.querySelector('[role="option"]')!.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true }));
		assert.deepStrictEqual(h.submittedAnswers, [{ requestId: 'request-layout', resolveId: 'resolve-layout', answers: { layout: { selectedValue: 'list-value', freeformValue: undefined } } }]);
		assert.strictEqual(h.container.querySelector('.project-board-live-question'), null);
		assert.deepStrictEqual(h.opened, []);
		assert.strictEqual(chat.isRead.get(), false);
	});

	test('PB-15/PB-22 custom answers survive collapse and refreshes before shared-widget submission', async () => {
		const { document } = createBoardDocument();
		const chat = new TestChat('Custom question');
		chat.status.set(SessionStatus.NeedsInput, undefined);
		const h = createBoard(document, [chat]);
		const carousel = new ChatQuestionCarouselData([{
			id: 'layout', type: 'singleSelect', title: 'Layout', message: 'Choose a layout',
			options: [{ id: 'list', label: 'List', value: 'list-value' }], allowFreeformInput: true,
		}], false, 'custom-layout');
		h.questionPreview.set({ kind: 'ready', questions: [], permissions: [], unsupported: [], truncated: false }, undefined);
		h.questionCarousels.set([{ carousel, requestId: 'custom-request' }], undefined);
		await h.service.open();
		const textarea = h.container.querySelector<HTMLTextAreaElement>('textarea')!;
		textarea.focus();
		textarea.value = 'Calendar layout';
		textarea.setSelectionRange(3, 7);
		textarea.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		h.container.querySelector<HTMLElement>('.project-board-card-select')!.click();
		assert.deepStrictEqual({
			sameInput: h.container.querySelector('textarea') === textarea, text: textarea.value,
			selection: [textarea.selectionStart, textarea.selectionEnd],
			selected: h.container.querySelector('.project-board-selection-count')?.textContent,
		}, { sameInput: true, text: 'Calendar layout', selection: [3, 7], selected: '1 conversation selected' });
		const collapse = () => h.container.querySelector<HTMLElement>('[data-board-control="collapse:unassigned"]')!;
		collapse().focus();
		collapse().click();
		assert.strictEqual(h.container.querySelector('textarea'), textarea);
		assert.ok(textarea.closest('.project-board-card-list[hidden]'));
		assert.deepStrictEqual([textarea.value, textarea.selectionStart, textarea.selectionEnd], ['Calendar layout', 3, 7]);
		collapse().click();
		textarea.focus();
		for (const keyCode of [37, 38, 39, 40, 35, 36]) {
			textarea.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode, bubbles: true, cancelable: true }));
			assert.strictEqual(document.activeElement, textarea, 'Card navigation must not capture answer-field keys');
		}
		chat.title.set('Updated question title', undefined);
		h.sessionsChanged.fire({ added: [], removed: [], changed: [h.session] });
		assert.deepStrictEqual({
			sameInput: h.container.querySelector('textarea') === textarea,
			focused: document.activeElement === textarea,
			text: textarea.value,
			selection: [textarea.selectionStart, textarea.selectionEnd],
			submissions: h.submittedAnswers.length,
			selected: h.container.querySelector('.project-board-selection-count')?.textContent,
		}, { sameInput: true, focused: true, text: 'Calendar layout', selection: [3, 7], submissions: 0, selected: '1 conversation selected' });
		textarea.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, ctrlKey: true, bubbles: true, cancelable: true }));
		assert.deepStrictEqual(h.submittedAnswers, [{ requestId: 'custom-request', resolveId: 'custom-layout', answers: { layout: { selectedValue: undefined, freeformValue: 'Calendar layout' } } }]);
		assert.deepStrictEqual(h.opened, []);
	});

	test('PB-15 multiple questions retain answers until the final step and archived cards cannot answer', async () => {
		const chat = new TestChat('Multiple questions');
		chat.status.set(SessionStatus.NeedsInput, undefined);
		const h = createBoard(mainWindow.document, [chat]);
		const carousel = new ChatQuestionCarouselData([
			{ id: 'one', type: 'singleSelect', title: 'First choice', options: [{ id: 'first', label: 'First', value: 'first-value' }], allowFreeformInput: false },
			{ id: 'two', type: 'multiSelect', title: 'Second choice', options: [{ id: 'a', label: 'A', value: 'a-value' }, { id: 'b', label: 'B', value: 'b-value' }], allowFreeformInput: true },
		], false, 'multiple');
		h.questionPreview.set({ kind: 'ready', questions: [], permissions: [], unsupported: [], truncated: false }, undefined);
		h.questionCarousels.set([{ carousel, requestId: 'multiple-request' }], undefined);
		await h.service.open();
		h.container.querySelector('[role="option"]')!.dispatchEvent(new mainWindow.MouseEvent('click', { bubbles: true }));
		assert.strictEqual(h.submittedAnswers.length, 0);
		for (const option of h.container.querySelectorAll<HTMLElement>('[role="option"]')) {
			option.click();
		}
		h.container.querySelector<HTMLElement>('.chat-question-submit-button')!.click();
		assert.strictEqual(h.submittedAnswers.length, 1);
		assert.deepStrictEqual(h.submittedAnswers[0].answers, {
			one: { selectedValue: 'first-value', freeformValue: undefined },
			two: { selectedValues: ['a-value', 'b-value'], freeformValue: undefined },
		});

		test('pending answer input survives embedded board switching and submits only once across boards', () => {
			const { document } = createBoardDocument();
			const chat = new TestChat('Shared pending question');
			chat.status.set(SessionStatus.NeedsInput, undefined);
			const h = createBoard(document, [chat]);
			const second = h.catalog.createBoard('Second');
			const carousel = new ChatQuestionCarouselData([{
				id: 'choice', type: 'singleSelect', title: 'Choice', message: 'Choose',
				options: [{ id: 'one', label: 'One', value: 'one' }], allowFreeformInput: true,
			}], false, 'shared-answer');
			h.questionPreview.set({ kind: 'ready', questions: [], permissions: [], unsupported: [], truncated: false }, undefined);
			h.questionCarousels.set([{ carousel, requestId: 'shared-request' }], undefined);
			store.add(h.service.createView(h.container));
			const first = h.container.querySelector<HTMLElement>('[data-board-id="default"]')!;
			const textarea = first.querySelector<HTMLTextAreaElement>('textarea')!;
			textarea.value = 'Keep my answer';
			textarea.setSelectionRange(2, 6);
			textarea.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
			h.catalog.selectBoard(second);
			assert.strictEqual(first.parentElement!.hidden, true);
			h.catalog.selectBoard(DEFAULT_PROJECT_BOARD_ID);
			assert.strictEqual(first.querySelector('textarea'), textarea);
			assert.deepStrictEqual([textarea.value, textarea.selectionStart, textarea.selectionEnd], ['Keep my answer', 2, 6]);
			textarea.focus();
			textarea.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, ctrlKey: true, bubbles: true, cancelable: true }));
			assert.strictEqual(h.submittedAnswers.length, 1);
			h.catalog.selectBoard(second);
			const other = h.container.querySelector(`[data-board-id="${second}"]`)!;
			assert.strictEqual(other.querySelector('.project-board-live-question'), null);
			assert.strictEqual(h.submittedAnswers.length, 1);
		});
		h.questionCarousels.set([{ carousel: new ChatQuestionCarouselData([{ id: 'archived', type: 'text', title: 'Archived' }], false), requestId: 'archived' }], undefined);
		h.questionPreview.set({ kind: 'ready', questions: [], permissions: [], unsupported: [], truncated: false }, undefined);
		assert.ok(h.container.querySelector('.project-board-live-question'));
		chat.isArchived.set(true, undefined);
		h.container.querySelector<HTMLElement>('[data-board-control="show-archived"]')!.click();
		assert.strictEqual(h.container.querySelector('.project-board-live-question'), null);
		chat.isArchived.set(false, undefined);
		assert.ok(h.container.querySelector('.project-board-live-question'));
		chat.interactivity.set(ChatInteractivity.ReadOnly, undefined);
		assert.strictEqual(h.container.querySelector('.project-board-live-question'), null);
	});

	test('PB-08 eight cards expand three at a time and include hidden Needs Input in the count', async () => {
		const chats = Array.from({ length: 8 }, (_, i) => new TestChat(`Overflow ${i}`));
		chats[7].status.set(SessionStatus.NeedsInput, undefined);
		const { service, container } = createIndependentChatBoard(mainWindow.document, chats);
		await service.open();
		for (const chat of chats) {
			const card = [...container.querySelectorAll('.project-board-card')].find(element => element.querySelector('h4')?.textContent === chat.title.get())!;
			const dataTransfer = new mainWindow.DataTransfer();
			card.dispatchEvent(new mainWindow.DragEvent('dragstart', { bubbles: true, dataTransfer }));
			container.querySelector('[aria-label="General, P0"]')!.dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		}
		const cell = () => container.querySelector('[aria-label="General, P0"]')!;
		const snapshot = () => ({
			cards: cell().querySelectorAll('.project-board-card').length,
			more: cell().querySelector('.project-board-more')?.textContent ?? null,
			attention: cell().querySelector('.project-board-attention')?.textContent,
		});
		assert.deepStrictEqual(snapshot(), { cards: 3, more: '+5 more', attention: '1 Needs Input' });
		assert.ok(cell().querySelector('.project-board-recency-warning')?.textContent?.includes('5 hidden chats'));
		chats[6].isArchived.set(true, undefined);
		assert.deepStrictEqual(snapshot(), { cards: 3, more: '+4 more', attention: '1 Needs Input' });
		chats[6].isArchived.set(false, undefined);
		const initialHeight = cell().getBoundingClientRect().height;
		cell().querySelector<HTMLElement>('.project-board-more')!.click();
		assert.deepStrictEqual(snapshot(), { cards: 6, more: '+2 more', attention: '1 Needs Input' });
		assert.ok(cell().getBoundingClientRect().height > initialHeight);
		cell().querySelector<HTMLElement>('.project-board-more')!.click();
		assert.deepStrictEqual(snapshot(), { cards: 8, more: null, attention: '1 Needs Input' });
		cell().querySelector<HTMLElement>('.project-board-less')!.click();
		assert.strictEqual(cell().querySelectorAll('.project-board-card').length, 3);
		assert.ok(chats.every(chat => !chat.isRead.get()));
	});

	test('PB-09 Show Archived restores hidden chat and owner placements without marking read', async () => {
		const chat = new TestChat('Archived placement');
		const h = createBoard(mainWindow.document, [chat]);
		const { service, container, session } = h;
		await service.open();
		await h.moveViaPicker('General, P1');
		for (const archived of [chat.isArchived, session.isArchived]) {
			archived.set(true, undefined);
			assert.strictEqual(container.querySelectorAll('.project-board-card').length, 0);
			container.querySelector<HTMLElement>('[data-board-control="show-archived"]')!.click();
			assert.strictEqual(container.querySelector('[aria-label="General, P1"] h4')?.textContent, 'Archived placement');
			container.querySelector<HTMLElement>('[data-board-control="show-archived"]')!.click();
			assert.strictEqual(container.querySelectorAll('.project-board-card').length, 0);
			archived.set(false, undefined);
			assert.strictEqual(container.querySelector('[aria-label="General, P1"] h4')?.textContent, 'Archived placement');
		}
		assert.strictEqual(chat.isRead.get(), false);
	});

	test('PB-11 context pills group artifacts, references and PRs without listing or opening their entries on the card', async () => {
		const chat = new TestChat('Shared context');
		const h = createBoard(mainWindow.document, [chat]);
		const file = URI.file('/project/generated.md');
		h.session.artifacts.set([{
			id: 'file', kind: SessionArtifactKind.File, label: 'Generated report', uri: file, isArtifact: true,
		}, {
			id: 'duplicate-reference', kind: SessionArtifactKind.File, label: 'Same report', uri: file, isArtifact: false,
		}, {
			id: 'reference', kind: SessionArtifactKind.Website, label: 'Documentation', link: URI.parse('https://example.com/docs'), isArtifact: false,
		}, {
			id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'example/project#12',
			link: URI.parse('https://github.com/example/project/pull/12'), isArtifact: true,
		}], undefined);
		h.metadata.set({
			kind: 'ready', prompt: 'Review the report', context: [
				{ label: 'Already an artifact', uri: file },
				{ label: 'Already a reference', uri: URI.parse('https://example.com/docs') },
				{ label: 'Already an owned PR', uri: URI.parse('https://github.com/example/project/pull/12') },
				{ label: 'Input context', uri: URI.file('/project/input.ts') },
			],
		}, undefined);
		await h.service.open();
		const pills = [...h.container.querySelectorAll<HTMLElement>('.chat-pill-button')];
		assert.deepStrictEqual({
			labels: pills.map(pill => pill.textContent),
			popups: pills.map(pill => pill.getAttribute('aria-haspopup')),
			rawLinks: h.container.querySelectorAll('.project-board-card a[href]').length,
			inlineFiles: h.container.textContent?.includes('generated.md'),
			inlinePR: h.container.textContent?.includes('example/project#12'),
			opened: h.opened, openedContext: h.openedContext, read: chat.isRead.get(),
		}, {
			labels: ['1 Artifact', '2 References', '1 Pull Request'], popups: ['listbox', 'listbox', 'listbox'],
			rawLinks: 0, inlineFiles: false, inlinePR: false, opened: [], openedContext: [], read: false,
		});
		pills[0].click();
		assert.ok(h.popup().textContent?.includes('generated.md'));
		assert.strictEqual(h.actionWidget.isVisible, true);
		assert.deepStrictEqual(h.openedContext, []);
		h.actionWidget.acceptSelected();
		pills[1].click();
		assert.ok(h.popup().textContent?.includes('Last prompt context'));
		assert.ok(h.popup().textContent?.includes('Input context'));
		h.actionWidget.hide(true);
		pills[2].click();
		pills[2].dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		assert.ok(h.popup().textContent?.includes('example/project#12'));
		assert.ok(h.popup().textContent?.includes('State unavailable'));
		h.actionWidget.acceptSelected();
		assert.deepStrictEqual({ opened: h.opened, openedContext: h.openedContext, read: chat.isRead.get() }, {
			opened: [], openedContext: [file.toString(), 'https://github.com/example/project/pull/12'], read: false,
		});
		assert.ok(h.service.getAccessibleContent().includes('Generated report'));
		assert.ok(h.service.getAccessibleContent().includes('/project/input.ts'));
	});

	for (const surface of ['embedded', 'standalone'] as const) {
		test(`${surface} context pills use native theme colors without rebuilding the card`, async () => {
			const h = createBoard(mainWindow.document, [new TestChat('Themed PR')]);
			h.session.artifacts.set([{
				id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'example/project#12',
				link: URI.parse('https://github.com/example/project/pull/12'), isArtifact: true,
			}], undefined);
			if (surface === 'embedded') {
				store.add(h.service.createView(h.container));
			} else {
				await h.service.open();
			}
			const pill = h.container.querySelector<HTMLElement>('.chat-pill-button')!;
			for (const color of ['rgb(79, 193, 255)', 'rgb(0, 95, 184)', 'rgb(255, 255, 0)']) {
				h.container.style.setProperty('--vscode-button-secondaryForeground', color);
				assert.strictEqual(mainWindow.getComputedStyle(pill).color, color);
			}
			assert.strictEqual(h.container.querySelector('.chat-pill-button'), pill);
		});
	}

	test('context pills retain focused triggers and pending answers during metadata and status updates', async () => {
		const { document } = createBoardDocument();
		const chat = new TestChat('Retained context');
		chat.status.set(SessionStatus.NeedsInput, undefined);
		const h = createBoard(document, [chat]);
		h.metadata.set({ kind: 'ready', context: [{ label: 'First input', uri: URI.file('/project/first.ts') }] }, undefined);
		h.questionPreview.set({ kind: 'ready', questions: [], permissions: [], unsupported: [], truncated: false }, undefined);
		h.questionCarousels.set([{
			carousel: new ChatQuestionCarouselData([{
				id: 'answer', type: 'singleSelect', title: 'Answer',
				options: [{ id: 'yes', label: 'Yes', value: 'yes' }], allowFreeformInput: true,
			}], false),
			requestId: 'context-question',
		}], undefined);
		await h.service.open();
		const answer = h.container.querySelector<HTMLTextAreaElement>('textarea')!;
		answer.value = 'Keep this answer';
		answer.setSelectionRange(2, 7);
		answer.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		const pill = h.container.querySelector<HTMLElement>('.chat-pill-button')!;
		pill.focus();
		h.metadata.set({
			kind: 'ready', prompt: 'Updated prompt',
			context: [{ label: 'First input', uri: URI.file('/project/first.ts') }, { label: 'Second input', uri: URI.file('/project/second.ts') }],
		}, undefined);
		await timeout(0);
		h.session.title.set('Updated owner title', undefined);
		assert.deepStrictEqual({
			retained: h.container.querySelector('.chat-pill-button') === pill,
			focused: document.activeElement === pill,
			label: pill.textContent,
			answerRetained: h.container.querySelector('textarea') === answer,
			answer: answer.value, selection: [answer.selectionStart, answer.selectionEnd],
			opened: h.opened, read: chat.isRead.get(), submitted: h.submittedAnswers,
		}, {
			retained: true, focused: true, label: '2 References',
			answerRetained: true, answer: 'Keep this answer', selection: [2, 7],
			opened: [], read: false, submitted: [],
		});
	});

	for (const change of ['fold', 'remove', 'archive', 'list', 'deactivate', 'dispose'] as const) {
		test(`context pills close their native popup on ${change}`, () => {
			const chat = new TestChat('Popup lifetime');
			const h = createBoard(mainWindow.document, [chat], undefined, change === 'list');
			if (change === 'list') {
				h.state.sessions = [{ ...createTestSession('Popup lifetime').session, ...h.session }];
			}
			h.session.artifacts.set([{
				id: 'file', kind: SessionArtifactKind.File, label: 'Report', uri: URI.file('/project/report.md'), isArtifact: true,
			}], undefined);
			const view = store.add(h.service.createView(h.container));
			h.container.querySelector<HTMLElement>('.chat-pill-button')!.click();
			assert.strictEqual(h.actionWidget.isVisible, true);
			switch (change) {
				case 'fold': h.container.querySelector<HTMLElement>('[data-board-control="collapse:unassigned"]')!.click(); break;
				case 'remove': h.session.chats.set([], undefined); break;
				case 'archive': h.session.isArchived.set(true, undefined); break;
				case 'list': h.service.toggleDisplayOption('showSessionList'); break;
				case 'deactivate': h.catalog.selectBoard(h.catalog.createBoard('Other')); break;
				case 'dispose': view.dispose(); break;
			}
			assert.deepStrictEqual({ visible: h.actionWidget.isVisible, opened: h.opened, read: chat.isRead.get() }, { visible: false, opened: [], read: false });
		});
	}

	test('context pills close a child popup when its parent folds and recreate it on expansion', () => {
		const parent = new TestChat('Parent');
		const child: IChat = { ...new TestChat('Worker'), origin: { kind: ChatOriginKind.Tool, parentChat: parent.resource } };
		const h = createBoard(mainWindow.document, [parent, child]);
		h.session.artifacts.set([{
			id: 'file', kind: SessionArtifactKind.File, label: 'Report', uri: URI.file('/project/report.md'), isArtifact: true,
		}], undefined);
		store.add(h.service.createView(h.container));
		const toggle = () => h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!;
		const childPill = () => h.container.querySelector<HTMLElement>('.project-board-child-cards .chat-pill-button');
		assert.strictEqual(childPill(), null);
		toggle().click();
		childPill()!.click();
		assert.strictEqual(h.actionWidget.isVisible, true);
		toggle().click();
		assert.strictEqual(h.actionWidget.isVisible, false);
		toggle().click();
		assert.strictEqual(childPill()?.textContent, '1 Artifact');
	});

	test('context pills hide empty categories and reveal exact prompt references only after refresh', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Deferred context')]);
		h.metadata.set({ kind: 'loading' }, undefined);
		await h.service.open();
		assert.strictEqual(h.container.querySelector('.chat-pill-button'), null);
		h.metadata.set({ kind: 'ready', context: [{ label: 'Loaded input', uri: URI.file('/project/input.ts') }] }, undefined);
		await timeout(0);
		const pill = h.container.querySelector<HTMLElement>('.chat-pill-button')!;
		assert.strictEqual(pill.textContent, '1 Reference');
		pill.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, bubbles: true }));
		assert.strictEqual(h.actionWidget.isVisible, true);
		h.metadata.set({ kind: 'ready', context: [] }, undefined);
		await timeout(0);
		assert.deepStrictEqual({
			visible: h.actionWidget.isVisible, pill: h.container.querySelector('.chat-pill-button'),
			opened: h.opened, openedContext: h.openedContext,
		}, { visible: false, pill: null, opened: [], openedContext: [] });
	});

	test('context pills report opener and clipboard failures instead of opening the chat', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Context failures')]);
		h.session.artifacts.set([{
			id: 'file', kind: SessionArtifactKind.File, label: 'Report', uri: URI.file('/project/report.md'), isArtifact: true,
		}], undefined);
		const errors: string[] = [];
		store.add(h.errors.event(error => errors.push(error)));
		const open = sinon.stub(h.instantiationService.get(IOpenerService), 'open').resolves(false);
		const notify = sinon.spy(h.instantiationService.get(INotificationService), 'error');
		store.add(toDisposable(() => { open.restore(); notify.restore(); }));
		store.add(h.service.createView(h.container));
		h.container.querySelector<HTMLElement>('.chat-pill-button')!.click();
		h.copy.rejects(new Error('Clipboard unavailable'));
		h.popup().querySelector<HTMLElement>('[aria-label="Copy path"]')!.click();
		await timeout(0);
		assert.ok(notify.calledWith('The context location could not be copied.'));
		h.actionWidget.acceptSelected();
		await timeout(0);
		assert.deepStrictEqual({ errors, opened: h.opened }, { errors: ['The context link could not be opened.'], opened: [] });
	});

	test('PR cards reuse owned associations, live icons and titles from the exact chat workspace without loading history', async () => {
		const chats = Array.from({ length: 17 }, (_, index) => new TestChat(`PR ${index.toString().padStart(2, '0')}`));
		const target = chats[16];
		const h = createBoard(mainWindow.document, chats);
		const uri = URI.parse('https://github.com/example/project/pull/12');
		const info = observableValue<IGitHubInfo | undefined>('github', undefined);
		const resolve = sinon.spy(() => info.set({
			owner: 'example', repo: 'project', pullRequests: [
				{ owner: 'example', repo: 'project', number: 12, uri, title: 'Fix the issue', icon: Codicon.gitPullRequestDraft, createdByThisSession: true },
				{ owner: 'example', repo: 'project', number: 99, uri: URI.parse('https://github.com/example/project/pull/99'), createdByThisSession: false },
			],
		}, undefined));
		target.workspace.set({
			uri: URI.file('/project'), label: 'Chat worktree', icon: Codicon.folder, isVirtualWorkspace: false, requiresWorkspaceTrust: false,
			folders: [{
				root: URI.file('/project'), workingDirectory: URI.file('/project'), name: 'project', description: undefined,
				gitRepository: { uri: URI.file('/project'), workTreeUri: undefined, baseBranchName: undefined, gitHubInfo: info, resolveGitHubInfo: resolve },
			}],
		}, undefined);
		h.session.artifacts.set([{ id: 'same-pr', kind: SessionArtifactKind.PullRequest, label: 'Recorded PR', link: uri, isArtifact: true }], undefined);
		await h.service.open();
		await timeout(0);
		h.container.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
		const card = () => [...h.container.querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => element.dataset.chatResource === target.resource.toString())!;
		const pr = () => [...card().querySelectorAll<HTMLElement>('.chat-pill-button')].find(pill => pill.textContent === '1 Pull Request')!;
		const prEntry = () => h.popup().querySelector<HTMLElement>('[aria-label^="example/project#12"]')!;
		const open = sinon.spy(h.instantiationService.get(IOpenerService), 'open');
		store.add(toDisposable(() => open.restore()));
		pr().click();
		pr().dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		assert.deepStrictEqual({
			resolve: resolve.callCount, label: pr().textContent, icon: !!prEntry().querySelector('.codicon-git-pull-request-draft'),
			description: prEntry().getAttribute('aria-label'), entries: h.popup().querySelectorAll('[aria-label^="example/project#12"]').length,
			reference: !!card().querySelector('[aria-label="Show 1 reference"]'),
			pending: !!card().querySelector('[data-board-control^="refresh:"]'),
			opened: h.opened, read: target.isRead.get(), openCalls: open.callCount,
		}, {
			resolve: 1, label: '1 Pull Request', icon: true,
			description: 'example/project#12: Fix the issue, Draft, https://github.com/example/project/pull/12', entries: 1, reference: true,
			pending: true, opened: [], read: false, openCalls: 0,
		});
		h.actionWidget.acceptSelected();
		assert.deepStrictEqual(open.firstCall.args[1], { fromUserGesture: true, allowCommands: false, openExternal: true });
		pr().click();
		const retained = pr();
		info.set({ owner: 'example', repo: 'project', pullRequest: { number: 12, uri, title: 'Merged fix', liveState: 'merged', icon: { ...Codicon.gitPullRequestDone, color: { id: 'gitDecoration.addedResourceForeground' } } } }, undefined);
		assert.strictEqual(pr(), retained);
		assert.strictEqual(h.actionWidget.isVisible, true);
		assert.ok(prEntry().querySelector('.codicon-git-pull-request-done'));
		assert.ok(prEntry().getAttribute('aria-label')?.includes('Merged'));
		assert.strictEqual(prEntry().querySelector<HTMLElement>('.codicon-git-pull-request-done')?.style.color, 'var(--vscode-gitDecoration-addedResourceForeground)');
		assert.ok(h.service.getAccessibleContent().includes('example/project#12: Merged fix'));
		assert.strictEqual(resolve.callCount, 1);
		for (const [state, icon, label] of [
			['open', 'git-pull-request', 'Open'],
			['closed', 'git-pull-request-closed', 'Closed'],
		] as const) {
			info.set({ owner: 'example', repo: 'project', pullRequest: { number: 12, uri, state } }, undefined);
			assert.ok(prEntry().querySelector(`.codicon-${icon}`));
			assert.strictEqual(prEntry().getAttribute('aria-label'), `example/project#12, ${label}, ${uri}`);
		}
		info.set(undefined, undefined);
		assert.ok(h.popup().querySelector('[aria-label^="Recorded PR, State unavailable"]'));
		h.session.artifacts.set([], undefined);
		assert.strictEqual(card().querySelector('.chat-pill-button'), null);
		assert.strictEqual(h.actionWidget.isVisible, false);
	});

	test('PB-06/PB-10 edited axes and placements survive reconstruction and cancelled deletion retains archived placements', async () => {
		const storage = store.add(new InMemoryStorageService());
		const chat = new TestChat('Persistent card');
		const first = createBoard(mainWindow.document, [chat], storage);
		first.quickInput.inputValues.push('Engineering', 'Product');
		let confirmations = 0;
		first.instantiationService.stub(IDialogService, {
			confirm: async confirmation => {
				assert.ok(confirmation.detail?.toString().includes('1 chat placements'));
				confirmations++;
				return { confirmed: false };
			}
		});
		await first.service.open();
		first.container.querySelector<HTMLElement>('[data-board-control="add-row"]')!.click();
		await Promise.resolve();
		const axis = () => [...first.container.querySelectorAll<HTMLElement>('[data-board-control]')].find(element => element.dataset.boardControl?.startsWith('axis:row:') && element.textContent === 'Engineering')!;
		assert.ok(axis());
		await first.moveViaPicker('Engineering, P0');
		axis().click();
		assert.strictEqual(first.contextMenu.delegate!.domForShadowRoot, first.container, 'Axis menus must be hosted in the board window');
		await first.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.axis.rename')!.run();
		const renamed = () => [...first.container.querySelectorAll<HTMLElement>('[data-board-control]')].find(element => element.dataset.boardControl?.startsWith('axis:row:') && element.textContent === 'Product')!;
		assert.strictEqual(first.container.querySelector('[aria-label="Product, P0"] h4')?.textContent, 'Persistent card');
		renamed().click();
		await first.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.axis.previous')!.run();
		assert.strictEqual(first.container.querySelector('.project-board-row-heading')?.textContent, 'Product');
		chat.isArchived.set(true, undefined);
		renamed().click();
		await first.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.axis.delete')!.run();
		assert.strictEqual(confirmations, 1);
		assert.ok(renamed());
		first.service.dispose();
		const restored = createBoard(mainWindow.document, [chat], storage);
		restored.instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: true }) });
		await restored.service.open();
		restored.container.querySelector<HTMLElement>('[data-board-control="show-archived"]')!.click();
		assert.strictEqual(restored.container.querySelector('[aria-label="Product, P0"] h4')?.textContent, 'Persistent card');
		const product = [...restored.container.querySelectorAll<HTMLElement>('[data-board-control]')].find(element => element.dataset.boardControl?.startsWith('axis:row:') && element.textContent === 'Product')!;
		product.click();
		await restored.contextMenu.delegate!.getActions().find(action => action.id === 'projectBoard.axis.delete')!.run();
		assert.strictEqual(restored.container.querySelector('.project-board-unassigned h4')?.textContent, 'Persistent card');
		assert.strictEqual(chat.isRead.get(), false);
	});

	test('PB-06 unavailable placed chats retain an explicit removable placeholder while hidden workers stay hidden', async () => {
		const chat = new TestChat('Temporarily missing');
		const h = createBoard(mainWindow.document, [chat]);
		await h.service.open();
		await h.moveViaPicker('General, P0');
		chat.interactivity.set(ChatInteractivity.Hidden, undefined);
		assert.strictEqual(h.container.querySelectorAll('.project-board-card').length, 0);
		chat.interactivity.set(ChatInteractivity.Full, undefined);
		h.state.sessions = [];
		h.sessionsChanged.fire({ added: [], removed: [h.session], changed: [] });
		assert.strictEqual(h.container.querySelector('[aria-label="General, P0"] .project-board-card-unavailable h4')?.textContent, 'Temporarily missing');
		h.state.sessions = [h.session];
		h.sessionsChanged.fire({ added: [h.session], removed: [], changed: [] });
		assert.strictEqual(h.container.querySelector('[aria-label="General, P0"] h4')?.textContent, 'Temporarily missing');
		h.state.sessions = [];
		h.sessionsChanged.fire({ added: [], removed: [h.session], changed: [] });
		h.container.querySelector<HTMLElement>('.project-board-card-unavailable .monaco-button')!.click();
		assert.strictEqual(h.container.querySelectorAll('.project-board-card-unavailable').length, 0);
	});

	test('PB-06 corrupt storage remains untouched until Reset Agents Hub is explicitly confirmed', async () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store(ProjectBoardCatalogService.LEGACY_STORAGE_KEY, '{broken', StorageScope.PROFILE, StorageTarget.MACHINE);
		const h = createBoard(mainWindow.document, [], storage);
		let confirmed = false;
		const confirm = sinon.stub(h.instantiationService.get(IDialogService), 'confirm').callsFake(async () => ({ confirmed }));
		store.add(toDisposable(() => confirm.restore()));
		store.add(h.service.createView(h.container));
		assert.ok(h.container.querySelector('.project-board-empty-hub'));
		assert.strictEqual(h.container.querySelector('[data-board-control="new-board"]')?.getAttribute('aria-disabled'), 'true');
		h.container.querySelector<HTMLElement>('[data-board-control="reset-hub"]')!.click();
		await Promise.resolve();
		assert.strictEqual(storage.get(ProjectBoardCatalogService.LEGACY_STORAGE_KEY, StorageScope.PROFILE), '{broken');
		confirmed = true;
		h.container.querySelector<HTMLElement>('[data-board-control="reset-hub"]')!.click();
		await Promise.resolve();
		assert.strictEqual(h.container.querySelector<HTMLElement>('.project-board-empty-hub')!.hidden, true);
		assert.deepStrictEqual([...h.container.querySelectorAll('.project-board-column-heading')].map(element => element.textContent), ['P0', 'P1', 'P2', 'P3']);
	});

	test('PB-10 rerender preserves the auxiliary context-view host for subsequent menus', async () => {
		const chat = new TestChat('Menu owner');
		const h = createBoard(mainWindow.document, [chat]);
		await h.service.open();
		const contextHost = mainWindow.document.createElement('div');
		contextHost.className = 'context-view-host';
		h.container.appendChild(contextHost);
		chat.title.set('Updated menu owner', undefined);
		assert.strictEqual(contextHost.parentElement, h.container);
		assert.strictEqual(h.container.querySelectorAll('.project-board').length, 1);
	});

	test('PB-07/PB-11 last prompt and submission time are explicit and metadata previews stay bounded', async () => {
		const chats = Array.from({ length: 17 }, (_, index) => new TestChat(`Prompt ${index.toString().padStart(2, '0')}`));
		const h = createBoard(mainWindow.document, chats);
		h.metadata.set({ kind: 'ready', prompt: 'A submitted prompt', submittedAt: 1000, context: [] }, undefined);
		await h.service.open();
		assert.strictEqual(h.container.querySelectorAll('[data-submitted-at="1000"]').length, 16);
		assert.ok(!h.container.textContent?.includes('Metadata preview limit reached'));
		assert.deepStrictEqual([...h.container.querySelectorAll('.project-board-card-prompt')].map(element => element.textContent), Array(16).fill('A submitted prompt'));
		assert.strictEqual(h.container.querySelector('[data-board-control^="refresh:"]')?.textContent, 'Pending refresh');
		chats[0].title.set('Agent-updated title', undefined);
		chats[0].isRead.set(true, undefined);
		assert.strictEqual(h.container.querySelector('[data-submitted-at]')?.getAttribute('data-submitted-at'), '1000');
		h.metadata.set({ kind: 'ready', prompt: 'A prompt without a known timestamp', context: [] }, undefined);
		await timeout(0);
		assert.strictEqual(h.container.querySelector('[data-submitted-at]'), null);
		assert.ok(h.container.textContent?.includes('Recency unavailable'));
	});

	for (const surface of ['embedded', 'standalone'] as const) {
		test(`${surface} Pending refresh loads the clicked card at capacity across cooperating views without navigation`, async () => {
			const chats = Array.from({ length: 17 }, (_, index) => new TestChat(`Refresh ${index.toString().padStart(2, '0')}`));
			const { document } = createBoardDocument();
			const h = createBoard(document, chats);
			chats[0].status.set(SessionStatus.NeedsInput, undefined);
			const carousel = new ChatQuestionCarouselData([{
				id: 'choice', type: 'singleSelect', title: 'Choice', options: [{ id: 'one', label: 'One', value: 'one' }], allowFreeformInput: true,
			}], false, 'protected-question');
			h.questionPreview.set({ kind: 'ready', questions: [], permissions: [], unsupported: [], truncated: false }, undefined);
			h.questionCarousels.set([{ carousel, requestId: 'protected-request' }], undefined);
			h.metadata.set({ kind: 'ready', prompt: 'Loaded prompt', context: [] }, undefined);
			if (surface === 'embedded') {
				store.add(h.service.createView(h.container));
			} else {
				await h.service.open();
			}
			const other = h.catalog.createBoard('Other');
			await h.service.open(other);
			const origin = h.container.querySelector<HTMLElement>(`.project-board[data-board-id="${DEFAULT_PROJECT_BOARD_ID}"]`)!;
			const otherBoard = h.currentContainer.querySelector<HTMLElement>(`.project-board[data-board-id="${other}"]`)!;
			origin.querySelector<HTMLElement>('[data-board-control^="collapse:children:"]')!.click();
			const textarea = origin.querySelector<HTMLTextAreaElement>('textarea')!;
			const otherTextarea = otherBoard.querySelector('textarea');
			textarea.value = 'Keep my draft';
			textarea.setSelectionRange(1, 4);
			textarea.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
			const target = chats[16];
			const card = (container: HTMLElement, chat: IChat) => [...container.querySelectorAll<HTMLElement>('[data-chat-resource]')].find(element => element.dataset.chatResource === chat.resource.toString())!;
			const button = card(origin, target).querySelector<HTMLElement>('[data-board-control^="refresh:"]')!;
			button.focus();
			assert.strictEqual(document.activeElement, button);
			button.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, bubbles: true, cancelable: true }));
			await timeout(0);
			assert.deepStrictEqual({
				prompt: card(origin, target).querySelector('.project-board-card-prompt')?.textContent,
				sharedPrompt: card(otherBoard, target).querySelector('.project-board-card-prompt')?.textContent,
				firstDeferred: card(origin, chats[1]).querySelector('[data-board-control^="refresh:"]')?.textContent,
				sharedDeferred: card(otherBoard, chats[1]).querySelector('[data-board-control^="refresh:"]')?.textContent,
				loaded: origin.querySelectorAll('.project-board-card-prompt').length,
				opened: h.opened, read: target.isRead.get(), deleted: h.state.deletedSessions,
			}, { prompt: 'Loaded prompt', sharedPrompt: 'Loaded prompt', firstDeferred: 'Pending refresh', sharedDeferred: 'Pending refresh', loaded: 16, opened: [], read: false, deleted: [] });
			assert.deepStrictEqual({
				inputRetained: origin.querySelector('textarea') === textarea, otherInputRetained: otherBoard.querySelector('textarea') === otherTextarea,
				input: textarea.value, selection: [textarea.selectionStart, textarea.selectionEnd], answers: h.submittedAnswers,
				focus: document.activeElement === card(origin, target),
			}, { inputRetained: true, otherInputRetained: true, input: 'Keep my draft', selection: [1, 4], answers: [], focus: true });
		});
	}

	test('refresh loading is disabled while genuine metadata errors and missing user prompts remain explicit', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Loading details')]);
		h.metadata.set({ kind: 'loading' }, undefined);
		await h.service.open();
		const button = h.container.querySelector<HTMLElement>('[data-board-control^="refresh:"]')!;
		assert.deepStrictEqual({
			label: button.textContent, disabled: button.getAttribute('aria-disabled'), busy: button.getAttribute('aria-busy'),
			prompt: h.container.querySelector('.project-board-card-prompt'), warnings: h.container.querySelectorAll('.project-board-card-warning').length,
		}, { label: 'Refreshing…', disabled: 'true', busy: 'true', prompt: null, warnings: 0 });
		for (const metadata of [
			{ kind: 'error', message: 'History load failed', error: 'History load failed' },
			{ kind: 'unavailable', message: 'No submitted user prompt available.' },
		] as const) {
			h.metadata.set(metadata, undefined);
			await timeout(0);
			assert.deepStrictEqual({
				button: h.container.querySelector('[data-board-control^="refresh:"]'),
				message: h.container.querySelector('.project-board-card-warning')?.textContent,
			}, { button: null, message: metadata.message });
		}
	});

	test('PB-11 empty prompt metadata is informational rather than an agent failure warning', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Empty request')]);
		h.metadata.set({ kind: 'ready', submittedAt: 1000, context: [], message: 'The latest request has no stored prompt text.' }, undefined);
		await h.service.open();
		assert.deepStrictEqual({
			prompt: h.container.querySelector('.project-board-card-prompt')?.textContent,
			note: h.container.querySelector('.project-board-card-metadata-note')?.textContent,
			warnings: h.container.querySelectorAll('.project-board-card-warning').length,
		}, {
			prompt: 'No prompt text', note: 'The latest request has no stored prompt text.', warnings: 0,
		});
	});

	test('PB-07 loaded overflow chats reorder on submission without loading hidden transcripts', async () => {
		const chats = Array.from({ length: 4 }, (_, i) => new TestChat(`Recency ${i}`));
		const h = createIndependentChatBoard(mainWindow.document, chats);
		const request = (timestamp: number) => new class extends mock<ChatRequestModel>() {
			override readonly requestTimestamp = timestamp;
		}();
		const models = chats.map((chat, i) => new class extends mock<IChatModel>() {
			override readonly sessionResource = chat.resource;
			override readonly lastRequestObs = observableValue<ChatRequestModel | undefined>('request', request((i + 1) * 1000));
			override get lastRequest() { return this.lastRequestObs.get(); }
			override readonly onDidChange = Event.None;
		}());
		h.loadedModels.set(models, undefined);
		await h.service.open();
		for (const chat of chats) {
			const card = [...h.container.querySelectorAll('.project-board-card')].find(element => element.querySelector('h4')?.textContent === chat.title.get())!;
			const dataTransfer = new mainWindow.DataTransfer();
			card.dispatchEvent(new mainWindow.DragEvent('dragstart', { bubbles: true, dataTransfer }));
			h.container.querySelector('[aria-label="General, P0"]')!.dispatchEvent(new mainWindow.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		}
		const titles = () => [...h.container.querySelectorAll('[aria-label="General, P0"] h4')].map(element => element.textContent);
		assert.deepStrictEqual(titles(), ['Recency 3', 'Recency 2', 'Recency 1']);
		models[0].lastRequestObs.set(request(5000), undefined);
		await timeout(0);
		assert.deepStrictEqual(titles(), ['Recency 0', 'Recency 3', 'Recency 2']);
		chats[2].title.set('Agent update', undefined);
		chats[2].isRead.set(true, undefined);
		assert.deepStrictEqual(titles(), ['Recency 0', 'Recency 3', 'Agent update']);
	});
});
