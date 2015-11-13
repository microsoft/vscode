/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import EditorCommon = require('vs/editor/common/editorCommon');
import types = require('vs/base/common/types');
import ts = require('vs/languages/typescript/common/lib/typescriptServices');
import lint = require('vs/languages/typescript/common/lint/lint');
import layout = require('vs/languages/typescript/common/lint/rules/layout');
import javascript = require('vs/languages/typescript/common/lint/rules/javascript');
import typescript = require('vs/languages/typescript/common/lint/rules/typescript');
import utils = require('./features/utils');
import {Range} from 'vs/editor/common/core/range';

function _assertCheck(checker:lint.SimpleStyleRuleChecker, sourceFile:ts.SourceFile, numbers:number[]):void {

	var expected:EditorCommon.IRange[] = [];

	for(var i = 0, len = numbers.length; i < len - 1; i+=2) {
		expected.push({
			startLineNumber: 1,
			startColumn: 1 + numbers[i],
			endLineNumber: 1,
			endColumn: 1 + numbers[i] + numbers[i + 1]
		});
	}

	var actual = checker.check(sourceFile);

	assert.equal(actual.length, expected.length);

	if(actual.length !== expected.length) {
		assert.ok(false, String(actual));
		return;
	}

	while(actual.length > 0) {
		var _expected  = expected.pop(),
			_actual = actual.pop().range;

		assert.ok(Range.equalsRange(_expected, _actual), JSON.stringify(_expected) + JSON.stringify(_actual));
	}
}


function assertCheck3(ctor:Function, source:string, ...numbers:number[]): void {

	var host = new utils.LanguageServiceHost().add('a.ts', source);
	var service = ts.createLanguageService(host, ts.createDocumentRegistry());
	var checker = new lint.LanuageServiceStyleRuleChecker(service, [{ rule: types.create(ctor), severity: 1 }]);
	var sourceFile = service.getSourceFile('a.ts');
	ts.bindSourceFile(sourceFile);

	_assertCheck(checker, sourceFile, numbers);
}

function assertCheck2(ctor:Function, source:string, ...numbers:number[]): void {
	var checker = new lint.SimpleStyleRuleChecker([{ rule: types.create(ctor), severity: 1 }]);
	var sourceFile = ts.createSourceFile('a.ts', source, ts.ScriptTarget.ES5);
	ts.bindSourceFile(sourceFile);

	_assertCheck(checker, sourceFile, numbers);
}

