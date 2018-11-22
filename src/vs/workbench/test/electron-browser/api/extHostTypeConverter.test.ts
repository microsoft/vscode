/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as assert from 'assert';
import { MarkdownString } from 'vs/workbench/api/node/extHostTypeConverters';
import { isEmptyObject } from 'vs/base/common/types';
import { size } from 'vs/base/common/collections';

suite('ExtHostTypeConverter', function () {

	test('MarkdownConvert - uris', function () {

		let data = MarkdownString.from('Hello');
		assert.equal(isEmptyObject(data.uris), true);
		assert.equal(data.value, 'Hello');

		data = MarkdownString.from('Hello [link](foo)');
		assert.equal(data.value, 'Hello [link](foo)');
		assert.equal(isEmptyObject(data.uris), true); // no scheme, no uri

		data = MarkdownString.from('Hello [link](www.noscheme.bad)');
		assert.equal(data.value, 'Hello [link](www.noscheme.bad)');
		assert.equal(isEmptyObject(data.uris), true); // no scheme, no uri

		data = MarkdownString.from('Hello [link](foo:path)');
		assert.equal(data.value, 'Hello [link](foo:path)');
		assert.equal(size(data.uris), 1);
		assert.ok(!!data.uris['foo:path']);

		data = MarkdownString.from('hello@foo.bar');
		assert.equal(data.value, 'hello@foo.bar');
		assert.equal(size(data.uris), 1);
		assert.ok(!!data.uris['mailto:hello@foo.bar']);

		data = MarkdownString.from('*hello* [click](command:me)');
		assert.equal(data.value, '*hello* [click](command:me)');
		assert.equal(size(data.uris), 1);
		assert.ok(!!data.uris['command:me']);

		data = MarkdownString.from('*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
		assert.equal(data.value, '*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
		assert.equal(size(data.uris), 1);
		assert.ok(!!data.uris['file:///somepath/here']);

		data = MarkdownString.from('*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
		assert.equal(data.value, '*hello* [click](file:///somepath/here). [click](file:///somepath/here)');
		assert.equal(size(data.uris), 1);
		assert.ok(!!data.uris['file:///somepath/here']);

		data = MarkdownString.from('*hello* [click](file:///somepath/here). [click](file:///somepath/here2)');
		assert.equal(data.value, '*hello* [click](file:///somepath/here). [click](file:///somepath/here2)');
		assert.equal(size(data.uris), 2);
		assert.ok(!!data.uris['file:///somepath/here']);
		assert.ok(!!data.uris['file:///somepath/here2']);
	});
});
