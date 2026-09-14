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
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IAuxiliaryWindow, IAuxiliaryWindowService } from '../../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatInteractivity, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ProjectBoardService } from '../../browser/projectBoardService.js';
import { IProjectBoardDraft, ProjectBoardChatWindows } from '../../browser/projectBoardNavigation.js';
import { IProjectBoardCard } from '../../common/projectBoardModel.js';
import { ProjectBoardQuestionPreview, ProjectBoardQuestionPreviewState } from '../../browser/projectBoardQuestions.js';

class TestChat extends mock<IChat>() {
	override readonly title = observableValue('title', this.name);
	override readonly status = observableValue<SessionStatus>('status', SessionStatus.InProgress);
	override readonly isRead = observableValue('read', false);
	override readonly interactivity = observableValue('interactivity', ChatInteractivity.Full);
	override readonly description = observableValue('description', undefined);
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

	function createBoard(document: Document, chats: readonly IChat[] = []) {
		const container = mainWindow.document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const session = new class extends mock<ISession>() {
			override readonly resource = URI.parse('test-session:session');
			override readonly providerId = 'test';
			override readonly title = observableValue('session-title', 'Owning session');
			override readonly chats = observableValue<readonly IChat[]>('chats', chats);
		}();
		const state = { focusCount: 0, ownerFocusCount: 0, openCount: 0, disposeCount: 0, createdCount: 0, sessions: chats.length ? [session] : [], navigationError: undefined as Error | undefined };
		const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		const opened: URI[] = [];
		const openedDrafts: string[] = [];
		const drafts = observableValue<readonly IProjectBoardDraft[]>('drafts', []);
		const contextMenu = new class extends mock<IContextMenuService>() {
			delegate: IContextMenuDelegate | undefined;
			override showContextMenu(delegate: IContextMenuDelegate): void {
				this.delegate = delegate;
			}
		}();
		const onOpened = store.add(new Emitter<URI>());
		const errors = store.add(new Emitter<string>());
		const instantiationService = workbenchInstantiationService(undefined, store);
		const questionPreview = observableValue<ProjectBoardQuestionPreviewState>('questionPreview', { kind: 'inactive' });
		instantiationService.stubInstance(ProjectBoardQuestionPreview, { preview: questionPreview, dispose() { } });
		instantiationService.stubInstance(ProjectBoardChatWindows, {
			drafts,
			dispose() { },
			async createNewSession() { state.createdCount++; },
			async openDraft(id: string): Promise<void> {
				if (state.navigationError) {
					throw state.navigationError;
				}
				openedDrafts.push(id);
			},
			async open(card: IProjectBoardCard): Promise<void> {
				if (state.navigationError) {
					throw state.navigationError;
				}
				opened.push(card.chat.resource);
				onOpened.fire(card.chat.resource);
			}
		});
		const auxiliaryWindow = new class extends mock<IAuxiliaryWindow>() {
			override readonly window = new class extends mock<CodeWindow>() {
				override readonly document = document;
				override readonly focus = () => { };
			}();
			override readonly container = container;
			override readonly whenStylesHaveLoaded = Promise.resolve();
			override readonly onUnload = Event.None;
			override dispose(): void { state.disposeCount++; }
		}();
		const service = store.add(new ProjectBoardService(
			new class extends mock<IAuxiliaryWindowService>() {
				override async open() { state.openCount++; return auxiliaryWindow; }
			}(),
			new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = sessionsChanged.event;
				override getSessions() { return state.sessions; }
			}(),
			instantiationService,
			new class extends mock<INotificationService>() {
				override error(message: string): void { errors.fire(message); }
			}(),
			store.add(new NullLogService()),
			new class extends mock<IHostService>() {
				override async focus(target: Window): Promise<void> {
					if (target === mainWindow) {
						state.ownerFocusCount++;
					} else {
						assert.strictEqual(target, auxiliaryWindow.window);
						state.focusCount++;
					}
				}
			}(),
			contextMenu,
		));
		return { service, container, state, opened, openedDrafts, drafts, contextMenu, onOpened, errors, session, sessionsChanged, questionPreview };
	}

	test('PB-01 renders in an auxiliary document and reuses the window', async () => {
		const document = mainWindow.document.implementation.createHTMLDocument();
		document.createElement = () => { throw new Error('Auxiliary documents prohibit createElement'); };
		const { service, container, state } = createBoard(document);
		await service.open();
		assert.ok(container.querySelector('.project-board'));
		assert.deepStrictEqual(Array.from(container.querySelectorAll('.project-board-column-heading'), element => element.textContent), ['P0', 'P1', 'P2', 'P3']);
		const firstFocusCount = state.focusCount;
		await service.open();
		assert.strictEqual(state.openCount, 1);
		assert.ok(state.focusCount > firstFocusCount);
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

	test('PB-16 top-right New Session delegates creation without owner navigation', async () => {
		const { service, container, state, opened } = createBoard(mainWindow.document.implementation.createHTMLDocument());
		await service.open();
		const button = container.querySelector<HTMLElement>('.project-board-header .monaco-button')!;
		assert.strictEqual(button.textContent, 'New Session');
		button.click();
		assert.strictEqual(state.createdCount, 1);
		assert.deepStrictEqual(opened, []);
		assert.strictEqual(state.ownerFocusCount, 0);
	});

	test('PB-16 draft cards use glyphs and card activation without an Open button', async () => {
		const { document } = createBoardDocument();
		const { service, container, drafts, openedDrafts, state } = createBoard(document);
		const draft: IProjectBoardDraft = { id: 'draft', resource: URI.parse('test-draft:session'), hasContent: false, submitted: false };
		drafts.set([draft], undefined);
		await service.open();
		const card = container.querySelector<HTMLElement>('.project-board-card-draft')!;
		assert.strictEqual(card.querySelector('button, .monaco-button'), null);
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
		assert.strictEqual(container.querySelectorAll('.project-board-card-session').length, 2);
	});

	test('PB-03 preserves keyboard focus across movement and live updates', async () => {
		const { document } = createBoardDocument();
		const chat = new TestChat('child');
		const { service, container, contextMenu, opened } = createBoard(document, [chat]);
		await service.open();
		const card = container.querySelector<HTMLElement>('.project-board-card')!;
		card.focus();
		card.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true }));
		assert.ok(contextMenu.delegate);
		assert.strictEqual(contextMenu.delegate.getActions().find(action => action.checked)?.id, 'projectBoard.move.unassigned');
		await contextMenu.delegate.getActions().find(action => action.id === 'projectBoard.move.general.p1')!.run();
		contextMenu.delegate.onHide?.(false);
		assert.strictEqual(document.activeElement, container.querySelector('.project-board-card'));
		assert.strictEqual(container.querySelector('.project-board-card-group[aria-label="General, P1"] h4')!.textContent, 'child');
		chat.status.set(SessionStatus.NeedsInput, undefined);
		assert.strictEqual(document.activeElement, container.querySelector('.project-board-card'));
		assert.strictEqual(container.querySelector('.project-board-card-status-label')!.textContent, 'Needs Input');
		container.querySelector('.project-board-card')!.dispatchEvent(new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		assert.strictEqual(contextMenu.delegate.getActions().find(action => action.checked)?.id, 'projectBoard.move.general.p1');
		await contextMenu.delegate.getActions().find(action => action.id === 'projectBoard.move.unassigned')!.run();
		contextMenu.delegate.onHide?.(false);
		assert.strictEqual(container.querySelector('.project-board-unassigned h4')!.textContent, 'child');
		assert.strictEqual(container.querySelectorAll('.project-board-card').length, 1);
		assert.strictEqual(chat.isRead.get(), false);
		assert.deepStrictEqual(opened, []);
	});

	test('PB-05 background updates do not reclaim focus from the opened chat window', async () => {
		const { document, nativeFocus } = createBoardDocument();
		const chat = new TestChat('Focus handoff');
		const { service, container, contextMenu } = createBoard(document, [chat]);
		await service.open();
		let restoredFocus = 0;
		store.add(addDisposableListener(container, 'focusin', () => restoredFocus++));

		for (const selector of ['.project-board-card', '.project-board-header .monaco-button']) {
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
		card.dispatchEvent(new mainWindow.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
		card.blur();
		restoredFocus = 0;
		nativeFocus.returns(false);
		contextMenu.delegate!.onHide?.(false);
		assert.strictEqual(restoredFocus, 0, 'Closing a background context menu must not steal focus');

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
			[SessionStatus.Completed, false, '\u{1F9CD}', 'Idle, unvisited'],
			[SessionStatus.Completed, true, '\u{1F9CD}', 'Idle, visited'],
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

	test('PB-05 cards have no action controls and double-click opens the exact child', async () => {
		const main = new TestChat('main');
		const child = new TestChat('child');
		const { service, container, opened, onOpened, state } = createBoard(mainWindow.document.implementation.createHTMLDocument(), [main, child]);
		await service.open();
		const card = container.querySelectorAll<HTMLElement>('.project-board-card')[1];
		assert.strictEqual(container.querySelectorAll('.project-board-card button, .project-board-card select, .project-board-card .monaco-button, .project-board-card-actions').length, 0);
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
		questionPreview.set({ kind: 'ready', questions: [{
			id: 'layout', type: 'singleSelect', title: 'Layout', text: 'Choose a layout', description: 'Choose what to build first.',
			detailedMessage: 'Consider **accessibility**.',
			options: [{ id: 'list', label: 'List - Dense scan' }, { id: 'grid', label: 'Grid - Visual overview' }],
			allowFreeformInput: false, allowSkip: false,
		}], permissions: [], unsupported: [], truncated: false }, undefined);
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
			described: container.querySelector('.project-board-card')?.getAttribute('aria-describedby') === preview.id,
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
});
