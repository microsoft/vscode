/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ICreateNewChatInSessionOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';

class TestNewChatInSessionWidget extends NewChatInSessionWidget {
	send(query: string, background: boolean): Promise<boolean> {
		return this._send(query, undefined, background);
	}

	selectHarness(harness: string): Promise<void> {
		return this._selectHarness(harness);
	}

	renderHarnessPicker(container: HTMLElement): void {
		this._renderHarnessPicker(container);
	}
}

suite('NewChatInSessionWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resets the composer to a chat of the main harness after a background send', async () => {
		const draft = upcastPartial<IChat>({ resource: URI.parse('test:///session#draft'), harness: 'other' });
		const session = upcastPartial<IActiveSession>({ harness: 'main', activeChat: constObservable(draft) });
		const resets: (ICreateNewChatInSessionOptions | undefined)[] = [];
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override async openNewChatInSession(_session: IActiveSession, options?: ICreateNewChatInSessionOptions): Promise<void> {
					resets.push(options);
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async sendRequest(): Promise<void> { }
			}(),
		});

		const sent = await widget.send('hello', true);

		assert.deepStrictEqual({ sent, resets }, { sent: true, resets: [{ forceNew: true }] });
	});

	test('picking another harness swaps the unsent peer chat for one of that harness and deletes the replaced draft', async () => {
		const chat = (fragment: string, harness: string | undefined, status = SessionStatus.Untitled) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status), ...(harness ? { harness } : {}) });
		const main = chat('', 'main', SessionStatus.Completed);
		const draft = chat('draft', undefined);
		const replacement = chat('replacement', 'other');
		const activeChat = observableValue<IChat>('activeChat', draft);
		const session = upcastPartial<IActiveSession>({ harness: 'main', isCreated: constObservable(true), mainChat: constObservable(main), activeChat });
		const opened: (ICreateNewChatInSessionOptions | undefined)[] = [];
		const deleted: string[] = [];
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override async openNewChatInSession(_session: IActiveSession, options?: ICreateNewChatInSessionOptions): Promise<void> {
					opened.push(options);
					activeChat.set(replacement, undefined);
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async deleteChat(_session: IActiveSession, chatUri: URI): Promise<boolean> {
					deleted.push(chatUri.fragment);
					return true;
				}
			}(),
		});

		await widget.selectHarness('main');
		await widget.selectHarness('other');

		assert.deepStrictEqual({ opened, deleted, active: activeChat.get().resource.fragment }, {
			opened: [{ harness: 'other' }],
			deleted: ['draft'],
			active: 'replacement',
		});
	});

	test('ignores a harness pick while a switch is pending, and keeps the draft when the user left the session meanwhile', async () => {
		const chat = (fragment: string, status = SessionStatus.Untitled) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status) });
		const main = chat('', SessionStatus.Completed);
		const activeChat = observableValue<IChat>('activeChat', chat('draft'));
		const session = upcastPartial<IActiveSession>({ sessionId: 'session', harness: 'main', isCreated: constObservable(true), mainChat: constObservable(main), activeChat });
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', session);
		const opened: (string | undefined)[] = [];
		const deleted: string[] = [];
		let finishOpen!: () => void;
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: activeSession,
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override openNewChatInSession(_session: IActiveSession, options?: ICreateNewChatInSessionOptions): Promise<void> {
					opened.push(options?.harness);
					return new Promise<void>(resolve => finishOpen = () => { activeChat.set(chat('replacement'), undefined); resolve(); });
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async deleteChat(_session: IActiveSession, chatUri: URI): Promise<boolean> {
					deleted.push(chatUri.fragment);
					return true;
				}
			}(),
		});

		const first = widget.selectHarness('other');
		await widget.selectHarness('third');
		activeSession.set(undefined, undefined);
		finishOpen();
		await first;

		assert.deepStrictEqual({ opened, deleted }, { opened: ['other'], deleted: [] });
	});

	test('renders the harness picker as the new-session pill in a header row above the input that collapses while hidden', () => {
		const store = new DisposableStore();
		const visible = observableValue('visible', true);
		const rendered: { className?: string }[] = [];
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_store: store,
			_newChatInput: {
				sessionTypePicker: {
					isVisible: visible,
					render: (container: HTMLElement, options?: { className?: string }) => {
						rendered.push(options ?? {});
						container.appendChild(document.createElement('div')).className = `sessions-chat-picker-slot ${options?.className}`;
					},
				},
			},
		});
		const content = document.createElement('div');
		widget.renderHarnessPicker(content);
		// The input renders after the header, so it sits below it.
		content.appendChild(document.createElement('div')).className = 'new-chat-input-container';
		const header = content.firstElementChild!;
		const state = () => ({ visible: header.classList.contains('visible') });
		const shown = state();
		const headerClasses = [...header.classList];
		visible.set(false, undefined);
		const hidden = state();
		store.dispose();

		assert.deepStrictEqual({
			headerClasses,
			aboveInput: header.nextElementSibling?.className,
			slot: header.firstElementChild?.firstElementChild?.className,
			options: header.firstElementChild?.className,
			rendered,
			shown,
			hidden,
		}, {
			headerClasses: ['new-session-quick-chat-header', 'sessions-workspace-category-picker', 'new-chat-harness-header', 'visible'],
			aboveInput: 'new-chat-input-container',
			slot: 'sessions-chat-picker-slot sessions-chat-session-type-picker sessions-workspace-category-picker-slot',
			options: 'new-chat-session-options-details',
			rendered: [{ className: 'sessions-chat-session-type-picker sessions-workspace-category-picker-slot' }],
			shown: { visible: true },
			hidden: { visible: false },
		});
	});

	test('a send while a harness switch is in flight waits for it and reaches the picked harness\'s chat', async () => {
		const chat = (fragment: string, status = SessionStatus.Untitled) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status) });
		const main = chat('', SessionStatus.Completed);
		const draft = chat('draft');
		const replacement = chat('replacement');
		const activeChat = observableValue<IChat>('activeChat', draft);
		const session = upcastPartial<IActiveSession>({ sessionId: 'session', harness: 'main', isCreated: constObservable(true), mainChat: constObservable(main), activeChat });
		const events: string[] = [];
		let finishOpen!: () => void;
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override openNewChatInSession(): Promise<void> {
					return new Promise<void>(resolve => finishOpen = () => { activeChat.set(replacement, undefined); resolve(); });
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async deleteChat(_session: IActiveSession, chatUri: URI): Promise<boolean> {
					events.push(`delete:${chatUri.fragment}`);
					return true;
				}
				override async sendRequest(_session: IActiveSession, target: IChat, options: { query: string }): Promise<void> {
					events.push(`send:${target.resource.fragment}:${options.query}`);
				}
			}(),
		});

		const switched = widget.selectHarness('other');
		// The user types and sends while the picked harness's chat is still being opened.
		const sent = widget.send('hello', false);
		finishOpen();
		await Promise.all([switched, sent]);

		assert.deepStrictEqual({ sent: await sent, events }, { sent: true, events: ['delete:draft', 'send:replacement:hello'] });
	});
});
