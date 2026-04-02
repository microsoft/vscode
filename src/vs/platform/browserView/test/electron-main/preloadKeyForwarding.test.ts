/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

/**
 * Simulates the key-forwarding logic from preload-browserView.ts.
 *
 * This helper mirrors the exact logic used in the preload script so we can test
 * it in isolation without requiring an Electron context.  The only behavioural
 * difference from the preload is that `ipcRenderer.send` is replaced by the
 * caller-supplied `forward` callback.
 */
function attachKeyForwardingListener(
	eventTarget: EventTarget,
	forward: (snapshot: Record<string, unknown>) => void
): void {
	eventTarget.addEventListener('keydown', (e: Event) => {
		const event = e as KeyboardEvent;

		// filter to events that either have modifiers or do not have a character representation.
		if (!(event.ctrlKey || event.altKey || event.metaKey) && event.key.length === 1) {
			return;
		}

		// Capture snapshot of relevant event properties now, before the event object
		// may be mutated or recycled.
		const keyEventSnapshot: Record<string, unknown> = {
			key: event.key,
			keyCode: event.keyCode,
			code: event.code,
			ctrlKey: event.ctrlKey,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			metaKey: event.metaKey,
			repeat: event.repeat
		};

		// Defer the check for `defaultPrevented` until after all synchronous event handlers
		// (including those in the page's main world) have had a chance to run.
		queueMicrotask(() => {
			if (event.defaultPrevented) {
				return;
			}
			forward(keyEventSnapshot);
		});
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite('preload-browserView key forwarding', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Regression test for https://github.com/microsoft/vscode/issues/306414
	 *
	 * Before the fix, the `defaultPrevented` check happened synchronously inside
	 * the isolated-world keydown listener.  Because isolated-world listeners can
	 * fire before main-world listeners for the same DOM event, `defaultPrevented`
	 * appeared false even when a page handler (e.g. vscode.dev's Command+Shift+P
	 * handler) had already – or was about to – call `preventDefault()`.
	 *
	 * After the fix, the check is deferred with `queueMicrotask`, which runs after
	 * all synchronous event handlers in all worlds have completed, so the correct
	 * `defaultPrevented` value is observed.
	 */
	test('does not forward a keydown event when the page calls preventDefault()', async () => {
		const target = new EventTarget();
		const forwarded: Record<string, unknown>[] = [];

		attachKeyForwardingListener(target, snapshot => forwarded.push(snapshot));

		// Simulate the page (main-world) handler that calls preventDefault(),
		// exactly as vscode.dev does for Command+Shift+P / F1.
		target.addEventListener('keydown', (e) => {
			e.preventDefault();
		});

		// Dispatch a Command+Shift+P equivalent event.
		const event = new KeyboardEvent('keydown', {
			key: 'P',
			code: 'KeyP',
			metaKey: true,
			shiftKey: true,
			bubbles: true,
			cancelable: true
		});
		target.dispatchEvent(event);

		// Let microtasks (including the queueMicrotask inside the listener) run.
		await Promise.resolve();

		assert.strictEqual(
			forwarded.length,
			0,
			'key event should NOT be forwarded when the page calls preventDefault()'
		);
	});

	test('does not forward a keydown event for F1 when the page calls preventDefault()', async () => {
		const target = new EventTarget();
		const forwarded: Record<string, unknown>[] = [];

		attachKeyForwardingListener(target, snapshot => forwarded.push(snapshot));

		// Simulate a page handler for F1 that calls preventDefault().
		target.addEventListener('keydown', (e) => {
			if ((e as KeyboardEvent).key === 'F1') {
				e.preventDefault();
			}
		});

		const event = new KeyboardEvent('keydown', {
			key: 'F1',
			code: 'F1',
			metaKey: false,
			shiftKey: false,
			bubbles: true,
			cancelable: true
		});
		target.dispatchEvent(event);

		await Promise.resolve();

		assert.strictEqual(
			forwarded.length,
			0,
			'F1 key event should NOT be forwarded when the page calls preventDefault()'
		);
	});

	test('forwards a keydown event when the page does not call preventDefault()', async () => {
		const target = new EventTarget();
		const forwarded: Record<string, unknown>[] = [];

		attachKeyForwardingListener(target, snapshot => forwarded.push(snapshot));

		// No page handler calls preventDefault().

		const event = new KeyboardEvent('keydown', {
			key: 'P',
			code: 'KeyP',
			metaKey: true,
			shiftKey: true,
			bubbles: true,
			cancelable: true
		});
		target.dispatchEvent(event);

		await Promise.resolve();

		assert.strictEqual(
			forwarded.length,
			1,
			'key event SHOULD be forwarded when the page does not call preventDefault()'
		);
		assert.strictEqual(forwarded[0]['key'], 'P');
		assert.strictEqual(forwarded[0]['metaKey'], true);
		assert.strictEqual(forwarded[0]['shiftKey'], true);
	});

	test('does not forward plain character key events without modifiers', async () => {
		const target = new EventTarget();
		const forwarded: Record<string, unknown>[] = [];

		attachKeyForwardingListener(target, snapshot => forwarded.push(snapshot));

		const event = new KeyboardEvent('keydown', {
			key: 'a',
			code: 'KeyA',
			metaKey: false,
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
			bubbles: true,
			cancelable: true
		});
		target.dispatchEvent(event);

		await Promise.resolve();

		assert.strictEqual(
			forwarded.length,
			0,
			'plain character key events without modifiers should not be forwarded'
		);
	});
});
