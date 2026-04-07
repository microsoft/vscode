/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it, vi } from 'vitest';
import { AggressivenessLevel, EditIntent } from '../../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { ILogger } from '../../../../platform/log/common/logService';
import { AsyncIterUtils } from '../../../../util/common/asyncIterableUtils';
import { EditIntentParseMode, parseEditIntentFromStream } from '../../node/xtabProvider';

// ============================================================================
// Test Utilities
// ============================================================================

function createMockLogger(): ILogger {
	return {
		trace: vi.fn(),
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		critical: vi.fn(),
		flush: vi.fn(),
		createSubLogger: () => createMockLogger(),
		withContext: () => createMockLogger(),
	} as unknown as ILogger;
}

// ============================================================================
// EditIntent.fromString Tests
// ============================================================================

describe('EditIntent.fromString', () => {
	it.each([
		['no_edit', EditIntent.NoEdit],
		['low', EditIntent.Low],
		['medium', EditIntent.Medium],
		['high', EditIntent.High],
	])('should return %s for "%s"', (input, expected) => {
		expect(EditIntent.fromString(input)).toBe(expected);
	});

	it('should return High for unknown values', () => {
		expect(EditIntent.fromString('invalid')).toBe(EditIntent.High);
		expect(EditIntent.fromString('')).toBe(EditIntent.High);
		expect(EditIntent.fromString('unknown')).toBe(EditIntent.High);
	});
});

// ============================================================================
// EditIntent.fromShortName Tests
// ============================================================================

describe('EditIntent.fromShortName', () => {
	it.each([
		['N', EditIntent.NoEdit],
		['L', EditIntent.Low],
		['M', EditIntent.Medium],
		['H', EditIntent.High],
	])('should return %s for "%s"', (input, expected) => {
		expect(EditIntent.fromShortName(input)).toBe(expected);
	});

	it('should return undefined for unknown values', () => {
		expect(EditIntent.fromShortName('invalid')).toBeUndefined();
		expect(EditIntent.fromShortName('')).toBeUndefined();
		expect(EditIntent.fromShortName('X')).toBeUndefined();
		expect(EditIntent.fromShortName('low')).toBeUndefined();
	});

	it('should return undefined for lowercase letters', () => {
		expect(EditIntent.fromShortName('n')).toBeUndefined();
		expect(EditIntent.fromShortName('l')).toBeUndefined();
		expect(EditIntent.fromShortName('m')).toBeUndefined();
		expect(EditIntent.fromShortName('h')).toBeUndefined();
	});
});

// ============================================================================
// EditIntent.shouldShowEdit Tests
// ============================================================================

describe('EditIntent.shouldShowEdit', () => {
	// Matrix of expected results: [intent][aggressiveness] = shouldShow
	// High confidence → always show, Low confidence → only high aggression
	const expectations: Record<EditIntent, Record<AggressivenessLevel, boolean>> = {
		[EditIntent.NoEdit]: {
			[AggressivenessLevel.Low]: false,
			[AggressivenessLevel.Medium]: false,
			[AggressivenessLevel.High]: false,
		},
		[EditIntent.Low]: {
			[AggressivenessLevel.Low]: false,
			[AggressivenessLevel.Medium]: false,
			[AggressivenessLevel.High]: true,
		},
		[EditIntent.Medium]: {
			[AggressivenessLevel.Low]: false,
			[AggressivenessLevel.Medium]: true,
			[AggressivenessLevel.High]: true,
		},
		[EditIntent.High]: {
			[AggressivenessLevel.Low]: true,
			[AggressivenessLevel.Medium]: true,
			[AggressivenessLevel.High]: true,
		},
	};

	for (const [intent, aggressivenessMap] of Object.entries(expectations)) {
		describe(`${intent} intent`, () => {
			for (const [aggressiveness, expected] of Object.entries(aggressivenessMap)) {
				const shouldText = expected ? 'should show' : 'should NOT show';
				it(`${shouldText} for ${aggressiveness} aggressiveness`, () => {
					expect(EditIntent.shouldShowEdit(intent as EditIntent, aggressiveness as AggressivenessLevel)).toBe(expected);
				});
			}
		});
	}
});

// ============================================================================
// parseEditIntentFromStream Tests
// ============================================================================

