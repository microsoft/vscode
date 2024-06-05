/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import assert from 'assert';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import { MarkdownString, NotebookCellOutputItem, NotebookData, LanguageSelector, WorkspaceEdit } from 'vs/workbench/api/common/extHostTypeConverters';
import { isEmptyObject } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IWorkspaceTextEditDto } from 'vs/workbench/api/common/extHost.protocol';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('ExtHostTypeConverter', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	function size<T>(from: Record<any, any>): number {
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
		assert.strictEqual(size(data.uris!), 1);
		assert.ok(!!data.uris!['foo:path']);

		data = MarkdownString.from('hello@foo.bar');
		assert.strictEqual(data.value, 'hello@foo.bar');
		assert.strictEqual(size(data.uris!), 1);
		// assert.ok(!!data.uris!['mailto:hello@foo.bar']);

		data = MarkdownString.from('*hello* [click](command:me)');
		assert.strictEqual(data.value, '*hello* [click](command:me)');
		assert.strictEqual(size(data.uris!), 1);
		assert.ok(!!data.uris!['command:me']);

		data = MarkdownString.from('*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
		assert.strictEqual(data.value, '*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
		assert.strictEqual(size(data.uris!), 1);
		assert.ok(!!data.uris!['file:///somepath/here']);

		data = MarkdownString.from('*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
		assert.strictEqual(data.value, '*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
		assert.strictEqual(size(data.uris!), 1);
		assert.ok(!!data.uris!['file:///somepath/here']);

		data = MarkdownString.from('*hello* [click](file:///somepath/here). [click](file:///somepath/here2)');
		assert.strictEqual(data.value, '*hello* [click](file:///somepath/here). [click](file:///somepath/here2)');
		assert.strictEqual(size(data.uris!), 2);
		assert.ok(!!data.uris!['file:///somepath/here']);
		assert.ok(!!data.uris!['file:///somepath/here2']);
	});

	test('NPM script explorer running a script from the hover does not work #65561', function () {

		const data = MarkdownString.from('*hello* [click](command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2Ffoo%2Fbaz.ex%22%2C%22path%22%3A%22%2Fc%3A%2Ffoo%2Fbaz.ex%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22dev%22%7D)');
		// assert that both uri get extracted but that the latter is only decoded once...
		assert.strictEqual(size(data.uris!), 2);
		for (const value of Object.values(data.uris!)) {
			if (value.scheme === 'file') {
				assert.ok(URI.revive(value).toString().indexOf('file:///c%3A') === 0);
			} else {
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
		const first = <IWorkspaceTextEditDto>dto.edits[0];
		assert.strictEqual(first.textEdit.insertAsSnippet, true);

		const ws2 = WorkspaceEdit.to(dto);
		const dto2 = WorkspaceEdit.from(ws2);
		const first2 = <IWorkspaceTextEditDto>dto2.edits[0];
		assert.strictEqual(first2.textEdit.insertAsSnippet, true);
	});
});
