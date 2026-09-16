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
import { toAction } from '../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatInteractivity, IChat, ISession, ISessionArtifact, SessionArtifactKind, SessionRemoteConnectionFailureReason, SessionRemoteConnectionStatus, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ProjectBoardService } from '../../browser/projectBoardService.js';
import { IProjectBoardDraft, ProjectBoardChatWindows } from '../../browser/projectBoardNavigation.js';
import { IProjectBoardCard } from '../../common/projectBoardModel.js';
import { IProjectBoardPendingQuestion, ProjectBoardQuestionPreview, ProjectBoardQuestionPreviewState } from '../../browser/projectBoardQuestions.js';
import { ProjectBoardState } from '../../browser/projectBoardState.js';
import { IProjectBoardInputConfiguration, IProjectBoardMetadata, ProjectBoardMetadata } from '../../browser/projectBoardMetadata.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IProjectBoardPendingActions } from '../../common/projectBoardActions.js';
import { ProjectBoardChatActions } from '../../browser/projectBoardChatActions.js';
import { ProjectBoardWindow } from '../../browser/projectBoardWindow.js';
import { IChatQuestionAnswers, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatQuestionCarouselData } from '../../../../../workbench/contrib/chat/common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { submitChatQuestionCarousel } from '../../../../../workbench/contrib/chat/common/chatService/chatQuestionCarouselHelpers.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatRequestModel, IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { SessionsDataTransfers } from '../../../../browser/dnd.js';

class TestChat extends mock<IChat>() {
	override readonly capabilities = observableValue('capabilities', { canRename: false, canDelete: true });
	override readonly title = observableValue('title', this.name);
	override readonly status = observableValue<SessionStatus>('status', SessionStatus.InProgress);
	override readonly isRead = observableValue('read', false);
	override readonly isArchived = observableValue('archived', false);
	override readonly interactivity = observableValue('interactivity', ChatInteractivity.Full);
	override readonly description = observableValue<IMarkdownString | undefined>('description', undefined);
	override readonly modelId = observableValue<string | undefined>('modelId', undefined);
	override readonly mode = observableValue<{ id: string; kind: string } | undefined>('mode', undefined);
	override readonly resource = URI.parse(`test-chat:session#${this.name}`);

	constructor(private readonly name: string) { super(); }
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

