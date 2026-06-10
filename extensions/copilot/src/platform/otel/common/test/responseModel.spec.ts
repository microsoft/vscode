/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { normalizeResponseModel } from '../responseModel';

describe('normalizeResponseModel', () => {
	it('echoes the request model when the response model only differs by `.` vs `-` (issue #318805)', () => {
		expect(normalizeResponseModel('claude-opus-4.6', 'claude-opus-4-6')).toBe('claude-opus-4.6');
		expect(normalizeResponseModel('claude-haiku-4.5', 'claude-haiku-4-5')).toBe('claude-haiku-4.5');
		expect(normalizeResponseModel('claude-sonnet-4.6', 'claude-sonnet-4-6')).toBe('claude-sonnet-4.6');
	});

	it('returns the resolved model when it adds specificity (e.g. dated snapshot)', () => {
		expect(normalizeResponseModel('gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17')).toBe('gpt-5.4-mini-2026-03-17');
		expect(normalizeResponseModel('gpt-4o', 'gpt-4o-2024-08-06')).toBe('gpt-4o-2024-08-06');
	});

	it('echoes the request model when the response strips a request-only suffix (e.g. reasoning effort)', () => {
		// Server strips the `-high` reasoning-effort qualifier and uses `-` punctuation.
		expect(normalizeResponseModel('claude-opus-4.7-high', 'claude-opus-4-7')).toBe('claude-opus-4.7-high');
		expect(normalizeResponseModel('claude-opus-4.6-medium', 'claude-opus-4-6')).toBe('claude-opus-4.6-medium');
		// Server strips variant qualifiers like `-1m-internal`.
		expect(normalizeResponseModel('claude-opus-4.7-1m-internal', 'claude-opus-4-7')).toBe('claude-opus-4.7-1m-internal');
	});

	it('does not treat unrelated models that share a numeric-looking prefix as the same', () => {
		// `gpt-4` is not a prefix of `gpt-40` because we require a `-` boundary.
		expect(normalizeResponseModel('gpt-4', 'gpt-40')).toBe('gpt-40');
	});

	it('returns the response model unchanged when it equals the request model', () => {
		expect(normalizeResponseModel('gpt-4o-mini-2024-07-18', 'gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini-2024-07-18');
	});

	it('is case-insensitive when comparing logical model identity', () => {
		expect(normalizeResponseModel('Claude-Opus-4.6', 'claude-opus-4-6')).toBe('Claude-Opus-4.6');
	});

	it('returns undefined when no response model is provided', () => {
		expect(normalizeResponseModel('claude-opus-4.6', undefined)).toBeUndefined();
		expect(normalizeResponseModel(undefined, undefined)).toBeUndefined();
	});

	it('returns the response model when no request model is available', () => {
		expect(normalizeResponseModel(undefined, 'claude-opus-4-6')).toBe('claude-opus-4-6');
	});
});
