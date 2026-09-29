/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Position } from '../../../common/core/position.js';
import { IRange, Range } from '../../../common/core/range.js';
import { TextEdit } from '../../../common/languages.js';
import { EditorWorker } from '../../../common/services/editorWebWorker.js';
import { ICommonModel } from '../../../common/services/textModelSync/textModelSync.impl.js';

suite('EditorWebWorker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	class WorkerWithModels extends EditorWorker {

		getModel(uri: string) {
			return this._getModel(uri);
		}

		addModel(lines: string[], eol: string = '\n') {
			const uri = 'test:file#' + Date.now();
			this.$acceptNewModel({
				url: uri,
				versionId: 1,
				lines: lines,
				EOL: eol
			});
			return this._getModel(uri)!;
		}
	}

	let worker: WorkerWithModels;
	let model: ICommonModel;

	setup(() => {
		worker = new WorkerWithModels();
		model = worker.addModel([
			'This is line one', //16
			'and this is line number two', //27
			'it is followed by #3', //20
			'and finished with the fourth.', //29
		]);
	});

	function assertPositionAt(offset: number, line: number, column: number) {
		const position = model.positionAt(offset);
		assert.strictEqual(position.lineNumber, line);
		assert.strictEqual(position.column, column);
	}

	function assertOffsetAt(lineNumber: number, column: number, offset: number) {
		const actual = model.offsetAt({ lineNumber, column });
		assert.strictEqual(actual, offset);
	}

	test('ICommonModel#offsetAt', () => {
		assertOffsetAt(1, 1, 0);
		assertOffsetAt(1, 2, 1);
		assertOffsetAt(1, 17, 16);
		assertOffsetAt(2, 1, 17);
		assertOffsetAt(2, 4, 20);
		assertOffsetAt(3, 1, 45);
		assertOffsetAt(5, 30, 95);
		assertOffsetAt(5, 31, 95);
		assertOffsetAt(5, Number.MAX_VALUE, 95);
		assertOffsetAt(6, 30, 95);
		assertOffsetAt(Number.MAX_VALUE, 30, 95);
		assertOffsetAt(Number.MAX_VALUE, Number.MAX_VALUE, 95);
	});

	test('ICommonModel#positionAt', () => {
		assertPositionAt(0, 1, 1);
		assertPositionAt(Number.MIN_VALUE, 1, 1);
		assertPositionAt(1, 1, 2);
		assertPositionAt(16, 1, 17);
		assertPositionAt(17, 2, 1);
		assertPositionAt(20, 2, 4);
		assertPositionAt(45, 3, 1);
		assertPositionAt(95, 4, 30);
		assertPositionAt(96, 4, 30);
		assertPositionAt(99, 4, 30);
		assertPositionAt(Number.MAX_VALUE, 4, 30);
	});

	test('ICommonModel#validatePosition, issue #15882', function () {
		const model = worker.addModel(['{"id": "0001","type": "donut","name": "Cake","image":{"url": "images/0001.jpg","width": 200,"height": 200},"thumbnail":{"url": "images/thumbnails/0001.jpg","width": 32,"height": 32}}']);
		assert.strictEqual(model.offsetAt({ lineNumber: 1, column: 2 }), 1);
	});

	test('MoreMinimal', () => {

		return worker.$computeMoreMinimalEdits(model.uri.toString(), [{ text: 'This is line One', range: new Range(1, 1, 1, 17) }], false).then(edits => {
			assert.strictEqual(edits.length, 1);
			const [first] = edits;
			assert.strictEqual(first.text, 'O');
			assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 15 });
		});
	});

	test('MoreMinimal, merge adjacent edits', async function () {

		const model = worker.addModel([
			'one',
			'two',
			'three',
			'four',
			'five'
		], '\n');


		const newEdits = await worker.$computeMoreMinimalEdits(model.uri.toString(), [
			{
				range: new Range(1, 1, 2, 1),
				text: 'one\ntwo\nthree\n',
			}, {
				range: new Range(2, 1, 3, 1),
				text: '',
			}, {
				range: new Range(3, 1, 4, 1),
				text: '',
			}, {
				range: new Range(4, 2, 4, 3),
				text: '4',
			}, {
				range: new Range(5, 3, 5, 5),
				text: '5',
			}
		], false);

		assert.strictEqual(newEdits.length, 2);
		assert.strictEqual(newEdits[0].text, '4');
		assert.strictEqual(newEdits[1].text, '5');
	});

	test('MoreMinimal, issue #15385 newline changes only', function () {

		const model = worker.addModel([
			'{',
			'\t"a":1',
			'}'
		], '\n');

		return worker.$computeMoreMinimalEdits(model.uri.toString(), [{ text: '{\r\n\t"a":1\r\n}', range: new Range(1, 1, 3, 2) }], false).then(edits => {
			assert.strictEqual(edits.length, 0);
		});
	});

	test('MoreMinimal, issue #15385 newline changes and other', function () {

		const model = worker.addModel([
			'{',
			'\t"a":1',
			'}'
		], '\n');

		return worker.$computeMoreMinimalEdits(model.uri.toString(), [{ text: '{\r\n\t"b":1\r\n}', range: new Range(1, 1, 3, 2) }], false).then(edits => {
			assert.strictEqual(edits.length, 1);
			const [first] = edits;
			assert.strictEqual(first.text, 'b');
			assert.deepStrictEqual(first.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 2, endColumn: 4 });
		});
	});

	test('MoreMinimal, issue #15385 newline changes and other 2/2', function () {

		const model = worker.addModel([
			'package main',	// 1
			'func foo() {',	// 2
			'}'				// 3
		]);

		return worker.$computeMoreMinimalEdits(model.uri.toString(), [{ text: '\n', range: new Range(3, 2, 4, 1000) }], false).then(edits => {
			assert.strictEqual(edits.length, 1);
			const [first] = edits;
			assert.strictEqual(first.text, '\n');
			assert.deepStrictEqual(first.range, { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 2 });
		});
	});

	async function testEdits(lines: string[], edits: TextEdit[]): Promise<unknown> {
		const model = worker.addModel(lines);

		const smallerEdits = await worker.$computeHumanReadableDiff(
			model.uri.toString(),
			edits,
			{ ignoreTrimWhitespace: false, maxComputationTimeMs: 0, computeMoves: false }
		);

		const t1 = applyEdits(model.getValue(), edits);
		const t2 = applyEdits(model.getValue(), smallerEdits);
		assert.deepStrictEqual(t1, t2);

		return smallerEdits.map(e => ({ range: Range.lift(e.range).toString(), text: e.text }));
	}


	test('computeHumanReadableDiff 1', async () => {
		assert.deepStrictEqual(
			await testEdits(
				[
					'function test() {}'
				],
				[{
					text: '\n/** Some Comment */\n',
					range: new Range(1, 1, 1, 1)
				}]),
			([{ range: '[1,1 -> 1,1]', text: '\n/** Some Comment */\n' }])
		);
	});

	test('computeHumanReadableDiff 2', async () => {
		assert.deepStrictEqual(
			await testEdits(
				[
					'function test() {}'
				],
				[{
					text: 'function test(myParam: number) { console.log(myParam); }',
					range: new Range(1, 1, 1, Number.MAX_SAFE_INTEGER)
				}]),
			([{ range: '[1,15 -> 1,15]', text: 'myParam: number' }, { range: '[1,18 -> 1,18]', text: ' console.log(myParam); ' }])
		);
	});

	test('computeHumanReadableDiff 3', async () => {
		assert.deepStrictEqual(
			await testEdits(
				[
					'',
					'',
					'',
					''
				],
				[{
					text: 'function test(myParam: number) { console.log(myParam); }\n\n',
					range: new Range(2, 1, 3, 20)
				}]),
			([{ range: '[2,1 -> 2,1]', text: 'function test(myParam: number) { console.log(myParam); }\n' }])
		);
	});

	test('computeHumanReadableDiff 4', async () => {
		assert.deepStrictEqual(
			await testEdits(
				[
					'function algorithm() {}',
				],
				[{
					text: 'function alm() {}',
					range: new Range(1, 1, 1, Number.MAX_SAFE_INTEGER)
				}]),
			([{ range: '[1,10 -> 1,19]', text: 'alm' }])
		);
	});

	test('[Bug] Getting Message "Overlapping ranges are not allowed" and nothing happens with Inline-Chat ', async function () {
		await testEdits(('const API = require(\'../src/api\');\n\ndescribe(\'API\', () => {\n  let api;\n  let database;\n\n  beforeAll(() => {\n    database = {\n      getAllBooks: jest.fn(),\n      getBooksByAuthor: jest.fn(),\n      getBooksByTitle: jest.fn(),\n    };\n    api = new API(database);\n  });\n\n  describe(\'GET /books\', () => {\n    it(\'should return all books\', async () => {\n      const mockBooks = [{ title: \'Book 1\' }, { title: \'Book 2\' }];\n      database.getAllBooks.mockResolvedValue(mockBooks);\n\n      const req = {};\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === \'/books\') {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getAllBooks).toHaveBeenCalled();\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n\n  describe(\'GET /books/author/:author\', () => {\n    it(\'should return books by author\', async () => {\n      const mockAuthor = \'John Doe\';\n      const mockBooks = [{ title: \'Book 1\', author: mockAuthor }, { title: \'Book 2\', author: mockAuthor }];\n      database.getBooksByAuthor.mockResolvedValue(mockBooks);\n\n      const req = {\n        params: {\n          author: mockAuthor,\n        },\n      };\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === `/books/author/${mockAuthor}`) {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n\n  describe(\'GET /books/title/:title\', () => {\n    it(\'should return books by title\', async () => {\n      const mockTitle = \'Book 1\';\n      const mockBooks = [{ title: mockTitle, author: \'John Doe\' }];\n      database.getBooksByTitle.mockResolvedValue(mockBooks);\n\n      const req = {\n        params: {\n          title: mockTitle,\n        },\n      };\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === `/books/title/${mockTitle}`) {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n});\n').split('\n'),
			[{
				range: { startLineNumber: 1, startColumn: 1, endLineNumber: 96, endColumn: 1 },
				text: `const request = require('supertest');\nconst API = require('../src/api');\n\ndescribe('API', () => {\n  let api;\n  let database;\n\n  beforeAll(() => {\n    database = {\n      getAllBooks: jest.fn(),\n      getBooksByAuthor: jest.fn(),\n      getBooksByTitle: jest.fn(),\n    };\n    api = new API(database);\n  });\n\n  describe('GET /books', () => {\n    it('should return all books', async () => {\n      const mockBooks = [{ title: 'Book 1' }, { title: 'Book 2' }];\n      database.getAllBooks.mockResolvedValue(mockBooks);\n\n      const response = await request(api.app).get('/books');\n\n      expect(database.getAllBooks).toHaveBeenCalled();\n      expect(response.status).toBe(200);\n      expect(response.body).toEqual(mockBooks);\n    });\n  });\n\n  describe('GET /books/author/:author', () => {\n    it('should return books by author', async () => {\n      const mockAuthor = 'John Doe';\n      const mockBooks = [{ title: 'Book 1', author: mockAuthor }, { title: 'Book 2', author: mockAuthor }];\n      database.getBooksByAuthor.mockResolvedValue(mockBooks);\n\n      const response = await request(api.app).get(\`/books/author/\${mockAuthor}\`);\n\n      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);\n      expect(response.status).toBe(200);\n      expect(response.body).toEqual(mockBooks);\n    });\n  });\n\n  describe('GET /books/title/:title', () => {\n    it('should return books by title', async () => {\n      const mockTitle = 'Book 1';\n      const mockBooks = [{ title: mockTitle, author: 'John Doe' }];\n      database.getBooksByTitle.mockResolvedValue(mockBooks);\n\n      const response = await request(api.app).get(\`/books/title/\${mockTitle}\`);\n\n      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);\n      expect(response.status).toBe(200);\n      expect(response.body).toEqual(mockBooks);\n    });\n  });\n});\n`,
			}]
		);
	});

	test('ICommonModel#getValueInRange, issue #17424', function () {

		const model = worker.addModel([
			'package main',	// 1
			'func foo() {',	// 2
			'}'				// 3
		]);

		const value = model.getValueInRange({ startLineNumber: 3, startColumn: 1, endLineNumber: 4, endColumn: 1 });
		assert.strictEqual(value, '}');
	});


	test('textualSuggest, issue #17785', function () {

		const model = worker.addModel([
			'foobar',	// 1
			'f f'	// 2
		]);

		return worker.$textualSuggest([model.uri.toString()], 'f', '[a-z]+', 'img').then((result) => {
			if (!result) {
				assert.ok(false);
			}
			assert.strictEqual(result.words.length, 1);
			assert.strictEqual(typeof result.duration, 'number');
			assert.strictEqual(result.words[0], 'foobar');
		});
	});

	test('get words via iterator, issue #46930', function () {

		const model = worker.addModel([
			'one line',	// 1
			'two line',	// 2
			'',
			'past empty',
			'single',
			'',
			'and now we are done'
		]);

		const words: string[] = [...model.words(/[a-z]+/img)];

		assert.deepStrictEqual(words, ['one', 'line', 'two', 'line', 'past', 'empty', 'single', 'and', 'now', 'we', 'are', 'done']);
	});
});

