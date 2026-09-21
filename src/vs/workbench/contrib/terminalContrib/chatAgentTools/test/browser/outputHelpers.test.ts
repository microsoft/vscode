/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { getOutput, MAX_OUTPUT_LENGTH, truncateLargeOutput } from '../../browser/outputHelpers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('outputHelpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	function createMockInstance(lines: { text: string; isWrapped?: boolean }[]): ITerminalInstance {
		const buffer = {
			length: lines.length,
			getLine: (index: number) => {
				const line = lines[index];
				if (!line) {
					return undefined;
				}
				return {
					isWrapped: !!line.isWrapped,
					translateToString: (trimRight?: boolean) => trimRight ? line.text.replace(/\s+$/g, '') : line.text
				};
			}
		};
		return {
			xterm: {
				raw: {
					buffer: {
						active: buffer
					}
				}
			}
		} as unknown as ITerminalInstance;
	}

	test('preserves explicit newline after an 80-column soft wrap', () => {
		const line80 = 'A'.repeat(80);
		const instance = createMockInstance([
			{ text: line80 },
			{ text: 'X', isWrapped: true },
			{ text: 'after' }
		]);

		const output = getOutput(instance);
		strictEqual(output, `${line80}X\nafter`);
	});

	test('rewinds marker when it starts on a wrapped continuation line', () => {
		const line80 = 'A'.repeat(80);
		const instance = createMockInstance([
			{ text: line80 },
			{ text: 'X', isWrapped: true },
			{ text: 'after' }
		]);

		const marker = { line: 1 } as IXtermMarker;
		const output = getOutput(instance, marker);
		strictEqual(output, `${line80}X\nafter`);
	});

	test('returns raw JSON without formatting (formatting only in file writer)', () => {
		const instance = createMockInstance([
			{ text: '{"items":[1,2],"nested":{"value":true}}' }
		]);

		const output = getOutput(instance);
		strictEqual(output, '{"items":[1,2],"nested":{"value":true}}');
	});

	test('does not truncate output (callers handle truncation)', () => {
		const line = 'a'.repeat(1000);
		const instance = createMockInstance(
			Array.from({ length: 100 }, () => ({ text: line }))
		);

		const output = getOutput(instance);
		// getOutput no longer truncates - it returns full output
		strictEqual(output.length, 100 * 1000 + 99); // 100 lines of 1000 chars + 99 newlines
	});

	suite('truncateLargeOutput', () => {
		test('truncates with preview header and tail', () => {
			const largeOutput = 'a'.repeat(30000);
			const result = truncateLargeOutput(largeOutput);
			strictEqual(result.length, MAX_OUTPUT_LENGTH);
			ok(result.includes('[Output too large'));
			ok(result.includes('[... middle of output truncated ...]'));
		});

		test('includes both head preview and tail', () => {
			const head = 'HEAD_CONTENT_' + 'x'.repeat(487);
			const middle = 'm'.repeat(29000);
			const tail = 'TAIL_CONTENT_' + 'z'.repeat(487);
			const largeOutput = head + middle + tail;

			const result = truncateLargeOutput(largeOutput);
			ok(result.includes('HEAD_CONTENT_'), 'should include head preview');
			ok(result.includes('TAIL_CONTENT_'), 'should include tail');
			ok(result.length <= MAX_OUTPUT_LENGTH);
		});

		test('includes file path when provided', () => {
			const largeOutput = 'x'.repeat(30000);
			const result = truncateLargeOutput(largeOutput, '/tmp/copilot-terminal-output-abc.txt');
			ok(result.includes('/tmp/copilot-terminal-output-abc.txt'));
			ok(result.includes('readFile'));
			ok(result.includes('grep'));
			ok(result.length <= MAX_OUTPUT_LENGTH);
		});
	});
});
