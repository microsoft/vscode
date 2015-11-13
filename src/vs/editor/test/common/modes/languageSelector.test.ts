/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {score, ModelLike} from 'vs/editor/common/modes/languageSelector';

suite('LanguageSelector', function() {

	let model: ModelLike = {
		language: 'farboo',
		uri: URI.parse('file:///testbed/file.fb')
	}

	test('score, invalid selector', function() {
		assert.equal(score({}, model), 0);
		assert.equal(score(undefined, model), undefined);
		assert.equal(score(null, model), undefined);
		assert.equal(score('', model), 0);
	});

	test('score, any language', function() {
		assert.equal(score({ language: '*'}, model), 5);
		assert.equal(score('*', model), 5);
	});

	test('score, filter', function() {
		assert.equal(score('farboo', model), 10);
		assert.equal(score({ language: 'farboo'}, model), 10);
		assert.equal(score({ language: 'farboo', scheme: 'file' }, model), 20);
		assert.equal(score({ language: 'farboo', scheme: 'http' }, model), 0);

		assert.equal(score({ pattern: '**/*.fb' }, model), 5);
		// assert.equal(score({ pattern: '/testbed/file.fb' }, model), 10); fails on windows
	});

	test('score, max(filters)', function() {
		let match = { language: 'farboo', scheme: 'file' };
		let fail = { language: 'farboo', scheme: 'http' };

		assert.equal(score(match, model), 20);
		assert.equal(score(fail, model), 0);
		assert.equal(score([match, fail], model), 20);
		assert.equal(score(['farboo', '*'], model), 10);
		assert.equal(score(['*', 'farboo'], model), 10);
	});
});