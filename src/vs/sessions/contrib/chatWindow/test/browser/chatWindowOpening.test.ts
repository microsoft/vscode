/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InFlightOperations, holdLoadedChat, openCleaningUpOnFailure } from '../../browser/chatWindowOpening.js';

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

	test('a chat moving between views keeps its loaded model, so the next view does not load it again', () => {
		let refs = 0;
		let loads = 0;
		const model = { loaded: true };
		/** A model store: released with its last reference, loaded again by whoever asks next. */
		const acquire = () => { refs++; return toDisposable(() => { if (--refs === 0) { model.loaded = false; } }); };
		const view = () => { const ref = acquire(); return ref; };
		const bind = () => { if (!model.loaded) { loads++; model.loaded = true; } return acquire(); };

		const mainView = view();
		const held = holdLoadedChat(() => model.loaded ? acquire() : undefined);
		mainView.dispose();
		const windowView = bind();
		held.dispose();
		windowView.dispose();

		assert.deepStrictEqual({ loads, refs, loaded: model.loaded }, { loads: 0, refs: 0, loaded: false });
	});

	test('holding a chat that is not loaded holds nothing', () => {
		holdLoadedChat(() => undefined).dispose();
	});
});
