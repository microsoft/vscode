/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InFlightOperations, openCleaningUpOnFailure } from '../../browser/chatWindowOpening.js';

suite('Chat window opening', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('opening the same chat while it opens gives the same window, and opens it again once done', async () => {
		const inFlight = new InFlightOperations<number>();
		const pending = new DeferredPromise<number>();
		let started = 0;
		const open = () => { started++; return pending.p; };

		const first = inFlight.run('chat', open);
		const second = inFlight.run('chat', open);
		const other = inFlight.run('other', async () => 0);
		pending.complete(1);
		await Promise.all([first, second, other]);
		await inFlight.run('chat', open);

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

		await assert.rejects(inFlight.run('chat', () => Promise.reject(new Error('failed'))));

		assert.strictEqual(await inFlight.run('chat', async () => 2), 2);
	});

	test('a failed opening disposes what it set up and closes its window', async () => {
		const events: string[] = [];

		await assert.rejects(openCleaningUpOnFailure(async opening => {
			opening.disposables.add(toDisposable(() => events.push('disposed')));
			opening.close = () => { events.push('closed'); return true; };
			throw new Error('failed');
		}), /failed/);

		assert.deepStrictEqual(events, ['disposed', 'closed']);
	});

	test('a failure before the window exists only disposes, and success keeps everything', async () => {
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
});
