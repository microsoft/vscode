/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import mm = require('vs/editor/common/model/mirrorModel');
import sassWorker = require('vs/languages/sass/common/sassWorker');
import URI from 'vs/base/common/uri';
import ResourceService = require('vs/editor/common/services/resourceServiceImpl');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import WinJS = require('vs/base/common/winjs.base');
import servicesUtil2 = require('vs/editor/test/common/servicesTestUtils');
import modesUtil = require('vs/editor/test/common/modesTestUtils');

suite('SASS - Worker', () => {

	var mockSASSWorkerEnv = function (url:URI, content: string) : { worker: sassWorker.SassWorker; model: mm.MirrorModel } {
		var resourceService = new ResourceService.ResourceService();
		var model = mm.createTestMirrorModelFromString(content, modesUtil.createMockMode('mock.mode.id', /(#?-?\d*\.\d\w*%?)|([$@#!]?[\w-?]+%?)|[$@#!]/g), url);
		resourceService.insert(url, model);

		let services = servicesUtil2.createMockEditorWorkerServices({
			resourceService: resourceService,
		});

		var worker = new sassWorker.SassWorker('mock.mode.id', [], services.resourceService, services.markerService);
		return { worker: worker, model: model };
	};

	var testSuggestionsFor = function(value:string, stringBefore:string):WinJS.TPromise<Modes.ISuggestResult> {
		var url = URI.parse('test://1');
		var env = mockSASSWorkerEnv(url, value);

		var idx = stringBefore ? value.indexOf(stringBefore) + stringBefore.length : 0;
		var position = env.model.getPositionFromOffset(idx);
		return env.worker.suggest(url, position).then(result => result[0]);
	};

	var testValueSetFor = function(value:string, selection:string, selectionLength: number, up: boolean):WinJS.TPromise<Modes.IInplaceReplaceSupportResult> {
		var url = URI.parse('test://1');
		var env = mockSASSWorkerEnv(url, value);

		var pos = env.model.getPositionFromOffset(value.indexOf(selection));
		var range = { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column + selectionLength };

		return env.worker.navigateValueSet(url, range, up);
	};

	var testOccurrences = function(value:string, tokenBefore:string):WinJS.TPromise<{ occurrences: Modes.IOccurence[]; model: mm.MirrorModel }> {
		var url = URI.parse('test://1');
		var env = mockSASSWorkerEnv(url, value);

		var pos = env.model.getPositionFromOffset(value.indexOf(tokenBefore) + tokenBefore.length);

		return env.worker.findOccurrences(url, pos).then((occurrences) => { return { occurrences: occurrences, model: env.model}; });
	};

	var assertSuggestion= function(completion:Modes.ISuggestResult, label:string, type?:string) {
		var proposalsFound = completion.suggestions.filter(function(suggestion: Modes.ISuggestion) {
			return suggestion.label === label && (!type || suggestion.type === type);
		});
		if (proposalsFound.length != 1) {
			assert.fail("Suggestion not found: " + label + ", has " + completion.suggestions.map(s => s.label).join(', '));
		}
	};

	var assertReplaceResult= function(result:Modes.IInplaceReplaceSupportResult, expected:string) {
		assert.equal(result.value, expected);
	};

	var assertOccurrences= function(occurrences: Modes.IOccurence[], model: mm.MirrorModel , expectedNumber:number, expectedContent:string) {
		assert.equal(occurrences.length, expectedNumber);
		occurrences.forEach((occurrence) => {
			assert.equal(model.getValueInRange(occurrence.range), expectedContent);
		});
	};

	test('Intellisense Sass', function(testDone):any {
		WinJS.Promise.join([
			testSuggestionsFor('$i: 0; body { width: ', 'width: ').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '$i');
			}),

			testSuggestionsFor('@for $i from 1 to 3 { $', '{ $').then((completion) => {
				assert.equal(completion.currentWord, '$');
				assertSuggestion(completion, '$i');
			}),

			testSuggestionsFor('@for $i from 1 through 3 { .item-#{$i} { width: 2em * $i; } }', '.item-#{').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '$i');
			}),
			testSuggestionsFor('.foo { background-color: d', 'background-color: d').then((completion) => {
				assert.equal(completion.currentWord, 'd');
				assertSuggestion(completion, 'darken');
				assertSuggestion(completion, 'desaturate');
			}),
			testSuggestionsFor('@function foo($x, $y) { @return $x + $y; } .foo { background-color: f', 'background-color: f').then((completion) => {
				assert.equal(completion.currentWord, 'f');
				assertSuggestion(completion, 'foo');
			}),

			testSuggestionsFor('.foo { di span { } ', 'di').then((completion) => {
				assert.equal(completion.currentWord, 'di');
				assertSuggestion(completion, 'display');
				assertSuggestion(completion, 'div');
			}),
			testSuggestionsFor('.foo { .', '{ .').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '.foo');
			}),
			// issue #250
			testSuggestionsFor('.foo { display: block;', 'block;').then((completion) => {
				assert.equal(completion.currentWord, '');
				assert.equal(0, completion.suggestions.length);
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('Sass Value sets', function(testDone): any {
		WinJS.Promise.join([
			testValueSetFor('@mixin foo { display: inline }', 'inline', 6, false).then((result) => {
				assertReplaceResult(result, 'flex');
			}),
			testValueSetFor('@mixin foo($i) { display: flex }', 'flex', 7, true).then((result) => {
				assertReplaceResult(result, 'inline');
			}),
			testValueSetFor('.foo { .bar { display: inline } }', 'inline', 0, false).then((result) => {
				assertReplaceResult(result, 'flex');
			}),
			testValueSetFor('@mixin foo { display: inline }', 'line', 0, false).then((result) => {
				assertReplaceResult(result, 'flex');
			}),

			testValueSetFor('@mixin foo { display: inline }', 'display', 0, false).then((result) => {
				assert.ok(!result);
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('Sass Occurrences', function(testDone): any {
		WinJS.Promise.join([
			testOccurrences('@mixin /*here*/foo { display: inline } foo { @include foo; }', '/*here*/').then((result) =>  {
				assertOccurrences(result.occurrences, result.model, 2, 'foo');
			}),

			testOccurrences('@mixin foo { display: inline } foo { @include /*here*/foo; }', '/*here*/').then((result) =>  {
				assertOccurrences(result.occurrences, result.model, 2, 'foo');
			}),

			testOccurrences('@mixin foo { display: inline } /*here*/foo { @include foo; }', '/*here*/').then((result) =>  {
				assertOccurrences(result.occurrences, result.model, 1, 'foo');
			}),

			testOccurrences('@function /*here*/foo($i) { @return $i*$i; } #foo { width: foo(2); }', '/*here*/').then((result) =>  {
				assertOccurrences(result.occurrences, result.model, 2, 'foo');
			}),

			testOccurrences('@function foo($i) { @return $i*$i; } #foo { width: /*here*/foo(2); }', '/*here*/').then((result) =>  {
				assertOccurrences(result.occurrences, result.model, 2, 'foo');
			}),
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});


});
