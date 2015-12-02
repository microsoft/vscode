/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import URI from 'vs/base/common/uri';
import outline = require('vs/languages/typescript/common/features/outline');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import utils = require('vs/languages/typescript/test/common/features/utils');

suite('TS - outline', () => {

	function assertOutline(code:string, callback:(outline:Modes.IOutlineEntry[])=>any):void {

		var host = new utils.LanguageServiceHost().add('a', code);
		var elements = outline.compute(ts.createLanguageService(host, ts.createDocumentRegistry()), URI.parse('a'));

		try {
			callback(elements);
		} catch(e) {
			assert.ok(false, e);
		}
	}

	//test('classes', function() {
	//
	//	assertOutline('class C {}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].type, outline.Type.toString(outline.Type.Class));
	//	});
	//
	//	assertOutline('class C { a:number; b(){} get n(){} set n(value:n) }', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].type, outline.Type.toString(outline.Type.Class));
	//		assert.equal(elements[0].children.length, 4);
	//	});
	//});

	//test('enums', function() {
	//
	//	assertOutline('enum E {}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].type, outline.Type.toString(outline.Type.Enum));
	//	});
	//
	//	assertOutline('enum E { a, b, c }', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].type, outline.Type.toString(outline.Type.Enum));
	//		assert.equal(elements[0].children.length, 3);
	//		assert.ok(elements[0].children.every(child => child.type === outline.Type.toString(outline.Type.Property)));
	//	});
	//});
	//
	//test('modules', function() {
	//
	//	assertOutline('module Foo { export var a:number; }', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].type, outline.Type.toString(outline.Type.Module));
	//		assert.equal(elements[0].children.length, 1);
	//	});
	//
	//	assertOutline('module Foo { export var a; }', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].type, outline.Type.toString(outline.Type.Module));
	//		assert.equal(elements[0].children.length, 1);
	//	});
	//
	//	assertOutline('declare module Foo { export var a:number; }', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].type, outline.Type.toString(outline.Type.Module));
	//		assert.equal(elements[0].children.length, 1);
	//	});
	//});

	//test('function expressions', function() {
	//
	//	assertOutline('var a = function() {}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].label, 'a = function()');
	//	});
	//
	//	assertOutline('var a = function(b:boolean) {}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].label, 'a = function(b:boolean)');
	//	});
	//
	//	assertOutline('{ a: function() {}}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].label, 'a: function()');
	//	});
	//
	//	assertOutline('{ a: function() {}, b: function(){}, c: function c(){} }', (elements) => {
	//		assert.equal(elements.length, 3);
	//		assert.equal(elements[0].label, 'a: function()');
	//		assert.equal(elements[1].label, 'b: function()');
	//		assert.equal(elements[2].label, 'c()');
	//	});
	//
	//	assertOutline('{ a: function b() {}}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].label, 'b()');
	//	});
	//
	//	assertOutline('{ a: function(c:number, ...rest:any[]) {}}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].label, 'a: function(c:number, ...rest:any[])');
	//	});
	//
	//	assertOutline('var _ = { a: function() {}}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].children.length, 1);
	//		elements = elements[0].children;
	//		assert.equal(elements[0].label, 'a: function()');
	//	});
	//
	//	assertOutline('a.b.c = function() {}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].label, 'c = function()');
	//	});
	//
	//	assertOutline('a.b.c = function d() {}', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].label, 'd()');
	//	});
	//
	//	assertOutline('[].forEach(function() {})', (elements) => {
	//		assert.equal(elements.length, 0);
	//	});
	//
	//	assertOutline('define(function() {})', (elements) => {
	//		assert.equal(elements.length, 0);
	//	});
	//});

	//test('variables', function() {
	//
	//	assertOutline('var a = 1', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].type, outline.Type.toString(outline.Type.Variable));
	//	});
	//
	//	assertOutline('function b(){ var a = 1 }', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.ok(!elements[0].children);
	//	});
	//
	//	assertOutline('(function() { var a = 23;})()', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].type, outline.Type.toString(outline.Type.Variable));
	//	});
	//
	//	assertOutline('(function foo() { var a = 23;})()', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.equal(elements[0].children.length, 1);
	//		assert.equal(elements[0].children[0].type, outline.Type.toString(outline.Type.Variable));
	//	});
	//
	//	assertOutline('function foo() { var a = 23; }', (elements) => {
	//		assert.equal(elements.length, 1);
	//		assert.ok(!elements[0].children);
	//	});
	//});
});