/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatInteractivity, IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING, TransientSideChatService } from '../../browser/transientSideChatService.js';

suite('TransientSideChatService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sourceChat = upcastPartial<IChat>({
		resource: URI.parse('test:///chat/source'),
		title: constObservable('Source Chat'),
		interactivity: constObservable(ChatInteractivity.Full),
	});
	const sideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/side') });
	const session = upcastPartial<ISession>({
		sessionId: 'session',
		resource: URI.parse('test:///session'),
	});

	function setup(options: {
		readonly onOpenChat?: () => Promise<void>;
		readonly onCloseChat?: (chat: IChat) => Promise<void>;
		readonly enabled?: boolean;
		readonly openChatSucceeds?: boolean;
	} = {}) {
		const calls: string[] = [];
		const didDeleteChat = disposables.add(new Emitter<{ session: ISession; chatResource: URI }>());
		const didChangeSessions = disposables.add(new Emitter<{ added: readonly ISession[]; removed: readonly ISession[]; changed: readonly ISession[] }>());
		const didReplaceSession = disposables.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		const chats = observableValue<readonly IChat[]>(disposables, [sourceChat, sideChat]);
		const activeChat = observableValue<IChat>(disposables, sourceChat);
		const liveSession = upcastPartial<ISession>({ ...session, chats });
		let currentSession = liveSession;
		const activeSession = upcastPartial<IActiveSession>({ ...liveSession, activeChat });
		const configurationService = new TestConfigurationService({ [AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING]: options.enabled ?? true });
		const sessionsService = upcastPartial<ISessionsService>({
			activeSession: constObservable(activeSession),
			closeChat: async (_session, chat, closeOptions) => {
				calls.push(`close:${chat.resource.toString()}:${closeOptions?.skipHistory}`);
				await options.onCloseChat?.(chat);
			},
			openChat: async (_session, chatResource) => {
				calls.push(`open:${chatResource.toString()}`);
				await options.onOpenChat?.();
				if (options.openChatSucceeds !== false) {
					const chat = chats.get().find(candidate => candidate.resource.toString() === chatResource.toString());
					if (chat) {
						activeChat.set(chat, undefined);
					}
				}
			},
		});
		const managementService = upcastPartial<ISessionsManagementService>({
			getSession: resource => resource.toString() === currentSession.resource.toString() ? currentSession : undefined,
			onDidChangeSessions: didChangeSessions.event,
			onDidReplaceSession: didReplaceSession.event,
			onDidDeleteSession: Event.None,
			onDidDeleteChat: didDeleteChat.event,
		});
		return {
			service: disposables.add(new TransientSideChatService(sessionsService, managementService, configurationService)),
			calls,
			didDeleteChat,
			didReplaceSession,
			chats,
			configurationService,
			setCurrentSession: (next: ISession) => currentSession = next,
		};
	}

	test('falls back when the source chat has no live host', async () => {
		const { service, calls } = setup();

		assert.deepStrictEqual({
			shown: await service.show(session, sourceChat, sideChat, 'question'),
			states: service.states.get(),
			calls,
		}, {
			shown: false,
			states: [],
			calls: [],
		});
	});

	test('falls back before closing when the source chat is read-only', async () => {
		const readOnlySourceChat = {
			...sourceChat,
			interactivity: constObservable(ChatInteractivity.ReadOnly),
		};
		const { service, calls, chats } = setup();
		chats.set([readOnlySourceChat, sideChat], undefined);
		disposables.add(service.registerHost(readOnlySourceChat.resource));

		assert.deepStrictEqual({
			shown: await service.show(session, readOnlySourceChat, sideChat, 'question'),
			states: service.states.get(),
			calls,
		}, {
			shown: false,
			states: [],
			calls: [],
		});
	});

	test('falls back when the source host disappears while the side chat closes', async () => {
		const closeChat = new DeferredPromise<void>();
		const { service, calls } = setup({ onCloseChat: () => closeChat.p });
		const host = service.registerHost(sourceChat.resource);

		const showing = service.show(session, sourceChat, sideChat, 'question');
		host.dispose();
		closeChat.complete();

		assert.deepStrictEqual({
			shown: await showing,
			states: service.states.get(),
			calls,
		}, {
			shown: false,
			states: [],
			calls: [`close:${sideChat.resource.toString()}:true`],
		});
	});

	test('falls back when the side chat leaves the catalog while it closes', async () => {
		const closeChat = new DeferredPromise<void>();
		const { service, chats } = setup({ onCloseChat: () => closeChat.p });
		disposables.add(service.registerHost(sourceChat.resource));

		const showing = service.show(session, sourceChat, sideChat, 'question');
		chats.set([sourceChat], undefined);
		closeChat.complete();

		assert.deepStrictEqual({
			shown: await showing,
			states: service.states.get(),
		}, {
			shown: false,
			states: [],
		});
	});

	test('keeps the source hosted while another matching host remains', async () => {
		const { service } = setup();
		const firstHost = disposables.add(service.registerHost(sourceChat.resource));
		const secondHost = service.registerHost(sourceChat.resource);
		secondHost.dispose();

		const shown = await service.show(session, sourceChat, sideChat, 'question');

		assert.deepStrictEqual({
			shown,
			states: service.states.get().map(state => state.sideChatResource.toString()),
		}, {
			shown: true,
			states: [sideChat.resource.toString()],
		});
		firstHost.dispose();
	});

	test('removes the card when its final source host is disposed', async () => {
		const { service } = setup();
		const host = service.registerHost(sourceChat.resource);
		await service.show(session, sourceChat, sideChat, 'question');

		host.dispose();

		assert.deepStrictEqual({
			states: service.states.get(),
			failurePresented: service.markFailed(sideChat.resource),
		}, {
			states: [],
			failurePresented: false,
		});
	});

	test('removes the card when its source chat becomes read-only', async () => {
		const sourceInteractivity = observableValue<ChatInteractivity>(disposables, ChatInteractivity.Full);
		const mutableSourceChat = { ...sourceChat, interactivity: sourceInteractivity };
		const { service, chats } = setup();
		chats.set([mutableSourceChat, sideChat], undefined);
		disposables.add(service.registerHost(mutableSourceChat.resource));
		await service.show(session, mutableSourceChat, sideChat, 'question');

		sourceInteractivity.set(ChatInteractivity.ReadOnly, undefined);

		assert.deepStrictEqual(service.states.get(), []);
	});

	test('an older presentation cannot overwrite a newer card', async () => {
		const firstClose = new DeferredPromise<void>();
		const secondClose = new DeferredPromise<void>();
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		const { service, chats } = setup({
			onCloseChat: chat => chat.resource.toString() === sideChat.resource.toString() ? firstClose.p : secondClose.p,
		});
		chats.set([sourceChat, sideChat, replacement], undefined);
		disposables.add(service.registerHost(sourceChat.resource));

		const firstShowing = service.show(session, sourceChat, sideChat, 'first');
		const secondShowing = service.show(session, sourceChat, replacement, 'second');
		secondClose.complete();
		const secondShown = await secondShowing;
		firstClose.complete();
		const firstShown = await firstShowing;

		assert.deepStrictEqual({
			firstShown,
			secondShown,
			state: service.states.get().map(state => ({
				sideChat: state.sideChatResource.toString(),
				question: state.question,
				replacedExisting: state.replacedExisting,
			})),
		}, {
			firstShown: false,
			secondShown: true,
			state: [{
				sideChat: replacement.resource.toString(),
				question: 'second',
				replacedExisting: false,
			}],
		});
	});

	test('falls back to full-chat presentation when the experiment-driven setting is disabled', async () => {
		const { service, calls } = setup({ enabled: false });
		disposables.add(service.registerHost(sourceChat.resource));

		assert.deepStrictEqual({
			shown: await service.show(session, sourceChat, sideChat, 'question'),
			states: service.states.get(),
			calls,
		}, {
			shown: false,
			states: [],
			calls: [],
		});
	});

	test('removes a live card when the experiment-driven setting is disabled', async () => {
		const { service, configurationService } = setup();
		disposables.add(service.registerHost(sourceChat.resource));
		await service.show(session, sourceChat, sideChat, 'question');

		await configurationService.setUserConfiguration(AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING,
		}));

		assert.deepStrictEqual(service.states.get(), []);
	});

	test('shows and promotes through the normal chat path', async () => {
		const { service, calls } = setup();
		disposables.add(service.registerHost(sourceChat.resource));

		const shown = await service.show(session, sourceChat, sideChat, 'question');
		const transient = service.states.get()[0];
		await service.promote(sourceChat.resource);

		assert.deepStrictEqual({
			shown,
			transient: { question: transient?.question, promoting: transient?.promoting },
			states: service.states.get(),
			calls,
		}, {
			shown: true,
			transient: { question: 'question', promoting: false },
			states: [],
			calls: [
				`close:${sideChat.resource.toString()}:true`,
				`open:${sideChat.resource.toString()}`,
			],
		});
	});

	test('clears transient state when the side chat opens through another surface', async () => {
		const { service } = setup();
		disposables.add(service.registerHost(sourceChat.resource));
		await service.show(session, sourceChat, sideChat, 'question');

		service.removeBySideChat(sideChat.resource);

		assert.deepStrictEqual(service.states.get(), []);
	});

	test('clears transient state when either referenced chat is deleted', async () => {
		const { service, didDeleteChat } = setup();
		disposables.add(service.registerHost(sourceChat.resource));

		await service.show(session, sourceChat, sideChat, 'question');
		didDeleteChat.fire({ session, chatResource: sideChat.resource });
		const afterSideChatDelete = service.states.get();

		await service.show(session, sourceChat, sideChat, 'question');
		didDeleteChat.fire({ session, chatResource: sourceChat.resource });

		assert.deepStrictEqual({
			afterSideChatDelete,
			afterSourceChatDelete: service.states.get(),
		}, {
			afterSideChatDelete: [],
			afterSourceChatDelete: [],
		});
	});

	test('drops resource state when the provider catalog no longer contains the side chat', async () => {
		const { service, chats } = setup();
		disposables.add(service.registerHost(sourceChat.resource));
		await service.show(session, sourceChat, sideChat, 'question');

		chats.set([sourceChat], undefined);

		assert.deepStrictEqual(service.states.get(), []);
	});

	test('remaps transient state when its session facade is replaced', async () => {
		const { service, didReplaceSession, chats, setCurrentSession } = setup();
		disposables.add(service.registerHost(sourceChat.resource));
		await service.show(session, sourceChat, sideChat, 'question');
		const replacement = upcastPartial<ISession>({
			...session,
			sessionId: 'replacement',
			resource: URI.parse('test:///session/replacement'),
			chats,
		});
		setCurrentSession(replacement);

		didReplaceSession.fire({ from: session, to: replacement });
		const state = service.states.get()[0];

		assert.deepStrictEqual({
			sessionResource: state?.sessionResource.toString(),
			resolvedSession: state && service.resolveState(state)?.session.sessionId,
		}, {
			sessionResource: replacement.resource.toString(),
			resolvedSession: replacement.sessionId,
		});
	});

	test('keeps the card when opening the full chat does not activate it', async () => {
		const { service } = setup({ openChatSucceeds: false });
		disposables.add(service.registerHost(sourceChat.resource));
		await service.show(session, sourceChat, sideChat, 'question');

		await assert.rejects(service.promote(sourceChat.resource), /did not open/);

		assert.deepStrictEqual(service.states.get().map(state => ({
			sideChat: state.sideChatResource.toString(),
			promoting: state.promoting,
		})), [{
			sideChat: sideChat.resource.toString(),
			promoting: false,
		}]);
	});

	test('successful promotion does not remove a newer transient question', async () => {
		const openChat = new DeferredPromise<void>();
		const { service, chats } = setup({ onOpenChat: () => openChat.p });
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		disposables.add(service.registerHost(sourceChat.resource));
		await service.show(session, sourceChat, sideChat, 'first');

		const promotion = service.promote(sourceChat.resource);
		chats.set([sourceChat, sideChat, replacement], undefined);
		await service.show(session, sourceChat, replacement, 'second');
		openChat.complete();
		await promotion;

		assert.deepStrictEqual(service.states.get().map(state => ({
			sideChat: state.sideChatResource.toString(),
			question: state.question,
			promoting: state.promoting,
		})), [{
			sideChat: replacement.resource.toString(),
			question: 'second',
			promoting: false,
		}]);
	});

	test('failed promotion does not restore stale state over a newer question', async () => {
		const openChat = new DeferredPromise<void>();
		const { service, chats } = setup({ onOpenChat: () => openChat.p });
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		disposables.add(service.registerHost(sourceChat.resource));
		await service.show(session, sourceChat, sideChat, 'first');

		const promotion = service.promote(sourceChat.resource);
		chats.set([sourceChat, sideChat, replacement], undefined);
		await service.show(session, sourceChat, replacement, 'second');
		openChat.error(new Error('open failed'));
		await assert.rejects(promotion, /open failed/);

		assert.deepStrictEqual(service.states.get().map(state => ({
			sideChat: state.sideChatResource.toString(),
			question: state.question,
			promoting: state.promoting,
		})), [{
			sideChat: replacement.resource.toString(),
			question: 'second',
			promoting: false,
		}]);
	});

	test('marks the matching transient side chat as failed', async () => {
		const { service } = setup();
		disposables.add(service.registerHost(sourceChat.resource));
		await service.show(session, sourceChat, sideChat, 'question');

		const marked = service.markFailed(sideChat.resource);
		service.dismiss(sourceChat.resource);
		const markedAfterDismiss = service.markFailed(sideChat.resource);

		assert.deepStrictEqual({
			marked,
			markedAfterDismiss,
			states: service.states.get(),
		}, {
			marked: true,
			markedAfterDismiss: false,
			states: [],
		});
	});

	test('records when a new side question replaces the source slot', async () => {
		const { service, chats } = setup();
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		disposables.add(service.registerHost(sourceChat.resource));

		await service.show(session, sourceChat, sideChat, 'first');
		const first = service.states.get()[0];
		chats.set([sourceChat, sideChat, replacement], undefined);
		await service.show(session, sourceChat, replacement, 'second');
		const second = service.states.get()[0];

		assert.deepStrictEqual({
			first: first?.replacedExisting,
			second: second?.replacedExisting,
		}, {
			first: false,
			second: true,
		});
	});

});
