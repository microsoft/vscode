/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { score } from 'vs/editor/common/languageSelector';

suite('LanguageSelector', function () {

	let model = {
		language: 'farboo',
		uri: URI.parse('file:///testbed/file.fb')
	};

	test('score, invalid selector', function () {
		assert.strictEqual(score({}, model.uri, model.language, true, undefined), 0);
		assert.strictEqual(score(undefined!, model.uri, model.language, true, undefined), 0);
		assert.strictEqual(score(null!, model.uri, model.language, true, undefined), 0);
		assert.strictEqual(score('', model.uri, model.language, true, undefined), 0);
	});

	test('score, any language', function () {
		assert.strictEqual(score({ language: '*' }, model.uri, model.language, true, undefined), 5);
		assert.strictEqual(score('*', model.uri, model.language, true, undefined), 5);

		assert.strictEqual(score('*', URI.parse('foo:bar'), model.language, true, undefined), 5);
		assert.strictEqual(score('farboo', URI.parse('foo:bar'), model.language, true, undefined), 10);
	});

	test('score, default schemes', function () {

		const uri = URI.parse('git:foo/file.txt');
		const language = 'farboo';

		assert.strictEqual(score('*', uri, language, true, undefined), 5);
		assert.strictEqual(score('farboo', uri, language, true, undefined), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: '' }, uri, language, true, undefined), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: 'git' }, uri, language, true, undefined), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: '*' }, uri, language, true, undefined), 10);
		assert.strictEqual(score({ language: 'farboo' }, uri, language, true, undefined), 10);
		assert.strictEqual(score({ language: '*' }, uri, language, true, undefined), 5);

		assert.strictEqual(score({ scheme: '*' }, uri, language, true, undefined), 5);
		assert.strictEqual(score({ scheme: 'git' }, uri, language, true, undefined), 10);
	});

	test('score, filter', function () {
		assert.strictEqual(score('farboo', model.uri, model.language, true, undefined), 10);
		assert.strictEqual(score({ language: 'farboo' }, model.uri, model.language, true, undefined), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: 'file' }, model.uri, model.language, true, undefined), 10);
		assert.strictEqual(score({ language: 'farboo', scheme: 'http' }, model.uri, model.language, true, undefined), 0);

		assert.strictEqual(score({ pattern: '**/*.fb' }, model.uri, model.language, true, undefined), 10);
		assert.strictEqual(score({ pattern: '**/*.fb', scheme: 'file' }, model.uri, model.language, true, undefined), 10);
		assert.strictEqual(score({ pattern: '**/*.fb' }, URI.parse('foo:bar'), model.language, true, undefined), 0);
		assert.strictEqual(score({ pattern: '**/*.fb', scheme: 'foo' }, URI.parse('foo:bar'), model.language, true, undefined), 0);

		let doc = {
			uri: URI.parse('git:/my/file.js'),
			langId: 'javascript'
		};
		assert.strictEqual(score('javascript', doc.uri, doc.langId, true, undefined), 10); // 0;
		assert.strictEqual(score({ language: 'javascript', scheme: 'git' }, doc.uri, doc.langId, true, undefined), 10); // 10;
		assert.strictEqual(score('*', doc.uri, doc.langId, true, undefined), 5); // 5
		assert.strictEqual(score('fooLang', doc.uri, doc.langId, true, undefined), 0); // 0
		assert.strictEqual(score(['fooLang', '*'], doc.uri, doc.langId, true, undefined), 5); // 5
	});

	test('score, max(filters)', function () {
		let match = { language: 'farboo', scheme: 'file' };
		let fail = { language: 'farboo', scheme: 'http' };

		assert.strictEqual(score(match, model.uri, model.language, true, undefined), 10);
		assert.strictEqual(score(fail, model.uri, model.language, true, undefined), 0);
		assert.strictEqual(score([match, fail], model.uri, model.language, true, undefined), 10);
		assert.strictEqual(score([fail, fail], model.uri, model.language, true, undefined), 0);
		assert.strictEqual(score(['farboo', '*'], model.uri, model.language, true, undefined), 10);
		assert.strictEqual(score(['*', 'farboo'], model.uri, model.language, true, undefined), 10);
	});

	test('score hasAccessToAllModels', function () {
		let doc = {
			uri: URI.parse('file:/my/file.js'),
			langId: 'javascript'
		};
		assert.strictEqual(score('javascript', doc.uri, doc.langId, false, undefined), 0);
		assert.strictEqual(score({ language: 'javascript', scheme: 'file' }, doc.uri, doc.langId, false, undefined), 0);
		assert.strictEqual(score('*', doc.uri, doc.langId, false, undefined), 0);
		assert.strictEqual(score('fooLang', doc.uri, doc.langId, false, undefined), 0);
		assert.strictEqual(score(['fooLang', '*'], doc.uri, doc.langId, false, undefined), 0);

		assert.strictEqual(score({ language: 'javascript', scheme: 'file', hasAccessToAllModels: true }, doc.uri, doc.langId, false, undefined), 10);
		assert.strictEqual(score(['fooLang', '*', { language: '*', hasAccessToAllModels: true }], doc.uri, doc.langId, false, undefined), 5);
	});

	test('score, notebookType', function () {
		let obj = {
			uri: URI.parse('file:/my/file.js'),
			langId: 'javascript',
			notebookType: 'fooBook'
		};

		assert.strictEqual(score('javascript', obj.uri, obj.langId, true, undefined), 10);
		assert.strictEqual(score('javascript', obj.uri, obj.langId, true, obj.notebookType), 10);
		assert.strictEqual(score({ notebookType: 'fooBook' }, obj.uri, obj.langId, true, obj.notebookType), 10);
		assert.strictEqual(score({ notebookType: 'fooBook', language: 'javascript', scheme: 'file' }, obj.uri, obj.langId, true, obj.notebookType), 10);
		assert.strictEqual(score({ notebookType: 'fooBook', language: '*' }, obj.uri, obj.langId, true, obj.notebookType), 10);
		assert.strictEqual(score({ notebookType: '*', language: '*' }, obj.uri, obj.langId, true, obj.notebookType), 5);
		assert.strictEqual(score({ notebookType: '*', language: 'javascript' }, obj.uri, obj.langId, true, obj.notebookType), 10);
	});

	test('Document selector match - unexpected result value #60232', function () {
		let selector = {
			language: 'json',
			scheme: 'file',
			pattern: '**/*.interface.json'
		};
		let value = score(selector, URI.parse('file:///C:/Users/zlhe/Desktop/test.interface.json'), 'json', true, undefined);
		assert.strictEqual(value, 10);
	});

	test('Document selector match - platform paths #99938', function () {
		let selector = {
			pattern: {
				base: '/home/user/Desktop',
				pattern: '*.json'
			}
		};
		let value = score(selector, URI.file('/home/user/Desktop/test.json'), 'json', true, undefined);
		assert.strictEqual(value, 10);
	});

	test('NotebookType without notebook', function () {
		let obj = {
			uri: URI.parse('file:///my/file.bat'),
			langId: 'bat',
		};

		let value = score({
			language: 'bat',
			notebookType: 'xxx'
		}, obj.uri, obj.langId, true, undefined);
		assert.strictEqual(value, 0);

		value = score({
			language: 'bat',
			notebookType: '*'
		}, obj.uri, obj.langId, true, undefined);
		assert.strictEqual(value, 0);
	});
});
