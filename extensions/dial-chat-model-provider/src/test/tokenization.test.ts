import * as assert from 'assert';
import {
	buildTokenizeBody,
	isRetryableTokenizeError,
	isTokenizeUnavailableError,
	parseTokenizeResponses,
} from '../tokenization';
import { normalizeDeployment } from '../deploymentMetadata';
import { type JsonValue } from '../runtimeGuards';

suite('tokenization — buildTokenizeBody', () => {
	test('wraps a single text as one string input', () => {
		assert.deepStrictEqual(buildTokenizeBody(['hello']), {
			inputs: [{ type: 'string', value: 'hello' }],
		});
	});

	test('wraps multiple texts as a batch of string inputs', () => {
		assert.deepStrictEqual(buildTokenizeBody(['a', 'b']), {
			inputs: [
				{ type: 'string', value: 'a' },
				{ type: 'string', value: 'b' },
			],
		});
	});
});

suite('tokenization — parseTokenizeResponses', () => {
	test('reads token_count from success outputs positionally', () => {
		const body = {
			outputs: [
				{ status: 'success', token_count: 1 },
				{ status: 'success', token_count: 14 },
			],
		} as unknown as JsonValue;
		assert.deepStrictEqual(parseTokenizeResponses(body, 2), [
			{ tokenCount: 1 },
			{ tokenCount: 14 },
		]);
	});

	test('reads error message from an error output', () => {
		const body = { outputs: [{ status: 'error', error: 'boom' }] } as unknown as JsonValue;
		assert.deepStrictEqual(parseTokenizeResponses(body, 1), [{ error: 'boom' }]);
	});

	test('pads missing/malformed outputs with empty results', () => {
		assert.deepStrictEqual(parseTokenizeResponses(null as unknown as JsonValue, 2), [{}, {}]);
		assert.deepStrictEqual(parseTokenizeResponses({} as unknown as JsonValue, 1), [{}]);
		assert.deepStrictEqual(
			parseTokenizeResponses(
				{ outputs: [{ status: 'success', token_count: 5 }] } as unknown as JsonValue,
				2,
			),
			[{ tokenCount: 5 }, {}],
		);
		assert.deepStrictEqual(
			parseTokenizeResponses({ outputs: [{ status: 'success' }] } as unknown as JsonValue, 1),
			[{}],
		);
	});

	test('zero is a valid token count', () => {
		const body = { outputs: [{ status: 'success', token_count: 0 }] } as unknown as JsonValue;
		assert.deepStrictEqual(parseTokenizeResponses(body, 1), [{ tokenCount: 0 }]);
	});
});

suite('tokenization — isTokenizeUnavailableError', () => {
	test('detects missing route / 404', () => {
		assert.ok(isTokenizeUnavailableError('POST /v1/... failed (HTTP 404): Route is not found'));
		assert.ok(isTokenizeUnavailableError('HTTP 404'));
	});

	test('detects unsupported tokenize feature', () => {
		assert.ok(isTokenizeUnavailableError('tokenize is not supported by this deployment'));
	});

	test('treats transient errors as available (retry later)', () => {
		assert.ok(!isTokenizeUnavailableError('socket hang up'));
		assert.ok(!isTokenizeUnavailableError('HTTP 502 bad gateway'));
	});
});

suite('tokenization — isRetryableTokenizeError', () => {
	test('does not retry permanent unavailability', () => {
		assert.ok(!isRetryableTokenizeError('HTTP 404'));
	});

	test('retries transient upstream failures', () => {
		assert.ok(isRetryableTokenizeError('POST failed (HTTP 503): overloaded'));
		assert.ok(
			isRetryableTokenizeError(
				'POST failed (HTTP unknown): (empty response body)',
			),
		);
	});

	test('retries missing token_count in an otherwise successful HTTP response', () => {
		assert.ok(isRetryableTokenizeError('Tokenize response missing token_count'));
	});
});

function dep(extras: Record<string, unknown> = {}) {
	return normalizeDeployment({ id: 'm', name: 'm', ...extras } as unknown as JsonValue);
}

suite('deploymentMetadata — maxInputTokens derivation', () => {
	// Safety margin = clamp(ceil(window * 0.01), 64, 2048). For a 65535 window → 656.
	const MARGIN_65535 = 656;

	test('reserves output budget and a safety margin out of maxTotalTokens', () => {
		const d = dep({ limits: { maxTotalTokens: 65535, maxCompletionTokens: 8000 } });
		assert.strictEqual(d.maxInputTokens, 65535 - 8000 - MARGIN_65535);
		assert.strictEqual(d.maxOutputTokens, 8000);
	});

	test('reads snake_case limits from the deployment listing', () => {
		const d = dep({ limits: { max_total_tokens: 65535, max_completion_tokens: 8000 } });
		assert.strictEqual(d.maxInputTokens, 65535 - 8000 - MARGIN_65535);
		assert.strictEqual(d.maxOutputTokens, 8000);
	});

	test('prefers explicit maxPromptTokens when present (authoritative, no margin)', () => {
		const d = dep({ limits: { maxPromptTokens: 50000, maxTotalTokens: 65535 } });
		assert.strictEqual(d.maxInputTokens, 50000);
	});

	test('falls back to total minus margin when no output budget is known', () => {
		const d = dep({ limits: { maxTotalTokens: 65535 } });
		assert.strictEqual(d.maxInputTokens, 65535 - MARGIN_65535);
	});

	test('no limits leaves maxInputTokens undefined', () => {
		const d = dep();
		assert.strictEqual(d.maxInputTokens, undefined);
	});
});
