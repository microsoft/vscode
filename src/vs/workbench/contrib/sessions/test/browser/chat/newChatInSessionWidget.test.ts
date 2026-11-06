/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ISessionsService } from '../../../browser/sessionsService.js';
import { IChat, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { ICreateNewChatInSessionOptions, ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { NewChatInSessionWidget } from '../../../browser/chat/newChatInSessionWidget.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../browser/sessionsRecentWorkspacesService.js';
import { ISessionsProvider } from '../../../common/sessionsProvider.js';
import { NestedChatWorkspaceControls } from '../../../browser/chat/nestedChatWorkspacePicker.js';
import { SessionsChatViewStateService } from '../../../browser/chat/chatViewStateService.js';
import { IChatDraft } from '../../../../chat/common/attachments/chatDraft.js';
import { SharedChatInputComposer } from '../../../browser/chat/sharedChatInputComposer.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ITestSessionWithChat, withCreatedStatus } from '../sessionHostTestUtils.js';
import { ISessionHost } from '../../../../../services/sessions/browser/sessionHost.js';
import { shownChatOf } from '../../../../../services/sessions/common/sessionPane.js';

class TestNewChatInSessionWidget extends NewChatInSessionWidget {
	send(query: string, background: boolean): Promise<boolean> {
		return this._send(query, undefined, background);
	}

	selectHarness(harness: string): Promise<void> {
		return this._selectHarness(harness);
	}
}

suite('NewChatInSessionWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the nested chat workspace for the draft\'s own agent, and re-reads it when a harness switch replaces the draft', () => {
		const store = new DisposableStore();
		const chat = (fragment: string, status: SessionStatus) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status) });
		const main = chat('', SessionStatus.Completed);
		const copilotDraft = chat('copilot-draft', SessionStatus.Untitled);
		const claudeDraft = chat('claude-draft', SessionStatus.Untitled);
		const activeChat = observableValue<IChat>('activeChat', copilotDraft);
		const session = upcastPartial<ITestSessionWithChat>({
			sessionId: 's', providerId: 'p', ...withCreatedStatus(constObservable(true)), mainChat: constObservable(main), activeChat,
			workspace: constObservable(undefined), capabilities: constObservable({ supportsMultipleChats: true }),
		});
		const supportFor: string[] = [];
		const controlsCalls: string[] = [];
		const instantiationService = new class extends mock<IInstantiationService>() {
			override createInstance = ((ctor: unknown) => ctor === NestedChatWorkspaceControls
				? { reset: () => controlsCalls.push('reset'), refresh: () => controlsCalls.push('refresh'), dispose: () => { } }
				: Object.assign(Object.create(SharedChatInputComposer.prototype), { dispose: () => { } })) as IInstantiationService['createInstance'];
		}();
		const widget = store.add(new NewChatInSessionWidget(
			{ session: constObservable<ITestSessionWithChat | undefined>(session), chat: activeChat },
			new TestConfigurationService(),
			instantiationService,
			new NullLogService(),
			new class extends mock<INotificationService>() { }(),
			new class extends mock<ISessionsProvidersService>() {
				override getProvider<T extends ISessionsProvider>(): T | undefined {
					return upcastPartial<ISessionsProvider>({
						getNestedChatWorkspaceSupport: (_sessionId: string, chat: URI) => { supportFor.push(chat.fragment); return undefined; },
					}) as T;
				}
			}(),
			new class extends mock<ISessionsRecentWorkspacesService>() { }(),
			new class extends mock<IFileDialogService>() { }(),
			new class extends mock<ISessionsManagementService>() { }(),
			new class extends mock<ISessionsService>() { readonly activeSession = constObservable<ITestSessionWithChat | undefined>(session); }(),
			store.add(new InMemoryStorageService()),
			new TestAccessibilityService(),
			new class extends mock<IFileService>() { }(),
			new SessionsChatViewStateService(),
			upcastPartial<ISessionHost>({}),
		));
		store.add(autorun(reader => { Reflect.get(widget, '_workspaceSupport').read(reader); }));

		activeChat.set(claudeDraft, undefined);
		store.dispose();

		assert.deepStrictEqual({ supportFor, controlsCalls }, { supportFor: ['copilot-draft', 'claude-draft'], controlsCalls: ['refresh'] });
	});

	test('resets the composer to a chat of the main harness after a background send', async () => {
		const draft = upcastPartial<IChat>({ resource: URI.parse('test:///session#draft'), harness: 'other' });
		const session = upcastPartial<ITestSessionWithChat>({ harness: 'main', activeChat: constObservable(draft) });
		const resets: (ICreateNewChatInSessionOptions | undefined)[] = [];
		const host = upcastPartial<ISessionHost>({ id: 'pane' });
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			_workspaceSupport: constObservable(undefined),
			_chat: constObservable(undefined),
			_paneChat: shownChatOf(constObservable(session), session.activeChat),
			_store: { isDisposed: false },
			logService: new NullLogService(),
			sessionHost: host,
			sessionsService: new class extends mock<ISessionsService>() {
				override async openNewChatInSession(_session: ITestSessionWithChat, options?: ICreateNewChatInSessionOptions): Promise<void> {
					resets.push(options);
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async sendRequest(): Promise<void> { }
			}(),
		});

		const sent = await widget.send('hello', true);

		assert.deepStrictEqual({ sent, resets }, { sent: true, resets: [{ forceNew: true, from: host }] });
	});

	test('picking another harness swaps the unsent peer chat for one of that harness and deletes the replaced draft', async () => {
		const chat = (fragment: string, harness: string | undefined, status = SessionStatus.Untitled) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status), ...(harness ? { harness } : {}) });
		const main = chat('', 'main', SessionStatus.Completed);
		const draft = chat('draft', undefined);
		const replacement = chat('replacement', 'other');
		const activeChat = observableValue<IChat>('activeChat', draft);
		const session = upcastPartial<ITestSessionWithChat>({ harness: 'main', ...withCreatedStatus(constObservable(true)), mainChat: constObservable(main), activeChat });
		const opened: (ICreateNewChatInSessionOptions | undefined)[] = [];
		const host = upcastPartial<ISessionHost>({ id: 'pane' });
		const deleted: string[] = [];
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			_chat: constObservable(undefined),
			_paneChat: shownChatOf(constObservable(session), session.activeChat),
			logService: new NullLogService(),
			sessionHost: host,
			sessionsService: new class extends mock<ISessionsService>() {
				override async openNewChatInSession(_session: ITestSessionWithChat, options?: ICreateNewChatInSessionOptions): Promise<void> {
					opened.push(options);
					activeChat.set(replacement, undefined);
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async deleteChat(_session: ITestSessionWithChat, chatUri: URI): Promise<boolean> {
					deleted.push(chatUri.fragment);
					return true;
				}
			}(),
		});

		await widget.selectHarness('main');
		await widget.selectHarness('other');

		assert.deepStrictEqual({ opened, deleted, active: activeChat.get().resource.fragment }, {
			opened: [{ harness: 'other', from: host }],
			deleted: ['draft'],
			active: 'replacement',
		});
	});

	test('picking another harness keeps the typed input in the composer when the chat is replaced', async () => {
		const chat = (fragment: string, harness?: string, status = SessionStatus.Untitled) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status), ...(harness ? { harness } : {}) });
		const main = chat('', undefined, SessionStatus.Completed);
		const draft = chat('draft');
		const replacement = chat('replacement', 'other');
		const activeChat = observableValue<IChat>('activeChat', draft);
		const session = upcastPartial<ITestSessionWithChat>({ sessionId: 'session', harness: 'main', ...withCreatedStatus(constObservable(true)), mainChat: constObservable(main), activeChat });
		let input: IChatDraft = { inputText: '', attachments: [] };
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			_chat: observableValue<IChat | undefined>('chat', undefined),
			_paneChat: shownChatOf(constObservable(session), session.activeChat),
			_newChatInput: { getDraft: () => input, setDraft: (value: IChatDraft | undefined) => { input = value ?? { inputText: '', attachments: [] }; } },
			viewStateService: new SessionsChatViewStateService(),
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override async openNewChatInSession(): Promise<void> {
					await Promise.resolve();
					activeChat.set(replacement, undefined);
					widget.setChat(replacement);
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async deleteChat(): Promise<boolean> { return true; }
			}(),
		});
		widget.setChat(draft);
		input = { inputText: 'typed before the switch', attachments: [] };

		await widget.selectHarness('other');

		assert.deepStrictEqual(input, { inputText: 'typed before the switch', attachments: [] });
	});

	test('opening another unsent chat while a harness switch is pending shows that chat\'s own draft', async () => {
		const chat = (fragment: string, harness?: string, status = SessionStatus.Untitled) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status), ...(harness ? { harness } : {}) });
		const main = chat('', undefined, SessionStatus.Completed);
		const draft = chat('draft');
		const otherDraft = chat('other-draft');
		const activeChat = observableValue<IChat>('activeChat', draft);
		const session = upcastPartial<ITestSessionWithChat>({ sessionId: 'session', harness: 'main', ...withCreatedStatus(constObservable(true)), mainChat: constObservable(main), activeChat });
		const viewStateService = new SessionsChatViewStateService();
		viewStateService.setDraft(otherDraft.resource, { inputText: 'the other chat\'s draft', attachments: [] });
		let input: IChatDraft = { inputText: '', attachments: [] };
		let finishOpen!: () => void;
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			_chat: observableValue<IChat | undefined>('chat', undefined),
			_paneChat: shownChatOf(constObservable(session), session.activeChat),
			_newChatInput: { getDraft: () => input, setDraft: (value: IChatDraft | undefined) => { input = value ?? { inputText: '', attachments: [] }; } },
			viewStateService,
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override openNewChatInSession(): Promise<void> {
					return new Promise<void>(resolve => finishOpen = resolve);
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async deleteChat(): Promise<boolean> { return true; }
			}(),
		});
		widget.setChat(draft);
		input = { inputText: 'typed before the switch', attachments: [] };

		const switched = widget.selectHarness('other');
		widget.setChat(otherDraft);
		const shown = input;
		finishOpen();
		await switched;

		assert.deepStrictEqual(shown, { inputText: 'the other chat\'s draft', attachments: [] });
	});

	test('returning to the replacement chat while the replaced draft is still being deleted restores its own draft', async () => {
		const chat = (fragment: string, harness?: string, status = SessionStatus.Untitled) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status), ...(harness ? { harness } : {}) });
		const main = chat('', undefined, SessionStatus.Completed);
		const draft = chat('draft');
		const replacement = chat('replacement', 'other');
		const otherDraft = chat('other-draft', 'other');
		const activeChat = observableValue<IChat>('activeChat', draft);
		const session = upcastPartial<ITestSessionWithChat>({ sessionId: 'session', harness: 'main', ...withCreatedStatus(constObservable(true)), mainChat: constObservable(main), activeChat });
		const viewStateService = new SessionsChatViewStateService();
		viewStateService.setDraft(otherDraft.resource, { inputText: 'the other chat\'s draft', attachments: [] });
		let input: IChatDraft = { inputText: '', attachments: [] };
		let finishDelete!: () => void;
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			_chat: observableValue<IChat | undefined>('chat', undefined),
			_paneChat: shownChatOf(constObservable(session), session.activeChat),
			_newChatInput: { getDraft: () => input, setDraft: (value: IChatDraft | undefined) => { input = value ?? { inputText: '', attachments: [] }; } },
			viewStateService,
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override async openNewChatInSession(): Promise<void> {
					await Promise.resolve();
					activeChat.set(replacement, undefined);
					widget.setChat(replacement);
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override deleteChat(): Promise<boolean> {
					return new Promise<boolean>(resolve => finishDelete = () => resolve(true));
				}
			}(),
		});
		widget.setChat(draft);
		input = { inputText: 'typed before the switch', attachments: [] };

		const switched = widget.selectHarness('other');
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		widget.setChat(otherDraft);
		const inOtherChat = input;
		input = { inputText: 'edited in the other chat', attachments: [] };
		widget.setChat(replacement);
		const backInReplacement = input;
		finishDelete();
		await switched;

		assert.deepStrictEqual({ inOtherChat, backInReplacement }, {
			inOtherChat: { inputText: 'the other chat\'s draft', attachments: [] },
			backInReplacement: { inputText: 'typed before the switch', attachments: [] },
		});
	});

	test('ignores a harness pick while a switch is pending, and keeps the draft when the user left the session meanwhile', async () => {
		const chat = (fragment: string, status = SessionStatus.Untitled) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status) });
		const main = chat('', SessionStatus.Completed);
		const activeChat = observableValue<IChat>('activeChat', chat('draft'));
		const session = upcastPartial<ITestSessionWithChat>({ sessionId: 'session', harness: 'main', ...withCreatedStatus(constObservable(true)), mainChat: constObservable(main), activeChat });
		const activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', session);
		const opened: (string | undefined)[] = [];
		const deleted: string[] = [];
		let finishOpen!: () => void;
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: activeSession,
			_chat: constObservable(undefined),
			_paneChat: shownChatOf(constObservable(session), session.activeChat),
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override openNewChatInSession(_session: ITestSessionWithChat, options?: ICreateNewChatInSessionOptions): Promise<void> {
					opened.push(options?.harness);
					return new Promise<void>(resolve => finishOpen = () => { activeChat.set(chat('replacement'), undefined); resolve(); });
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async deleteChat(_session: ITestSessionWithChat, chatUri: URI): Promise<boolean> {
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

	test('a send while a harness switch is in flight waits for it and reaches the picked harness\'s chat', async () => {
		const chat = (fragment: string, status = SessionStatus.Untitled) => upcastPartial<IChat>({ resource: URI.parse(`test:///session#${fragment}`), status: constObservable(status) });
		const main = chat('', SessionStatus.Completed);
		const draft = chat('draft');
		const replacement = chat('replacement');
		const activeChat = observableValue<IChat>('activeChat', draft);
		const session = upcastPartial<ITestSessionWithChat>({ sessionId: 'session', harness: 'main', ...withCreatedStatus(constObservable(true)), mainChat: constObservable(main), activeChat });
		const events: string[] = [];
		let finishOpen!: () => void;
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			_workspaceSupport: constObservable(undefined),
			_chat: constObservable(undefined),
			_paneChat: shownChatOf(constObservable(session), session.activeChat),
			_store: { isDisposed: false },
			logService: new NullLogService(),
			sessionsService: new class extends mock<ISessionsService>() {
				override openNewChatInSession(): Promise<void> {
					return new Promise<void>(resolve => finishOpen = () => { activeChat.set(replacement, undefined); resolve(); });
				}
			}(),
			sessionsManagementService: new class extends mock<ISessionsManagementService>() {
				override async deleteChat(_session: ITestSessionWithChat, chatUri: URI): Promise<boolean> {
					events.push(`delete:${chatUri.fragment}`);
					return true;
				}
				override async sendRequest(_session: ITestSessionWithChat, target: IChat, options: { query: string }): Promise<void> {
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
