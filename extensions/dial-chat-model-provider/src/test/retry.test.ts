import * as assert from 'assert';
import { computeBackoffDelayMs, computeChatTransientRetryDelayMs } from '../retry';

suite('retry — computeBackoffDelayMs', () => {
	test('doubles the base delay per attempt up to maxDelayMs', () => {
		const attempt1 = computeBackoffDelayMs(1, 1_000, 30_000);
		const attempt2 = computeBackoffDelayMs(2, 1_000, 30_000);
		const attempt3 = computeBackoffDelayMs(3, 1_000, 30_000);
		assert.ok(attempt1 >= 750 && attempt1 <= 1_250);
		assert.ok(attempt2 >= 1_500 && attempt2 <= 2_500);
		assert.ok(attempt3 >= 3_000 && attempt3 <= 5_000);
	});

	test('caps delay at maxDelayMs before jitter', () => {
		const delay = computeBackoffDelayMs(10, 1_000, 5_000);
		assert.ok(delay >= 3_750 && delay <= 6_250);
	});
});

suite('retry — computeChatTransientRetryDelayMs', () => {
	const config = { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 30_000 };

	test('uses exponential backoff for ordinary transient errors', () => {
		const delay = computeChatTransientRetryDelayMs(2, config, 'HTTP 503', 500);
		assert.ok(delay >= 1_500 && delay <= 2_500);
	});

	test('scales delay with elapsed time on empty response body', () => {
		const delay = computeChatTransientRetryDelayMs(
			3,
			config,
			'POST failed (HTTP unknown): (empty response body)',
			50_000,
		);
		assert.strictEqual(delay, 16_666);
	});
});
