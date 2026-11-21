/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { CellKind, CellUri, compressOutputItemStreams, diff, MimeTypeDisplayOrder, NotebookWorkingCopyTypeIdentifier } from '../../common/notebookCommon.js';
import { cellIndexesToRanges, cellRangesToIndexes, reduceCellRanges } from '../../common/notebookRange.js';
import { setupInstantiationService, TestCell } from './testNotebookEditor.js';

suite('Notebook stream compression', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const cases: [input: string, expected: string, didCompression: boolean][] = [
		['', '', false],
		['plain\ntext', 'plain\ntext', false],
		['abcdef\rxy', 'xycdef', true],
		['abcdef\rxy\rz', 'zycdef', true],
		['xy\rlonger\rz', 'zonger', true],
		['abc\r', 'abc\r', false],
		['abc\r\r', 'abc', true],
		['abc\r\r\r', 'abc', true],
		['abcdef\rxy\r', 'xycdef\r', true],
		['abc\r\n', 'abc\n', true],
		['abc\r\r\n', 'abc\n', true],
		['abc\rx\ndef\ry', 'xbc\nyef', true],
		['abc\u2028def\rx\u2029ghi\ry', 'abc\u2028xef\u2029yhi', true],
		['\u6f22\u5b57\rX', 'X\u5b57', true],
		['\ud83d\ude00xyz\rA', 'A\ufffdxyz', true],
		['abc\b\bX\rY', 'YX', true],
		['a\n\b', 'a\n\b', false],
		['abc\r\bX', 'abcX', true],
		['$$\r\r', '$', true],
		['abc\r$xy', 'abc\r$xy', false],
		['abc\r$xy\nq\rr', '$xy\nr', true],
		['price $5\nabcdef\rxy', 'price $5\nxycdef', true],
	];

	test('preserves overwrite, line-ending, backspace, Unicode and dollar semantics', () => {
		assert.deepStrictEqual(cases.map(([input]) => {
			const result = compressOutputItemStreams([VSBuffer.fromString(input).buffer]);
			return { text: result.data.toString(), didCompression: result.didCompression };
		}), cases.map(([, text, didCompression]) => ({ text, didCompression })));
	});

	test('preserves normalization when input is split across byte buffers', () => {
		for (const [input, text, didCompression] of cases) {
			const bytes = VSBuffer.fromString(input).buffer;
			const results = Array.from({ length: bytes.length + 1 }, (_, index) => {
				const result = compressOutputItemStreams([bytes.subarray(0, index), bytes.subarray(index)]);
				return { text: result.data.toString(), didCompression: result.didCompression };
			});
			assert.deepStrictEqual(results, results.map(() => ({ text, didCompression })), JSON.stringify(input));
		}
	});

	test('combines thousands of carriage-return segments on one line', () => {
		const input = `abcdefghijklmnop${'\r01234567\rxy\rz'.repeat(4000)}\n`;
		const result = compressOutputItemStreams([VSBuffer.fromString(input).buffer]);
		assert.deepStrictEqual({ text: result.data.toString(), didCompression: result.didCompression }, {
			text: 'zy234567ijklmnop\n',
			didCompression: true,
		});
	});
});

