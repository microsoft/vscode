import * as assert from 'assert';
import axios from 'axios';
import { abortError, isAbortError, throwIfAborted } from '../cancel';
import { sleepMs } from '../retry';

suite('cancel — abortError / isAbortError', () => {
	test('abortError sets AbortError name', () => {
		const err = abortError();
		assert.strictEqual(err.name, 'AbortError');
		assert.strictEqual(isAbortError(err), true);
	});

	test('isAbortError recognizes axios cancellation', () => {
		const err = new axios.Cancel('cancelled');
		assert.strictEqual(isAbortError(err), true);
	});

	test('throwIfAborted throws when signal is already aborted', () => {
		const controller = new AbortController();
		controller.abort();
		assert.throws(() => throwIfAborted(controller.signal), (e: unknown) => isAbortError(e));
	});
});

suite('cancel — sleepMs abort', () => {
	test('sleepMs rejects when signal aborts during wait', async () => {
		const controller = new AbortController();
		const pending = sleepMs(60_000, controller.signal);
		controller.abort();
		await assert.rejects(pending, (e: unknown) => isAbortError(e));
	});
});
