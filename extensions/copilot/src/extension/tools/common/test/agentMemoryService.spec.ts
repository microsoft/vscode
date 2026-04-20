/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { isRepoMemoryEntry } from '../agentMemoryService';

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


});
