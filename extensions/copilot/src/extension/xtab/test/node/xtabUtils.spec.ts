/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { findMergeConflictMarkersRange } from '../../node/xtabUtils';


suite('findMergeConflictMarkersRange', () => {

	test('should find merge conflict markers within edit window', () => {
		const lines = [
			'function foo() {',
			'<<<<<<< HEAD',
			'  return 1;',
			'=======',
			'  return 2;',
			'>>>>>>> branch',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 7);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(1);
		expect(result?.endExclusive).toBe(6);
	});

	test('should return undefined when no merge conflict markers present', () => {
		const lines = [
			'function foo() {',
			'  return 1;',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 3);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should return undefined when start marker exists but no end marker', () => {
		const lines = [
			'function foo() {',
			'<<<<<<< HEAD',
			'  return 1;',
			'=======',
			'  return 2;',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 6);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should return undefined when conflict exceeds maxMergeConflictLines', () => {
		const lines = [
			'<<<<<<< HEAD',
			'line 1',
			'line 2',
			'line 3',
			'line 4',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 6);
		const maxMergeConflictLines = 3; // Too small to reach end marker

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should find conflict when exactly at maxMergeConflictLines boundary', () => {
		const lines = [
			'<<<<<<< HEAD',
			'line 1',
			'line 2',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 4);
		const maxMergeConflictLines = 4;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(4);
	});

	test('should only search within edit window range', () => {
		const lines = [
			'function foo() {',
			'  return 1;',
			'<<<<<<< HEAD',
			'  return 2;',
			'>>>>>>> branch',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 2); // Excludes the conflict
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should find first conflict when multiple conflicts exist', () => {
		const lines = [
			'<<<<<<< HEAD',
			'first conflict',
			'>>>>>>> branch',
			'some code',
			'<<<<<<< HEAD',
			'second conflict',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 7);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(3);
	});

	test('should handle conflict at start of edit window', () => {
		const lines = [
			'<<<<<<< HEAD',
			'content',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 3);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(3);
	});

	test('should handle conflict at end of edit window', () => {
		const lines = [
			'some code',
			'<<<<<<< HEAD',
			'content',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 4);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(1);
		expect(result?.endExclusive).toBe(4);
	});

	test('should handle empty lines array', () => {
		const lines: string[] = [];
		const editWindowRange = new OffsetRange(0, 0);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should handle single line with start marker only', () => {
		const lines = ['<<<<<<< HEAD'];
		const editWindowRange = new OffsetRange(0, 1);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should handle lines with merge markers that do not start at beginning', () => {
		const lines = [
			'function foo() {',
			'  <<<<<<< HEAD',
			'  return 1;',
			'  >>>>>>> branch',
			'}',
		];
		const editWindowRange = new OffsetRange(0, 5);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined(); // Should not match as markers don't start at line beginning
	});

	test('should handle conflict that extends beyond lines array', () => {
		const lines = [
			'<<<<<<< HEAD',
			'content',
		];
		const editWindowRange = new OffsetRange(0, 2);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined();
	});

	test('should handle edit window extending beyond lines array', () => {
		const lines = [
			'<<<<<<< HEAD',
			'content',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 100); // Beyond array length
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(3);
	});

	test('should handle minimal conflict (start and end markers only)', () => {
		const lines = [
			'<<<<<<< HEAD',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 2);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(2);
	});

	test('should handle maxMergeConflictLines of 1', () => {
		const lines = [
			'<<<<<<< HEAD',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 2);
		const maxMergeConflictLines = 1;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeUndefined(); // Cannot find end marker within limit
	});

	test('should handle maxMergeConflictLines of 2', () => {
		const lines = [
			'<<<<<<< HEAD',
			'>>>>>>> branch',
		];
		const editWindowRange = new OffsetRange(0, 2);
		const maxMergeConflictLines = 2;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(0);
		expect(result?.endExclusive).toBe(2);
	});

	test('should find conflict starting in middle of edit window', () => {
		const lines = [
			'line 1',
			'line 2',
			'<<<<<<< HEAD',
			'conflict',
			'>>>>>>> branch',
			'line 5',
		];
		const editWindowRange = new OffsetRange(0, 6);
		const maxMergeConflictLines = 10;

		const result = findMergeConflictMarkersRange(lines, editWindowRange, maxMergeConflictLines);

		expect(result).toBeDefined();
		expect(result?.start).toBe(2);
		expect(result?.endExclusive).toBe(5);
	});
});