describe('parseEditIntentFromStream', () => {
	describe('successful parsing', () => {
		it.each([
			['no_edit', EditIntent.NoEdit],
			['low', EditIntent.Low],
			['medium', EditIntent.Medium],
			['high', EditIntent.High],
		])('should parse %s intent', async (intentValue, expectedIntent) => {
			const inputLines = [`<|edit_intent|>${intentValue}<|/edit_intent|>`, 'line1', 'line2'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger());

			expect(editIntent).toBe(expectedIntent);
			expect(parseError).toBeUndefined();
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['line1', 'line2']);
		});

		it('should handle content on same line after tag', async () => {
			const inputLines = ['<|edit_intent|>low<|/edit_intent|>const x = 1;', 'const y = 2;'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger());

			expect(editIntent).toBe(EditIntent.Low);
			expect(parseError).toBeUndefined();
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['const x = 1;', 'const y = 2;']);
		});

		it('should trim whitespace-only content after tag', async () => {
			const inputLines = ['<|edit_intent|>low<|/edit_intent|>   ', 'const x = 1;'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { remainingLinesStream } = await parseEditIntentFromStream(linesStream, createMockLogger());

			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['const x = 1;']);
		});

		it('should handle single-line stream with only tag', async () => {
			const inputLines = ['<|edit_intent|>no_edit<|/edit_intent|>'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream } = await parseEditIntentFromStream(linesStream, createMockLogger());

			expect(editIntent).toBe(EditIntent.NoEdit);
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual([]);
		});
	});

	describe('error handling', () => {
		it('should return emptyResponse error for empty stream', async () => {
			const linesStream = AsyncIterUtils.fromArray([]);

			const { editIntent, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger());

			expect(editIntent).toBe(EditIntent.High);
			expect(parseError).toBe('emptyResponse');
		});

		it('should return noTagFound error when no tag present', async () => {
			const inputLines = ['const x = 1;', 'const y = 2;'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger());

			expect(editIntent).toBe(EditIntent.High);
			expect(parseError).toBe('noTagFound');
			// All original lines should be preserved
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['const x = 1;', 'const y = 2;']);
		});

		it('should return malformedTag:startWithoutEnd error', async () => {
			const inputLines = ['<|edit_intent|>low', 'const x = 1;'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger());

			expect(editIntent).toBe(EditIntent.High);
			expect(parseError).toBe('malformedTag:startWithoutEnd');
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['<|edit_intent|>low', 'const x = 1;']);
		});

		it('should return malformedTag:endWithoutStart error', async () => {
			const inputLines = ['low<|/edit_intent|>', 'const x = 1;'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger());

			expect(editIntent).toBe(EditIntent.High);
			expect(parseError).toBe('malformedTag:endWithoutStart');
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['low<|/edit_intent|>', 'const x = 1;']);
		});

		it('should return unknownIntentValue error for unrecognized intent', async () => {
			const inputLines = ['<|edit_intent|>unknown_value<|/edit_intent|>', 'const x = 1;'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger());

			expect(editIntent).toBe(EditIntent.High);
			expect(parseError).toBe('unknownIntentValue:unknown_value');
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['const x = 1;']);
		});
	});
});

// ============================================================================
// parseEditIntentFromStream ShortName Mode Tests
// ============================================================================

