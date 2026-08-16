/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { INewChatVoiceComposer, isNewChatVoiceSessionActive, NEW_CHAT_VOICE_SENTINEL, NewChatVoiceTargetService } from '../../browser/newChatVoice.js';

suite('NewChatVoiceTargetService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function makeComposer(routesWhileSessionActive: boolean): INewChatVoiceComposer {
		return upcastPartial<INewChatVoiceComposer>({
			onDidFocus: Event.None,
			routesWhileSessionActive,
			sendQuery: () => undefined,
			prefillInput: () => undefined,
			focus: () => undefined,
		});
	}

	function makeActiveSession(isCreated: boolean, chatResource: URI): IActiveSession {
		return upcastPartial<IActiveSession>({
			isCreated: observableValue<boolean>('isCreated', isCreated),
			activeChat: observableValue<IChat>('activeChat', upcastPartial<IChat>({ resource: chatResource })),
		});
	}

	function setup() {
		const store = disposables.add(new DisposableStore());
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
		const focusEmitter = store.add(new Emitter<void>());
		let focusedResource: URI | undefined;

		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession: ISettableObservable<IActiveSession | undefined> = activeSession;
		}();
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidChangeFocusedSession = focusEmitter.event;
			override get lastFocusedWidget(): IChatWidget | undefined {
				return focusedResource ? upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatViewModel>({ sessionResource: focusedResource }) }) : undefined;
			}
		}();

		const service = store.add(new NewChatVoiceTargetService(sessionsService, chatWidgetService));

		// Keep the derived live so it recomputes on dependency changes.
		let current: URI | undefined;
		store.add(autorun(reader => { current = service.currentVoiceInputResource.read(reader); }));

		const setFocused = (resource: URI | undefined) => { focusedResource = resource; focusEmitter.fire(); };
		return { store, service, activeSession, setFocused, resource: (): URI | undefined => current };
	}

	test('bound input resource follows composer > active created session > focus priority', () => {
		const { store, service, activeSession, setFocused, resource } = setup();
		const chatResource = URI.parse('agent-host-copilot:/session-1');

		// No composer, no session, no focus -> nothing is bound.
		assert.strictEqual(resource(), undefined);

		// Focused chat is the fallback when nothing else claims voice.
		setFocused(chatResource);
		assert.ok(resource() && resource()!.toString() === chatResource.toString());

		// An active, created session outranks bare focus.
		const otherResource = URI.parse('agent-host-copilot:/session-2');
		activeSession.set(makeActiveSession(true, otherResource), undefined);
		assert.strictEqual(resource()!.toString(), otherResource.toString());

		// A composer that routes while a session is active wins over the session.
		const composer = makeComposer(true);
		store.add(service.registerComposer(composer));
		assert.strictEqual(resource()!.toString(), NEW_CHAT_VOICE_SENTINEL.toString());
	});

	test('welcome composer yields to a created session', () => {
		const { store, service, activeSession, resource } = setup();

		// A composer that only targets before a session exists.
		const composer = makeComposer(false);
		store.add(service.registerComposer(composer));
		assert.strictEqual(resource()!.toString(), NEW_CHAT_VOICE_SENTINEL.toString());

		// Once a session is created, the composer stops being the target.
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		activeSession.set(makeActiveSession(true, chatResource), undefined);
		assert.strictEqual(resource()!.toString(), chatResource.toString());
	});

	test('new-session composer does not show another session voice connection as active', () => {
		assert.strictEqual(isNewChatVoiceSessionActive(true, false, undefined, true), true);
		assert.strictEqual(isNewChatVoiceSessionActive(false, true, undefined, true), true);
		assert.strictEqual(isNewChatVoiceSessionActive(true, false, URI.parse('agent-host-copilot:/session-1'), false), false);
		assert.strictEqual(isNewChatVoiceSessionActive(true, false, undefined, false), false);
		assert.strictEqual(isNewChatVoiceSessionActive(false, false, undefined, true), false);
		assert.strictEqual(isNewChatVoiceSessionActive(true, false, undefined, true, true), false);
	});
});
