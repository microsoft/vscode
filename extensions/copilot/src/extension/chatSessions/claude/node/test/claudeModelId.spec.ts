/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { parseClaudeModelId, tryParseClaudeModelId } from '../claudeModelId';

describe('parseClaudeModelId', () => {
	describe('parsing SDK model IDs', () => {
		it('parses claude-{name}-{major}-{minor}-{date}', () => {
			const result = parseClaudeModelId('claude-opus-4-5-20251101');
			expect(result).toEqual(expect.objectContaining({
				name: 'opus',
				version: '4.5',
				modifiers: '20251101',
			}));
		});

		it('parses claude-{major}-{minor}-{name}-{date} (old format)', () => {
			const result = parseClaudeModelId('claude-3-5-sonnet-20241022');
			expect(result).toEqual(expect.objectContaining({
				name: 'sonnet',
				version: '3.5',
				modifiers: '20241022',
			}));
		});

		it('parses claude-{name}-{major}-{date}', () => {
			const result = parseClaudeModelId('claude-sonnet-4-20250514');
			expect(result).toEqual(expect.objectContaining({
				name: 'sonnet',
				version: '4',
				modifiers: '20250514',
			}));
		});

		it('parses claude-{major}-{name}-{date} (old format)', () => {
			const result = parseClaudeModelId('claude-3-opus-20240229');
			expect(result).toEqual(expect.objectContaining({
				name: 'opus',
				version: '3',
				modifiers: '20240229',
			}));
		});

		it('parses SDK ID without date suffix', () => {
			const result = parseClaudeModelId('claude-opus-4-5');
			expect(result).toEqual(expect.objectContaining({
				name: 'opus',
				version: '4.5',
				modifiers: '',
			}));
		});
	});

	describe('parsing endpoint model IDs', () => {
		it('parses claude-{name}-{major}.{minor}', () => {
			const result = parseClaudeModelId('claude-opus-4.5');
			expect(result).toEqual(expect.objectContaining({
				name: 'opus',
				version: '4.5',
				modifiers: '',
			}));
		});

		it('parses claude-{name}-{major}', () => {
			const result = parseClaudeModelId('claude-sonnet-4');
			expect(result).toEqual(expect.objectContaining({
				name: 'sonnet',
				version: '4',
				modifiers: '',
			}));
		});

		it('parses claude-haiku-3.5', () => {
			const result = parseClaudeModelId('claude-haiku-3.5');
			expect(result).toEqual(expect.objectContaining({
				name: 'haiku',
				version: '3.5',
				modifiers: '',
			}));
		});
	});

	describe('modifiers (non-date suffixes)', () => {
		it('parses endpoint ID with 1m context variant (dot version)', () => {
			const result = parseClaudeModelId('claude-opus-4.6-1m');
			expect(result).toEqual(expect.objectContaining({
				name: 'opus',
				version: '4.6',
				modifiers: '1m',
			}));
		});

		it('parses SDK ID with 1m context variant (dash version)', () => {
			const result = parseClaudeModelId('claude-opus-4-6-1m');
			expect(result).toEqual(expect.objectContaining({
				name: 'opus',
				version: '4.6',
				modifiers: '1m',
			}));
		});

		it('parses SDK ID with both 1m modifier and date suffix', () => {
			const result = parseClaudeModelId('claude-opus-4-6-1m-20251101');
			expect(result).toEqual(expect.objectContaining({
				name: 'opus',
				version: '4.6',
				modifiers: '1m-20251101',
			}));
		});

		it('parses single-version ID with modifier', () => {
			const result = parseClaudeModelId('claude-sonnet-4-1m');
			expect(result).toEqual(expect.objectContaining({
				name: 'sonnet',
				version: '4',
				modifiers: '1m',
			}));
		});

		it('1m on opus converts to correct SDK model ID', () => {
			expect(parseClaudeModelId('claude-opus-4.6-1m').toSdkModelId()).toBe('claude-opus-4-6-1m');
		});

		it('1m on opus converts to correct endpoint model ID', () => {
			expect(parseClaudeModelId('claude-opus-4-6-1m').toEndpointModelId()).toBe('claude-opus-4.6-1m');
		});

		it('1m on non-opus model is not included in SDK model ID', () => {
			expect(parseClaudeModelId('claude-sonnet-4-1m').toSdkModelId()).toBe('claude-sonnet-4');
		});

		it('1m on non-opus model is not included in endpoint model ID', () => {
			expect(parseClaudeModelId('claude-sonnet-4-1m').toEndpointModelId()).toBe('claude-sonnet-4');
		});

		it('1m with date suffix on opus keeps only 1m in SDK model ID', () => {
			expect(parseClaudeModelId('claude-opus-4-6-1m-20251101').toSdkModelId()).toBe('claude-opus-4-6-1m');
		});

		it('1m with date suffix on opus keeps only 1m in endpoint model ID', () => {
			expect(parseClaudeModelId('claude-opus-4-6-1m-20251101').toEndpointModelId()).toBe('claude-opus-4.6-1m');
		});
	});

	describe('bare model names', () => {
		it('parses a bare name with no version', () => {
			const result = parseClaudeModelId('foo');
			expect(result).toEqual(expect.objectContaining({
				name: 'foo',
				version: '',
				modifiers: '',
			}));
		});

		it('toSdkModelId returns the bare name', () => {
			expect(parseClaudeModelId('foo').toSdkModelId()).toBe('foo');
		});

		it('toEndpointModelId returns the bare name', () => {
			expect(parseClaudeModelId('foo').toEndpointModelId()).toBe('foo');
		});

		it('parses bare "claude" as a bare name', () => {
			const result = parseClaudeModelId('claude');
			expect(result).toEqual(expect.objectContaining({
				name: 'claude',
				version: '',
				modifiers: '',
			}));
		});
	});

	describe('unparseable inputs', () => {
		it('throws for hyphenated non-Claude IDs', () => {
			expect(() => parseClaudeModelId('gpt-4o')).toThrow(`Unable to parse Claude model ID: 'gpt-4o'`);
		});

		it('throws for garbage with hyphens', () => {
			expect(() => parseClaudeModelId('invalid-model-id')).toThrow();
		});
	});

	describe('tryParseClaudeModelId', () => {
		it('returns undefined for hyphenated non-Claude IDs', () => {
			expect(tryParseClaudeModelId('gpt-4o')).toBeUndefined();
		});

		it('returns a result for bare names', () => {
			expect(tryParseClaudeModelId('foo')).toEqual(expect.objectContaining({
				name: 'foo',
				version: '',
			}));
		});

		it('returns a result for valid Claude IDs', () => {
			expect(tryParseClaudeModelId('claude-sonnet-4')).toEqual(expect.objectContaining({
				name: 'sonnet',
				version: '4',
			}));
		});
	});

	describe('case insensitivity', () => {
		it('parses uppercase input', () => {
			const result = parseClaudeModelId('CLAUDE-OPUS-4-5');
			expect(result).toEqual(expect.objectContaining({
				name: 'opus',
				version: '4.5',
			}));
		});

		it('parses mixed case input', () => {
			const result = parseClaudeModelId('Claude-Sonnet-4-20250514');
			expect(result).toEqual(expect.objectContaining({
				name: 'sonnet',
				version: '4',
				modifiers: '20250514',
			}));
		});
	});

	describe('caching', () => {
		it('returns the same object for repeated calls', () => {
			const first = parseClaudeModelId('claude-opus-4-5-20251101');
			const second = parseClaudeModelId('claude-opus-4-5-20251101');
			expect(first).toBe(second);
		});

		it('returns the same object for different casing of the same ID', () => {
			const lower = parseClaudeModelId('claude-haiku-3-5');
			const upper = parseClaudeModelId('CLAUDE-HAIKU-3-5');
			expect(lower).toBe(upper);
		});
	});

	describe('toSdkModelId', () => {
		it('produces dash-separated version for major.minor', () => {
			expect(parseClaudeModelId('claude-opus-4.5').toSdkModelId()).toBe('claude-opus-4-5');
		});

		it('produces single-digit version when no minor', () => {
			expect(parseClaudeModelId('claude-sonnet-4').toSdkModelId()).toBe('claude-sonnet-4');
		});

		it('normalizes old-format SDK IDs to new format', () => {
			expect(parseClaudeModelId('claude-3-5-sonnet-20241022').toSdkModelId()).toBe('claude-sonnet-3-5');
		});

		it('strips date suffix from SDK IDs', () => {
			expect(parseClaudeModelId('claude-opus-4-5-20251101').toSdkModelId()).toBe('claude-opus-4-5');
		});
	});

	describe('toEndpointModelId', () => {
		it('produces dot-separated version for major.minor', () => {
			expect(parseClaudeModelId('claude-opus-4-5-20251101').toEndpointModelId()).toBe('claude-opus-4.5');
		});

		it('produces single-digit version when no minor', () => {
			expect(parseClaudeModelId('claude-sonnet-4-20250514').toEndpointModelId()).toBe('claude-sonnet-4');
		});

		it('normalizes old-format SDK IDs', () => {
			expect(parseClaudeModelId('claude-3-5-sonnet-20241022').toEndpointModelId()).toBe('claude-sonnet-3.5');
		});

		it('is identity for endpoint-format IDs', () => {
			expect(parseClaudeModelId('claude-haiku-4.5').toEndpointModelId()).toBe('claude-haiku-4.5');
		});
	});
});
