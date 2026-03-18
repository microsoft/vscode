/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import type { IMarker as IXtermMarker } from '@xterm/xterm';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { getOutput } from '../../browser/outputHelpers.js';
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
});
