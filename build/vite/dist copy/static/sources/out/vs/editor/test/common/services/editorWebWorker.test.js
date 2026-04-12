/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { Range } from '../../../common/core/range.js';
import { EditorWorker } from '../../../common/services/editorWebWorker.js';
suite('EditorWebWorker', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    class WorkerWithModels extends EditorWorker {
        getModel(uri) {
            return this._getModel(uri);
        }
        addModel(lines, eol = '\n') {
            const uri = 'test:file#' + Date.now();
            this.$acceptNewModel({
                url: uri,
                versionId: 1,
                lines: lines,
                EOL: eol
            });
            return this._getModel(uri);
        }
    }
    let worker;
    let model;
    setup(() => {
        worker = new WorkerWithModels();
        model = worker.addModel([
            'This is line one', //16
            'and this is line number two', //27
            'it is followed by #3', //20
            'and finished with the fourth.', //29
        ]);
    });
    function assertPositionAt(offset, line, column) {
        const position = model.positionAt(offset);
        assert.strictEqual(position.lineNumber, line);
        assert.strictEqual(position.column, column);
    }
    function assertOffsetAt(lineNumber, column, offset) {
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
            'package main', // 1
            'func foo() {', // 2
            '}' // 3
        ]);
        return worker.$computeMoreMinimalEdits(model.uri.toString(), [{ text: '\n', range: new Range(3, 2, 4, 1000) }], false).then(edits => {
            assert.strictEqual(edits.length, 1);
            const [first] = edits;
            assert.strictEqual(first.text, '\n');
            assert.deepStrictEqual(first.range, { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 2 });
        });
    });
    async function testEdits(lines, edits) {
        const model = worker.addModel(lines);
        const smallerEdits = await worker.$computeHumanReadableDiff(model.uri.toString(), edits, { ignoreTrimWhitespace: false, maxComputationTimeMs: 0, computeMoves: false });
        const t1 = applyEdits(model.getValue(), edits);
        const t2 = applyEdits(model.getValue(), smallerEdits);
        assert.deepStrictEqual(t1, t2);
        return smallerEdits.map(e => ({ range: Range.lift(e.range).toString(), text: e.text }));
    }
    test('computeHumanReadableDiff 1', async () => {
        assert.deepStrictEqual(await testEdits([
            'function test() {}'
        ], [{
                text: '\n/** Some Comment */\n',
                range: new Range(1, 1, 1, 1)
            }]), ([{ range: '[1,1 -> 1,1]', text: '\n/** Some Comment */\n' }]));
    });
    test('computeHumanReadableDiff 2', async () => {
        assert.deepStrictEqual(await testEdits([
            'function test() {}'
        ], [{
                text: 'function test(myParam: number) { console.log(myParam); }',
                range: new Range(1, 1, 1, Number.MAX_SAFE_INTEGER)
            }]), ([{ range: '[1,15 -> 1,15]', text: 'myParam: number' }, { range: '[1,18 -> 1,18]', text: ' console.log(myParam); ' }]));
    });
    test('computeHumanReadableDiff 3', async () => {
        assert.deepStrictEqual(await testEdits([
            '',
            '',
            '',
            ''
        ], [{
                text: 'function test(myParam: number) { console.log(myParam); }\n\n',
                range: new Range(2, 1, 3, 20)
            }]), ([{ range: '[2,1 -> 2,1]', text: 'function test(myParam: number) { console.log(myParam); }\n' }]));
    });
    test('computeHumanReadableDiff 4', async () => {
        assert.deepStrictEqual(await testEdits([
            'function algorithm() {}',
        ], [{
                text: 'function alm() {}',
                range: new Range(1, 1, 1, Number.MAX_SAFE_INTEGER)
            }]), ([{ range: '[1,10 -> 1,19]', text: 'alm' }]));
    });
    test('[Bug] Getting Message "Overlapping ranges are not allowed" and nothing happens with Inline-Chat ', async function () {
        await testEdits(('const API = require(\'../src/api\');\n\ndescribe(\'API\', () => {\n  let api;\n  let database;\n\n  beforeAll(() => {\n    database = {\n      getAllBooks: jest.fn(),\n      getBooksByAuthor: jest.fn(),\n      getBooksByTitle: jest.fn(),\n    };\n    api = new API(database);\n  });\n\n  describe(\'GET /books\', () => {\n    it(\'should return all books\', async () => {\n      const mockBooks = [{ title: \'Book 1\' }, { title: \'Book 2\' }];\n      database.getAllBooks.mockResolvedValue(mockBooks);\n\n      const req = {};\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === \'/books\') {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getAllBooks).toHaveBeenCalled();\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n\n  describe(\'GET /books/author/:author\', () => {\n    it(\'should return books by author\', async () => {\n      const mockAuthor = \'John Doe\';\n      const mockBooks = [{ title: \'Book 1\', author: mockAuthor }, { title: \'Book 2\', author: mockAuthor }];\n      database.getBooksByAuthor.mockResolvedValue(mockBooks);\n\n      const req = {\n        params: {\n          author: mockAuthor,\n        },\n      };\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === `/books/author/${mockAuthor}`) {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n\n  describe(\'GET /books/title/:title\', () => {\n    it(\'should return books by title\', async () => {\n      const mockTitle = \'Book 1\';\n      const mockBooks = [{ title: mockTitle, author: \'John Doe\' }];\n      database.getBooksByTitle.mockResolvedValue(mockBooks);\n\n      const req = {\n        params: {\n          title: mockTitle,\n        },\n      };\n      const res = {\n        json: jest.fn(),\n      };\n\n      await api.register({\n        get: (path, handler) => {\n          if (path === `/books/title/${mockTitle}`) {\n            handler(req, res);\n          }\n        },\n      });\n\n      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);\n      expect(res.json).toHaveBeenCalledWith(mockBooks);\n    });\n  });\n});\n').split('\n'), [{
                range: { startLineNumber: 1, startColumn: 1, endLineNumber: 96, endColumn: 1 },
                text: `const request = require('supertest');\nconst API = require('../src/api');\n\ndescribe('API', () => {\n  let api;\n  let database;\n\n  beforeAll(() => {\n    database = {\n      getAllBooks: jest.fn(),\n      getBooksByAuthor: jest.fn(),\n      getBooksByTitle: jest.fn(),\n    };\n    api = new API(database);\n  });\n\n  describe('GET /books', () => {\n    it('should return all books', async () => {\n      const mockBooks = [{ title: 'Book 1' }, { title: 'Book 2' }];\n      database.getAllBooks.mockResolvedValue(mockBooks);\n\n      const response = await request(api.app).get('/books');\n\n      expect(database.getAllBooks).toHaveBeenCalled();\n      expect(response.status).toBe(200);\n      expect(response.body).toEqual(mockBooks);\n    });\n  });\n\n  describe('GET /books/author/:author', () => {\n    it('should return books by author', async () => {\n      const mockAuthor = 'John Doe';\n      const mockBooks = [{ title: 'Book 1', author: mockAuthor }, { title: 'Book 2', author: mockAuthor }];\n      database.getBooksByAuthor.mockResolvedValue(mockBooks);\n\n      const response = await request(api.app).get(\`/books/author/\${mockAuthor}\`);\n\n      expect(database.getBooksByAuthor).toHaveBeenCalledWith(mockAuthor);\n      expect(response.status).toBe(200);\n      expect(response.body).toEqual(mockBooks);\n    });\n  });\n\n  describe('GET /books/title/:title', () => {\n    it('should return books by title', async () => {\n      const mockTitle = 'Book 1';\n      const mockBooks = [{ title: mockTitle, author: 'John Doe' }];\n      database.getBooksByTitle.mockResolvedValue(mockBooks);\n\n      const response = await request(api.app).get(\`/books/title/\${mockTitle}\`);\n\n      expect(database.getBooksByTitle).toHaveBeenCalledWith(mockTitle);\n      expect(response.status).toBe(200);\n      expect(response.body).toEqual(mockBooks);\n    });\n  });\n});\n`,
            }]);
    });
    test('ICommonModel#getValueInRange, issue #17424', function () {
        const model = worker.addModel([
            'package main', // 1
            'func foo() {', // 2
            '}' // 3
        ]);
        const value = model.getValueInRange({ startLineNumber: 3, startColumn: 1, endLineNumber: 4, endColumn: 1 });
        assert.strictEqual(value, '}');
    });
    test('textualSuggest, issue #17785', function () {
        const model = worker.addModel([
            'foobar', // 1
            'f f' // 2
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
            'one line', // 1
            'two line', // 2
            '',
            'past empty',
            'single',
            '',
            'and now we are done'
        ]);
        const words = [...model.words(/[a-z]+/img)];
        assert.deepStrictEqual(words, ['one', 'line', 'two', 'line', 'past', 'empty', 'single', 'and', 'now', 'we', 'are', 'done']);
    });
});
function applyEdits(text, edits) {
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
    constructor(text) {
        this.text = text;
        this.lineStartOffsetByLineIdx = [];
        this.lineStartOffsetByLineIdx.push(0);
        for (let i = 0; i < text.length; i++) {
            if (text.charAt(i) === '\n') {
                this.lineStartOffsetByLineIdx.push(i + 1);
            }
        }
        this.lineStartOffsetByLineIdx.push(text.length + 1);
    }
    getOffset(position) {
        const maxLineOffset = position.lineNumber >= this.lineStartOffsetByLineIdx.length ? this.text.length : (this.lineStartOffsetByLineIdx[position.lineNumber] - 1);
        return Math.min(this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1, maxLineOffset);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yV2ViV29ya2VyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvZWRpdG9yV2ViV29ya2VyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUU5RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHM0UsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtJQUU3Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0sZ0JBQWlCLFNBQVEsWUFBWTtRQUUxQyxRQUFRLENBQUMsR0FBVztZQUNuQixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUVELFFBQVEsQ0FBQyxLQUFlLEVBQUUsTUFBYyxJQUFJO1lBQzNDLE1BQU0sR0FBRyxHQUFHLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDdEMsSUFBSSxDQUFDLGVBQWUsQ0FBQztnQkFDcEIsR0FBRyxFQUFFLEdBQUc7Z0JBQ1IsU0FBUyxFQUFFLENBQUM7Z0JBQ1osS0FBSyxFQUFFLEtBQUs7Z0JBQ1osR0FBRyxFQUFFLEdBQUc7YUFDUixDQUFDLENBQUM7WUFDSCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFFLENBQUM7UUFDN0IsQ0FBQztLQUNEO0lBRUQsSUFBSSxNQUF3QixDQUFDO0lBQzdCLElBQUksS0FBbUIsQ0FBQztJQUV4QixLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsTUFBTSxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUNoQyxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUN2QixrQkFBa0IsRUFBRSxJQUFJO1lBQ3hCLDZCQUE2QixFQUFFLElBQUk7WUFDbkMsc0JBQXNCLEVBQUUsSUFBSTtZQUM1QiwrQkFBK0IsRUFBRSxJQUFJO1NBQ3JDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsU0FBUyxnQkFBZ0IsQ0FBQyxNQUFjLEVBQUUsSUFBWSxFQUFFLE1BQWM7UUFDckUsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMxQyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDOUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFFRCxTQUFTLGNBQWMsQ0FBQyxVQUFrQixFQUFFLE1BQWMsRUFBRSxNQUFjO1FBQ3pFLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBRUQsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtRQUNsQyxjQUFjLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4QixjQUFjLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4QixjQUFjLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxQixjQUFjLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN6QixjQUFjLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN6QixjQUFjLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN6QixjQUFjLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxQixjQUFjLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMxQixjQUFjLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDeEMsY0FBYyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDMUIsY0FBYyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3pDLGNBQWMsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDeEQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO1FBQ3BDLGdCQUFnQixDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDMUIsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsZ0JBQWdCLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxQixnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVCLGdCQUFnQixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0IsZ0JBQWdCLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQixnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNCLGdCQUFnQixDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDNUIsZ0JBQWdCLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM1QixnQkFBZ0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVCLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzNDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDZDQUE2QyxFQUFFO1FBQ25ELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyx3TEFBd0wsQ0FBQyxDQUFDLENBQUM7UUFDMU4sTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNyRSxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFO1FBRXhCLE9BQU8sTUFBTSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUMvSSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDcEMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQztZQUN0QixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDcEMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsZUFBZSxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDL0csQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxLQUFLO1FBRTlDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUM7WUFDN0IsS0FBSztZQUNMLEtBQUs7WUFDTCxPQUFPO1lBQ1AsTUFBTTtZQUNOLE1BQU07U0FDTixFQUFFLElBQUksQ0FBQyxDQUFDO1FBR1QsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRTtZQUM1RTtnQkFDQyxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QixJQUFJLEVBQUUsbUJBQW1CO2FBQ3pCLEVBQUU7Z0JBQ0YsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDNUIsSUFBSSxFQUFFLEVBQUU7YUFDUixFQUFFO2dCQUNGLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzVCLElBQUksRUFBRSxFQUFFO2FBQ1IsRUFBRTtnQkFDRixLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QixJQUFJLEVBQUUsR0FBRzthQUNULEVBQUU7Z0JBQ0YsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDNUIsSUFBSSxFQUFFLEdBQUc7YUFDVDtTQUNELEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFVixNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztJQUMzQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxnREFBZ0QsRUFBRTtRQUV0RCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDO1lBQzdCLEdBQUc7WUFDSCxTQUFTO1lBQ1QsR0FBRztTQUNILEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFVCxPQUFPLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLElBQUksS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDL0ksTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMscURBQXFELEVBQUU7UUFFM0QsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUM3QixHQUFHO1lBQ0gsU0FBUztZQUNULEdBQUc7U0FDSCxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRVQsT0FBTyxNQUFNLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQy9JLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNwQyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM3RyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlEQUF5RCxFQUFFO1FBRS9ELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUM7WUFDN0IsY0FBYyxFQUFFLElBQUk7WUFDcEIsY0FBYyxFQUFFLElBQUk7WUFDcEIsR0FBRyxDQUFJLElBQUk7U0FDWCxDQUFDLENBQUM7UUFFSCxPQUFPLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ25JLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxlQUFlLEVBQUUsQ0FBQyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsYUFBYSxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM3RyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsS0FBSyxVQUFVLFNBQVMsQ0FBQyxLQUFlLEVBQUUsS0FBaUI7UUFDMUQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVyQyxNQUFNLFlBQVksR0FBRyxNQUFNLE1BQU0sQ0FBQyx5QkFBeUIsQ0FDMUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFDcEIsS0FBSyxFQUNMLEVBQUUsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLENBQzdFLENBQUM7UUFFRixNQUFNLEVBQUUsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9DLE1BQU0sRUFBRSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFL0IsT0FBTyxZQUFZLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN6RixDQUFDO0lBR0QsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzdDLE1BQU0sQ0FBQyxlQUFlLENBQ3JCLE1BQU0sU0FBUyxDQUNkO1lBQ0Msb0JBQW9CO1NBQ3BCLEVBQ0QsQ0FBQztnQkFDQSxJQUFJLEVBQUUseUJBQXlCO2dCQUMvQixLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQzVCLENBQUMsQ0FBQyxFQUNKLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLHlCQUF5QixFQUFFLENBQUMsQ0FBQyxDQUM5RCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDN0MsTUFBTSxDQUFDLGVBQWUsQ0FDckIsTUFBTSxTQUFTLENBQ2Q7WUFDQyxvQkFBb0I7U0FDcEIsRUFDRCxDQUFDO2dCQUNBLElBQUksRUFBRSwwREFBMEQ7Z0JBQ2hFLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7YUFDbEQsQ0FBQyxDQUFDLEVBQ0osQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSx5QkFBeUIsRUFBRSxDQUFDLENBQUMsQ0FDdEgsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzdDLE1BQU0sQ0FBQyxlQUFlLENBQ3JCLE1BQU0sU0FBUyxDQUNkO1lBQ0MsRUFBRTtZQUNGLEVBQUU7WUFDRixFQUFFO1lBQ0YsRUFBRTtTQUNGLEVBQ0QsQ0FBQztnQkFDQSxJQUFJLEVBQUUsOERBQThEO2dCQUNwRSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2FBQzdCLENBQUMsQ0FBQyxFQUNKLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLDREQUE0RCxFQUFFLENBQUMsQ0FBQyxDQUNqRyxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDN0MsTUFBTSxDQUFDLGVBQWUsQ0FDckIsTUFBTSxTQUFTLENBQ2Q7WUFDQyx5QkFBeUI7U0FDekIsRUFDRCxDQUFDO2dCQUNBLElBQUksRUFBRSxtQkFBbUI7Z0JBQ3pCLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLENBQUM7YUFDbEQsQ0FBQyxDQUFDLEVBQ0osQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQzVDLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrR0FBa0csRUFBRSxLQUFLO1FBQzdHLE1BQU0sU0FBUyxDQUFDLENBQUMsNDZFQUE0NkUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFDejhFLENBQUM7Z0JBQ0EsS0FBSyxFQUFFLEVBQUUsZUFBZSxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLGFBQWEsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRTtnQkFDOUUsSUFBSSxFQUFFLG8yREFBbzJEO2FBQzEyRCxDQUFDLENBQ0YsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFO1FBRWxELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUM7WUFDN0IsY0FBYyxFQUFFLElBQUk7WUFDcEIsY0FBYyxFQUFFLElBQUk7WUFDcEIsR0FBRyxDQUFJLElBQUk7U0FDWCxDQUFDLENBQUM7UUFFSCxNQUFNLEtBQUssR0FBRyxLQUFLLENBQUMsZUFBZSxDQUFDLEVBQUUsZUFBZSxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxFQUFFLGFBQWEsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDNUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUM7SUFHSCxJQUFJLENBQUMsOEJBQThCLEVBQUU7UUFFcEMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUM3QixRQUFRLEVBQUUsSUFBSTtZQUNkLEtBQUssQ0FBQyxJQUFJO1NBQ1YsQ0FBQyxDQUFDO1FBRUgsT0FBTyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUU7WUFDM0YsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUNiLE1BQU0sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEIsQ0FBQztZQUNELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDM0MsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLE1BQU0sQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQy9DLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUU7UUFFNUMsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUM3QixVQUFVLEVBQUUsSUFBSTtZQUNoQixVQUFVLEVBQUUsSUFBSTtZQUNoQixFQUFFO1lBQ0YsWUFBWTtZQUNaLFFBQVE7WUFDUixFQUFFO1lBQ0YscUJBQXFCO1NBQ3JCLENBQUMsQ0FBQztRQUVILE1BQU0sS0FBSyxHQUFhLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFFdEQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDN0gsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILFNBQVMsVUFBVSxDQUFDLElBQVksRUFBRSxLQUF3QztJQUN6RSxNQUFNLFdBQVcsR0FBRyxJQUFJLHlCQUF5QixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hELE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDakMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbEMsT0FBTyxDQUFDO1lBQ1AsV0FBVyxFQUFFLFdBQVcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDNUQsU0FBUyxFQUFFLFdBQVcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3hELElBQUksRUFBRSxDQUFDLENBQUMsSUFBSTtTQUNaLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBRTFELEtBQUssTUFBTSxJQUFJLElBQUksV0FBVyxFQUFFLENBQUM7UUFDaEMsSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3pGLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUM7QUFFRCxNQUFNLHlCQUF5QjtJQUc5QixZQUE2QixJQUFZO1FBQVosU0FBSSxHQUFKLElBQUksQ0FBUTtRQUN4QyxJQUFJLENBQUMsd0JBQXdCLEdBQUcsRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEMsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN0QyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUM7Z0JBQzdCLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzNDLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRCxTQUFTLENBQUMsUUFBa0I7UUFDM0IsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsd0JBQXdCLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2hLLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsUUFBUSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUM5RyxDQUFDO0NBQ0QifQ==