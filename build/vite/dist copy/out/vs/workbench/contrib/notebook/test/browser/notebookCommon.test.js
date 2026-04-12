/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { CellKind, CellUri, diff, MimeTypeDisplayOrder, NotebookWorkingCopyTypeIdentifier } from '../../common/notebookCommon.js';
import { cellIndexesToRanges, cellRangesToIndexes, reduceCellRanges } from '../../common/notebookRange.js';
import { setupInstantiationService, TestCell } from './testNotebookEditor.js';
suite('NotebookCommon', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let disposables;
    let instantiationService;
    let languageService;
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = setupInstantiationService(disposables);
        languageService = instantiationService.get(ILanguageService);
    });
    test('sortMimeTypes default orders', function () {
        assert.deepStrictEqual(new MimeTypeDisplayOrder().sort([
            'application/json',
            'application/javascript',
            'text/html',
            'image/svg+xml',
            Mimes.latex,
            Mimes.markdown,
            'image/png',
            'image/jpeg',
            Mimes.text
        ]), [
            'application/json',
            'application/javascript',
            'text/html',
            'image/svg+xml',
            Mimes.latex,
            Mimes.markdown,
            'image/png',
            'image/jpeg',
            Mimes.text
        ]);
        assert.deepStrictEqual(new MimeTypeDisplayOrder().sort([
            'application/json',
            Mimes.latex,
            Mimes.markdown,
            'application/javascript',
            'text/html',
            Mimes.text,
            'image/png',
            'image/jpeg',
            'image/svg+xml'
        ]), [
            'application/json',
            'application/javascript',
            'text/html',
            'image/svg+xml',
            Mimes.latex,
            Mimes.markdown,
            'image/png',
            'image/jpeg',
            Mimes.text
        ]);
        assert.deepStrictEqual(new MimeTypeDisplayOrder().sort([
            Mimes.markdown,
            'application/json',
            Mimes.text,
            'image/jpeg',
            'application/javascript',
            'text/html',
            'image/png',
            'image/svg+xml'
        ]), [
            'application/json',
            'application/javascript',
            'text/html',
            'image/svg+xml',
            Mimes.markdown,
            'image/png',
            'image/jpeg',
            Mimes.text
        ]);
        disposables.dispose();
    });
    test('sortMimeTypes user orders', function () {
        assert.deepStrictEqual(new MimeTypeDisplayOrder([
            'image/png',
            Mimes.text,
            Mimes.markdown,
            'text/html',
            'application/json'
        ]).sort([
            'application/json',
            'application/javascript',
            'text/html',
            'image/svg+xml',
            Mimes.markdown,
            'image/png',
            'image/jpeg',
            Mimes.text
        ]), [
            'image/png',
            Mimes.text,
            Mimes.markdown,
            'text/html',
            'application/json',
            'application/javascript',
            'image/svg+xml',
            'image/jpeg',
        ]);
        assert.deepStrictEqual(new MimeTypeDisplayOrder([
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
        ]), [
            'application/json',
            'text/html',
            Mimes.markdown,
            'application/javascript',
            'image/svg+xml',
            'image/png',
            'image/jpeg',
            Mimes.text
        ]);
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
    test('sortMimeTypes glob', function () {
        assert.deepStrictEqual(new MimeTypeDisplayOrder([
            'application/vnd-vega*',
            Mimes.markdown,
            'text/html',
            'application/json'
        ]).sort([
            'application/json',
            'application/javascript',
            'text/html',
            'application/vnd-plot.json',
            'application/vnd-vega.json'
        ]), [
            'application/vnd-vega.json',
            'text/html',
            'application/json',
            'application/vnd-plot.json',
            'application/javascript',
        ], 'glob *');
        disposables.dispose();
    });
    test('diff cells', function () {
        const cells = [];
        for (let i = 0; i < 5; i++) {
            cells.push(disposables.add(new TestCell('notebook', i, `var a = ${i};`, 'javascript', CellKind.Code, [], languageService)));
        }
        assert.deepStrictEqual(diff(cells, [], (cell) => {
            return cells.indexOf(cell) > -1;
        }), [
            {
                start: 0,
                deleteCount: 5,
                toInsert: []
            }
        ]);
        assert.deepStrictEqual(diff([], cells, (cell) => {
            return false;
        }), [
            {
                start: 0,
                deleteCount: 0,
                toInsert: cells
            }
        ]);
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
        const splices = diff(cells, modifiedCells, (cell) => {
            return cells.indexOf(cell) > -1;
        });
        assert.deepStrictEqual(splices, [
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
        ]);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDb21tb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9ub3RlYm9va0NvbW1vbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUV0RixPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsb0JBQW9CLEVBQUUsaUNBQWlDLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNsSSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsbUJBQW1CLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMzRyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsUUFBUSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFOUUsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtJQUM1Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksV0FBNEIsQ0FBQztJQUNqQyxJQUFJLG9CQUE4QyxDQUFDO0lBQ25ELElBQUksZUFBaUMsQ0FBQztJQUV0QyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDcEMsb0JBQW9CLEdBQUcseUJBQXlCLENBQUMsV0FB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RSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RHLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHFCQUFxQixFQUFFO1FBQzNCLE1BQU0sQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDcEQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6RSxNQUFNLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM1RSxNQUFNLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0UsTUFBTSxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFckcsTUFBTSxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9FLE1BQU0sQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXJHLE1BQU0sQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlFLE1BQU0sQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9FLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGVBQWUsRUFBRTtRQUNyQixNQUFNLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9HLE1BQU0sQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDL0csTUFBTSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvRyxNQUFNLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFckksTUFBTSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQztZQUN2QyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtZQUNwQixFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENB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