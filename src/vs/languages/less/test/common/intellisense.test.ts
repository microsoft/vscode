/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import mm = require('vs/editor/common/model/mirrorModel');
import lessWorker = require('vs/languages/less/common/lessWorker');
import URI from 'vs/base/common/uri';
import ResourceService = require('vs/editor/common/services/resourceServiceImpl');
import WinJS = require('vs/base/common/winjs.base');
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import servicesUtil2 = require('vs/editor/test/common/servicesTestUtils');
import modesUtil = require('vs/editor/test/common/modesTestUtils');

suite('LESS - Intellisense', () => {


	//------------ TEST suggestions ----------------

	var testSuggestionsFor = function(value:string, stringBefore:string):WinJS.TPromise<Modes.ISuggestResult> {
		var resourceService = new ResourceService.ResourceService();
		var url = URI.parse('test://1');
		resourceService.insert(url,  mm.createTestMirrorModelFromString(value, modesUtil.createMockMode('mock.mode.id', /(-?\d*\.\d+)|([\w-]+)/g), url));

		let services = servicesUtil2.createMockEditorWorkerServices({
			resourceService: resourceService,
		});

		var worker = new lessWorker.LessWorker('mock.mode.id', [], services.resourceService, services.markerService);
		var position: EditorCommon.IPosition;
		if (stringBefore === null) {
			position = { column: 1, lineNumber: 1 };
		} else {
			var idx = value.indexOf(stringBefore);
			position = {
				column: idx + stringBefore.length + 1,
				lineNumber: 1
			};
		}
		return worker.suggest(url, position).then(result => result[0]);
	};

	var assertSuggestion= function(completion:Modes.ISuggestResult, label:string) {
		var proposalsFound = completion.suggestions.filter(function(suggestion: Modes.ISuggestion) {
			return suggestion.label === label;
		});
		if (proposalsFound.length != 1) {
			assert.fail("Suggestion not found: " + label + ", has " + completion.suggestions.map(s => s.label).join(', '));
		}
	};

	test('LESS - Intellisense', function(testDone):any {
		WinJS.Promise.join([
			testSuggestionsFor('body { ', '{ ').then(function(completion:Modes.ISuggestResult):void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'display');
				assertSuggestion(completion, 'background');
			}),
			testSuggestionsFor('body { ver', 'ver').then(function(completion:Modes.ISuggestResult):void {
				assert.equal(completion.currentWord, 'ver');
				assertSuggestion(completion, 'vertical-align');
			}),
			testSuggestionsFor('body { word-break: ', ': ').then(function(completion:Modes.ISuggestResult):void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'keep-all');
			}),
			testSuggestionsFor('body { inner { vertical-align: }', ': ').then(function(completion:Modes.ISuggestResult):void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'bottom');
			}),
			testSuggestionsFor('@var1: 3; body { inner { vertical-align: }', 'align: ').then(function(completion:Modes.ISuggestResult):void {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '@var1');
			}),
			testSuggestionsFor('.foo { background-color: d', 'background-color: d').then((completion) => {
				assert.equal(completion.currentWord, 'd');
				assertSuggestion(completion, 'darken');
				assertSuggestion(completion, 'desaturate');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});
});