describe('parseEditIntentFromStream (ShortName mode)', () => {
	describe('successful parsing', () => {
		it.each([
			['N', EditIntent.NoEdit],
			['L', EditIntent.Low],
			['M', EditIntent.Medium],
			['H', EditIntent.High],
		])('should parse %s short name', async (shortName, expectedIntent) => {
			const inputLines = [shortName, 'line1', 'line2'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

			expect(editIntent).toBe(expectedIntent);
			expect(parseError).toBeUndefined();
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['line1', 'line2']);
		});

		it('should handle short name with leading/trailing whitespace', async () => {
			const inputLines = ['  M  ', 'const x = 1;'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

			expect(editIntent).toBe(EditIntent.Medium);
			expect(parseError).toBeUndefined();
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['const x = 1;']);
		});

		it('should handle single-line stream with only short name', async () => {
			const inputLines = ['N'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

			expect(editIntent).toBe(EditIntent.NoEdit);
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual([]);
		});
	});

	describe('error handling', () => {
		it('should return emptyResponse error for empty stream', async () => {
			const linesStream = AsyncIterUtils.fromArray([]);

			const { editIntent, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

			expect(editIntent).toBe(EditIntent.High);
			expect(parseError).toBe('emptyResponse');
		});

		it('should return unknownIntentValue error when first line is not a valid short name', async () => {
			const inputLines = ['const x = 1;', 'const y = 2;'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

			expect(editIntent).toBe(EditIntent.High);
			expect(parseError).toBe('unknownIntentValue:const x = 1;');
			// All original lines should be preserved
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['const x = 1;', 'const y = 2;']);
		});

		it('should return unknownIntentValue error for multi-character first line', async () => {
			const inputLines = ['low', 'const x = 1;'];
			const linesStream = AsyncIterUtils.fromArray(inputLines);

			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

			expect(editIntent).toBe(EditIntent.High);
			expect(parseError).toBe('unknownIntentValue:low');
			expect(await AsyncIterUtils.toArray(remainingLinesStream)).toEqual(['low', 'const x = 1;']);
		});
	});
});

// ============================================================================
// Integration: Filtering Behavior Tests
// ============================================================================

describe('Edit Intent Filtering Integration', () => {
	// These tests verify the complete flow: parse intent from stream -> check if should show

	describe('Tags mode', () => {
		describe('no_edit always filtered out', () => {
			it.each([AggressivenessLevel.Low, AggressivenessLevel.Medium, AggressivenessLevel.High])(
				'should filter out no_edit with %s aggressiveness',
				async (aggressiveness) => {
					const linesStream = AsyncIterUtils.fromArray(['<|edit_intent|>no_edit<|/edit_intent|>', 'code']);
					const { editIntent } = await parseEditIntentFromStream(linesStream, createMockLogger());

					expect(editIntent).toBe(EditIntent.NoEdit);
					expect(EditIntent.shouldShowEdit(editIntent, aggressiveness)).toBe(false);
				}
			);
		});

		describe('low intent only shown for high aggressiveness', () => {
			it.each([
				[AggressivenessLevel.Low, false],
				[AggressivenessLevel.Medium, false],
				[AggressivenessLevel.High, true],
			])(
				'with %s aggressiveness should return %s',
				async (aggressiveness, expected) => {
					const linesStream = AsyncIterUtils.fromArray(['<|edit_intent|>low<|/edit_intent|>', 'code']);
					const { editIntent } = await parseEditIntentFromStream(linesStream, createMockLogger());

					expect(editIntent).toBe(EditIntent.Low);
					expect(EditIntent.shouldShowEdit(editIntent, aggressiveness)).toBe(expected);
				}
			);
		});

		describe('medium intent shown for medium/high aggressiveness', () => {
			it.each([
				[AggressivenessLevel.Low, false],
				[AggressivenessLevel.Medium, true],
				[AggressivenessLevel.High, true],
			])('with %s aggressiveness should return %s', async (aggressiveness, expected) => {
				const linesStream = AsyncIterUtils.fromArray(['<|edit_intent|>medium<|/edit_intent|>', 'code']);
				const { editIntent } = await parseEditIntentFromStream(linesStream, createMockLogger());

				expect(EditIntent.shouldShowEdit(editIntent, aggressiveness)).toBe(expected);
			});
		});

		describe('high intent never filtered (always shown)', () => {
			it.each([AggressivenessLevel.Low, AggressivenessLevel.Medium, AggressivenessLevel.High])(
				'should NOT filter high intent with %s aggressiveness',
				async (aggressiveness) => {
					const linesStream = AsyncIterUtils.fromArray(['<|edit_intent|>high<|/edit_intent|>', 'code']);
					const { editIntent } = await parseEditIntentFromStream(linesStream, createMockLogger());

					expect(editIntent).toBe(EditIntent.High);
					expect(EditIntent.shouldShowEdit(editIntent, aggressiveness)).toBe(true);
				}
			);
		});
	});

	describe('ShortName mode', () => {
		describe('N (no_edit) always filtered out', () => {
			it.each([AggressivenessLevel.Low, AggressivenessLevel.Medium, AggressivenessLevel.High])(
				'should filter out N with %s aggressiveness',
				async (aggressiveness) => {
					const linesStream = AsyncIterUtils.fromArray(['N', 'code']);
					const { editIntent } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

					expect(editIntent).toBe(EditIntent.NoEdit);
					expect(EditIntent.shouldShowEdit(editIntent, aggressiveness)).toBe(false);
				}
			);
		});

		describe('L (low) intent only shown for high aggressiveness', () => {
			it.each([
				[AggressivenessLevel.Low, false],
				[AggressivenessLevel.Medium, false],
				[AggressivenessLevel.High, true],
			])(
				'with %s aggressiveness should return %s',
				async (aggressiveness, expected) => {
					const linesStream = AsyncIterUtils.fromArray(['L', 'code']);
					const { editIntent } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

					expect(editIntent).toBe(EditIntent.Low);
					expect(EditIntent.shouldShowEdit(editIntent, aggressiveness)).toBe(expected);
				}
			);
		});

		describe('M (medium) intent shown for medium/high aggressiveness', () => {
			it.each([
				[AggressivenessLevel.Low, false],
				[AggressivenessLevel.Medium, true],
				[AggressivenessLevel.High, true],
			])('with %s aggressiveness should return %s', async (aggressiveness, expected) => {
				const linesStream = AsyncIterUtils.fromArray(['M', 'code']);
				const { editIntent } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

				expect(EditIntent.shouldShowEdit(editIntent, aggressiveness)).toBe(expected);
			});
		});

		describe('H (high) intent never filtered (always shown)', () => {
			it.each([AggressivenessLevel.Low, AggressivenessLevel.Medium, AggressivenessLevel.High])(
				'should NOT filter H intent with %s aggressiveness',
				async (aggressiveness) => {
					const linesStream = AsyncIterUtils.fromArray(['H', 'code']);
					const { editIntent } = await parseEditIntentFromStream(linesStream, createMockLogger(), EditIntentParseMode.ShortName);

					expect(editIntent).toBe(EditIntent.High);
					expect(EditIntent.shouldShowEdit(editIntent, aggressiveness)).toBe(true);
				}
			);
		});
	});
});
