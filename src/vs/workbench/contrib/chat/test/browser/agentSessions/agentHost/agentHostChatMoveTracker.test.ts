/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../../base/common/async.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AgentHostChatMoveTracker } from '../../../../browser/agentSessions/agentHost/agentHostChatMoveTracker.js';

suite('AgentHostChatMoveTracker', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface ITestSession {
		readonly resource: URI;
	}

	function session(name: string): ITestSession {
		return { resource: URI.parse(`agent-host-copilot:/${name}`) };
	}

	/** The catalog of `session` listing `backends`; each chat's resource in it is `<session>#<backend>`. */
	function catalog(session: ITestSession, ...backends: string[]): ReadonlyMap<string, URI> {
		return new Map(backends.map(backend => [backend, session.resource.with({ fragment: backend })]));
	}

	function setup() {
		const tracker = disposables.add(new AgentHostChatMoveTracker<ITestSession>());
		const moves: string[] = [];
		disposables.add(tracker.onDidMoveChat(({ from, to }) => moves.push(`${from.chat.toString()} -> ${to.chat.toString()}`)));
		const list = (session: ITestSession, ...backends: string[]) => tracker.update(session, catalog(session, ...backends));
		return { tracker, moves, list };
	}

	test('a chat that leaves one session and appears in another moved, whichever catalog arrives first', () => {
		const { moves, list } = setup();
		const a = session('a'), b = session('b');
		list(a, 'main-a', 'x', 'y');
		list(b, 'main-b');

		list(a, 'main-a', 'y');
		list(b, 'main-b', 'x');
		list(b, 'main-b', 'x', 'y');
		list(a, 'main-a');

		assert.deepStrictEqual(moves, [
			'agent-host-copilot:/a#x -> agent-host-copilot:/b#x',
			'agent-host-copilot:/a#y -> agent-host-copilot:/b#y',
		]);
	});

	test('a chat promoted into a new session moved to its main chat; a session that ends while another lists its chat moved it', () => {
		const { tracker, moves, list } = setup();
		const a = session('a'), b = session('b'), n = session('n');
		list(a, 'main-a', 'p');
		list(b, 'main-b');

		list(a, 'main-a');
		tracker.update(n, new Map([['p', n.resource]]));
		list(b, 'main-b', 'main-a');
		tracker.remove(a);

		assert.deepStrictEqual(moves, [
			'agent-host-copilot:/a#p -> agent-host-copilot:/n',
			'agent-host-copilot:/a#main-a -> agent-host-copilot:/b#main-a',
		]);
	});

	test('deleted, new and re-listed chats did not move', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tracker, moves, list } = setup();
		const a = session('a'), b = session('b'), c = session('c');
		list(a, 'main-a', 'deleted');
		list(b, 'main-b');

		list(a, 'main-a');
		list(b, 'main-b', 'new');
		// A session is forgotten and listed again, e.g. by another instance of it.
		tracker.remove(b);
		list(session('b'), 'main-b', 'new');
		await timeout(AgentHostChatMoveTracker.PAIRING_WINDOW_MS + 1);
		// Long after it was deleted, a chat with the same backend is no move.
		list(c, 'main-c', 'deleted');

		assert.deepStrictEqual(moves, []);
	}));

	test('an untracked session keeps no catalog, even one reported only through update', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { tracker, moves, list } = setup();
		const a = session('a'), b = session('b');
		list(a, 'main-a', 'x');
		tracker.untrack(a);
		await timeout(AgentHostChatMoveTracker.PAIRING_WINDOW_MS + 1);

		// Listed again later without `x`: a catalog kept from before would read that as `x` leaving `a` just now.
		list(a, 'main-a');
		list(b, 'main-b', 'x');

		assert.deepStrictEqual(moves, []);
	}));
});
