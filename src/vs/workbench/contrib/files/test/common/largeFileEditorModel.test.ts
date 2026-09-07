/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { LargeFileEditorModel, LargeFileStreamReader } from '../../common/largeFileEditorModel.js';

suite('LargeFileEditorModel', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reads a stream in bounded pages', async () => {
		const stream = newWriteableStream<string>(strings => strings.join(''));
		const reader = store.add(new LargeFileStreamReader(stream));

		const firstPagePromise = reader.readPage(4);
		stream.write('abcdef');
		stream.end();

		const firstPage = await firstPagePromise;
		const secondPage = await reader.readPage(4);

		assert.deepStrictEqual([firstPage, secondPage], [
			{ value: 'abcd', isLast: false },
			{ value: 'ef', isLast: true }
		]);
	});

	test('preserves surrogate pairs across page boundaries', async () => {
		const stream = newWriteableStream<string>(strings => strings.join(''));
		const reader = store.add(new LargeFileStreamReader(stream));

		const firstPagePromise = reader.readPage(4);
		stream.write('abc😀x');
		stream.write('YZ');
		stream.end();

		const pages = [await firstPagePromise];
		while (!pages.at(-1)!.isLast) {
			pages.push(await reader.readPage(4));
		}

		assert.deepStrictEqual({
			values: pages.map(page => page.value),
			combined: pages.map(page => page.value).join('')
		}, {
			values: ['abc', '😀xY', 'Z'],
			combined: 'abc😀xYZ'
		});
	});

	test('preserves CRLF across model page boundaries', async () => {
		const stream = newWriteableStream<string>(strings => strings.join(''));
		const reader = new LargeFileStreamReader(stream);

		const firstPagePromise = reader.readPage(3);
		stream.write('ab\r');
		stream.write('\ncd');
		stream.end();

		const firstPage = await firstPagePromise;
		const model = createTextModel(firstPage.value);
		const largeFileModel = store.add(new LargeFileEditorModel(model, reader, firstPage.isLast, 3, 10));
		while (!largeFileModel.isComplete) {
			await largeFileModel.loadMore();
		}

		assert.deepStrictEqual(model.getLinesContent(), ['ab', 'cd']);
	});

	test('keeps a bounded line window while loading', async () => {
		const stream = newWriteableStream<string>(strings => strings.join(''));
		const reader = store.add(new LargeFileStreamReader(stream));

		const firstPagePromise = reader.readPage(6);
		stream.write('1\n2\n3\n4\n5\n6\n');
		stream.end();

		const firstPage = await firstPagePromise;
		const model = createTextModel(firstPage.value);
		const largeFileModel = store.add(new LargeFileEditorModel(model, reader, firstPage.isLast, 4, 8));

		const firstLoad = await largeFileModel.loadMore();
		const secondLoad = await largeFileModel.loadMore();

		assert.deepStrictEqual({
			value: model.getValue(),
			baseLineNumber: largeFileModel.baseLineNumber,
			firstLoad,
			secondLoad
		}, {
			value: '3\n4\n5\n6\n',
			baseLineNumber: 3,
			firstLoad: { removedLineCount: 1, isComplete: false, stoppedAtLongLine: false },
			secondLoad: { removedLineCount: 1, isComplete: true, stoppedAtLongLine: false }
		});
	});

	test('stops before an oversized line makes the window unbounded', async () => {
		let destroyCount = 0;
		const stream = newWriteableStream<string>(strings => strings.join(''), { onDidDestroy: () => destroyCount++ });
		const reader = store.add(new LargeFileStreamReader(stream));

		const firstPagePromise = reader.readPage(4);
		stream.write('abcdefgh');
		stream.end();

		const firstPage = await firstPagePromise;
		const model = createTextModel(firstPage.value);
		const largeFileModel = store.add(new LargeFileEditorModel(model, reader, firstPage.isLast, 4, 6));
		const result = await largeFileModel.loadMore();

		assert.deepStrictEqual({
			value: model.getValue(),
			baseLineNumber: largeFileModel.baseLineNumber,
			destroyCount,
			result
		}, {
			value: 'abcdefgh',
			baseLineNumber: 1,
			destroyCount: 1,
			result: { removedLineCount: 0, isComplete: true, stoppedAtLongLine: true }
		});
	});
});
