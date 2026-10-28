/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ICreateNewChatInSessionOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { NestedChatWorkspaceControls } from '../../browser/nestedChatWorkspacePicker.js';
import { SharedChatInputComposer } from '../../browser/sharedChatInputComposer.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

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
		const session = upcastPartial<IActiveSession>({
			sessionId: 's', providerId: 'p', isCreated: constObservable(true), mainChat: constObservable(main), activeChat,
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
			{},
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
			new class extends mock<ISessionsService>() { override readonly activeSession = constObservable<IActiveSession | undefined>(session); }(),
			store.add(new InMemoryStorageService()),
			new TestAccessibilityService(),
			new class extends mock<IFileService>() { }(),
		));
		store.add(autorun(reader => { Reflect.get(widget, '_workspaceSupport').read(reader); }));

		activeChat.set(claudeDraft, undefined);
		store.dispose();

		assert.deepStrictEqual({ supportFor, controlsCalls }, { supportFor: ['copilot-draft', 'claude-draft'], controlsCalls: ['refresh'] });
	});

	test('resets the composer to a chat of the main harness after a background send', async () => {
		const draft = upcastPartial<IChat>({ resource: URI.parse('test:///session#draft'), harness: 'other' });
		const session = upcastPartial<IActiveSession>({ harness: 'main', activeChat: constObservable(draft) });
		const resets: (ICreateNewChatInSessionOptions | undefined)[] = [];
		const widget: TestNewChatInSessionWidget = Object.assign(Object.create(TestNewChatInSessionWidget.prototype), {
			_session: constObservable(session),
			_workspaceSupport: constObservable(undefined),
			_chat: constObservable(undefined),
			_store: { isDisposed: false },
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
			_chat: constObservable(undefined),
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
			_chat: constObservable(undefined),
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
			_workspaceSupport: constObservable(undefined),
			_chat: constObservable(undefined),
			_store: { isDisposed: false },
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
