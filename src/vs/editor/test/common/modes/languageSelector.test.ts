/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {score} from 'vs/editor/common/modes/languageSelector';

suite('LanguageSelector', function() {

	let model = {
		language: 'farboo',
		uri: URI.parse('file:///testbed/file.fb')
	};

	test('score, invalid selector', function() {
		assert.equal(score({}, model.uri, model.language), 0);
		assert.equal(score(undefined, model.uri, model.language), undefined);
		assert.equal(score(null, model.uri, model.language), undefined);
		assert.equal(score('', model.uri, model.language), 0);
	});

	test('score, any language', function() {
		assert.equal(score({ language: '*'}, model.uri, model.language), 5);
		assert.equal(score('*', model.uri, model.language), 5);
	});

	test('score, filter', function() {
		assert.equal(score('farboo', model.uri, model.language), 10);
		assert.equal(score({ language: 'farboo'}, model.uri, model.language), 10);
		assert.equal(score({ language: 'farboo', scheme: 'file' }, model.uri, model.language), 20);
		assert.equal(score({ language: 'farboo', scheme: 'http' }, model.uri, model.language), 0);

		assert.equal(score({ pattern: '**/*.fb' }, model.uri, model.language), 5);
		// assert.equal(score({ pattern: '/testbed/file.fb' }, model.uri, model.language), 10); fails on windows
	});

	test('score, max(filters)', function() {
		let match = { language: 'farboo', scheme: 'file' };
		let fail = { language: 'farboo', scheme: 'http' };

		assert.equal(score(match, model.uri, model.language), 20);
		assert.equal(score(fail, model.uri, model.language), 0);
		assert.equal(score([match, fail], model.uri, model.language), 20);
		assert.equal(score(['farboo', '*'], model.uri, model.language), 10);
		assert.equal(score(['*', 'farboo'], model.uri, model.language), 10);
	});
});