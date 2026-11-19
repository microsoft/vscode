/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import dedent from 'ts-dedent';
import { createTextDocument } from '../../test/textDocument';
import { TextDocumentManager } from '../../textDocumentManager';
import {
	BlockPositionType,
	getBlockPositionType,
	TerseBlockTrimmer,
} from '../blockTrimmer';
const x = TextDocumentManager;
console.log(x);


suite('TerseBlockTrimmer', function () {
	test('.getCompletionTrimOffset() returns undefined for a single statement under the line limit', async function () {
		await testCompletionTrimming(dedent`
			function example() {
				âšlet result = [];
		`);
	});

	test('.getCompletionTrimOffset() trims to the containing block', async function () {
		await testCompletionTrimming(dedent`
			function example() {
				âšreturn;
			}âœ‚ï¸
			function example2() {
				return;
			}
		`);
	});

	test('.getCompletionTrimOffset() trims at a blank line', async function () {
		await testCompletionTrimming(dedent`
			function example() {
				âšlet result = [];âœ‚ï¸

				let i = 0;
		`);
	});

	test('.getCompletionTrimOffset() trims at non-statement content between statements', async function () {
		await testCompletionTrimming(dedent`
			function example() {
				âšlet result = [];âœ‚ï¸
				// comment
				let i = 0;
		`);
	});

	test('.getCompletionTrimOffset() trims at the start of a new compound statement', async function () {
		await testCompletionTrimming(dedent`
			function example() {
				âšlet result = [];
				let i = 0;âœ‚ï¸
				for (i = 0; i < 10; i++) {
		`);
	});

	test('.getCompletionTrimOffset() trims after a single compound statement', async function () {
		await testCompletionTrimming(dedent`
			function reverseFind(haystack, needle) {
				âšfor (let i = haystack.length - 1; i >= 0; i--) {
					if (haystack[i] === needle) return i;
				}âœ‚ï¸
				return -1;
		`);
	});

	test('.getCompletionTrimOffset() trims to the line limit once the look-ahead size is exceeded', async function () {
		await testCompletionTrimming(dedent`
			function example() {
				âš// line 1
				// line 2
				// line 3âœ‚ï¸
				// line 4
				// line 5
				// line 6
				// line 7
				// line 8
				// line 9
				// line 10
				// line 11
		`);
	});

	test('.getCompletionTrimOffset() allows a single section to fill up to the look-ahead size if it is complete', async function () {
		await testCompletionTrimming(dedent`
			function example() {
				âšconst a = 1;
				const b = 2;
				const c = 3;
				const d = 4;
				const e = 5;
				const f = 6;âœ‚ï¸
				while (true) {
		`);
	});

	test('.getCompletionTrimOffset() supports Python', async function () {
		await testCompletionTrimming(
			dedent`
			def reverse_find(haystack, needle):
				âšresult = []
				i = 0âœ‚ï¸
				while i < len(haystack):
				`,
			'python'
		);
	});

	test('.getCompletionTrimOffset() trims to a containing block in Python', async function () {
		await testCompletionTrimming(
			dedent`
			def example(a, b):
				if a > b:
					âšc = a - b
					return câœ‚ï¸
				else:
			`,
			'python'
		);
	});

	test('.getCompletionTrimOffset() supports Go', async function () {
		await testCompletionTrimming(
			dedent`
			package main

			func reverseFind(haystack []int, needle int) int {
				âšresult := []int{}
				i := 0âœ‚ï¸
				for i < len(haystack) {
					if haystack[i] == needle {
						return i
				`,
			'go'
		);
	});

	test('.getCompletionTrimOffset() supports PHP', async function () {
		await testCompletionTrimming(
			dedent`
			<?php
			function reverse_find($haystack, $needle) {
				âš$search = array_reverse($haystack, true);âœ‚ï¸
				foreach ($search as $index => $item) {
					if ($item === $needle) {
						return $index;
					}
				}
				`,
			'php'
		);
	});

	test('.getCompletionTrimOffset() supports Ruby', async function () {
		await testCompletionTrimming(
			dedent`
			def reverse_find(haystack, needle)
				âšlen = haystack.length
				i = len - 1âœ‚ï¸
				while i >= 0 do
					return i if haystack[i] == needle
					i -= 1
				end
				`,
			'ruby'
		);
	});

	test('.getCompletionTrimOffset() supports Java', async function () {
		await testCompletionTrimming(
			dedent`
			public class Main {
				public static int reverseFind(int[] haystack, int needle) {
					âšint end = haystack.length - 1;âœ‚ï¸
					for (int i = end; i >= 0; i--) {
						if (haystack[i] == needle) {
							return i;
						}
					}
				`,
			'java'
		);
	});

	test('.getCompletionTrimOffset() supports C#', async function () {
		await testCompletionTrimming(
			dedent`
			class Program {
				static int ReverseFind(int[] haystack, int needle) {
					âšint end = haystack.Length - 1;âœ‚ï¸
					for (int i = end; i >= 0; i--) {
						if (haystack[i] == needle) {
							return i;
						}
					}
				`,
			'csharp'
		);
	});

	test('.getCompletionTrimOffset() supports C', async function () {
		await testCompletionTrimming(
			dedent`
			#include <stdio.h>

			int reverse_find(int haystack[], int needle, int size) {
				âšint i = size - 1;âœ‚ï¸
				while (i >= 0) {
					if (haystack[i] == needle) {
						return i;
					}
					i--;
				}
				`,
			'c'
		);
	});

	test('.getCompletionTrimOffset() supports C++', async function () {
		await testCompletionTrimming(
			dedent`
			#include <iostream>
			using namespace std;

			template <typename T>
			class ReverseFind {
			public:
				static int find(T haystack[], T needle, int size) {
					âšint i = size - 1;âœ‚ï¸
					while (i >= 0) {
						if (haystack[i] == needle) {
							return i;
						}
						i--;
					}
				}
			};
			`,
			'cpp'
		);
	});

});

