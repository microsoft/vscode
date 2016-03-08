/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import mm = require('vs/editor/common/model/mirrorModel');
import cssWorker = require('vs/languages/css/common/cssWorker');
import URI from 'vs/base/common/uri';
import ResourceService = require('vs/editor/common/services/resourceServiceImpl');
import MarkerService = require('vs/platform/markers/common/markerService');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import WinJS = require('vs/base/common/winjs.base');
import cssErrors = require('vs/languages/css/common/parser/cssErrors');
import servicesUtil2 = require('vs/editor/test/common/servicesTestUtils');
import modesUtil = require('vs/editor/test/common/modesTestUtils');
import {NULL_THREAD_SERVICE} from 'vs/platform/test/common/nullThreadService';
import {IMarker} from 'vs/platform/markers/common/markers';

export function mockMirrorModel(content:string, url:URI = null) : mm.MirrorModel {
	return mm.createTestMirrorModelFromString(content, modesUtil.createMockMode('mock.mode.id', /(#?-?\d*\.\d\w*%?)|([@#.:!]?[\w-?]+%?)|[@#.!]/g), url);
}

suite('Validation - CSS', () => {

	test('Test Error Mapping', function():void {

		var source = '    #navigation a;';
		var message = cssErrors.ParseError.LeftCurlyExpected.message;
		var url = URI.parse('inmemory://localhost/vs/editor/common/model/mirrorModel/1');
		var mirrorModel:any= mockMirrorModel(source, url);

		var markerService = new MarkerService.MainProcessMarkerService(NULL_THREAD_SERVICE);
		var resourceService = new ResourceService.ResourceService();
		resourceService.insert(url, mirrorModel);

		let services = servicesUtil2.createMockEditorWorkerServices({
			resourceService: resourceService,
			markerService: markerService
		});
		var worker = new cssWorker.CSSWorker('mock.mode.id', [], services.resourceService, services.markerService);
		worker.doValidate([url]);

		var markers = markerService.read({ resource: url });
		var marker = markers[0];
		assert.equal(marker.startColumn, 18);
		assert.equal(marker.endColumn, 19);
		assert.equal(marker.message, message);
	});

	var mockCSSWorkerEnv = function (url: URI, content: string): { worker: cssWorker.CSSWorker; model: mm.MirrorModel; markers: IMarker[]; } {
		var resourceService = new ResourceService.ResourceService();
		var model = mockMirrorModel(content, url);
		resourceService.insert(url, model);

		var markerService = new MarkerService.MainProcessMarkerService(NULL_THREAD_SERVICE);

		let services = servicesUtil2.createMockEditorWorkerServices({
			resourceService: resourceService,
			markerService: markerService
		});

		var worker = new cssWorker.CSSWorker('mock.mode.id', [], services.resourceService, services.markerService);
		worker.doValidate([url]);

		var markers = markerService.read({ resource: url });
		return { worker: worker, model: model, markers: markers };
	};

	var testSuggestionsFor = function(value:string, stringBefore:string):WinJS.TPromise<Modes.ISuggestResult> {
		var url = URI.parse('test://1');
		var env = mockCSSWorkerEnv(url, value);

		var idx = stringBefore ? value.indexOf(stringBefore) + stringBefore.length : 0;
		var position = env.model.getPositionFromOffset(idx);
		return env.worker.suggest(url, position).then(result => result[0]);
	};

	var testValueSetFor = function(value:string, selection:string, selectionLength: number, up: boolean):WinJS.TPromise<Modes.IInplaceReplaceSupportResult> {
		var url = URI.parse('test://1');
		var env = mockCSSWorkerEnv(url, value);

		var pos = env.model.getPositionFromOffset(value.indexOf(selection));
		var range = { startLineNumber: pos.lineNumber, startColumn: pos.column, endLineNumber: pos.lineNumber, endColumn: pos.column + selectionLength };

		return env.worker.navigateValueSet(url, range, up);
	};

	var testOccurrences = function (value: string, tokenBefore: string): WinJS.TPromise<{ occurrences: Modes.IOccurence[]; model: mm.MirrorModel; }> {
		var url = URI.parse('test://1');
		var env = mockCSSWorkerEnv(url, value);

		var pos = env.model.getPositionFromOffset(value.indexOf(tokenBefore) + tokenBefore.length);

		return env.worker.findOccurrences(url, pos).then((occurrences) => { return { occurrences: occurrences, model: env.model}; });
	};

	var testQuickFixes = function (value: string, tokenBefore: string): WinJS.TPromise<{ fixes: Modes.IQuickFix[]; model: mm.MirrorModel; }> {
		var url = URI.parse('test://1');
		var env = mockCSSWorkerEnv(url, value);

		var pos = env.model.getPositionFromOffset(value.indexOf(tokenBefore) + tokenBefore.length);

		var markers = env.markers.filter((m) => m.startColumn === pos.column && m.startLineNumber === pos.lineNumber);
		assert.equal(1, markers.length, 'No marker at pos: ' + JSON.stringify({ pos: pos, markers: env.markers }));

		return env.worker.getQuickFixes(url, markers[0]).then((fixes) => { return { fixes: fixes, model: env.model}; });
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

	var assertQuickFix= function(fixes: Modes.IQuickFix[], model: mm.MirrorModel, expectedContent:string[]) {
		var labels = fixes.map(f => f.command.title);

		for (var index = 0; index < expectedContent.length; index++) {
			assert.ok(labels.indexOf(expectedContent[index]) !== -1, 'Quick fix not found: ' + expectedContent[index]);
		}
	};

	test('Intellisense', function(testDone): any {
		WinJS.Promise.join([
			testSuggestionsFor(' ', null).then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '@import');
				assertSuggestion(completion, '@keyframes');
				assertSuggestion(completion, 'div');
			}),

			testSuggestionsFor(' body {', null).then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '@import');
				assertSuggestion(completion, '@keyframes');
				assertSuggestion(completion, 'html');
			}),

			testSuggestionsFor('body {', '{').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'display');
				assertSuggestion(completion, 'background');
			}),
			testSuggestionsFor('body { ver', 'ver').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'ver');
				assertSuggestion(completion, 'vertical-align');
			}),
			testSuggestionsFor('body { vertical-align', 'vertical-ali').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'vertical-ali');
				assertSuggestion(completion, 'vertical-align');
			}),

			testSuggestionsFor('body { vertical-align', 'vertical-align').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'vertical-align');
				assertSuggestion(completion, 'vertical-align');
			}),
			testSuggestionsFor('body { vertical-align: bottom;}', 'vertical-align').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'vertical-align');
				assertSuggestion(completion, 'vertical-align');
			}),
			testSuggestionsFor('body { vertical-align: bottom;}', 'vertical-align:').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'bottom');
				assertSuggestion(completion, '0cm');
			}),
			testSuggestionsFor('body { vertical-align: bottom;}', 'vertical-align: ').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'bottom');
				assertSuggestion(completion, '0cm');
			}),
			testSuggestionsFor('body { vertical-align: bott', 'bott').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'bott');
				assertSuggestion(completion, 'bottom');
			}),
			testSuggestionsFor('body { vertical-align: bottom }', 'bott').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'bott');
				assertSuggestion(completion, 'bottom');
			}),
			testSuggestionsFor('body { vertical-align: bottom }', 'bottom').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'bottom');
				assertSuggestion(completion, 'bottom');
			}),
			testSuggestionsFor('body { vertical-align: bottom; }', 'bottom').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'bottom');
				assertSuggestion(completion, 'bottom');
			}),
			testSuggestionsFor('body { vertical-align: bottom; }', 'bottom;').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assert.equal(completion.suggestions.length, 0);
			}),
			testSuggestionsFor('body { vertical-align: bottom; }', 'bottom; ').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'display');
			}),
			testSuggestionsFor('body { vertical-align: 9 }', '9').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '9');
				assertSuggestion(completion, '9cm');
			}),
			testSuggestionsFor('body { vertical-align: 1.2 }', '1.2').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '1.2');
				assertSuggestion(completion, '1.2em');
			}),
			testSuggestionsFor('body { vertical-align: 10 }', '1').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '1');
				assertSuggestion(completion, '1cm');
			}),
			testSuggestionsFor('body { vertical-align: 10c }', '10c').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '10c');
				assertSuggestion(completion, '10cm');
			}),
			testSuggestionsFor('body { notexisting: ;}', 'notexisting: ').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assert.equal(completion.suggestions.length, 0); // no matches
			}),
			testSuggestionsFor('@import url("something.css");', '@').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '@');
				assert.equal(completion.suggestions.length, 0); // to be improved
			}),
			testSuggestionsFor('body { border-right: ', 'right: ').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'cyan');
				assertSuggestion(completion, 'dotted');
				assertSuggestion(completion, '0em');
			}),
			testSuggestionsFor('body { border-right: cyan dotted 2em ', 'cyan').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'cyan');
				assertSuggestion(completion, 'cyan');
				assertSuggestion(completion, 'darkcyan');
			}),
			testSuggestionsFor('body { border-right: dotted 2em ', '2em ').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'cyan');
			}),
			testSuggestionsFor('body { trans ', 'trans').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'trans');
				assertSuggestion(completion, 'transition');
			}),
			testSuggestionsFor('.foo { background-color: #123456; } .bar { background-color: }', '.bar { background-color:').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '#123456', '##123456');
			}),
			testSuggestionsFor('.foo { unknown: foo; } .bar { unknown: }', '.bar { unknown:').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'foo', 'value');
			}),
			testSuggestionsFor('.foo { background-color: r', 'background-color: r').then(function(completion: Modes.ISuggestResult): void {
				assert.equal(completion.currentWord, 'r');
				assertSuggestion(completion, 'rgb', 'function');
				assertSuggestion(completion, 'rgba', 'function');
				assertSuggestion(completion, 'red', '##ff0000');
			})
		]).done(() => testDone(), (errors: any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('Value sets', function(testDone): any {
		WinJS.Promise.join([
			testValueSetFor('body { display: inline }', 'inline', 6, false).then(function(result:Modes.IInplaceReplaceSupportResult):void  {
				assertReplaceResult(result, 'flex');
			}),
			testValueSetFor('body { display: flex }', 'flex', 7, true).then(function(result:Modes.IInplaceReplaceSupportResult):void  {
				assertReplaceResult(result, 'inline');
			}),
			testValueSetFor('body { display: inline }', 'inline', 0, false).then(function(result:Modes.IInplaceReplaceSupportResult):void  {
				assertReplaceResult(result, 'flex');
			}),
			testValueSetFor('body { display: inline }', 'line', 0, false).then(function(result:Modes.IInplaceReplaceSupportResult):void  {
				assertReplaceResult(result, 'flex');
			}),
			testValueSetFor('body { display: inline }', 'display', 0, false).then(function(result:Modes.IInplaceReplaceSupportResult):void  {
				assert.ok(!result);
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('Occurrences', function(testDone): any {
		WinJS.Promise.join([
			testOccurrences('body { /*here*/display: inline } #foo { display: inline }', '/*here*/').then((result) =>  {
				assertOccurrences(result.occurrences, result.model, 2, 'display');
			}),

			testOccurrences('body { display: /*here*/inline } #foo { display: inline }', '/*here*/').then((result) =>  {
				assertOccurrences(result.occurrences, result.model, 2, 'inline');
			}),

			testOccurrences('/*here*/body { display: inline } #foo { display: inline }', '/*here*/').then((result) =>  {
				assertOccurrences(result.occurrences, result.model, 1, 'body');
			}),

			testOccurrences('/* comment */body { display: inline } ', 'comment').then((result) =>  {
				assertOccurrences(result.occurrences, result.model, 0, '');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('Quick Fixes', function(testDone): any {
		WinJS.Promise.join([
			testQuickFixes('body { /*here*/displai: inline }', '/*here*/').then((result) =>  {
				assertQuickFix(result.fixes, result.model, [ 'Rename to \'display\'']);
			}),

			testQuickFixes('body { /*here*/background-colar: red }', '/*here*/').then((result) =>  {
				assertQuickFix(result.fixes, result.model, ['Rename to \'background-color\'', 'Rename to \'background-clip\'', 'Rename to \'background-image\'' ]);
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});
});
