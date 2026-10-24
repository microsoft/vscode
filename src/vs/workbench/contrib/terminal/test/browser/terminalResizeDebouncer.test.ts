/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TerminalResizeDebouncer } from '../../browser/terminalResizeDebouncer.js';

suite('TerminalResizeDebouncer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resizes immediately when buffer is under threshold', async () => {
		let bothCols = 0;
		let bothRows = 0;

		const mockXterm: any = {
			raw: {
				buffer: {
					normal: { length: 50 }
				},
				element: {}
			}
		};

		const debouncer = store.add(new TerminalResizeDebouncer(
			() => true,
			() => mockXterm,
			(cols, rows) => { bothCols = cols; bothRows = rows; },
			() => { },
			() => { }
		));

		debouncer.resize(100, 30, false);
		strictEqual(bothCols, 100);
		strictEqual(bothRows, 30);
	});

	test('flush resizes both dimensions atomically', async () => {
		let bothCols = 0;
		let bothRows = 0;

		const mockXterm: any = {
			raw: {
				buffer: {
					normal: { length: 500 }
				},
				element: {}
			}
		};

		const debouncer = store.add(new TerminalResizeDebouncer(
			() => true,
			() => mockXterm,
			(cols, rows) => { bothCols = cols; bothRows = rows; },
			() => { },
			() => { }
		));

		debouncer.resize(120, 40, false);
		debouncer.flush();

		strictEqual(bothCols, 120);
		strictEqual(bothRows, 40);
	});
});