async function testCompletionTrimming(
	textWithCompletion: string,
	languageId = 'typescript'
): Promise<void> {
	const cursorMarker = 'âš';
	const trimMarker = 'âœ‚ï¸';
	const cursorPos = textWithCompletion.indexOf(cursorMarker);
	const trimPos = textWithCompletion.indexOf(trimMarker);
	const prefix = textWithCompletion.substring(0, cursorPos);
	const trimmed = textWithCompletion.substring(cursorPos + cursorMarker.length, trimPos === -1 ? undefined : trimPos);
	const completion = trimmed + (trimPos === -1 ? '' : textWithCompletion.substring(trimPos + trimMarker.length));
	const expectedOffset = trimPos === -1 ? undefined : trimmed.length;
	const trimmer = new TerseBlockTrimmer(languageId, prefix, completion);

	const actualOffset = await trimmer.getCompletionTrimOffset();

	assert.strictEqual(
		actualOffset,
		expectedOffset,
		dedent`
			Expected an offset of ${expectedOffset} but got ${actualOffset}
			${trimmed === completion.substring(0, actualOffset) ? 'true' : 'false'}

			expected completion:
				${JSON.stringify(completion.substring(0, expectedOffset))}

			actual completion:
				${JSON.stringify(completion.substring(0, actualOffset))}
		`
	);
}

