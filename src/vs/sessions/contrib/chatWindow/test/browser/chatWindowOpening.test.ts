/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, IReader, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatModelHold, closeChatWindowsOfGoneChats, followReplacedWindowSessions, IChatWindowChatSession, IGoneChatWindow, IReplaceableChatWindow, isChatWindowChatGone } from '../../browser/chatWindowOpening.js';

suite('Chat window opening (sessions)', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
		disposables.add(closeChatWindowsOfGoneChats(windows));

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
			const window: IReplaceableChatWindow = {
				session: windowSession,
				setSession: value => {
					shown.push(value.resource.path);
					windowSession.set(value, undefined);
				},
				close: () => shown.push(`closed ${initial.resource.path}`),
			};
			return window;
		};
		const windows = observableValue<readonly IReplaceableChatWindow[]>('windows', [createWindow(replaced), createWindow(closing)]);
		disposables.add(followReplacedWindowSessions(windows, windowSessions));

		const replacement = session('replacement', 'one');
		windowSessions.set([replacement], undefined);

		const [first] = windows.get();
		assert.deepStrictEqual({ shown, session: first.session.get()?.resource.path, chat: first.session.get()?.scopedChatResource?.path }, {
			shown: ['/replacement', 'closed /closing'],
			session: '/replacement',
			chat: '/chat/one',
		});
	});
});
