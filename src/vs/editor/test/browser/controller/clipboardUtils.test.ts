/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createClipboardPasteEvent } from '../../../browser/controller/editContext/clipboardUtils.js';

suite('ClipboardUtils', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('pasting files copied in a file manager generates text from their paths, falling back to their names', () => {
		// Chromium only exposes the files in this case and withholds the clipboard text
		const files = [
			new File(['hello'], 'example.txt', { type: 'text/plain' }),
			new File(['# hi'], 'notes #1.md', { type: 'text/markdown' }),
		];
		const paths = new Map([
			['example.txt', '/home/john/Downloads/example.txt'],
			['notes #1.md', '/home/john/Downloads/my folder/notes #1.md'],
		]);

		function paste(getFilePath?: (file: File) => string | undefined) {
			const clipboardData = new DataTransfer();
			for (const file of files) {
				clipboardData.items.add(file);
			}
			const event = createClipboardPasteEvent(new ClipboardEvent('paste', { clipboardData }), getFilePath);
			return { text: event.text, metadata: event.metadata };
		}

		assert.deepStrictEqual({
			filesWithPaths: paste(file => paths.get(file.name)),
			filesWithoutPaths: paste(() => undefined),
			inMemoryFiles: paste(),
		}, {
			filesWithPaths: { text: '/home/john/Downloads/example.txt\n/home/john/Downloads/my folder/notes #1.md', metadata: null },
			filesWithoutPaths: { text: 'example.txt\nnotes #1.md', metadata: null },
			inMemoryFiles: { text: 'example.txt\nnotes #1.md', metadata: null },
		});
	});
});