suite('NotebookCommon', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;
	let instantiationService: TestInstantiationService;
	let languageService: ILanguageService;

	setup(() => {
		disposables = new DisposableStore();
		instantiationService = setupInstantiationService(disposables);
		languageService = instantiationService.get(ILanguageService);
	});

	test('sortMimeTypes default orders', function () {
		assert.deepStrictEqual(new MimeTypeDisplayOrder().sort(
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				Mimes.latex,
				Mimes.markdown,
				'image/png',
				'image/jpeg',
				Mimes.text
			]),
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				Mimes.latex,
				Mimes.markdown,
				'image/png',
				'image/jpeg',
				Mimes.text
			]
		);

		assert.deepStrictEqual(new MimeTypeDisplayOrder().sort(
			[
				'application/json',
				Mimes.latex,
				Mimes.markdown,
				'application/javascript',
				'text/html',
				Mimes.text,
				'image/png',
				'image/jpeg',
				'image/svg+xml'
			]),
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				Mimes.latex,
				Mimes.markdown,
				'image/png',
				'image/jpeg',
				Mimes.text
			]
		);

		assert.deepStrictEqual(new MimeTypeDisplayOrder().sort(
			[
				Mimes.markdown,
				'application/json',
				Mimes.text,
				'image/jpeg',
				'application/javascript',
				'text/html',
				'image/png',
				'image/svg+xml'
			]),
			[
				'application/json',
				'application/javascript',
				'text/html',
				'image/svg+xml',
				Mimes.markdown,
				'image/png',
				'image/jpeg',
				Mimes.text
			]
		);

		disposables.dispose();
	});



	test('sortMimeTypes user orders', function () {
		assert.deepStrictEqual(
			new MimeTypeDisplayOrder([
				'image/png',
				Mimes.text,
				Mimes.markdown,
				'text/html',
				'application/json'
			]).sort(
				[
					'application/json',
					'application/javascript',
					'text/html',
					'image/svg+xml',
					Mimes.markdown,
					'image/png',
					'image/jpeg',
					Mimes.text
				]
			),
			[
				'image/png',
				Mimes.text,
				Mimes.markdown,
				'text/html',
				'application/json',
				'application/javascript',
				'image/svg+xml',
				'image/jpeg',
			]
		);

		assert.deepStrictEqual(
			new MimeTypeDisplayOrder([
				'application/json',
				'text/html',
				'text/html',
				Mimes.markdown,
				'application/json'
			]).sort([
				Mimes.markdown,
				'application/json',
				Mimes.text,
				'application/javascript',
				'text/html',
				'image/svg+xml',
				'image/jpeg',
				'image/png'
			]),
			[
				'application/json',
				'text/html',
				Mimes.markdown,
				'application/javascript',
				'image/svg+xml',
				'image/png',
				'image/jpeg',
				Mimes.text
			]
		);

		disposables.dispose();
	});

	test('prioritizes mimetypes', () => {
		const m = new MimeTypeDisplayOrder([
			Mimes.markdown,
			'text/html',
			'application/json'
		]);
		assert.deepStrictEqual(m.toArray(), [Mimes.markdown, 'text/html', 'application/json']);

		// no-op if already in the right order
		m.prioritize('text/html', ['application/json']);
		assert.deepStrictEqual(m.toArray(), [Mimes.markdown, 'text/html', 'application/json']);

		// sorts to highest priority
		m.prioritize('text/html', ['application/json', Mimes.markdown]);
		assert.deepStrictEqual(m.toArray(), ['text/html', Mimes.markdown, 'application/json']);

		// adds in new type
		m.prioritize('text/plain', ['application/json', Mimes.markdown]);
		assert.deepStrictEqual(m.toArray(), ['text/plain', 'text/html', Mimes.markdown, 'application/json']);

		// moves multiple, preserves order
		m.prioritize(Mimes.markdown, ['text/plain', 'application/json', Mimes.markdown]);
		assert.deepStrictEqual(m.toArray(), ['text/html', Mimes.markdown, 'text/plain', 'application/json']);

		// deletes multiple
		m.prioritize('text/plain', ['text/plain', 'text/html', Mimes.markdown]);
		assert.deepStrictEqual(m.toArray(), ['text/plain', 'text/html', Mimes.markdown, 'application/json']);

		// handles multiple mimetypes, unknown mimetype
		const m2 = new MimeTypeDisplayOrder(['a', 'b']);
		m2.prioritize('b', ['a', 'b', 'a', 'q']);
		assert.deepStrictEqual(m2.toArray(), ['b', 'a']);

		disposables.dispose();
	});

	test('prioritizes mimetypes with 10+ entries (numeric index sort)', () => {
		// Regression for the case where `Array.from(uniqueIndices).sort()` did a
		// lexicographic sort on numeric indices, so `[2, 10]` became `[10, 2]`
		// and the reverse-splice loop removed the wrong entries.
		const mimes = Array.from({ length: 12 }, (_, i) => `type/${i}`);
		const m = new MimeTypeDisplayOrder(mimes);
		assert.deepStrictEqual(m.toArray(), mimes);

		m.prioritize('type/11', ['type/2', 'type/10']);
		assert.deepStrictEqual(m.toArray(), [
			'type/0', 'type/1', 'type/3', 'type/4', 'type/5',
			'type/6', 'type/7', 'type/8', 'type/9', 'type/11',
			'type/2', 'type/10',
		]);

		disposables.dispose();
	});

	test('sortMimeTypes glob', function () {
		assert.deepStrictEqual(
			new MimeTypeDisplayOrder([
				'application/vnd-vega*',
				Mimes.markdown,
				'text/html',
				'application/json'
			]).sort(
				[
					'application/json',
					'application/javascript',
					'text/html',
					'application/vnd-plot.json',
					'application/vnd-vega.json'
				]
			),
			[
				'application/vnd-vega.json',
				'text/html',
				'application/json',
				'application/vnd-plot.json',
				'application/javascript',
			],
			'glob *'
		);

		disposables.dispose();
	});

	test('diff cells', function () {
		const cells: TestCell[] = [];

		for (let i = 0; i < 5; i++) {
			cells.push(
				disposables.add(new TestCell('notebook', i, `var a = ${i};`, 'javascript', CellKind.Code, [], languageService))
			);
		}

		assert.deepStrictEqual(diff<TestCell>(cells, [], (cell) => {
			return cells.indexOf(cell) > -1;
		}), [
			{
				start: 0,
				deleteCount: 5,
				toInsert: []
			}
		]
		);

		assert.deepStrictEqual(diff<TestCell>([], cells, (cell) => {
			return false;
		}), [
			{
				start: 0,
				deleteCount: 0,
				toInsert: cells
			}
		]
		);

		const cellA = disposables.add(new TestCell('notebook', 6, 'var a = 6;', 'javascript', CellKind.Code, [], languageService));
		const cellB = disposables.add(new TestCell('notebook', 7, 'var a = 7;', 'javascript', CellKind.Code, [], languageService));

		const modifiedCells = [
			cells[0],
			cells[1],
			cellA,
			cells[3],
			cellB,
			cells[4]
		];

		const splices = diff<TestCell>(cells, modifiedCells, (cell) => {
			return cells.indexOf(cell) > -1;
		});

		assert.deepStrictEqual(splices,
			[
				{
					start: 2,
					deleteCount: 1,
					toInsert: [cellA]
				},
				{
					start: 4,
					deleteCount: 0,
					toInsert: [cellB]
				}
			]
		);

		disposables.dispose();
	});

});


