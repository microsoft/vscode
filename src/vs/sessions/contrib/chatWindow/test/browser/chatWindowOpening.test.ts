/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { IObservable, observableValue, IReader } from '../../../../../base/common/observable.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatWindowContext, IChatWindowContent, NotInChatWindowContext } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { InFlightOperations, ChatModelHold, IChatWindowChatSession, closeChatWindowsOfGoneChats, followReplacedWindowSessions, IGoneChatWindow, IReplaceableChatWindow, isChatWindowChatGone, openCleaningUpOnFailure } from '../../browser/chatWindowOpening.js';

suite('Chat window opening', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opening the same session while it opens gives the same window, and opens it again once done', async () => {
		const inFlight = new InFlightOperations<number>();
		const pending = new DeferredPromise<number>();
		let started = 0;
		const open = () => { started++; return pending.p; };

		const first = inFlight.run('session', open);
		const second = inFlight.run('session', open);
		const other = inFlight.run('other', async () => 0);
		pending.complete(1);
		await Promise.all([first, second, other]);
		await inFlight.run('session', open);

		assert.deepStrictEqual({ same: first === second, started }, { same: true, started: 2 });
	});

	test('two chats of one session open at once, each in a window of its own', async () => {
		const inFlight = new InFlightOperations<number>();
		const pending = new DeferredPromise<number>();
		let started = 0;
		const open = () => { started++; return pending.p; };

		const main = inFlight.run(URI.parse('chat:/session/main').toString(), open);
		const peer = inFlight.run(URI.parse('chat:/session/peer').toString(), open);
		const peerAgain = inFlight.run(URI.parse('chat:/session/peer').toString(), open);
		pending.complete(1);
		await Promise.all([main, peer, peerAgain]);

		assert.deepStrictEqual({ started, peerShared: peer === peerAgain, distinct: main !== peer }, { started: 2, peerShared: true, distinct: true });
	});

	test('a failed opening is not remembered', async () => {
		const inFlight = new InFlightOperations<number>();

		await assert.rejects(inFlight.run('session', () => Promise.reject(new Error('failed'))));

		assert.strictEqual(await inFlight.run('session', async () => 2), 2);
	});

	test('a failed opening disposes what it set up and closes its part', async () => {
		const events: string[] = [];

		await assert.rejects(openCleaningUpOnFailure(async opening => {
			opening.disposables.add(toDisposable(() => events.push('disposed')));
			opening.close = () => { events.push('closed'); return true; };
			throw new Error('failed');
		}), /failed/);

		assert.deepStrictEqual(events, ['disposed', 'closed']);
	});

	test('a failure before the part exists only disposes, and success keeps everything', async () => {
		const events: string[] = [];
		await assert.rejects(openCleaningUpOnFailure(async opening => {
			opening.disposables.add(toDisposable(() => events.push('disposed')));
			throw new Error('failed');
		}));
		const result = await openCleaningUpOnFailure(async opening => {
			opening.disposables.add(toDisposable(() => events.push('wrongly disposed')));
			disposables.add(opening.disposables);
			return 'opened';
		});

		assert.deepStrictEqual({ events, result }, { events: ['disposed'], result: 'opened' });
	});

	suite('Chat model hold', () => {

		const resource = URI.parse('chat:/a');

		function setup() {
			const counter = { refs: 0, acquired: 0 };
			const acquire = () => { counter.refs++; counter.acquired++; return toDisposable(() => counter.refs--); };
			return { counter, acquire };
		}

		test('is held until the view has bound, then released', async () => {
			const { counter, acquire } = setup();
			const hold = disposables.add(new ChatModelHold(acquire, 10_000, 5));
			let bound = false;
			hold.hold(resource, () => bound);
			const held = counter.refs;
			bound = true;
			await timeout(30);

			assert.deepStrictEqual({ held, after: counter.refs, holding: hold.isHolding }, { held: 1, after: 0, holding: false });
		});

		test('is released after the timeout when the view never reports binding', async () => {
			const { counter, acquire } = setup();
			const hold = disposables.add(new ChatModelHold(acquire, 20, 5));
			hold.hold(resource, () => false);
			await timeout(60);

			assert.strictEqual(counter.refs, 0);
		});

		test('a hold for another chat replaces the previous one, and none is taken without a chat or a loaded model', () => {
			const { counter, acquire } = setup();
			const hold = disposables.add(new ChatModelHold(acquire, 10_000, 5));
			hold.hold(resource, () => false);
			hold.hold(URI.parse('chat:/b'), () => false);
			const replaced = counter.refs;
			hold.hold(undefined, () => false);
			const none = counter.refs;
			const unloaded = disposables.add(new ChatModelHold(() => undefined));
			unloaded.hold(resource, () => false);

			assert.deepStrictEqual({ replaced, none, unloaded: unloaded.isHolding }, { replaced: 1, none: 0, unloaded: false });
		});

		test('disposing the hold, as closing the window or a failed opening does, releases it', () => {
			const { counter, acquire } = setup();
			const hold = new ChatModelHold(acquire, 10_000, 5);
			hold.hold(resource, () => false);
			hold.dispose();

			assert.strictEqual(counter.refs, 0);
		});
	});

	test('a chat window closes with its chat once the session listed its chats, or when the chat is archived', () => {
		const chat = { resource: URI.parse('test:/chat'), isArchived: observableValue('archived', false) };
		const chats = observableValue('chats', [chat]);
		const loading = observableValue('loading', false);
		const session = { chats, loading } as unknown as IChatWindowChatSession;
		const gone = () => isChatWindowChatGone(session, chat.resource, { readObservable: (o: IObservable<unknown>) => o.get() } as unknown as IReader);

		const states = [gone()];
		chat.isArchived.set(true, undefined);
		states.push(gone());
		chat.isArchived.set(false, undefined);
		chats.set([], undefined);
		loading.set(true, undefined);
		states.push(gone());
		loading.set(false, undefined);
		states.push(gone());

		assert.deepStrictEqual(states, [false, true, false, true]);
	});

	test('a window opened after the tracking started closes when its chat is deleted or archived', () => {
		const windows = observableValue<readonly IGoneChatWindow[]>('windows', []);
		const closed: string[] = [];
		const createWindow = (name: string) => {
			const chat = { resource: URI.parse(`test:/session/${name}`), isArchived: observableValue('archived', false) };
			const chats = observableValue('chats', [chat]);
			const session = { chats, loading: observableValue('loading', false), scopedChatResource: chat.resource };
			const window: IGoneChatWindow = { session: observableValue('session', session as unknown as IChatWindowChatSession & { scopedChatResource: URI }), close: () => { closed.push(name); windows.set(windows.get().filter(candidate => candidate !== window), undefined); } };
			return { window, chat, chats };
		};
		disposables.add(closeChatWindowsOfGoneChats(windows, () => false));

		const deleted = createWindow('deleted');
		const archived = createWindow('archived');
		const kept = createWindow('kept');
		windows.set([deleted.window, archived.window, kept.window], undefined);
		deleted.chats.set([], undefined);
		archived.chat.isArchived.set(true, undefined);

		assert.deepStrictEqual({ closed, remaining: windows.get().length }, { closed: ['deleted', 'archived'], remaining: 1 });
	});

	test('a window whose session its provider replaces shows the replacement and knows it by its resource; it closes when its session no longer shows', () => {
		const session = (name: string, chat: string) => ({ resource: URI.parse(`test:/${name}`), scopedChatResource: URI.parse(`test:/chat/${chat}`) }) as IActiveSession;
		const replaced = session('replaced', 'one');
		const closing = session('closing', 'two');
		const windowSessions = observableValue<readonly IActiveSession[]>('windowSessions', [replaced, closing]);
		const shown: string[] = [];
		const createWindow = (initial: IActiveSession) => {
			const windowSession = observableValue<IActiveSession | undefined>('session', initial);
			const content = observableValue<IChatWindowContent>('content', { session: initial.resource, chat: initial.scopedChatResource });
			const window: IReplaceableChatWindow = {
				session: windowSession, content,
				sessionView: { openSession: (shownSession: IActiveSession) => shown.push(shownSession.resource.path) },
				setSession: value => windowSession.set(value, undefined),
				setContent: value => content.set(value, undefined),
				close: () => shown.push(`closed ${initial.resource.path}`),
			};
			return window;
		};
		const windows = observableValue<readonly IReplaceableChatWindow[]>('windows', [createWindow(replaced), createWindow(closing)]);
		disposables.add(followReplacedWindowSessions(windows, windowSessions));

		const replacement = session('replacement', 'one');
		windowSessions.set([replacement], undefined);

		const [first] = windows.get();
		assert.deepStrictEqual({ shown, session: first.session.get()?.resource.path, content: first.content.get().session.path, chat: first.content.get().chat?.path }, {
			shown: ['/replacement', 'closed /closing'],
			session: '/replacement',
			content: '/replacement',
			chat: '/chat/one',
		});
	});

	test('starting a chat is gated on being outside a chat window', () => {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const outside = contextKeyService.contextMatchesRules(NotInChatWindowContext);
		ChatWindowContext.bindTo(contextKeyService).set('chatWithEditors');

		assert.deepStrictEqual({ outside, inside: contextKeyService.contextMatchesRules(NotInChatWindowContext) }, { outside: true, inside: false });
	});
});
