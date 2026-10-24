/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { InFlightOperations, ChatModelHold, openCleaningUpOnFailure } from '../../browser/chatWindowOpening.js';

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
});
