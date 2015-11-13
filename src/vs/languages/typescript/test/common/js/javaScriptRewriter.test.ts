/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import javaScriptRewriter = require('vs/languages/typescript/common/js/rewriting');
import importAndExportRewriter = require('vs/languages/typescript/common/js/importAndExportRewriter');
import globalVariableRewriter = require('vs/languages/typescript/common/js/globalVariableRewriter');
import RequireRewriter = require('vs/languages/typescript/common/js/requireRewriter');
import DefineRewriter = require('vs/languages/typescript/common/js/defineRewriter');

suite('JS* - JavaScript Rewriter', () => {

	function assertTranslation(before:string[], expected:string[]):void {

		var actual = javaScriptRewriter.translate([
			new DefineRewriter(),
			new RequireRewriter(),
			new importAndExportRewriter.ImportsAndExportsCollector(),
			new globalVariableRewriter.GlobalVariableCollector(),
		], before.join('\n')).value;

		assert.equal(actual, expected.join('\n'));
	}

	test('amd - object literal', function() {
		assertTranslation(['define({});'], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(literal:T):T;',
			'var _var_0 = define({});',
			'export = _var_0;'
		]);
		assertTranslation(['define({})'], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(literal:T):T;',
			'var _var_0 = define({})',
			'export = _var_0;'
		]);
	});

	test('amd - dependencies', function() {
		assertTranslation(['define([], function(){});'], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:()=>T):T;',
			'var _var_0 = define([], function(){});',
			'export = _var_0;'
		]);
		assertTranslation(['define([], function(d1){})'], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:(d1)=>T):T;',
			'var _var_0 = define([], function(d1){})',
			'export = _var_0;'
		]);
		assertTranslation(['define(["d1", "d2"], function(d1, d2){});'], [
			'import * as _$steroids$_30_32 from "d1";',
			'import * as _$steroids$_34_36 from "d2";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:(d1,d2)=>T):T;',
			'var _var_0 = define(["d1", "d2"], function(d1: typeof _$steroids$_30_32, d2: typeof _$steroids$_34_36){});',
			'export = _var_0;'
		]);
		assertTranslation(['define(["exports", "d2"], function(exports, d2){});'], [
			'import * as _$steroids$_44_46 from "d2";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:(exports,d2)=>T):T;',
			'var _var_0 = define(["exports", "d2"], function(exports, d2: typeof _$steroids$_44_46){});',
			'export = _var_0;'
		]);
		assertTranslation(['define(["d1", "d2", "d3"], function(d1, d2){});'], [
			'import * as _$steroids$_36_38 from "d1";',
			'import * as _$steroids$_40_42 from "d2";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:(d1,d2)=>T):T;',
			'var _var_0 = define(["d1", "d2", "d3"], function(d1: typeof _$steroids$_36_38, d2: typeof _$steroids$_40_42){});',
			'export = _var_0;'
		]);
	});

	test('amd - require-calls', function() {
		// one dependency, no param, one require call
		assertTranslation([
			'define(["./d1"], function() {',
			'\tvar a = require("./d1");',
			'})'
		], [
			'import * as _$steroids$_47_53 from "./d1";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:()=>T):T;',
			'var _var_0 = define(["./d1"], function() {',
			'\tvar a = (<typeof _$steroids$_47_53>require("./d1"));',
			'})',
			'export = _var_0;'
		]);
		// no dependency array, illegal params, one require call
		assertTranslation([
			'define(function(p) {',
			'\tvar a = require("./d1");',
			'});'
		], [
			'import * as _$steroids$_38_44 from "./d1";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(callback:(p)=>T):T;',
			'var _var_0 = define(function(p) {',
			'\tvar a = (<typeof _$steroids$_38_44>require("./d1"));',
			'});',
			'export = _var_0;'
		]);
		// no dependency, one illegal param, one require call
		assertTranslation([
			'define([], function(p) {',
			'\tvar a = require("./d1");',
			'});'
		], [
			'import * as _$steroids$_42_48 from "./d1";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:(p)=>T):T;',
			'var _var_0 = define([], function(p) {',
			'\tvar a = (<typeof _$steroids$_42_48>require("./d1"));',
			'});',
			'export = _var_0;'
		]);
		// one dependency with proper param, one require call
		assertTranslation([
			'define(["d1", "d2"], function(d1) {',
			'\tvar d2 = require("d2");',
			'});'
		], [
			'import * as _$steroids$_30_32 from "d1";',
			'import * as _$steroids$_54_58 from "d2";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:(d1)=>T):T;',
			'var _var_0 = define(["d1", "d2"], function(d1: typeof _$steroids$_30_32) {',
			'\tvar d2 = (<typeof _$steroids$_54_58>require("d2"));',
			'});',
			'export = _var_0;'
		]);
	});

	test('amd - exports.<more>', function() {
		assertTranslation(
			['define([], function(){',
			'exports.foo = true;',
			'});'], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:()=>T):T;',
			'var _var_1 = define([], function(){',
			'var _var_0 = true;',
			'return {foo:_var_0};});',
			'export = _var_1;'
		]);

		assertTranslation(
			['define([], function(){',
			'exports.foo = true;',
			'exports.bar = function bar() {}',
			'});'], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'declare function define<T>(dep,callback:()=>T):T;',
			'var _var_2 = define([], function(){',
			'var _var_0 = true;',
			'var _var_1 = function bar() {}',
			'return {foo:_var_0,bar:_var_1};});',
			'export = _var_2;'
		]);
	});

	test('commonjs - require call', function() {
		assertTranslation([
			'var a = require("d");'
		], [
			'import * as _$steroids$_16_19 from "d";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var a = (<typeof _$steroids$_16_19>require("d"));'
		]);
		assertTranslation([
			'var a = require("d"),',
			'\tb = require("b");',
		], [
			'import * as _$steroids$_16_19 from "d";',
			'import * as _$steroids$_35_38 from "b";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var a = (<typeof _$steroids$_16_19>require("d")),',
			'\tb = (<typeof _$steroids$_35_38>require("b"));',
		]);
		assertTranslation([
			'require("d").farboo();'
		], [
			'import * as _$steroids$_8_11 from "d";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'(<typeof _$steroids$_8_11>require("d")).farboo();'
		]);
		assertTranslation([
			'require("d").farboo();',
			'require("c\\d").farboo();'
		], [
			'import * as _$steroids$_8_11 from "d";',
			'import * as _$steroids$_31_36 from "c\\d";',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'(<typeof _$steroids$_8_11>require("d")).farboo();',
			'(<typeof _$steroids$_31_36>require("c\\d")).farboo();'
		]);
	});

	test('commonjs - (module.)?exports.<more>', function() {
		assertTranslation([
			'exports.foo = true;'
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _$steroids$_0_11 = true;',
			'export {_$steroids$_0_11 as foo}'
		]);
		assertTranslation([
			'exports.foo = true;',
			'exports.foo = true;',
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _$steroids$_0_11 = true;',
			'var _$steroids$_20_31 = true;',
			'export {_$steroids$_0_11 as foo, _$steroids$_20_31 as foo}'
		]);
		assertTranslation([
			'exports.foo = true;',
			'exports.bar = 123;',
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _$steroids$_0_11 = true;',
			'var _$steroids$_20_31 = 123;',
			'export {_$steroids$_0_11 as foo, _$steroids$_20_31 as bar}'
		]);
		assertTranslation([
			'module.exports.foo = true;'
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _$steroids$_0_18 = true;',
			'export {_$steroids$_0_18 as foo}'
		]);
		assertTranslation([
			'module.exports.foo = true;',
			'module.exports.foo = true;',
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _$steroids$_0_18 = true;',
			'var _$steroids$_27_45 = true;',
			'export {_$steroids$_0_18 as foo, _$steroids$_27_45 as foo}'
		]);
		assertTranslation([
			'module.exports.foo = true;',
			'module.exports.bar = 123;',
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _$steroids$_0_18 = true;',
			'var _$steroids$_27_45 = 123;',
			'export {_$steroids$_0_18 as foo, _$steroids$_27_45 as bar}'
		]);
	});

	test('commonjs - (module.)?exports = ', function() {
		assertTranslation([
			'exports = true;'
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _var_0 = true;',
			'export = _var_0;'
		]);
		assertTranslation([
			'exports = true;',
			'exports = true;',
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _var_0 = true;',
			'var _var_1 = true;',
			'export = _var_0;',
			'export = _var_1;'
		]);
		assertTranslation([
			'module.exports = true;'
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _var_0 = true;',
			'export = _var_0;'
		]);
		assertTranslation([
			'module.exports = true;',
			'module.exports = true;',
		], [
			'declare var exports:any; declare var module:any; declare var require:any;',
			'var _var_0 = true;',
			'var _var_1 = true;',
			'export = _var_0;',
			'export = _var_1;'
		]);
	});

	test('global - generate global variables', function() {
		assertTranslation([
			'/*global foo*/',
			'console.log(foo);'
		], [
			'/*global foo*/',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'console.log(foo);declare var foo:any;\n'
		]);
	//	assertTranslation([
	//		'/*global foo*/',
	//		'/*global foo*/',
	//		'console.log(foo);'
	//	], [
	//		'declare var foo:any;',
	//		'/*global foo*/',
	//		'/*global foo*/',
	//		'console.log(foo);'
	//	]);
		assertTranslation([
			'/*!Copyright*/',
			'/*global foo*/',
			'console.log(foo);'
		], [
			'/*!Copyright*/',
			'/*global foo*/',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'console.log(foo);declare var foo:any;\n'
		]);
		assertTranslation([
			'/*global foo, bar*/',
			'console.log(foo);'
		], [
			'/*global foo, bar*/',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'console.log(foo);declare var foo:any;',
			'declare var bar:any;\n'
		]);
		assertTranslation([
			'/*global foo,',
			' bar*/',
			'console.log(foo);'
		], [
			'/*global foo,',
			' bar*/',
			'declare var exports:any; declare var module:any; declare var require:any;',
			'console.log(foo);declare var foo:any;',
			'declare var bar:any;\n'
		]);
	});
});