suite('getBlockPositionType()', function () {
	test('empty document returns NonBlock', async function () {
		await testPositionType(BlockPositionType.NonBlock, 'âš');
	});

	test('on a simple expression returns NonBlock', async function () {
		await testPositionType(BlockPositionType.NonBlock, 'âšconst x = 1;');
	});

	test('with an empty block returns EmptyBlock', async function () {
		await testPositionType(BlockPositionType.EmptyBlock, 'while (true) { âš }');
		await testPositionType(BlockPositionType.EmptyBlock, 'function example() { âš }');
	});

	test('at the end of a non-empty block returns BlockEnd', async function () {
		await testPositionType(BlockPositionType.BlockEnd, 'while (true) { x += 1; âš }');
	});

	test('mid-statement at the end of a non-empty block returns BlockEnd', async function () {
		await testPositionType(BlockPositionType.BlockEnd, 'while (true) { x += 1âš; }');
	});

	test('between statements within a block returns MidBlock', async function () {
		await testPositionType(BlockPositionType.MidBlock, 'while (true) { last = x; âš x += 1; }');
	});

	test('on a statement before the last within a block returns MidBlock', async function () {
		await testPositionType(BlockPositionType.MidBlock, 'while (true) { last = xâš; x += 1; }');
	});

	test('on a multi-line simple statement within a block before the last line returns MidBlock', async function () {
		await testPositionType(
			BlockPositionType.MidBlock,
			dedent`
			if (true) {
				someFunction(
					arg1,
					arg2,
					âš
					arg3
				);
			}
			`
		);
	});

	test('on a multi-line simple statement within a block on the last line returns BlockEnd', async function () {
		await testPositionType(
			BlockPositionType.BlockEnd,
			dedent`
			if (true) {
				someFunction(
					arg1,
					arg2,
					arg3
				âš);
			}
			`
		);
	});

	// confirm single-line if statement behavior in JS given the special treatment by StatementTree:
	test('inside an empty block of a single-line if statement in JS returns EmptyBlock', async function () {
		await testPositionType(BlockPositionType.EmptyBlock, 'if (true) { âš }');
	});

	test('supports Python', async function () {
		await testPositionType(
			BlockPositionType.MidBlock,
			dedent`
				def example():
					âš
					pass
			`,
			'python'
		);
	});

	test('supports Go', async function () {
		await testPositionType(
			BlockPositionType.EmptyBlock,
			dedent`
				package main

				func main() {
					âš
				}
			`,
			'go'
		);
	});

	test('supports PHP', async function () {
		await testPositionType(
			BlockPositionType.EmptyBlock,
			dedent`
				<?php
				function main() {
					âš
				}
			`,
			'php'
		);
	});

	test('supports Ruby', async function () {
		await testPositionType(
			BlockPositionType.EmptyBlock,
			dedent`
				def main
					âš
				end
			`,
			'ruby'
		);
	});

	test('supports Java', async function () {
		await testPositionType(
			BlockPositionType.EmptyBlock,
			dedent`
				public class Main {
					public static void main(String[] args) {
						âš
					}
				}
			`,
			'java'
		);
	});

	test('supports C#', async function () {
		await testPositionType(
			BlockPositionType.EmptyBlock,
			dedent`
				class Program
				{
					static void Main(string[] args) {
						âš
					}
				}
			`,
			'csharp'
		);
	});

	test('supports C', async function () {
		await testPositionType(
			BlockPositionType.EmptyBlock,
			dedent`
				#include <iostream>

				int main() {
					âš
				}
			`,
			'cpp'
		);
	});

	test('supports C++', async function () {
		await testPositionType(
			BlockPositionType.EmptyBlock,
			dedent`
				#include <iostream>

				class Main {
					âš
				}
			`,
			'cpp'
		);
	});

	async function testPositionType(
		expectedType: BlockPositionType,
		textWithCursor: string,
		languageId = 'typescript'
	): Promise<void> {
		const cursorMarker = 'âš';
		const cursorPos = textWithCursor.indexOf(cursorMarker);
		const prefix = textWithCursor.substring(0, cursorPos);
		const suffix = textWithCursor.substring(cursorPos + cursorMarker.length);
		const doc = createTextDocument('file:///test.ts', languageId, 0, prefix + suffix);
		const pos = doc.positionAt(cursorPos);

		const actualType = await getBlockPositionType(doc, pos);

		assert.strictEqual(actualType, expectedType);
	}
});
