/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { StandardAutoClosingPairConditional } from 'vs/editor/common/modes/languageConfiguration';
import { StandardTokenType } from 'vs/editor/common/modes';

suite('StandardAutoClosingPairConditional', () => {

	test('Missing notIn', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}' });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), true);
		assert.equal(v.isOK(StandardTokenType.String), true);
		assert.equal(v.isOK(StandardTokenType.RegEx), true);
	});

	test('Empty notIn', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: [] });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), true);
		assert.equal(v.isOK(StandardTokenType.String), true);
		assert.equal(v.isOK(StandardTokenType.RegEx), true);
	});

	test('Invalid notIn', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['bla'] });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), true);
		assert.equal(v.isOK(StandardTokenType.String), true);
		assert.equal(v.isOK(StandardTokenType.RegEx), true);
	});

	test('notIn in strings', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['string'] });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), true);
		assert.equal(v.isOK(StandardTokenType.String), false);
		assert.equal(v.isOK(StandardTokenType.RegEx), true);
	});

	test('notIn in comments', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['comment'] });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), false);
		assert.equal(v.isOK(StandardTokenType.String), true);
		assert.equal(v.isOK(StandardTokenType.RegEx), true);
	});

	test('notIn in regex', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['regex'] });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), true);
		assert.equal(v.isOK(StandardTokenType.String), true);
		assert.equal(v.isOK(StandardTokenType.RegEx), false);
	});

	test('notIn in strings nor comments', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['string', 'comment'] });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), false);
		assert.equal(v.isOK(StandardTokenType.String), false);
		assert.equal(v.isOK(StandardTokenType.RegEx), true);
	});

	test('notIn in strings nor regex', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['string', 'regex'] });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), true);
		assert.equal(v.isOK(StandardTokenType.String), false);
		assert.equal(v.isOK(StandardTokenType.RegEx), false);
	});

	test('notIn in comments nor regex', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['comment', 'regex'] });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), false);
		assert.equal(v.isOK(StandardTokenType.String), true);
		assert.equal(v.isOK(StandardTokenType.RegEx), false);
	});

	test('notIn in strings, comments nor regex', () => {
		let v = new StandardAutoClosingPairConditional({ open: '{', close: '}', notIn: ['string', 'comment', 'regex'] });
		assert.equal(v.isOK(StandardTokenType.Other), true);
		assert.equal(v.isOK(StandardTokenType.Comment), false);
		assert.equal(v.isOK(StandardTokenType.String), false);
		assert.equal(v.isOK(StandardTokenType.RegEx), false);
  });
  

  test('Empty onlyIn', function () {
    var v = new StandardAutoClosingPairConditional({ open: '@', close: '{}', onlyIn: [] });
    assert.equal(v.isOK(0 /* Other */), false);
    assert.equal(v.isOK(1 /* Comment */), true);
    assert.equal(v.isOK(2 /* String */), true);
    assert.equal(v.isOK(4 /* RegEx */), true);
  });
  test('Invalid onlyIn', function () {
    var v = new StandardAutoClosingPairConditional({ open: '@', close: '{}', onlyIn: ['bla'] });
    assert.equal(v.isOK(0 /* Other */), false);
    assert.equal(v.isOK(1 /* Comment */), true);
    assert.equal(v.isOK(2 /* String */), true);
    assert.equal(v.isOK(4 /* RegEx */), true);
  });
  test('onlyIn in strings', function () {
    var v = new StandardAutoClosingPairConditional({ open: '@', close: '{}', onlyIn: ['string'] });
    assert.equal(v.isOK(0 /* Other */), false);
    assert.equal(v.isOK(1 /* Comment */), false);
    assert.equal(v.isOK(2 /* String */), true);
    assert.equal(v.isOK(4 /* RegEx */), false);
  });
  test('onlyIn in comments', function () {
    var v = new StandardAutoClosingPairConditional({ open: '@', close: '{}', onlyIn: ['comment'] });
    assert.equal(v.isOK(0 /* Other */), false);
    assert.equal(v.isOK(1 /* Comment */), true);
    assert.equal(v.isOK(2 /* String */), false);
    assert.equal(v.isOK(4 /* RegEx */), false);
  });
  test('onlyIn in regex', function () {
    var v = new StandardAutoClosingPairConditional({ open: '@', close: '{}', onlyIn: ['regex'] });
    assert.equal(v.isOK(0 /* Other */), false);
    assert.equal(v.isOK(1 /* Comment */), false);
    assert.equal(v.isOK(2 /* String */), false);
    assert.equal(v.isOK(4 /* RegEx */), true);
  });
  test('onlyIn in strings and comments', function () {
    var v = new StandardAutoClosingPairConditional({ open: '@', close: '{}', onlyIn: ['string', 'comment'] });
    assert.equal(v.isOK(0 /* Other */), false);
    assert.equal(v.isOK(1 /* Comment */), true);
    assert.equal(v.isOK(2 /* String */), true);
    assert.equal(v.isOK(4 /* RegEx */), false);
  });
  test('onlyIn in strings and regex', function () {
    var v = new StandardAutoClosingPairConditional({ open: '@', close: '{}', onlyIn: ['string', 'regex'] });
    assert.equal(v.isOK(0 /* Other */), false);
    assert.equal(v.isOK(1 /* Comment */), false);
    assert.equal(v.isOK(2 /* String */), true);
    assert.equal(v.isOK(4 /* RegEx */), true);
  });
  test('onlyIn in comments and regex', function () {
    var v = new StandardAutoClosingPairConditional({ open: '@', close: '{}', onlyIn: ['comment', 'regex'] });
    assert.equal(v.isOK(0 /* Other */), false);
    assert.equal(v.isOK(1 /* Comment */), true);
    assert.equal(v.isOK(2 /* String */), false);
    assert.equal(v.isOK(4 /* RegEx */), true);
  });
  test('onlyIn in strings, comments and regex', function () {
    var v = new StandardAutoClosingPairConditional({ open: '@', close: '{}', onlyIn: ['string', 'comment', 'regex'] });
    assert.equal(v.isOK(0 /* Other */), false);
    assert.equal(v.isOK(1 /* Comment */), true);
    assert.equal(v.isOK(2 /* String */), true);
    assert.equal(v.isOK(4 /* RegEx */), true);
  });
});
