/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as extHostTypes from '../../common/extHostTypes.js';
import { ChatAgentResult, MarkdownString, NotebookCellOutputItem, NotebookData, LanguageSelector, WorkspaceEdit } from '../../common/extHostTypeConverters.js';
import { isEmptyObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('ExtHostTypeConverter', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    function size(from) {
        let count = 0;
        for (const key in from) {
            if (Object.prototype.hasOwnProperty.call(from, key)) {
                count += 1;
            }
        }
        return count;
    }
    test('MarkdownConvert - uris', function () {
        let data = MarkdownString.from('Hello');
        assert.strictEqual(isEmptyObject(data.uris), true);
        assert.strictEqual(data.value, 'Hello');
        data = MarkdownString.from('Hello [link](foo)');
        assert.strictEqual(data.value, 'Hello [link](foo)');
        assert.strictEqual(isEmptyObject(data.uris), true); // no scheme, no uri
        data = MarkdownString.from('Hello [link](www.noscheme.bad)');
        assert.strictEqual(data.value, 'Hello [link](www.noscheme.bad)');
        assert.strictEqual(isEmptyObject(data.uris), true); // no scheme, no uri
        data = MarkdownString.from('Hello [link](foo:path)');
        assert.strictEqual(data.value, 'Hello [link](foo:path)');
        assert.strictEqual(size(data.uris), 1);
        assert.ok(!!data.uris['foo:path']);
        data = MarkdownString.from('hello@foo.bar');
        assert.strictEqual(data.value, 'hello@foo.bar');
        assert.strictEqual(size(data.uris), 1);
        // assert.ok(!!data.uris!['mailto:hello@foo.bar']);
        data = MarkdownString.from('*hello* [click](command:me)');
        assert.strictEqual(data.value, '*hello* [click](command:me)');
        assert.strictEqual(size(data.uris), 1);
        assert.ok(!!data.uris['command:me']);
        data = MarkdownString.from('*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
        assert.strictEqual(data.value, '*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
        assert.strictEqual(size(data.uris), 1);
        assert.ok(!!data.uris['file:///somepath/here']);
        data = MarkdownString.from('*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
        assert.strictEqual(data.value, '*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
        assert.strictEqual(size(data.uris), 1);
        assert.ok(!!data.uris['file:///somepath/here']);
        data = MarkdownString.from('*hello* [click](file:///somepath/here). [click](file:///somepath/here2)');
        assert.strictEqual(data.value, '*hello* [click](file:///somepath/here). [click](file:///somepath/here2)');
        assert.strictEqual(size(data.uris), 2);
        assert.ok(!!data.uris['file:///somepath/here']);
        assert.ok(!!data.uris['file:///somepath/here2']);
    });
    test('NPM script explorer running a script from the hover does not work #65561', function () {
        const data = MarkdownString.from('*hello* [click](command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2Ffoo%2Fbaz.ex%22%2C%22path%22%3A%22%2Fc%3A%2Ffoo%2Fbaz.ex%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22dev%22%7D)');
        // assert that both uri get extracted but that the latter is only decoded once...
        assert.strictEqual(size(data.uris), 2);
        for (const value of Object.values(data.uris)) {
            if (value.scheme === 'file') {
                assert.ok(URI.revive(value).toString().indexOf('file:///c%3A') === 0);
            }
            else {
                assert.strictEqual(value.scheme, 'command');
            }
        }
    });
    test('Notebook metadata is ignored when using Notebook Serializer #125716', function () {
        const d = new extHostTypes.NotebookData([]);
        d.cells.push(new extHostTypes.NotebookCellData(extHostTypes.NotebookCellKind.Code, 'hello', 'fooLang'));
        d.metadata = { foo: 'bar', bar: 123 };
        const dto = NotebookData.from(d);
        assert.strictEqual(dto.cells.length, 1);
        assert.strictEqual(dto.cells[0].language, 'fooLang');
        assert.strictEqual(dto.cells[0].source, 'hello');
        assert.deepStrictEqual(dto.metadata, d.metadata);
    });
    test('NotebookCellOutputItem', function () {
        const item = extHostTypes.NotebookCellOutputItem.text('Hello', 'foo/bar');
        const dto = NotebookCellOutputItem.from(item);
        assert.strictEqual(dto.mime, 'foo/bar');
        assert.deepStrictEqual(Array.from(dto.valueBytes.buffer), Array.from(new TextEncoder().encode('Hello')));
        const item2 = NotebookCellOutputItem.to(dto);
        assert.strictEqual(item2.mime, item.mime);
        assert.deepStrictEqual(Array.from(item2.data), Array.from(item.data));
    });
    test('LanguageSelector', function () {
        const out = LanguageSelector.from({ language: 'bat', notebookType: 'xxx' });
        assert.ok(typeof out === 'object');
        assert.deepStrictEqual(out, {
            language: 'bat',
            notebookType: 'xxx',
            scheme: undefined,
            pattern: undefined,
            exclusive: undefined,
        });
    });
    test('JS/TS Surround With Code Actions provide bad Workspace Edits when obtained by VSCode Command API #178654', function () {
        const uri = URI.parse('file:///foo/bar');
        const ws = new extHostTypes.WorkspaceEdit();
        ws.set(uri, [extHostTypes.SnippetTextEdit.insert(new extHostTypes.Position(1, 1), new extHostTypes.SnippetString('foo$0bar'))]);
        const dto = WorkspaceEdit.from(ws);
        const first = dto.edits[0];
        assert.strictEqual(first.textEdit.insertAsSnippet, true);
        const ws2 = WorkspaceEdit.to(dto);
        const dto2 = WorkspaceEdit.from(ws2);
        const first2 = dto2.edits[0];
        assert.strictEqual(first2.textEdit.insertAsSnippet, true);
    });
});
suite('ChatAgentResult', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('reviveMetadata - roundtrips base64-encoded LanguageModelDataPart', function () {
        const originalData = new Uint8Array([10, 20, 30, 40]);
        const part = new extHostTypes.LanguageModelDataPart(originalData, 'image/png');
        const serialized = part.toJSON();
        const result = ChatAgentResult.to({ metadata: { part: serialized } });
        const revived = result.metadata.part;
        assert.ok(revived instanceof extHostTypes.LanguageModelDataPart);
        assert.deepStrictEqual(Array.from(revived.data), Array.from(originalData));
        assert.strictEqual(revived.mimeType, 'image/png');
    });
    test('reviveMetadata - decodes legacy Buffer-like LanguageModelDataPart shape', function () {
        const legacySerialized = {
            $mid: 24 /* MarshalledId.LanguageModelDataPart */,
            data: { type: 'Buffer', data: [1, 2, 3] },
            mimeType: 'image/jpeg',
        };
        const result = ChatAgentResult.to({ metadata: { part: legacySerialized } });
        const revived = result.metadata.part;
        assert.ok(revived instanceof extHostTypes.LanguageModelDataPart);
        assert.deepStrictEqual(Array.from(revived.data), [1, 2, 3]);
        assert.strictEqual(revived.mimeType, 'image/jpeg');
    });
    test('reviveMetadata - does not throw on malformed LanguageModelDataPart shape', function () {
        const malformed = {
            $mid: 24 /* MarshalledId.LanguageModelDataPart */,
            data: null,
            mimeType: 'image/png',
        };
        assert.doesNotThrow(() => ChatAgentResult.to({ metadata: { part: malformed } }));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFR5cGVDb252ZXJ0ZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RUeXBlQ29udmVydGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxZQUFZLE1BQU0sOEJBQThCLENBQUM7QUFDN0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxjQUFjLEVBQUUsc0JBQXNCLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLGFBQWEsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9KLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFHaEcsS0FBSyxDQUFDLHNCQUFzQixFQUFFO0lBRTdCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsU0FBUyxJQUFJLENBQUksSUFBc0I7UUFDdEMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUN4QixJQUFJLE1BQU0sQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDckQsS0FBSyxJQUFJLENBQUMsQ0FBQztZQUNaLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsSUFBSSxDQUFDLHdCQUF3QixFQUFFO1FBRTlCLElBQUksSUFBSSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENB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