	function createBoard(document: Document, chats: readonly IChat[] = [], storage = store.add(new InMemoryStorageService())) {
		const container = mainWindow.document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const session = new class extends mock<ISession>() {
			override readonly sessionId = 'test-session';
			override readonly resource = URI.parse('test-session:session');
			override readonly providerId = 'test';
			override readonly title = observableValue('session-title', 'Owning session');
			override readonly chats = observableValue<readonly IChat[]>('chats', chats);
			override readonly isArchived = observableValue('archived', false);
			override readonly artifacts = observableValue<readonly ISessionArtifact[]>('artifacts', []);
			override readonly status = observableValue('sessionStatus', SessionStatus.Untitled);
			override readonly remoteConnectionStatus = observableValue<SessionRemoteConnectionStatus>('connection', { kind: 'connected' });
			override readonly capabilities = observableValue('capabilities', { supportsMultipleChats: true, supportsDelete: true });
		}();
		const state = {
			focusCount: 0,
			ownerFocusCount: 0,
			openCount: 0,
			disposeCount: 0,
			createdCount: 0,
			sessions: chats.length ? [session] : [] as ISession[],
			navigationError: undefined as Error | undefined,
			deletionError: undefined as Error | undefined,
			closedResource: undefined as URI | undefined,
			deletedSessions: [] as ISession[],
			deletedDrafts: [] as string[],
			renameError: undefined as Error | undefined,
			renamedChats: [] as { session: ISession; resource: URI; title: string }[],
		};
		const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		const newSession = observableValue<ISession | undefined>('newSession', undefined);
		const opened: URI[] = [];
		const openedDrafts: string[] = [];
		const drafts = observableValue<readonly IProjectBoardDraft[]>('drafts', []);
		const contextMenu = new class extends mock<IContextMenuService>() {
			delegate: IContextMenuDelegate | undefined;
			override showContextMenu(delegate: IContextMenuDelegate): void {
				this.delegate = {
					...delegate,
					getActions: () => delegate.getActions().map(action => toAction({
						id: action.id, label: action.label, enabled: action.enabled, checked: action.checked,
						run: async () => {
							delegate.onHide?.(false);
							await action.run();
						},
					})),
				};
			}
		}();
		const onOpened = store.add(new Emitter<URI>());
		const errors = store.add(new Emitter<string>());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const quickInput = { selectedLabel: undefined as string | undefined, labels: [] as string[], inputValues: [] as string[] };
		const pick = sinon.stub().callsFake((items: IQuickPickItem[]) => {
			quickInput.labels = items.map(item => item.label);
			return Promise.resolve(items.find(item => item.label === quickInput.selectedLabel));
		});
		instantiationService.stub(IQuickInputService, { pick, input: async () => quickInput.inputValues.shift() });
		instantiationService.stub(IStorageService, storage);
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
		instantiationService.stub(ISessionsProvidersService, { onDidChangeProviders: Event.None, getProvider: () => undefined });
		const openedContext: string[] = [];
		instantiationService.stub(IOpenerService, {
			open: async (resource, options) => {
				assert.deepStrictEqual(options, { fromUserGesture: true, allowCommands: false });
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
			async createNewSession() { state.createdCount++; },
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
		let auxiliaryWindow: IAuxiliaryWindow | undefined;
		instantiationService.stubInstance(ProjectBoardWindow, {
			get content() { return auxiliaryWindow?.container ?? container; },
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
					return auxiliaryWindow;
				}
			}(),
			new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = sessionsChanged.event;
				override readonly newSession = newSession;
				override getSessions() { return state.sessions; }
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
						assert.strictEqual(target, auxiliaryWindow?.window);
						state.focusCount++;
					}
				}
			}(),
			contextMenu,
		));
		return {
			service, container, state, opened, openedDrafts, drafts, contextMenu, onOpened, errors, session, sessionsChanged, newSession, questionPreview, questionCarousels, submittedAnswers, openedContext, instantiationService, metadata, credits, creditsError, actions, includeCredits, loadedModels, quickInput, pick,
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

	test('PB-01 renders in an auxiliary document and reuses the window', async () => {
		const document = mainWindow.document.implementation.createHTMLDocument();
		document.createElement = () => { throw new Error('Auxiliary documents prohibit createElement'); };
		const { service, container, state } = createBoard(document);
		await service.open();
		assert.ok(container.querySelector('.project-board'));
		assert.strictEqual(container.querySelector('h1')?.textContent, 'Agents Hub');
		assert.ok(service.getAccessibleContent().startsWith('Agents Hub\n'));
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.project-board-column-heading'), element => element.textContent), ['P0', 'P1', 'P2', 'P3']);
		const firstFocusCount = state.focusCount;
		await service.open();
		assert.strictEqual(state.openCount, 1);
		assert.ok(state.focusCount > firstFocusCount);
	});

	test('PB-21 board notifies content size changes so the host can rescan after +more expands a column', async () => {
		const chats = Array.from({ length: 5 }, (_, index) => new TestChat(`Card ${index}`));
		const h = createBoard(mainWindow.document, chats);
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
			inlineControls: embeddedContainer.querySelectorAll('[data-board-control="add-row"], [data-board-control="add-column"], [data-board-control="show-archived"], [data-board-control="new-session"], [data-board-control="settings"]').length,
		}, {
			hasBoard: true,
			hasInlineHeader: false,
			inlineControls: 0,
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
		assert.strictEqual(tray().querySelector('.project-board-collapsed-summary')?.textContent, '3 sessions');
		chats[1].status.set(SessionStatus.NeedsInput, undefined);
		assert.strictEqual(tray().querySelector('.project-board-attention')?.textContent, '1 Needs Input');
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
		assert.strictEqual(cell('P1').querySelector('.project-board-collapsed-summary')?.textContent, '1 session');
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
		for (const [value, amount] of [[0, '0.00'], [1, '0.01'], [100, '1.00'], [1234, '12.34'], [12.5, '0.13']] as const) {
			h.credits.set(value, undefined);
			const credits = h.container.querySelector('.project-board-card-credits')!;
			assert.deepStrictEqual({
				text: credits.textContent,
				label: credits.getAttribute('aria-label'),
			}, {
				text: `$${amount}`,
				label: `AI credits: $${amount} USD`,
			});
		}
		const metrics = h.container.querySelector('.project-board-card-metrics')!;
		assert.ok(metrics.parentElement?.classList.contains('project-board-card-status-bar'));
		assert.strictEqual(metrics.parentElement?.lastElementChild, metrics);
		assert.strictEqual(metrics.parentElement?.parentElement?.lastElementChild, metrics.parentElement);
		assert.strictEqual(metrics.querySelector('.project-board-card-credits')?.textContent, '$0.13');
		assert.ok(metrics.querySelector('.codicon-clock[aria-hidden="true"]'));
		assert.strictEqual(document.activeElement?.getAttribute('data-board-control'), 'settings');
		await toggle('projectBoard.settings.stateDuration', true);
		assert.strictEqual(h.container.querySelector('.project-board-card-duration'), null);
		h.closeBoard();
		await h.service.open();
		assert.strictEqual(h.currentContainer.querySelector('.project-board-card-duration'), null);
		assert.strictEqual(h.currentContainer.querySelector('.project-board-card-credits')?.getAttribute('aria-label'), 'AI credits: $0.13 USD');
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
		assert.strictEqual(summary(), '2 sessions');
		h.service.toggleAutoIncludeSessions();
		assert.strictEqual(summary(), '0 sessions');
		assert.strictEqual(h.container.querySelectorAll('.project-board-unassigned .project-board-card').length, 0);
		assert.strictEqual(h.drafts.get().length, 1);
		h.service.toggleAutoIncludeSessions();
		assert.strictEqual(summary(), '2 sessions');
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
		assert.ok(hoverContent.includes('AI credits: $0.13 USD'));
		assert.ok(hoverContent.includes('including subagents'));
		assert.ok(hoverContent.includes('100 AI credits per dollar'));
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

	test('PB-02/PB-16 an Agents-created draft appears immediately and becomes one live unassigned chat', async () => {
		const chat = new TestChat('Agents-created chat');
		const h = createBoard(mainWindow.document);
		await h.service.open();
		h.session.title.set('Agents draft', undefined);
		h.session.chats.set([chat], undefined);
		h.newSession.set(h.session, undefined);
		assert.strictEqual(h.container.querySelector('.project-board-unassigned h4')?.textContent, 'Agents draft');
		assert.strictEqual(h.container.querySelectorAll('.project-board-agents-draft').length, 1);
		assert.strictEqual(h.container.querySelector('[data-chat-resource]'), null, 'Unsent Agents drafts must not load or open a new backend chat');
		h.state.sessions = [h.session];
		h.sessionsChanged.fire({ added: [h.session], removed: [], changed: [] });
		assert.strictEqual(h.container.querySelectorAll('.project-board-card').length, 1);
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

	test('PB-02 discarding an Agents draft removes its preview without deleting or opening another session', async () => {
		const h = createBoard(mainWindow.document);
		await h.service.open();
		h.newSession.set(h.session, undefined);
		assert.strictEqual(h.container.querySelectorAll('.project-board-agents-draft').length, 1);
		h.newSession.set(undefined, undefined);
		assert.deepStrictEqual({
			cards: h.container.querySelectorAll('.project-board-card').length,
			ownedDrafts: h.drafts.get().length,
			opened: h.opened.length,
		}, { cards: 0, ownedDrafts: 0, opened: 0 });
	});

	test('PB-03 card context menus do not enumerate cells; keyboard movement uses a searchable picker', async () => {
		const chat = new TestChat('Keyboard movement');
		const h = createBoard(mainWindow.document, [chat]);
		await h.service.open();
		const event = new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		h.container.querySelector('.project-board-card')!.dispatchEvent(event);
		assert.strictEqual(h.contextMenu.delegate, undefined);
		assert.strictEqual(event.defaultPrevented, false);
		for (const key of [{ keyCode: 121, shiftKey: true }, { keyCode: 93 }]) {
			const event = new mainWindow.KeyboardEvent('keydown', { ...key, bubbles: true, cancelable: true });
			h.container.querySelector('.project-board-card')!.dispatchEvent(event);
			assert.strictEqual(event.defaultPrevented, false);
		}
		assert.strictEqual(h.contextMenu.delegate, undefined);
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
		assert.deepStrictEqual(h.contextMenu.delegate?.getActions().map(action => action.label), ['Rename...']);
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

	test('card context menu is unavailable when the chat does not support renaming', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('No rename')]);
		await h.service.open();
		const card = h.container.querySelector<HTMLElement>('[data-chat-resource]')!;
		assert.strictEqual(card.getAttribute('aria-keyshortcuts')?.includes('F2') ?? false, false);
		const event = new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		card.dispatchEvent(event);
		assert.strictEqual(event.defaultPrevented, false);
		assert.strictEqual(h.contextMenu.delegate, undefined);
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
		const h = createBoard(mainWindow.document, chats);
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
		const h = createBoard(document, chats);
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
		assert.ok(board().clientHeight <= h.container.clientHeight, 'The scroll viewport must fit its auxiliary host');
		assert.ok(board().scrollHeight > board().clientHeight);
		assert.ok(board().scrollWidth > board().clientWidth);
		board().scrollTop = board().scrollHeight;
		board().scrollLeft = board().scrollWidth;
		const position = { top: board().scrollTop, left: board().scrollLeft };
		assert.ok(position.top > 0 && position.left > 0);
		const lastCell = h.container.querySelector('[aria-label="General, P3"]')!;
		assert.ok(lastCell.getBoundingClientRect().bottom <= board().getBoundingClientRect().bottom);
		assert.ok(lastCell.getBoundingClientRect().right <= board().getBoundingClientRect().right);
		chats[0].title.set('Updated while scrolled', undefined);
		assert.deepStrictEqual({ top: board().scrollTop, left: board().scrollLeft }, position);
	});

	test('PB-05/PB-11 arrows follow card geometry, reveal focus, and Enter opens exactly that chat', async () => {
		const chats = Array.from({ length: 4 }, (_, index) => new TestChat(`Navigate ${index}`));
		const h = createBoard(mainWindow.document, chats);
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

	test('session card delete action confirms, deletes the backing session, and does not open the card', async () => {
		const chat = new TestChat('Delete me');
		const h = createBoard(mainWindow.document, [chat]);
		h.instantiationService.stub(IDialogService, {
			confirm: async confirmation => {
				assert.deepStrictEqual({
					message: confirmation.message,
					detail: confirmation.detail,
					primaryButton: confirmation.primaryButton,
				}, {
					message: 'Are you sure you want to delete this session?',
					detail: 'This action cannot be undone.',
					primaryButton: 'Delete',
				});
				return { confirmed: true };
			},
		});
		await h.service.open();
		const button = h.container.querySelector<HTMLElement>('[aria-label="Delete Session"]')!;
		assert.ok(button.classList.contains('codicon-trash'));
		const actions = button.parentElement!;
		assert.ok(actions.classList.contains('project-board-card-actions'));
		button.focus();
		assert.strictEqual(mainWindow.getComputedStyle(actions).opacity, '1');
		const deleted = Event.toPromise(h.sessionsChanged.event);
		button.click();
		await deleted;
		await Promise.resolve();
		assert.deepStrictEqual({
			deletedSessions: h.state.deletedSessions,
			opened: h.opened,
			cardCount: h.container.querySelectorAll('[data-chat-resource]').length,
		}, {
			deletedSessions: [h.session],
			opened: [],
			cardCount: 0,
		});
	});

	test('session card delete action leaves the card in place when cancelled or deletion fails', async () => {
		const chat = new TestChat('Keep me');
		const h = createBoard(mainWindow.document, [chat]);
		let confirmed = false;
		h.instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed }) });
		await h.service.open();
		const button = () => h.container.querySelector<HTMLElement>('[aria-label="Delete Session"]')!;
		button().click();
		await Promise.resolve();
		assert.deepStrictEqual({ deleted: h.state.deletedSessions.length, cards: h.container.querySelectorAll('[data-chat-resource]').length }, { deleted: 0, cards: 1 });

		confirmed = true;
		h.state.deletionError = new Error('Delete failed');
		const notification = Event.toPromise(h.errors.event);
		button().click();
		assert.strictEqual(await notification, 'The session could not be deleted.');
		assert.deepStrictEqual({ deleted: h.state.deletedSessions.length, cards: h.container.querySelectorAll('[data-chat-resource]').length }, { deleted: 0, cards: 1 });
	});

	test('session card delete action is omitted when the backing provider cannot delete the session', async () => {
		const h = createBoard(mainWindow.document, [new TestChat('Read only')]);
		h.session.capabilities.set({ supportsMultipleChats: true, supportsDelete: false }, undefined);
		await h.service.open();
		assert.strictEqual(h.container.querySelector('[aria-label="Delete Session"]'), null);
	});

	test('PB-16 top-right New Session delegates creation without owner navigation', async () => {
		const { service, container, state, opened } = createBoard(mainWindow.document.implementation.createHTMLDocument());
		await service.open();
		const button = container.querySelector<HTMLElement>('[data-board-control="new-session"]')!;
		assert.strictEqual(button.textContent, 'New Session');
		button.click();
		assert.strictEqual(state.createdCount, 1);
		assert.deepStrictEqual(opened, []);
		assert.strictEqual(state.ownerFocusCount, 0);
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
		assert.deepStrictEqual(Array.from(container.querySelectorAll('h4'), element => element.textContent), ['Renamed child', 'main']);
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

	test('PB-05 cards only have their delete action and double-click opens the exact child', async () => {
		const main = new TestChat('main');
		const child = new TestChat('child');
		const { service, container, opened, onOpened, state } = createBoard(mainWindow.document.implementation.createHTMLDocument(), [main, child]);
		await service.open();
		const card = [...container.querySelectorAll<HTMLElement>('.project-board-card')].find(element => element.querySelector('h4')?.textContent === 'child')!;
		assert.deepStrictEqual({
			deleteActions: container.querySelectorAll('.project-board-card [aria-label="Delete Session"]').length,
			otherControls: container.querySelectorAll('.project-board-card button, .project-board-card select, .project-board-card .monaco-button:not([aria-label="Delete Session"])').length,
		}, { deleteActions: 2, otherControls: 0 });
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
		assert.strictEqual(card.getAttribute('role'), 'button');
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
		}, { sameInput: true, focused: true, text: 'Calendar layout', selection: [3, 7], submissions: 0 });
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
		const { service, container } = createBoard(mainWindow.document, chats);
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

	test('PB-11 shared context links open their resources without opening or marking the chat', async () => {
		const chat = new TestChat('Shared context');
		const { service, container, session, opened, openedContext } = createBoard(mainWindow.document, [chat]);
		session.artifacts.set([{
			id: 'pr', kind: SessionArtifactKind.PullRequest, label: 'example/project#12',
			link: URI.parse('https://github.com/example/project/pull/12'), isArtifact: true,
		}], undefined);
		await service.open();
		const context = container.querySelector('[aria-label="Shared session context"]')!;
		const link = context.querySelector('a')!;
		link.click();
		link.dispatchEvent(new mainWindow.MouseEvent('dblclick', { bubbles: true }));
		link.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { keyCode: 13, bubbles: true }));
		assert.deepStrictEqual({
			label: link.textContent, opened, openedContext, read: chat.isRead.get(),
		}, {
			label: 'example/project#12', opened: [], openedContext: ['https://github.com/example/project/pull/12'], read: false,
		});
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
		assert.strictEqual(h.container.querySelector('[aria-label="General, P0"] .project-board-card-unavailable h4')?.textContent, 'Unavailable Chat');
		h.state.sessions = [h.session];
		h.sessionsChanged.fire({ added: [h.session], removed: [], changed: [] });
		assert.strictEqual(h.container.querySelector('[aria-label="General, P0"] h4')?.textContent, 'Temporarily missing');
		h.state.sessions = [];
		h.sessionsChanged.fire({ added: [], removed: [h.session], changed: [] });
		h.container.querySelector<HTMLElement>('.project-board-card-unavailable .monaco-button')!.click();
		assert.strictEqual(h.container.querySelectorAll('.project-board-card-unavailable').length, 0);
	});

	test('PB-06 corrupt storage remains untouched until Reset Board is explicitly confirmed', async () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store(ProjectBoardState.STORAGE_KEY, '{broken', StorageScope.PROFILE, StorageTarget.MACHINE);
		const h = createBoard(mainWindow.document, [], storage);
		let confirmed = false;
		h.instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed }) });
		await h.service.open();
		assert.ok(h.container.querySelector('.project-board-storage-error'));
		assert.strictEqual(h.container.querySelector('[data-board-control="add-row"]')?.getAttribute('aria-disabled'), 'true');
		h.container.querySelector<HTMLElement>('[data-board-control="reset"]')!.click();
		await Promise.resolve();
		assert.strictEqual(storage.get(ProjectBoardState.STORAGE_KEY, StorageScope.PROFILE), '{broken');
		confirmed = true;
		h.container.querySelector<HTMLElement>('[data-board-control="reset"]')!.click();
		await Promise.resolve();
		assert.strictEqual(h.container.querySelector('.project-board-storage-error'), null);
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
		assert.ok(h.container.textContent?.includes('Metadata preview limit reached'));
		assert.deepStrictEqual([...h.container.querySelectorAll('.project-board-card-prompt')].map(element => element.textContent), [...Array(16).fill('A submitted prompt'), 'Prompt unavailable']);
		chats[0].title.set('Agent-updated title', undefined);
		chats[0].isRead.set(true, undefined);
		assert.strictEqual(h.container.querySelector('[data-submitted-at]')?.getAttribute('data-submitted-at'), '1000');
		h.metadata.set({ kind: 'ready', prompt: 'A prompt without a known timestamp', context: [] }, undefined);
		assert.strictEqual(h.container.querySelector('[data-submitted-at]'), null);
		assert.ok(h.container.textContent?.includes('Recency unavailable'));
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
		const h = createBoard(mainWindow.document, chats);
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
		assert.deepStrictEqual(titles(), ['Recency 0', 'Recency 3', 'Recency 2']);
		chats[2].title.set('Agent update', undefined);
		chats[2].isRead.set(true, undefined);
		assert.deepStrictEqual(titles(), ['Recency 0', 'Recency 3', 'Agent update']);
	});
});
