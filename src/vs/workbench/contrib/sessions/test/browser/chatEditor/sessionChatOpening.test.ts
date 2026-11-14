/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, IReader, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatModelHold, IChatWindowChatSession, isChatWindowChatGone } from '../../../browser/chatEditor/sessionChatOpening.js';

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

		test('is released at its timeout also while the view is polled less often, as in a window in the background', async () => {
			const { counter, acquire } = setup();
			const hold = disposables.add(new ChatModelHold(acquire, 20, 10_000));
			hold.hold(resource, () => false);
			await timeout(60);

			assert.deepStrictEqual({ refs: counter.refs, holding: hold.isHolding }, { refs: 0, holding: false });
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
		const mainChat = { resource: URI.parse('test:/main'), isArchived: observableValue('mainArchived', false) };
		const session = { chats, loading, mainChat: observableValue('mainChat', mainChat) } as unknown as IChatWindowChatSession;
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

	test('the main chat a session does not list yet is archived while the session loads, and is otherwise kept', () => {
		const mainChat = { resource: URI.parse('test:/main'), isArchived: observableValue('archived', false) };
		const loading = observableValue('loading', true);
		const session = { chats: observableValue('chats', []), loading, mainChat: observableValue('mainChat', mainChat) } as unknown as IChatWindowChatSession;
		const reader = { readObservable: (o: IObservable<unknown>) => o.get() } as unknown as IReader;
		const states = [isChatWindowChatGone(session, mainChat.resource, reader)];
		mainChat.isArchived.set(true, undefined);
		states.push(isChatWindowChatGone(session, mainChat.resource, reader));
		states.push(isChatWindowChatGone(session, URI.parse('test:/other'), reader));

		assert.deepStrictEqual(states, [false, true, false]);
	});
});
