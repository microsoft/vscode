/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseClaudeModelId, tryParseClaudeModelId } from '../../node/claude/claudeModelId.js';

suite('parseClaudeModelId', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parsing SDK model IDs', () => {
		test('parses claude-{name}-{major}-{minor}-{date}', () => {
			const result = parseClaudeModelId('claude-opus-4-5-20251101');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'opus', version: '4.5', modifiers: '20251101' },
			);
		});

		test('parses claude-{major}-{minor}-{name}-{date} (old format)', () => {
			const result = parseClaudeModelId('claude-3-5-sonnet-20241022');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'sonnet', version: '3.5', modifiers: '20241022' },
			);
		});

		test('parses claude-{name}-{major}-{date}', () => {
			const result = parseClaudeModelId('claude-sonnet-4-20250514');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'sonnet', version: '4', modifiers: '20250514' },
			);
		});

		test('parses claude-{major}-{name}-{date} (old format)', () => {
			const result = parseClaudeModelId('claude-3-opus-20240229');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'opus', version: '3', modifiers: '20240229' },
			);
		});

		test('parses SDK ID without date suffix', () => {
			const result = parseClaudeModelId('claude-opus-4-5');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'opus', version: '4.5', modifiers: '' },
			);
		});
	});

	suite('parsing endpoint model IDs', () => {
		test('parses claude-{name}-{major}.{minor}', () => {
			const result = parseClaudeModelId('claude-opus-4.5');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'opus', version: '4.5', modifiers: '' },
			);
		});

		test('parses claude-{name}-{major}', () => {
			const result = parseClaudeModelId('claude-sonnet-4');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'sonnet', version: '4', modifiers: '' },
			);
		});

		test('parses claude-haiku-3.5', () => {
			const result = parseClaudeModelId('claude-haiku-3.5');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'haiku', version: '3.5', modifiers: '' },
			);
		});
	});

	suite('modifiers (non-date suffixes)', () => {
		test('parses endpoint ID with 1m context variant (dot version)', () => {
			const result = parseClaudeModelId('claude-opus-4.6-1m');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'opus', version: '4.6', modifiers: '1m' },
			);
		});

		test('parses SDK ID with 1m context variant (dash version)', () => {
			const result = parseClaudeModelId('claude-opus-4-6-1m');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'opus', version: '4.6', modifiers: '1m' },
			);
		});

		test('parses SDK ID with both 1m modifier and date suffix', () => {
			const result = parseClaudeModelId('claude-opus-4-6-1m-20251101');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'opus', version: '4.6', modifiers: '1m-20251101' },
			);
		});

		test('parses single-version ID with modifier', () => {
			const result = parseClaudeModelId('claude-sonnet-4-1m');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'sonnet', version: '4', modifiers: '1m' },
			);
		});

		test('1m on opus converts to correct SDK model ID', () => {
			assert.strictEqual(parseClaudeModelId('claude-opus-4.6-1m').toSdkModelId(), 'claude-opus-4-6-1m');
		});

		test('1m on opus converts to correct endpoint model ID', () => {
			assert.strictEqual(parseClaudeModelId('claude-opus-4-6-1m').toEndpointModelId(), 'claude-opus-4.6-1m');
		});

		test('1m on non-opus model is not included in SDK model ID', () => {
			assert.strictEqual(parseClaudeModelId('claude-sonnet-4-1m').toSdkModelId(), 'claude-sonnet-4');
		});

		test('1m on non-opus model is not included in endpoint model ID', () => {
			assert.strictEqual(parseClaudeModelId('claude-sonnet-4-1m').toEndpointModelId(), 'claude-sonnet-4');
		});

		test('1m with date suffix on opus keeps only 1m in SDK model ID', () => {
			assert.strictEqual(parseClaudeModelId('claude-opus-4-6-1m-20251101').toSdkModelId(), 'claude-opus-4-6-1m');
		});

		test('1m with date suffix on opus keeps only 1m in endpoint model ID', () => {
			assert.strictEqual(parseClaudeModelId('claude-opus-4-6-1m-20251101').toEndpointModelId(), 'claude-opus-4.6-1m');
		});
	});

	suite('bare model names', () => {
		test('parses a bare name with no version', () => {
			const result = parseClaudeModelId('foo');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'foo', version: '', modifiers: '' },
			);
		});

		test('toSdkModelId returns the bare name', () => {
			assert.strictEqual(parseClaudeModelId('foo').toSdkModelId(), 'foo');
		});

		test('toEndpointModelId returns the bare name', () => {
			assert.strictEqual(parseClaudeModelId('foo').toEndpointModelId(), 'foo');
		});

		test('parses bare "claude" as a bare name', () => {
			const result = parseClaudeModelId('claude');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'claude', version: '', modifiers: '' },
			);
		});
	});

	suite('unparseable inputs', () => {
		test('throws for hyphenated non-Claude IDs', () => {
			assert.throws(() => parseClaudeModelId('gpt-4o'), /Unable to parse Claude model ID: 'gpt-4o'/);
		});

		test('throws for garbage with hyphens', () => {
			assert.throws(() => parseClaudeModelId('invalid-model-id'));
		});
	});

	suite('tryParseClaudeModelId', () => {
		test('returns undefined for hyphenated non-Claude IDs', () => {
			assert.strictEqual(tryParseClaudeModelId('gpt-4o'), undefined);
		});

		test('returns a result for bare names', () => {
			const result = tryParseClaudeModelId('foo');
			assert.ok(result);
			assert.deepStrictEqual({ name: result.name, version: result.version }, { name: 'foo', version: '' });
		});

		test('returns a result for valid Claude IDs', () => {
			const result = tryParseClaudeModelId('claude-sonnet-4');
			assert.ok(result);
			assert.deepStrictEqual({ name: result.name, version: result.version }, { name: 'sonnet', version: '4' });
		});
	});

	suite('case insensitivity', () => {
		test('parses uppercase input', () => {
			const result = parseClaudeModelId('CLAUDE-OPUS-4-5');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version },
				{ name: 'opus', version: '4.5' },
			);
		});

		test('parses mixed case input', () => {
			const result = parseClaudeModelId('Claude-Sonnet-4-20250514');
			assert.deepStrictEqual(
				{ name: result.name, version: result.version, modifiers: result.modifiers },
				{ name: 'sonnet', version: '4', modifiers: '20250514' },
			);
		});
	});

	suite('caching', () => {
		test('returns the same object for repeated calls', () => {
			const first = parseClaudeModelId('claude-opus-4-5-20251101');
			const second = parseClaudeModelId('claude-opus-4-5-20251101');
			assert.strictEqual(first, second);
		});

		test('returns the same object for different casing of the same ID', () => {
			const lower = parseClaudeModelId('claude-haiku-3-5');
			const upper = parseClaudeModelId('CLAUDE-HAIKU-3-5');
			assert.strictEqual(lower, upper);
		});
	});

	suite('toSdkModelId', () => {
		test('produces dash-separated version for major.minor', () => {
			assert.strictEqual(parseClaudeModelId('claude-opus-4.5').toSdkModelId(), 'claude-opus-4-5');
		});

		test('produces single-digit version when no minor', () => {
			assert.strictEqual(parseClaudeModelId('claude-sonnet-4').toSdkModelId(), 'claude-sonnet-4');
		});

		test('normalizes old-format SDK IDs to new format', () => {
			assert.strictEqual(parseClaudeModelId('claude-3-5-sonnet-20241022').toSdkModelId(), 'claude-sonnet-3-5');
		});

		test('strips date suffix from SDK IDs', () => {
			assert.strictEqual(parseClaudeModelId('claude-opus-4-5-20251101').toSdkModelId(), 'claude-opus-4-5');
		});
	});

	suite('toEndpointModelId', () => {
		test('produces dot-separated version for major.minor', () => {
			assert.strictEqual(parseClaudeModelId('claude-opus-4-5-20251101').toEndpointModelId(), 'claude-opus-4.5');
		});

		test('produces single-digit version when no minor', () => {
			assert.strictEqual(parseClaudeModelId('claude-sonnet-4-20250514').toEndpointModelId(), 'claude-sonnet-4');
		});

		test('normalizes old-format SDK IDs', () => {
			assert.strictEqual(parseClaudeModelId('claude-3-5-sonnet-20241022').toEndpointModelId(), 'claude-sonnet-3.5');
		});

		test('is identity for endpoint-format IDs', () => {
			assert.strictEqual(parseClaudeModelId('claude-haiku-4.5').toEndpointModelId(), 'claude-haiku-4.5');
		});
	});
});
