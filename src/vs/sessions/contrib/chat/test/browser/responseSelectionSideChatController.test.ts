/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationHandle, INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatResponseViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { ResponseSelectionSideChatController } from '../../browser/responseSelectionSideChatController.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

class RecordingNotificationService extends TestNotificationService {
	readonly notifications: { severity: Severity; message: string }[] = [];
	override warn(message: string): INotificationHandle {
		this.notifications.push({ severity: Severity.Warning, message });
		return super.warn(message);
	}
	override error(error: string | Error): INotificationHandle {
		this.notifications.push({ severity: Severity.Error, message: error instanceof Error ? error.message : error });
		return super.error(error);
	}
}

suite('ResponseSelectionSideChatController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(options?: {
		createSideChatInSession?: ISessionsManagementService['createSideChatInSession'];
		sendRequest?: ISessionsManagementService['sendRequest'];
	}) {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		const doc = dom.getActiveDocument();
		const widgetDomNode = doc.createElement('div');
		doc.body.appendChild(widgetDomNode);
		store.add(toDisposable(() => widgetDomNode.remove()));

		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		// Positioned so the selection's real client rects (the controller
		// measures the range itself) land at known coordinates.
		markdown.style.position = 'absolute';
		markdown.style.top = '0px';
		markdown.style.left = '0px';
		const textNode = doc.createTextNode('hello world');
		markdown.appendChild(textNode);
		widgetDomNode.appendChild(markdown);

		const response = upcastPartial<IChatResponseViewModel>({ requestId: 'turn-1', setVote: () => undefined });
		const focusResponseItemCalls: boolean[] = [];
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => response,
			focusResponseItem: (lastFocused?: boolean) => { focusResponseItemCalls.push(!!lastFocused); },
		});

		let containerRect: Partial<DOMRect> = { top: 0, left: 0, width: 600, height: 600 };
		widgetDomNode.getBoundingClientRect = () => containerRect as DOMRect;

		const targetWindow = dom.getWindow(widgetDomNode);
		const originalGetSelection = targetWindow.getSelection.bind(targetWindow);
		const mutableWindow = targetWindow as typeof targetWindow & { getSelection: () => Selection | null };
		let selectionText = '';
		const range = doc.createRange();
		range.setStart(textNode, 0);
		range.setEnd(textNode, textNode.data.length);
		mutableWindow.getSelection = () => upcastPartial<Selection>({
			toString: () => selectionText,
			isCollapsed: selectionText.length === 0,
			anchorNode: textNode,
			focusNode: textNode,
			rangeCount: 1,
			getRangeAt: () => range,
		});
		store.add(toDisposable(() => { mutableWindow.getSelection = originalGetSelection; }));

		const setSelection = (text: string, selectionTop?: number) => {
			selectionText = text;
			if (selectionTop !== undefined) {
				markdown.style.top = `${selectionTop}px`;
			}
			doc.dispatchEvent(new Event('selectionchange'));
		};
		const setContainerRect = (rect: Partial<DOMRect>) => { containerRect = rect; };
		const highlightedRanges = () => targetWindow.CSS.highlights?.get('chat-response-selection')?.size ?? 0;

		const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/source') });
		const session = upcastPartial<ISession>({
			sessionId: 'session',
			resource: URI.parse('test:///session'),
			status: constObservable(SessionStatus.Completed),
			isArchived: constObservable(false),
			capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }),
		});

		const callOrder: string[] = [];
		const notificationService = new RecordingNotificationService();
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessionForChatResource: resource => resource.toString() === chat.resource.toString() ? { session, chat } : undefined,
			createSideChatInSession: options?.createSideChatInSession ?? (async (_session, _sourceChat, turnId, selection) => {
				callOrder.push(`create:${turnId}:${selection?.text}`);
				return sideChat;
			}),
			sendRequest: options?.sendRequest ?? (async (_session, sentChat, sendOptions) => {
				callOrder.push(`send:${sentChat.resource.toString()}:${sendOptions.query}`);
			}),
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			openChat: async (_session, chatUri) => {
				callOrder.push(`open:${chatUri.toString()}`);
			},
		}));
		instantiationService.stub(INotificationService, notificationService);
		instantiationService.stub(ILogService, new NullLogService());

		const controller = store.add(instantiationService.createInstance(ResponseSelectionSideChatController, widget));
		controller.setChat(chat);

		return { controller, setSelection, setContainerRect, callOrder, doc, chat, sideChat, focusResponseItemCalls, notificationService, highlightedRanges };
	}

	function inputDomNode(controller: ResponseSelectionSideChatController): HTMLElement {
		return (controller as unknown as { _input: { domNode: HTMLElement } })._input.domNode;
	}

	function inputTextArea(controller: ResponseSelectionSideChatController): HTMLTextAreaElement {
		return (controller as unknown as { _input: { inputElement: HTMLTextAreaElement } })._input.inputElement;
	}

	function isInputBusy(controller: ResponseSelectionSideChatController): boolean {
		return (controller as unknown as { _input: { isBusy: boolean } })._input.isBusy;
	}

	function submitViaClick(controller: ResponseSelectionSideChatController, query: string): void {
		const textArea = inputTextArea(controller);
		textArea.value = query;
		textArea.dispatchEvent(new Event('input', { bubbles: true }));
		inputDomNode(controller).querySelector<HTMLElement>('.action-label')!.click();
	}

	function dispatchKey(target: HTMLElement, key: string, options?: { shiftKey?: boolean; isComposing?: boolean }): KeyboardEvent {
		const event = new KeyboardEvent('keydown', { key, shiftKey: options?.shiftKey, bubbles: true, cancelable: true });
		Object.defineProperty(event, 'keyCode', { get: () => key === 'Escape' ? 27 : 13 });
		if (options?.isComposing) {
			Object.defineProperty(event, 'isComposing', { get: () => true });
		}
		target.dispatchEvent(event);
		return event;
	}

	test('shows the ask-question input for a valid markdown selection', () => {
		const { controller, setSelection } = setup();
		assert.strictEqual(inputDomNode(controller).style.display, 'none');

		setSelection('hello world');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none');
	});

	test('hides the input again once the selection is cleared', () => {
		const { controller, setSelection } = setup();
		setSelection('hello world');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none');

		setSelection('');
		assert.strictEqual(inputDomNode(controller).style.display, 'none');
	});

	test('creates, opens, and sends a side chat anchored to the response on submit', async () => {
		const { controller, setSelection, callOrder, sideChat } = setup();
		setSelection('hello world');

		const textArea = inputTextArea(controller);
		textArea.value = 'what does this mean?';
		textArea.dispatchEvent(new Event('input', { bubbles: true }));
		inputDomNode(controller).querySelector<HTMLElement>('.action-label')!.click();

		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual(callOrder, [
			'create:turn-1:hello world',
			`open:${sideChat.resource.toString()}`,
			`send:${sideChat.resource.toString()}:what does this mean?`,
		]);
	});

	test('stays visible and keeps the captured selection when the input steals focus and collapses the native selection', () => {
		const { controller, setSelection, callOrder } = setup();
		setSelection('hello world');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none');

		const textArea = inputTextArea(controller);
		textArea.focus();
		// Focusing the textarea collapses the document Selection as a browser
		// side effect; this must not dismiss the widget.
		setSelection('');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none', 'input must stay visible while focused');

		// The originally-captured selection must still be used on submit, not
		// the now-empty native selection.
		textArea.value = 'what does this mean?';
		textArea.dispatchEvent(new Event('input', { bubbles: true }));
		inputDomNode(controller).querySelector<HTMLElement>('.action-label')!.click();
		assert.ok(callOrder[0]?.startsWith('create:turn-1:hello world'));
	});

	test('dismisses once focus genuinely leaves the input and the selection is invalid', () => {
		const { controller, setSelection } = setup();
		setSelection('hello world');

		const textArea = inputTextArea(controller);
		textArea.focus();
		setSelection('');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none');

		textArea.blur();
		setSelection('');
		assert.strictEqual(inputDomNode(controller).style.display, 'none', 'input must dismiss once focus truly leaves it');
	});

	test('restores focus to the response item when Escape dismisses the focused input', () => {
		const { controller, setSelection, focusResponseItemCalls } = setup();
		setSelection('hello world');

		const textArea = inputTextArea(controller);
		textArea.focus();
		dispatchKey(textArea, 'Escape');

		assert.strictEqual(inputDomNode(controller).style.display, 'none');
		assert.deepStrictEqual(focusResponseItemCalls, [true]);
	});

	test('does not restore focus on dismiss when the input was not focused', () => {
		const { setSelection, focusResponseItemCalls } = setup();
		setSelection('hello world');
		setSelection('');

		assert.deepStrictEqual(focusResponseItemCalls, []);
	});

	test('clamps the overlay vertically within the container bounds when the selection is near the bottom', () => {
		const { controller, setSelection, setContainerRect } = setup();
		// A container far shorter than any realistic widget height forces the
		// vertical clamp to floor the overlay at the top.
		setContainerRect({ top: 0, left: 0, width: 600, height: 20 });
		setSelection('hello world', 10);

		const style = inputDomNode(controller).style;
		assert.notStrictEqual(style.display, 'none');
		assert.strictEqual(parseFloat(style.top), 0);
	});

	test('paints the captured selection with a custom highlight once the native selection is gone', () => {
		const { controller, setSelection, highlightedRanges } = setup();
		setSelection('hello world');
		assert.strictEqual(highlightedRanges(), 0, 'the browser still paints the live native selection');

		// Focusing the textarea collapses the native selection; the highlight
		// takes over so the user can still see what they selected.
		inputTextArea(controller).focus();
		setSelection('');
		assert.strictEqual(highlightedRanges(), 1);

		inputTextArea(controller).blur();
		setSelection('');
		assert.strictEqual(inputDomNode(controller).style.display, 'none');
		assert.strictEqual(highlightedRanges(), 0, 'dismissing must clear the highlight');
	});

	test('clears the highlight when the controller is disposed', () => {
		const { controller, setSelection, highlightedRanges } = setup();
		setSelection('hello world');
		inputTextArea(controller).focus();
		setSelection('');
		assert.strictEqual(highlightedRanges(), 1);

		controller.dispose();
		assert.strictEqual(highlightedRanges(), 0);
	});

	test('stays visible with a busy state while the request is pending, then clears once it settles', async () => {
		let resolveCreate!: (chat: IChat) => void;
		const pending = new Promise<IChat>(resolve => { resolveCreate = resolve; });
		const { controller, setSelection, callOrder, sideChat } = setup({
			createSideChatInSession: async (_session, _sourceChat, turnId, selection) => {
				callOrder.push(`create:${turnId}:${selection?.text}`);
				return pending;
			},
		});
		setSelection('hello world');
		submitViaClick(controller, 'what does this mean?');

		assert.strictEqual(isInputBusy(controller), true, 'input must report busy while the request is pending');
		assert.strictEqual(inputTextArea(controller).disabled, true, 'the textarea must be disabled while pending');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none', 'the overlay must stay visible while pending, not be dismissed eagerly');

		resolveCreate(sideChat);
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual(callOrder, [
			'create:turn-1:hello world',
			`open:${sideChat.resource.toString()}`,
			`send:${sideChat.resource.toString()}:what does this mean?`,
		]);
		assert.strictEqual(isInputBusy(controller), false, 'busy clears once the orchestration settles');
	});

	test('prevents duplicate submission (click and Enter) while a request is pending', async () => {
		let resolveCreate!: (chat: IChat) => void;
		const pending = new Promise<IChat>(resolve => { resolveCreate = resolve; });
		let createCalls = 0;
		const { controller, setSelection, sideChat } = setup({
			createSideChatInSession: async () => {
				createCalls++;
				return pending;
			},
		});
		setSelection('hello world');
		submitViaClick(controller, 'what does this mean?');
		assert.strictEqual(createCalls, 1);

		// A second click and an Enter keypress while the first request is still
		// in flight must not create a second side chat.
		inputDomNode(controller).querySelector<HTMLElement>('.action-label')!.click();
		dispatchKey(inputTextArea(controller), 'Enter');
		assert.strictEqual(createCalls, 1, 'only the first submission must create a side chat');

		resolveCreate(sideChat);
		await new Promise(resolve => setTimeout(resolve, 0));
	});

	test('ignores Escape and selection-change dismissal while a request is pending', async () => {
		let resolveCreate!: (chat: IChat) => void;
		const pending = new Promise<IChat>(resolve => { resolveCreate = resolve; });
		const { controller, setSelection, sideChat } = setup({
			createSideChatInSession: async () => pending,
		});
		setSelection('hello world');
		submitViaClick(controller, 'what does this mean?');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none');

		dispatchKey(inputTextArea(controller), 'Escape');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none', 'Escape must not dismiss a pending request');

		setSelection('');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none', 'an invalidated selection must not dismiss a pending request');

		resolveCreate(sideChat);
		await new Promise(resolve => setTimeout(resolve, 0));
	});

	test('restores the entered question and re-enables the input when the side chat fails to create', async () => {
		const { controller, setSelection, notificationService } = setup({
			createSideChatInSession: async () => { throw new Error('boom'); },
		});
		setSelection('hello world');
		submitViaClick(controller, 'what does this mean?');
		assert.strictEqual(isInputBusy(controller), true);

		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(isInputBusy(controller), false, 'busy must clear on failure');
		assert.strictEqual(inputTextArea(controller).disabled, false, 'the textarea must be re-enabled on failure');
		assert.strictEqual(inputTextArea(controller).value, 'what does this mean?', 'the entered question must be restored on failure');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none', 'the overlay must stay visible so the user can retry');
		assert.strictEqual(notificationService.notifications.length, 1);
		assert.strictEqual(notificationService.notifications[0].severity, Severity.Error);
	});

	test('same-chat setChat (e.g. a status/interactivity update) preserves a visible draft', () => {
		const { controller, setSelection, chat } = setup();
		setSelection('hello world');
		const textArea = inputTextArea(controller);
		textArea.value = 'a draft in progress';
		textArea.dispatchEvent(new Event('input', { bubbles: true }));

		// A new IChat object for the same resource (e.g. ChatView re-invoking
		// setChat on a status/interactivity observable change) must not
		// discard the visible draft.
		controller.setChat(upcastPartial<IChat>({ resource: chat.resource }));

		assert.notStrictEqual(inputDomNode(controller).style.display, 'none', 'input must stay visible on a same-resource setChat');
		assert.strictEqual(textArea.value, 'a draft in progress', 'the typed draft must survive a same-resource setChat');
	});

	test('same-chat setChat does not clear a pending busy submission', async () => {
		let resolveCreate!: (chat: IChat) => void;
		const pending = new Promise<IChat>(resolve => { resolveCreate = resolve; });
		const { controller, setSelection, callOrder, chat, sideChat } = setup({
			createSideChatInSession: async (_session, _sourceChat, turnId, selection) => {
				callOrder.push(`create:${turnId}:${selection?.text}`);
				return pending;
			},
		});
		setSelection('hello world');
		submitViaClick(controller, 'what does this mean?');
		assert.strictEqual(isInputBusy(controller), true);

		// A same-resource setChat (status/interactivity update) must not
		// force-dismiss or clear busy while the submission is still pending.
		controller.setChat(upcastPartial<IChat>({ resource: chat.resource }));
		assert.strictEqual(isInputBusy(controller), true, 'busy must survive a same-resource setChat');
		assert.strictEqual(inputTextArea(controller).disabled, true);
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none');

		// The still-pending original request must be the one that eventually
		// resolves the busy state — a same-resource setChat must not have
		// let a second submission race in.
		resolveCreate(sideChat);
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual(callOrder, [
			'create:turn-1:hello world',
			`open:${sideChat.resource.toString()}`,
			`send:${sideChat.resource.toString()}:what does this mean?`,
		]);
		assert.strictEqual(isInputBusy(controller), false);
	});

	test('different-resource setChat force-dismisses even while busy', async () => {
		let resolveCreate!: (chat: IChat) => void;
		const pending = new Promise<IChat>(resolve => { resolveCreate = resolve; });
		const { controller, setSelection } = setup({
			createSideChatInSession: async () => pending,
		});
		setSelection('hello world');
		submitViaClick(controller, 'what does this mean?');
		assert.strictEqual(isInputBusy(controller), true);

		controller.setChat(upcastPartial<IChat>({ resource: URI.parse('test:///chat/other') }));

		assert.strictEqual(inputDomNode(controller).style.display, 'none', 'a genuine chat change must dismiss even a busy overlay');
		assert.strictEqual(isInputBusy(controller), false);

		// A real click also clears the browser's text selection; reflect that
		// here so a `selectionchange` the browser fires asynchronously as
		// focus leaves the now-hidden input (which the mocked `getSelection`
		// would otherwise still report as "hello world") can't reopen it.
		setSelection('');

		// The now-orphaned request settling afterwards must not reopen the overlay.
		resolveCreate(upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') }));
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(inputDomNode(controller).style.display, 'none');
	});

	test('a success that settles after a different-resource setChat does not reopen, refocus, or mutate the overlay', async () => {
		let resolveCreate!: (chat: IChat) => void;
		const pending = new Promise<IChat>(resolve => { resolveCreate = resolve; });
		const { controller, setSelection, focusResponseItemCalls } = setup({
			createSideChatInSession: async () => pending,
		});
		setSelection('hello world');
		submitViaClick(controller, 'what does this mean?');

		controller.setChat(upcastPartial<IChat>({ resource: URI.parse('test:///chat/other') }));
		setSelection('');
		const focusCallsAtDismiss = focusResponseItemCalls.length;

		resolveCreate(upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') }));
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(inputDomNode(controller).style.display, 'none', 'a stale success must not reopen the overlay');
		assert.strictEqual(inputTextArea(controller).value, '', 'a stale success must not mutate the (already cleared) input value');
		assert.deepStrictEqual(focusResponseItemCalls.length, focusCallsAtDismiss, 'a stale success must not refocus the transcript');
	});

	test('a failure that settles after a different-resource setChat does not reopen, refocus, mutate, or notify', async () => {
		let rejectCreate!: (err: Error) => void;
		const pending = new Promise<IChat>((_resolve, reject) => { rejectCreate = reject; });
		const { controller, setSelection, notificationService, focusResponseItemCalls } = setup({
			createSideChatInSession: async () => pending,
		});
		setSelection('hello world');
		submitViaClick(controller, 'what does this mean?');

		controller.setChat(upcastPartial<IChat>({ resource: URI.parse('test:///chat/other') }));
		setSelection('');
		const focusCallsAtDismiss = focusResponseItemCalls.length;

		rejectCreate(new Error('boom'));
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(inputDomNode(controller).style.display, 'none', 'a stale failure must not reopen the overlay');
		assert.strictEqual(inputTextArea(controller).value, '', 'a stale failure must not restore the failed question into the (already cleared) input');
		assert.deepStrictEqual(focusResponseItemCalls.length, focusCallsAtDismiss, 'a stale failure must not refocus the input');
		assert.strictEqual(notificationService.notifications.length, 0, 'a stale failure must not surface a retry notification for an abandoned overlay');
	});

	test('plain Enter submits and prevents the default newline', () => {
		const { controller, setSelection, callOrder } = setup();
		setSelection('hello world');
		const textArea = inputTextArea(controller);
		textArea.value = 'what does this mean?';
		textArea.dispatchEvent(new Event('input', { bubbles: true }));

		const event = dispatchKey(textArea, 'Enter');

		assert.strictEqual(event.defaultPrevented, true, 'plain Enter must prevent the default newline');
		assert.ok(callOrder[0]?.startsWith('create:turn-1:hello world'), 'plain Enter must submit');
	});

	test('Shift+Enter inserts a newline instead of submitting', () => {
		const { controller, setSelection, callOrder } = setup();
		setSelection('hello world');
		const textArea = inputTextArea(controller);
		textArea.value = 'what does this mean?';
		textArea.dispatchEvent(new Event('input', { bubbles: true }));

		const event = dispatchKey(textArea, 'Enter', { shiftKey: true });

		assert.strictEqual(event.defaultPrevented, false, 'Shift+Enter must let the textarea insert a newline');
		assert.deepStrictEqual(callOrder, [], 'Shift+Enter must not submit');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none', 'Shift+Enter must not dismiss the overlay');
	});

	test('Enter during IME composition does not submit', () => {
		const { controller, setSelection, callOrder } = setup();
		setSelection('hello world');
		const textArea = inputTextArea(controller);
		textArea.value = 'what does this mean?';
		textArea.dispatchEvent(new Event('input', { bubbles: true }));

		const event = dispatchKey(textArea, 'Enter', { isComposing: true });

		assert.strictEqual(event.defaultPrevented, false, 'Enter during IME composition must not be prevented');
		assert.deepStrictEqual(callOrder, [], 'Enter during IME composition must not submit');
		assert.notStrictEqual(inputDomNode(controller).style.display, 'none', 'Enter during IME composition must not dismiss the overlay');
	});
});
