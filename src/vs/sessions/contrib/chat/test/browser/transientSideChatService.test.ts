/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import type { IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatInteractivity, IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { SideChatOrchestrationService, SideChatPresentation } from '../../browser/sideChatOrchestration.js';
import { AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING, ITransientSideChatService, TransientSideChatPresentationResult, TransientSideChatService } from '../../browser/transientSideChatService.js';

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
		readonly onDidOpenChat?: (chat: IChat) => void;
		readonly onCloseChat?: (chat: IChat) => Promise<void>;
		readonly enabled?: boolean;
		readonly openChatSucceeds?: boolean;
		readonly sendRequest?: ISessionsManagementService['sendRequest'];
		readonly createSideChatInSession?: ISessionsManagementService['createSideChatInSession'];
	} = {}) {
		const calls: string[] = [];
		const focusedChats: string[] = [];
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
			openChat: async (_session, chatResource, openOptions) => {
				calls.push(`open:${chatResource.toString()}`);
				await options.onOpenChat?.();
				if (options.openChatSucceeds !== false && !openOptions?.token?.isCancellationRequested) {
					const chat = chats.get().find(candidate => candidate.resource.toString() === chatResource.toString());
					if (chat) {
						activeChat.set(chat, undefined);
						options.onDidOpenChat?.(chat);
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
			sendRequest: options.sendRequest,
			createSideChatInSession: options.createSideChatInSession ?? (async () => sideChat),
		});
		const sessionsPartService = upcastPartial<ISessionsPartService>({
			focusSession: session => { focusedChats.push(session!.activeChat.get().resource.toString()); },
			getSessionView: () => upcastPartial<NonNullable<ReturnType<ISessionsPartService['getSessionView']>>>({
				splitChatToSide: resource => calls.push(`split:${resource.toString()}`),
			}),
		});
		const service = disposables.add(new TransientSideChatService(sessionsService, managementService, configurationService, sessionsPartService));
		return {
			service,
			orchestration: new SideChatOrchestrationService(managementService, sessionsService, sessionsPartService, service),
			calls,
			focusedChats,
			activeChat,
			didDeleteChat,
			didReplaceSession,
			chats,
			configurationService,
			sessionsService,
			managementService,
			sessionsPartService,
			setCurrentSession: (next: ISession) => currentSession = next,
		};
	}

	async function show(service: ITransientSideChatService, session: ISession, sourceChat: IChat, sideChat: IChat, question: string): Promise<TransientSideChatPresentationResult> {
		const presentation = service.beginPresentation(sourceChat);
		try {
			return await presentation.show(session, sideChat, question);
		} finally {
			presentation.dispose();
		}
	}

	test('falls back when the source chat has no live host', async () => {
		const { service, calls } = setup();

		assert.deepStrictEqual({
			shown: await show(service, session, sourceChat, sideChat, 'question'),
			states: service.states.get(),
			calls,
		}, {
			shown: TransientSideChatPresentationResult.Unavailable,
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
			shown: await show(service, session, readOnlySourceChat, sideChat, 'question'),
			states: service.states.get(),
			calls,
		}, {
			shown: TransientSideChatPresentationResult.Unavailable,
			states: [],
			calls: [],
		});
	});

	test('falls back when the source host disappears while the side chat closes', async () => {
		const closeChat = new DeferredPromise<void>();
		const { service, calls } = setup({ onCloseChat: () => closeChat.p });
		const host = service.registerHost(sourceChat.resource);

		const showing = show(service, session, sourceChat, sideChat, 'question');
		host.dispose();
		closeChat.complete();

		assert.deepStrictEqual({
			shown: await showing,
			states: service.states.get(),
			calls,
		}, {
			shown: TransientSideChatPresentationResult.Unavailable,
			states: [],
			calls: [`close:${sideChat.resource.toString()}:true`],
		});
	});

	test('falls back when the side chat leaves the catalog while it closes', async () => {
		const closeChat = new DeferredPromise<void>();
		const { service, chats } = setup({ onCloseChat: () => closeChat.p });
		disposables.add(service.registerHost(sourceChat.resource));

		const showing = show(service, session, sourceChat, sideChat, 'question');
		chats.set([sourceChat], undefined);
		closeChat.complete();

		assert.deepStrictEqual({
			shown: await showing,
			states: service.states.get(),
		}, {
			shown: TransientSideChatPresentationResult.Unavailable,
			states: [],
		});
	});

	test('keeps the source hosted while another matching host remains', async () => {
		const { service } = setup();
		const firstHost = disposables.add(service.registerHost(sourceChat.resource));
		const secondHost = service.registerHost(sourceChat.resource);
		secondHost.dispose();

		const shown = await show(service, session, sourceChat, sideChat, 'question');

		assert.deepStrictEqual({
			shown,
			states: service.states.get().map(state => state.sideChatResource.toString()),
		}, {
			shown: TransientSideChatPresentationResult.Shown,
			states: [sideChat.resource.toString()],
		});
		firstHost.dispose();
	});

	test('removes the card when its final source host is disposed', async () => {
		const { service } = setup();
		const host = service.registerHost(sourceChat.resource);
		await show(service, session, sourceChat, sideChat, 'question');

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
		await show(service, session, mutableSourceChat, sideChat, 'question');

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

		const firstShowing = show(service, session, sourceChat, sideChat, 'first');
		const secondShowing = show(service, session, sourceChat, replacement, 'second');
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
			firstShown: TransientSideChatPresentationResult.Superseded,
			secondShown: TransientSideChatPresentationResult.Shown,
			state: [{
				sideChat: replacement.resource.toString(),
				question: 'second',
				replacedExisting: false,
			}],
		});
	});

	test('orders presentations by submission rather than side-chat creation completion', async () => {
		const firstCreation = new DeferredPromise<IChat>();
		const secondCreation = new DeferredPromise<IChat>();
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		const sends: { chat: string; preserveActiveChat: boolean | undefined }[] = [];
		const { service, orchestration, chats, calls, activeChat } = setup({
			createSideChatInSession: (_session, _source, turnId) => turnId === 'first' ? firstCreation.p : secondCreation.p,
			sendRequest: async (_session, chat, options) => {
				sends.push({ chat: chat.resource.toString(), preserveActiveChat: options.preserveActiveChat });
			},
		});
		chats.set([sourceChat, sideChat, replacement], undefined);
		disposables.add(service.registerHost(sourceChat.resource));

		const first = orchestration.createAndPresent(session, sourceChat, 'first', 'first question');
		const second = orchestration.createAndPresent(session, sourceChat, 'second', 'second question');
		await secondCreation.complete(replacement);
		const secondPrepared = await second;
		await firstCreation.complete(sideChat);
		const firstPrepared = await first;
		await secondPrepared.send({ query: 'second question' });
		await firstPrepared.send({ query: 'first question' });

		assert.deepStrictEqual({
			presentations: [firstPrepared.presentation, secondPrepared.presentation],
			activeChat: activeChat.get().resource.toString(),
			questions: service.states.get().map(state => state.question),
			calls,
			sends,
		}, {
			presentations: [SideChatPresentation.Superseded, SideChatPresentation.Transient],
			activeChat: sourceChat.resource.toString(),
			questions: ['second question'],
			calls: [
				`close:${replacement.resource.toString()}:true`,
				`close:${sideChat.resource.toString()}:true`,
			],
			sends: [
				{ chat: replacement.resource.toString(), preserveActiveChat: true },
				{ chat: sideChat.resource.toString(), preserveActiveChat: true },
			],
		});
	});

	test('does not navigate or remove the newer card when an older close finishes last', async () => {
		const firstClosing = new DeferredPromise<void>();
		const firstClose = new DeferredPromise<void>();
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		const sends: boolean[] = [];
		const { service, orchestration, chats, calls, activeChat } = setup({
			createSideChatInSession: async (_session, _source, turnId) => turnId === 'first' ? sideChat : replacement,
			onCloseChat: chat => {
				if (chat === sideChat) {
					void firstClosing.complete();
					return firstClose.p;
				}
				return Promise.resolve();
			},
			sendRequest: async (_session, _chat, options) => { sends.push(options.preserveActiveChat === true); },
		});
		chats.set([sourceChat, sideChat, replacement], undefined);
		const host = disposables.add(service.registerHost(sourceChat.resource));

		const first = orchestration.createAndPresent(session, sourceChat, 'first', 'first question');
		await firstClosing.p;
		const secondPrepared = await orchestration.createAndPresent(session, sourceChat, 'second', 'second question');
		await firstClose.complete();
		const firstPrepared = await first;
		await firstPrepared.send({ query: 'first question' });

		assert.deepStrictEqual({
			presentations: [firstPrepared.presentation, secondPrepared.presentation],
			activeChat: activeChat.get().resource.toString(),
			questions: service.states.get().map(state => state.question),
			calls,
			sends,
		}, {
			presentations: [SideChatPresentation.Superseded, SideChatPresentation.Transient],
			activeChat: sourceChat.resource.toString(),
			questions: ['second question'],
			calls: [
				`close:${sideChat.resource.toString()}:true`,
				`close:${replacement.resource.toString()}:true`,
			],
			sends: [true],
		});
		host.dispose();
	});

	test('a newer failed creation does not restore navigation ownership to an older request', async () => {
		const firstCreation = new DeferredPromise<IChat>();
		const { service, orchestration, calls } = setup({
			createSideChatInSession: (_session, _source, turnId) => turnId === 'first' ? firstCreation.p : Promise.reject(new Error('create failed')),
		});
		disposables.add(service.registerHost(sourceChat.resource));

		const first = orchestration.createAndPresent(session, sourceChat, 'first', 'first question');
		await assert.rejects(orchestration.createAndPresent(session, sourceChat, 'second', 'second question'), /create failed/);
		await firstCreation.complete(sideChat);
		const firstPrepared = await first;

		assert.deepStrictEqual({
			presentation: firstPrepared.presentation,
			states: service.states.get(),
			calls,
		}, {
			presentation: SideChatPresentation.Superseded,
			states: [],
			calls: [`close:${sideChat.resource.toString()}:true`],
		});
	});

	test('cancels a pending full-chat fallback when a newer question is presented transiently', async () => {
		const opening = new DeferredPromise<void>();
		const openChat = new DeferredPromise<void>();
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		const sends: boolean[] = [];
		const { service, orchestration, chats, configurationService, calls, activeChat } = setup({
			enabled: false,
			createSideChatInSession: async (_session, _source, turnId) => turnId === 'first' ? sideChat : replacement,
			onOpenChat: async () => {
				await opening.complete();
				await openChat.p;
			},
			sendRequest: async (_session, _chat, options) => { sends.push(options.preserveActiveChat === true); },
		});
		chats.set([sourceChat, sideChat, replacement], undefined);
		disposables.add(service.registerHost(sourceChat.resource));

		const first = orchestration.createAndPresent(session, sourceChat, 'first', 'first question');
		await opening.p;
		await configurationService.setUserConfiguration(AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING, true);
		const secondPrepared = await orchestration.createAndPresent(session, sourceChat, 'second', 'second question');
		await openChat.complete();
		const firstPrepared = await first;
		await firstPrepared.send({ query: 'first question' });

		assert.deepStrictEqual({
			presentations: [firstPrepared.presentation, secondPrepared.presentation],
			activeChat: activeChat.get().resource.toString(),
			questions: service.states.get().map(state => state.question),
			calls,
			sends,
		}, {
			presentations: [SideChatPresentation.Superseded, SideChatPresentation.Transient],
			activeChat: sourceChat.resource.toString(),
			questions: ['second question'],
			calls: [
				`open:${sideChat.resource.toString()}`,
				`close:${replacement.resource.toString()}:true`,
				`close:${sideChat.resource.toString()}:true`,
			],
			sends: [true],
		});
	});

	test('presentation ownership is independent for different source chats', async () => {
		const otherSource = { ...sourceChat, resource: URI.parse('test:///chat/other-source') };
		const otherSideChat = upcastPartial<IChat>({ resource: URI.parse('test:///chat/other-side') });
		const firstCreation = new DeferredPromise<IChat>();
		const { service, orchestration, chats } = setup({
			createSideChatInSession: (_session, _source, turnId) => turnId === 'first' ? firstCreation.p : Promise.resolve(otherSideChat),
		});
		chats.set([sourceChat, sideChat, otherSource, otherSideChat], undefined);
		disposables.add(service.registerHost(sourceChat.resource));
		disposables.add(service.registerHost(otherSource.resource));

		const first = orchestration.createAndPresent(session, sourceChat, 'first', 'first question');
		const secondPrepared = await orchestration.createAndPresent(session, otherSource, 'second', 'second question');
		await firstCreation.complete(sideChat);
		const firstPrepared = await first;

		assert.deepStrictEqual({
			presentations: [firstPrepared.presentation, secondPrepared.presentation],
			questions: service.states.get().map(state => state.question),
		}, {
			presentations: [SideChatPresentation.Transient, SideChatPresentation.Transient],
			questions: ['second question', 'first question'],
		});
	});

	test('falls back to full-chat presentation when the experiment-driven setting is disabled', async () => {
		const { service, calls } = setup({ enabled: false });
		disposables.add(service.registerHost(sourceChat.resource));

		assert.deepStrictEqual({
			shown: await show(service, session, sourceChat, sideChat, 'question'),
			states: service.states.get(),
			calls,
		}, {
			shown: TransientSideChatPresentationResult.Unavailable,
			states: [],
			calls: [],
		});
	});

	test('removes a live card when the experiment-driven setting is disabled', async () => {
		const { service, configurationService } = setup();
		disposables.add(service.registerHost(sourceChat.resource));
		await show(service, session, sourceChat, sideChat, 'question');

		await configurationService.setUserConfiguration(AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING, false);
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: key => key === AGENT_SESSIONS_TRANSIENT_SIDE_CHAT_SETTING,
		}));

		assert.deepStrictEqual(service.states.get(), []);
	});

	test('shows and promotes through the normal chat path', async () => {
		const { service, calls, focusedChats } = setup();
		disposables.add(service.registerHost(sourceChat.resource));

		const shown = await show(service, session, sourceChat, sideChat, 'question');
		const transient = service.states.get()[0];
		await service.promote(sourceChat.resource);

		assert.deepStrictEqual({
			shown,
			transient: { question: transient?.question, promoting: transient?.promoting },
			states: service.states.get(),
			calls,
			focusedChats,
		}, {
			shown: TransientSideChatPresentationResult.Shown,
			transient: { question: 'question', promoting: false },
			states: [],
			calls: [
				`close:${sideChat.resource.toString()}:true`,
				`open:${sideChat.resource.toString()}`,
			],
			focusedChats: [sideChat.resource.toString()],
		});
	});

	test('clears transient state when the side chat opens through another surface', async () => {
		const { service } = setup();
		disposables.add(service.registerHost(sourceChat.resource));
		await show(service, session, sourceChat, sideChat, 'question');

		service.removeBySideChat(sideChat.resource);

		assert.deepStrictEqual(service.states.get(), []);
	});

	test('clears transient state when either referenced chat is deleted', async () => {
		const { service, didDeleteChat } = setup();
		disposables.add(service.registerHost(sourceChat.resource));

		await show(service, session, sourceChat, sideChat, 'question');
		didDeleteChat.fire({ session, chatResource: sideChat.resource });
		const afterSideChatDelete = service.states.get();

		await show(service, session, sourceChat, sideChat, 'question');
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
		await show(service, session, sourceChat, sideChat, 'question');

		chats.set([sourceChat], undefined);

		assert.deepStrictEqual(service.states.get(), []);
	});

	test('remaps transient state when its session facade is replaced', async () => {
		const { service, didReplaceSession, chats, setCurrentSession } = setup();
		disposables.add(service.registerHost(sourceChat.resource));
		await show(service, session, sourceChat, sideChat, 'question');
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
		await show(service, session, sourceChat, sideChat, 'question');

		await assert.rejects(service.promote(sourceChat.resource), /did not open/);

		assert.deepStrictEqual(service.states.get().map(state => ({
			sideChat: state.sideChatResource.toString(),
			promoting: state.promoting,
		})), [{
			sideChat: sideChat.resource.toString(),
			promoting: false,
		}]);
	});

	test('a newer question cancels promotion before it can replace the source host', async () => {
		const openChat = new DeferredPromise<void>();
		const { service, chats, activeChat, focusedChats } = setup({
			onOpenChat: () => openChat.p,
			onDidOpenChat: () => sourceHost.dispose(),
		});
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		const sourceHost: IDisposable = disposables.add(service.registerHost(sourceChat.resource));
		await show(service, session, sourceChat, sideChat, 'first');

		const promotion = service.promote(sourceChat.resource);
		chats.set([sourceChat, sideChat, replacement], undefined);
		await show(service, session, sourceChat, replacement, 'second');
		openChat.complete();
		const promoted = await promotion;

		assert.deepStrictEqual({
			promoted,
			activeChat: activeChat.get().resource.toString(),
			focusedChats,
			states: service.states.get().map(state => ({
				sideChat: state.sideChatResource.toString(),
				question: state.question,
				promoting: state.promoting,
			})),
		}, {
			promoted: false,
			activeChat: sourceChat.resource.toString(),
			focusedChats: [],
			states: [{
				sideChat: replacement.resource.toString(),
				question: 'second',
				promoting: false,
			}],
		});
	});

	test('successful promotion does not supersede a newer creation still in flight', async () => {
		const openChat = new DeferredPromise<void>();
		const creation = new DeferredPromise<IChat>();
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		const { service, orchestration, chats } = setup({
			onOpenChat: () => openChat.p,
			createSideChatInSession: () => creation.p,
		});
		chats.set([sourceChat, sideChat, replacement], undefined);
		disposables.add(service.registerHost(sourceChat.resource));
		await show(service, session, sourceChat, sideChat, 'first question');

		const promotion = service.promote(sourceChat.resource);
		const creating = orchestration.createAndPresent(session, sourceChat, 'second', 'second question');
		await openChat.complete();
		await promotion;
		await creation.complete(replacement);
		const prepared = await creating;

		assert.deepStrictEqual({
			presentation: prepared.presentation,
			questions: service.states.get().map(state => state.question),
		}, {
			presentation: SideChatPresentation.Transient,
			questions: ['second question'],
		});
	});

	test('propagates a send failure while the card is being promoted', async () => {
		const openChat = new DeferredPromise<void>();
		const sendRequest = new DeferredPromise<void>();
		const { service, sessionsService, managementService } = setup({
			onOpenChat: () => openChat.p,
			sendRequest: () => sendRequest.p,
		});
		disposables.add(service.registerHost(sourceChat.resource));
		const orchestration = new SideChatOrchestrationService(managementService, sessionsService, upcastPartial<ISessionsPartService>({}), service);
		const prepared = await orchestration.createAndPresent(session, sourceChat, 'turn', 'question');
		const send = prepared.send({ query: 'question' });
		const rejected = assert.rejects(send, /send failed/);
		const promotion = service.promote(sourceChat.resource);

		sendRequest.error(new Error('send failed'));
		await rejected;
		openChat.complete();
		await promotion;

		assert.deepStrictEqual(service.states.get(), []);
	});

	test('retains failure details when an in-flight promotion also fails', async () => {
		const openChat = new DeferredPromise<void>();
		const { service } = setup({ onOpenChat: () => openChat.p });
		disposables.add(service.registerHost(sourceChat.resource));
		await show(service, session, sourceChat, sideChat, 'question');
		const promotion = service.promote(sourceChat.resource);

		const failurePresented = service.markFailed(sideChat.resource);
		openChat.error(new Error('open failed'));
		await assert.rejects(promotion, /open failed/);

		assert.deepStrictEqual({
			failurePresented,
			states: service.states.get().map(state => ({ failed: state.failed, promoting: state.promoting })),
		}, {
			failurePresented: false,
			states: [{ failed: true, promoting: false }],
		});
	});

	test('failed promotion does not restore stale state over a newer question', async () => {
		const openChat = new DeferredPromise<void>();
		const { service, chats } = setup({ onOpenChat: () => openChat.p });
		const replacement = upcastPartial<IChat>({ resource: URI.parse('test:///chat/replacement') });
		disposables.add(service.registerHost(sourceChat.resource));
		await show(service, session, sourceChat, sideChat, 'first');

		const promotion = service.promote(sourceChat.resource);
		chats.set([sourceChat, sideChat, replacement], undefined);
		await show(service, session, sourceChat, replacement, 'second');
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
		await show(service, session, sourceChat, sideChat, 'question');

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

		await show(service, session, sourceChat, sideChat, 'first');
		const first = service.states.get()[0];
		chats.set([sourceChat, sideChat, replacement], undefined);
		await show(service, session, sourceChat, replacement, 'second');
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
