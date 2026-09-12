/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TerminalInputBuffer } from '../../node/terminalInputBuffer.js';

suite('TerminalInputBuffer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('throttles multiline input while preserving bytes and order', async () => {
		const writes: (string | Buffer)[] = [];
		const allWritesComplete = new DeferredPromise<void>();
		const inputBuffer = store.add(new TerminalInputBuffer(data => {
			writes.push(data);
			if (writes.length === 4) {
				allWritesComplete.complete();
			}
		}, true));
		const multilineInput = `line\r${'x'.repeat(250)}😀${'x'.repeat(350)}`;

		inputBuffer.write(multilineInput);
		const initialWriteCount = writes.length;
		inputBuffer.write('after');
		await allWritesComplete.p;

		deepStrictEqual({
			initialWriteCount,
			writeSizes: writes.map(data => Buffer.byteLength(data)),
			data: Buffer.concat(writes.map(data => Buffer.from(data))).toString(),
		}, {
			initialWriteCount: 1,
			writeSizes: [256, 256, 97, 5],
			data: `${multilineInput}after`,
		});
	});

	test('does not throttle single line, binary, or bracketed paste input', () => {
		const writes: (string | Buffer)[] = [];
		const inputBuffer = store.add(new TerminalInputBuffer(data => writes.push(data), true));
		const singleLineInput = 'x'.repeat(600);
		const binaryInput = Buffer.from(`line\r${'x'.repeat(600)}`);
		const bracketedPasteInput = `\x1b[200~line\r${'x'.repeat(600)}\x1b[201~`;

		inputBuffer.write(singleLineInput);
		inputBuffer.write(binaryInput);
		inputBuffer.write(bracketedPasteInput);

		deepStrictEqual(writes, [singleLineInput, binaryInput, bracketedPasteInput]);
	});
});