function applyEdits(text: string, edits: { range: IRange; text: string }[]): string {
	const transformer = new PositionOffsetTransformer(text);
	const offsetEdits = edits.map(e => {
		const range = Range.lift(e.range);
		return ({
			startOffset: transformer.getOffset(range.getStartPosition()),
			endOffset: transformer.getOffset(range.getEndPosition()),
			text: e.text
		});
	});

	offsetEdits.sort((a, b) => b.startOffset - a.startOffset);

	for (const edit of offsetEdits) {
		text = text.substring(0, edit.startOffset) + edit.text + text.substring(edit.endOffset);
	}

	return text;
}

class PositionOffsetTransformer {
	private readonly lineStartOffsetByLineIdx: number[];

	constructor(private readonly text: string) {
		this.lineStartOffsetByLineIdx = [];
		this.lineStartOffsetByLineIdx.push(0);
		for (let i = 0; i < text.length; i++) {
			if (text.charAt(i) === '\n') {
				this.lineStartOffsetByLineIdx.push(i + 1);
			}
		}
		this.lineStartOffsetByLineIdx.push(text.length + 1);
	}

	getOffset(position: Position): number {
		const maxLineOffset = position.lineNumber >= this.lineStartOffsetByLineIdx.length ? this.text.length : (this.lineStartOffsetByLineIdx[position.lineNumber] - 1);
		return Math.min(this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1, maxLineOffset);
	}
}
