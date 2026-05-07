/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { isRepoMemoryEntry, normalizeCitations } from '../agentMemoryService';

describe('AgentMemoryService', () => {
	describe('isRepoMemoryEntry', () => {
		it('should return true for valid entry with required fields only', () => {
			const entry: unknown = {
				subject: 'testing',
				fact: 'Use vitest for unit tests'
			};
			expect(isRepoMemoryEntry(entry)).toBe(true);
		});

		it('should return true for valid entry with all fields', () => {
			const entry: unknown = {
				subject: 'testing',
				fact: 'Use vitest for unit tests',
				citations: ['src/test.ts:10'],
				reason: 'Important for consistency',
				category: 'general'
			};
			expect(isRepoMemoryEntry(entry)).toBe(true);
		});

		it('should return true for entry with legacy string citations', () => {
			const entry: unknown = {
				subject: 'testing',
				fact: 'Use vitest for unit tests',
				citations: 'src/test.ts:10, src/other.ts:20'
			};
			expect(isRepoMemoryEntry(entry)).toBe(true);
		});

		it('should return false for null', () => {
			expect(isRepoMemoryEntry(null)).toBe(false);
		});

		it('should return false for undefined', () => {
			expect(isRepoMemoryEntry(undefined)).toBe(false);
		});

		it('should return false for non-object', () => {
			expect(isRepoMemoryEntry('string')).toBe(false);
			expect(isRepoMemoryEntry(123)).toBe(false);
		});

		it('should return false for missing subject', () => {
			const entry: unknown = {
				fact: 'Use vitest for unit tests'
			};
			expect(isRepoMemoryEntry(entry)).toBe(false);
		});

		it('should return false for missing fact', () => {
			const entry: unknown = {
				subject: 'testing'
			};
			expect(isRepoMemoryEntry(entry)).toBe(false);
		});

		it('should return false for non-string subject', () => {
			const entry: unknown = {
				subject: 123,
				fact: 'Use vitest for unit tests'
			};
			expect(isRepoMemoryEntry(entry)).toBe(false);
		});

		it('should return false for invalid citations type', () => {
			const entry: unknown = {
				subject: 'testing',
				fact: 'Use vitest for unit tests',
				citations: 123
			};
			expect(isRepoMemoryEntry(entry)).toBe(false);
		});

		it('should return false for citations array with non-string elements', () => {
			const entry: unknown = {
				subject: 'testing',
				fact: 'Use vitest for unit tests',
				citations: [123, 'src/test.ts:10']
			};
			expect(isRepoMemoryEntry(entry)).toBe(false);
		});
	});

	describe('normalizeCitations', () => {
		it('should return undefined for undefined input', () => {
			expect(normalizeCitations(undefined)).toBeUndefined();
		});

		it('should split comma-separated string into array', () => {
			const result = normalizeCitations('src/a.ts:10, src/b.ts:20');
			expect(result).toEqual(['src/a.ts:10', 'src/b.ts:20']);
		});

		it('should trim whitespace from citations', () => {
			const result = normalizeCitations('  src/a.ts:10  ,  src/b.ts:20  ');
			expect(result).toEqual(['src/a.ts:10', 'src/b.ts:20']);
		});

		it('should filter out empty citations', () => {
			const result = normalizeCitations('src/a.ts:10, , src/b.ts:20');
			expect(result).toEqual(['src/a.ts:10', 'src/b.ts:20']);
		});

		it('should return array input unchanged', () => {
			const input = ['src/a.ts:10', 'src/b.ts:20'];
			const result = normalizeCitations(input);
			expect(result).toEqual(input);
		});

		it('should handle single citation string', () => {
			const result = normalizeCitations('src/a.ts:10');
			expect(result).toEqual(['src/a.ts:10']);
		});

		it('should handle empty string', () => {
			const result = normalizeCitations('');
			expect(result).toEqual([]);
		});
	});
});