suite('TypeScript - lint', () => {

	test('EmptyBlocksMustHaveAComment', function() {
		assertCheck2(layout.EmptyBlocksWithoutComment, 'if(true) { return 8; }');
		assertCheck2(layout.EmptyBlocksWithoutComment, 'if(true) { /**/ }');
		assertCheck2(layout.EmptyBlocksWithoutComment, 'if(true) { /*coment*/ }');
		assertCheck2(layout.EmptyBlocksWithoutComment, 'if(true) {}', 9, 2);
		assertCheck2(layout.EmptyBlocksWithoutComment, 'if(true) { }', 9, 3);
	});

	test('CurlyBracketsMustNotBeOmitted', function() {
		assertCheck2(layout.CurlyBracketsMustNotBeOmitted, 'if(true) return 1', 9, 8);
	});

	test('ComparisonOperatorsMustBeStrict', function() {
		assertCheck2(javascript.ComparisonOperatorsNotStrict, 'var a = b === c;');
		assertCheck2(javascript.ComparisonOperatorsNotStrict, 'var a = b !== c;');
		assertCheck2(javascript.ComparisonOperatorsNotStrict, 'var a = b == c;', 10, 2);
		assertCheck2(javascript.ComparisonOperatorsNotStrict, 'var a = b != c;', 10, 2);
		assertCheck2(javascript.ComparisonOperatorsNotStrict, 'var a = b == c; a = b != c', 10, 2, 22, 2);
	});

	test('MissingSemicolon', function() {
		assertCheck2(javascript.MissingSemicolon, 'var a = 1;');
		assertCheck2(javascript.MissingSemicolon, 'var a = 1; b = 1;');
		assertCheck2(javascript.MissingSemicolon, 'var a = 1', 8, 1);
		assertCheck2(javascript.MissingSemicolon, 'a()', 2, 1);
		assertCheck2(javascript.MissingSemicolon, 'a(); b()', 7, 1);
		assertCheck2(javascript.MissingSemicolon, 'a = 1234', 7, 1);
		assertCheck2(javascript.MissingSemicolon, 'function f() { return 2 }', 22, 1);
		assertCheck2(javascript.MissingSemicolon, 'class C { f0:string }', 18, 1);
		assertCheck2(javascript.MissingSemicolon, 'interface I { f0:string }', 22, 1);
	});

	test('TypeOfShouldNotBeComparedToAnyStringLiteral', function() {
		assertCheck2(javascript.UnknownTypeOfResults, 'typeof a === "number"');
		assertCheck2(javascript.UnknownTypeOfResults, 'var a = (typeof body == \"farboo\");', 9, 23);
		assertCheck2(javascript.UnknownTypeOfResults, 'var a = (typeof body === \"farboo\");', 9, 24);
		assertCheck2(javascript.UnknownTypeOfResults, 'var a = (typeof body === null);', 9, 20);
		assertCheck2(javascript.UnknownTypeOfResults, 'var a = (typeof body === undefined);', 9, 25);
		assertCheck2(javascript.UnknownTypeOfResults, 'var a = typeof(\"test\")===\"string1\" || typeof(\"test\")===\"string2\" || typeof(\"test\")===\"string3\";', 8, 26, 38, 26, 68, 26);
	});

	test('DontHaveASemiColonInsteadOfABlock', function() {
		assertCheck2(javascript.SemicolonsInsteadOfBlocks, 'if(true || false);', 0, 18);
		assertCheck2(javascript.SemicolonsInsteadOfBlocks, 'if(true || false){}');
		assertCheck2(javascript.SemicolonsInsteadOfBlocks, 'if(true || false);{}', 0, 18);
		assertCheck2(javascript.SemicolonsInsteadOfBlocks, '/**/while(!!1);{}', 4, 11);
		assertCheck2(javascript.SemicolonsInsteadOfBlocks, '/**/while(!!1)  ;', 4, 13);
		assertCheck2(javascript.SemicolonsInsteadOfBlocks, 'for(;;);', 0, 8);
		assertCheck2(javascript.SemicolonsInsteadOfBlocks, 'for(;;)/**/;', 0, 12);
		assertCheck2(javascript.SemicolonsInsteadOfBlocks, 'for(var a in b);', 0, 16);
	});

	test('FunctionsInsideLoops', function() {
		assertCheck2(javascript.FunctionsInsideLoops, 'for(;;) { function a() {} }', 10, 15);
		assertCheck2(javascript.FunctionsInsideLoops, 'for(a in b) { function a() {} }', 14, 15);
		assertCheck2(javascript.FunctionsInsideLoops, 'do { function a() {} }while(true)', 5, 15);
		assertCheck2(javascript.FunctionsInsideLoops, 'while(true) { function a() {} }', 14, 15);
		assertCheck2(javascript.FunctionsInsideLoops, 'while(true) { var a = function() {} }', 22, 13);
		assertCheck2(javascript.FunctionsInsideLoops, 'while(true) { var a = () => {} }', 22, 8);
		assertCheck2(javascript.FunctionsInsideLoops, 'while(true) { var a = a => {} }', 22, 7);
		assertCheck2(javascript.FunctionsInsideLoops, 'while(true) { var a = (a, b) => {} }', 22, 12);
	});

	test('NewOnLowercaseFunctions', function() {
		assertCheck2(javascript.NewOnLowercaseFunctions, 'new Foo();');
		assertCheck2(javascript.NewOnLowercaseFunctions, 'new class {}');
		assertCheck2(javascript.NewOnLowercaseFunctions, 'new foo.Bar();');
		assertCheck2(javascript.NewOnLowercaseFunctions, 'new _foo();');
		assertCheck2(javascript.NewOnLowercaseFunctions, 'new foo();', 4, 3);
		assertCheck2(javascript.NewOnLowercaseFunctions, 'new $foo();', 4, 4);
		assertCheck2(javascript.NewOnLowercaseFunctions, 'new foo.bar();', 4, 7);
	});

	test('FunctionsMustHaveAReturnType', function() {
		assertCheck2(typescript.FunctionsWithoutReturnType, 'class A { foo():void{}}');
		assertCheck2(typescript.FunctionsWithoutReturnType, 'class A { foo():boolean{}}');
		assertCheck2(typescript.FunctionsWithoutReturnType, 'class A { foo(){}}', 10, 3);
		assertCheck2(typescript.FunctionsWithoutReturnType, 'function foo(){}', 9, 3);
		assertCheck2(typescript.FunctionsWithoutReturnType, 'var f = function(){}');
	});

	test('LooksLikeATripleSlashReference', function() {
		assertCheck2(typescript.TripleSlashReferenceAlike, '/// <reference path="path.ts">');
		assertCheck2(typescript.TripleSlashReferenceAlike, '/// <reference path="path.ts"');
		assertCheck2(typescript.TripleSlashReferenceAlike, '/// <amd-dependency path="vs/css!./referenceSearchWidget" />');
		assertCheck2(typescript.TripleSlashReferenceAlike, '/// <reference path="path.ts>', 0, 29);
		assertCheck2(typescript.TripleSlashReferenceAlike, '/// <reference path="">', 0, 23);
		assertCheck2(typescript.TripleSlashReferenceAlike, '// <reference path=\'path\'>', 0, 26);
		assertCheck2(typescript.TripleSlashReferenceAlike, '/// <reference "far.d.ts">', 0, 26);
		assertCheck2(typescript.TripleSlashReferenceAlike, '/// <reference \'far.d.ts\'>', 0, 26);
	});

	test('RemoveUnusedVariables', function () {
		assertCheck3(typescript.UnusedVariables, 'export var a = true;'); // exported
		assertCheck3(typescript.UnusedVariables, 'var a = true;'); // global
		assertCheck3(typescript.UnusedVariables, 'var a;'); // global
		assertCheck3(typescript.UnusedVariables, 'var a = true; a = false; a = !a;');
		assertCheck3(typescript.UnusedVariables, 'function f() { var a = true; return a; }');
		assertCheck3(typescript.UnusedVariables, 'function f() { var a = true; var b = 1; return a; }', 33, 1);
		assertCheck3(typescript.UnusedVariables, 'function f() { var a = true; var b:number = 1; return a; }', 33, 1);
	});

	test('RemoveUnusedFunctions', function() {
		assertCheck3(typescript.UnusedFunctions, 'export function fn(){}');
		assertCheck3(typescript.UnusedFunctions, 'function fn(){}', 9, 2);
		assertCheck3(typescript.UnusedFunctions, 'function fn(){}; fn();');
	});

	test('RemoveUnusedImports', function() {
		assertCheck3(typescript.UnusedImports, 'import Env = require(\'vs/base/env\'); var t = Env;');
		assertCheck3(typescript.UnusedImports, 'import Env = require(\'vs/base/env\');', 0, 36);
		assertCheck3(typescript.UnusedImports, 'import utils = require(\'./features/utils\')', 0, 42);
	});

	test('RemoveUnusedMembers', function() {
		assertCheck3(typescript.UnusedMembers, 'class foo { private bar = 5; public t = this.bar; }');
		assertCheck3(typescript.UnusedMembers, 'class foo { private bar; }', 20, 3);
		assertCheck3(typescript.UnusedMembers, 'class foo { public bar; private unusedMethod(); public test(): void {}}', 32, 12);
	});
});