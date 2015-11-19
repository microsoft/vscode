/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import rewriting = require('vs/languages/typescript/common/js/rewriting');
import RequireRewriter = require('vs/languages/typescript/common/js/requireRewriter');

suite('JS* - Require Rewriter', () => {

	function assertTranslation(before:string[], expected:string[]):void {
		var actual = rewriting.translate([new RequireRewriter()], before.join('\n')).value;
		assert.equal(actual, expected.join('\n'));
	}

	test('require, simple statement', function () {

		assertTranslation([
			'var far = require("boo");',
		], [
			'import * as _$steroids$_18_23 from "boo";',
			'var far = (<typeof _$steroids$_18_23>require("boo"));'
		]);

		assertTranslation([
			'var far = require("boo"/*farboo*/);',
		], [
			'import * as _$steroids$_18_23 from "boo";',
			'var far = (<typeof _$steroids$_18_23>require("boo"/*farboo*/));'
		]);
	});

	test('require, inline statement', function () {

		assertTranslation([
			'var far = require("boo") .log();',
		], [
			'import * as _$steroids$_18_23 from "boo";',
			'var far = (<typeof _$steroids$_18_23>require("boo")) .log();'
		]);

		assertTranslation([
			'var far = require("boo"),',
			'    boo = require("far");',
		], [
			'import * as _$steroids$_18_23 from "boo";',
			'import * as _$steroids$_44_49 from "far";',
			'var far = (<typeof _$steroids$_18_23>require("boo")),',
			'    boo = (<typeof _$steroids$_44_49>require("far"));',
		]);
	});

	test('require, inside amd-define', function () {
		assertTranslation([
			'define(["a", "b"], function(a) {',
			'    require("a").b',
			'});',
		], [
			'import * as _$steroids$_45_48 from "a";',
			'define(["a", "b"], function(a) {',
			'    (<typeof _$steroids$_45_48>require("a")).b',
			'});',
		]);
	});

	test('require, strip .js-extname', function () {
		assertTranslation([
			'var far = require("boo.js");',
		], [
			'import * as _$steroids$_18_26 from "boo";',
			'var far = (<typeof _$steroids$_18_26>require("boo.js"));'
		]);

		assertTranslation([
			'var far = require("boo.notjs");',
		], [
			'import * as _$steroids$_18_29 from "boo.notjs";',
			'var far = (<typeof _$steroids$_18_29>require("boo.notjs"));'
		]);
	});

	test('require, quotes as authored', function () {
		assertTranslation([
			'var far = require("boo");',
		], [
			'import * as _$steroids$_18_23 from "boo";',
			'var far = (<typeof _$steroids$_18_23>require("boo"));'
		]);

		assertTranslation([
			'var far = require(\'boo\');',
		], [
			'import * as _$steroids$_18_23 from \'boo\';',
			'var far = (<typeof _$steroids$_18_23>require(\'boo\'));'
		]);
	});

	test('require, insert semicolon', function() {
		assertTranslation([
			'far.boo()',
			'require("boo");',
		], [
			'import * as _$steroids$_18_23 from "boo";',
			'far.boo()',
			';(<typeof _$steroids$_18_23>require("boo"));'
		]);
	});

	test('require, donts', function () {

		assertTranslation([
			'var far = Require("boo") .log();',
		], [
			'var far = Require("boo") .log();',
		]);

		assertTranslation([
			'var far = r.require("boo");',
		], [
			'var far = r.require("boo");',
		]);
	});
});