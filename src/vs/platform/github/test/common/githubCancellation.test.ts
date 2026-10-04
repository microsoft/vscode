/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toGitHubAbortSignal } from '../../common/githubCancellation.js';

suite('GitHub cancellation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves an AbortSignal and its abort reason without taking ownership', () => {
		const lifetime = store.add(new DisposableStore());
		const controller = new AbortController();
		const signal = toGitHubAbortSignal(controller.signal, lifetime);
		lifetime.dispose();
		const abortedByDisposal = signal.aborted;
		const reason = { cancelled: true };
		controller.abort(reason);
		assert.deepStrictEqual({
			sameSignal: signal === controller.signal, abortedByDisposal, reason: signal.reason,
		}, { sameSignal: true, abortedByDisposal: false, reason });
	});

	test('preserves an already aborted signal', () => {
		const lifetime = store.add(new DisposableStore());
		const controller = new AbortController();
		const reason = new Error('Caller cancelled');
		controller.abort(reason);
		const signal = toGitHubAbortSignal(controller.signal, lifetime);
		assert.strictEqual(signal, controller.signal);
		assert.throws(() => signal.throwIfAborted(), error => error === reason);
	});

	test('converts token cancellation to a CancellationError', () => {
		const lifetime = store.add(new DisposableStore());
		const token = store.add(new CancellationTokenSource());
		const signal = toGitHubAbortSignal(token.token, lifetime);
		const initiallyAborted = signal.aborted;
		token.cancel();
		assert.deepStrictEqual({
			initiallyAborted, aborted: signal.aborted, cancellationError: signal.reason instanceof CancellationError,
		}, { initiallyAborted: false, aborted: true, cancellationError: true });
	});

	test('an already cancelled token does not register a listener', () => {
		const lifetime = store.add(new DisposableStore());
		const signal = toGitHubAbortSignal({
			isCancellationRequested: true,
			onCancellationRequested: () => assert.fail('No listener expected for a cancelled token'),
		}, lifetime);
		assert.throws(() => signal.throwIfAborted(), CancellationError);
	});

	test('accepts CancellationToken.None', () => {
		const lifetime = store.add(new DisposableStore());
		const signal = toGitHubAbortSignal(CancellationToken.None, lifetime);
		assert.strictEqual(signal.aborted, false);
	});

	test('detaches the token listener when the operation lifetime ends', () => {
		const lifetime = store.add(new DisposableStore());
		const cancelled = store.add(new Emitter<void>());
		const signal = toGitHubAbortSignal({ isCancellationRequested: false, onCancellationRequested: cancelled.event }, lifetime);
		const listening = cancelled.hasListeners();
		lifetime.dispose();
		cancelled.fire();
		assert.deepStrictEqual({
			listening, listeningAfterDisposal: cancelled.hasListeners(), aborted: signal.aborted,
		}, { listening: true, listeningAfterDisposal: false, aborted: false });
	});
});