suite('CellUri', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parse, generate (file-scheme)', function () {

		const nb = URI.parse('file:///bar/følder/file.nb');
		const id = 17;

		const data = CellUri.generate(nb, id);
		const actual = CellUri.parse(data);
		assert.ok(Boolean(actual));
		assert.strictEqual(actual?.handle, id);
		assert.strictEqual(actual?.notebook.toString(), nb.toString());
	});

	test('parse, generate (foo-scheme)', function () {

		const nb = URI.parse('foo:///bar/følder/file.nb');
		const id = 17;

		const data = CellUri.generate(nb, id);
		const actual = CellUri.parse(data);
		assert.ok(Boolean(actual));
		assert.strictEqual(actual?.handle, id);
		assert.strictEqual(actual?.notebook.toString(), nb.toString());
	});

	test('stable order', function () {

		const nb = URI.parse('foo:///bar/følder/file.nb');
		const handles = [1, 2, 9, 10, 88, 100, 666666, 7777777];

		const uris = handles.map(h => CellUri.generate(nb, h)).sort();

		const strUris = uris.map(String).sort();
		const parsedUris = strUris.map(s => URI.parse(s));

		const actual = parsedUris.map(u => CellUri.parse(u)?.handle);

		assert.deepStrictEqual(actual, handles);
	});
});


suite('CellRange', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Cell range to index', function () {
		assert.deepStrictEqual(cellRangesToIndexes([]), []);
		assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 0 }]), []);
		assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 1 }]), [0]);
		assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 2 }]), [0, 1]);
		assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 2 }, { start: 2, end: 3 }]), [0, 1, 2]);
		assert.deepStrictEqual(cellRangesToIndexes([{ start: 0, end: 2 }, { start: 3, end: 4 }]), [0, 1, 3]);
	});

	test('Cell index to range', function () {
		assert.deepStrictEqual(cellIndexesToRanges([]), []);
		assert.deepStrictEqual(cellIndexesToRanges([0]), [{ start: 0, end: 1 }]);
		assert.deepStrictEqual(cellIndexesToRanges([0, 1]), [{ start: 0, end: 2 }]);
		assert.deepStrictEqual(cellIndexesToRanges([0, 1, 2]), [{ start: 0, end: 3 }]);
		assert.deepStrictEqual(cellIndexesToRanges([0, 1, 3]), [{ start: 0, end: 2 }, { start: 3, end: 4 }]);

		assert.deepStrictEqual(cellIndexesToRanges([1, 0]), [{ start: 0, end: 2 }]);
		assert.deepStrictEqual(cellIndexesToRanges([1, 2, 0]), [{ start: 0, end: 3 }]);
		assert.deepStrictEqual(cellIndexesToRanges([3, 1, 0]), [{ start: 0, end: 2 }, { start: 3, end: 4 }]);

		assert.deepStrictEqual(cellIndexesToRanges([9, 10]), [{ start: 9, end: 11 }]);
		assert.deepStrictEqual(cellIndexesToRanges([10, 9]), [{ start: 9, end: 11 }]);
	});

	test('Reduce ranges', function () {
		assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 1 }, { start: 1, end: 2 }]), [{ start: 0, end: 2 }]);
		assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 2 }, { start: 1, end: 3 }]), [{ start: 0, end: 3 }]);
		assert.deepStrictEqual(reduceCellRanges([{ start: 1, end: 3 }, { start: 0, end: 2 }]), [{ start: 0, end: 3 }]);
		assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 2 }, { start: 4, end: 5 }]), [{ start: 0, end: 2 }, { start: 4, end: 5 }]);

		assert.deepStrictEqual(reduceCellRanges([
			{ start: 0, end: 1 },
			{ start: 1, end: 2 },
			{ start: 4, end: 6 }
		]), [
			{ start: 0, end: 2 },
			{ start: 4, end: 6 }
		]);

		assert.deepStrictEqual(reduceCellRanges([
			{ start: 0, end: 1 },
			{ start: 1, end: 3 },
			{ start: 3, end: 4 }
		]), [
			{ start: 0, end: 4 }
		]);
	});

	test('Reduce ranges 2, empty ranges', function () {
		assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 0 }, { start: 0, end: 0 }]), [{ start: 0, end: 0 }]);
		assert.deepStrictEqual(reduceCellRanges([{ start: 0, end: 0 }, { start: 1, end: 2 }]), [{ start: 1, end: 2 }]);
		assert.deepStrictEqual(reduceCellRanges([{ start: 2, end: 2 }]), [{ start: 2, end: 2 }]);
	});
});

suite('NotebookWorkingCopyTypeIdentifier', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('supports notebook type only', function () {
		const viewType = 'testViewType';
		const type = NotebookWorkingCopyTypeIdentifier.create(viewType);
		assert.deepEqual(NotebookWorkingCopyTypeIdentifier.parse(type), { notebookType: viewType, viewType });
		assert.strictEqual(NotebookWorkingCopyTypeIdentifier.parse('something'), undefined);
	});

	test('supports different viewtype', function () {
		const notebookType = { notebookType: 'testNotebookType', viewType: 'testViewType' };
		const type = NotebookWorkingCopyTypeIdentifier.create(notebookType.notebookType, notebookType.viewType);
		assert.deepEqual(NotebookWorkingCopyTypeIdentifier.parse(type), notebookType);
		assert.strictEqual(NotebookWorkingCopyTypeIdentifier.parse('something'), undefined);
	});
});
