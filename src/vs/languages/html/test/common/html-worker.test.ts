/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/html/common/html.contribution';
import assert = require('assert');
import mm = require('vs/editor/common/model/mirrorModel');
import htmlWorker = require('vs/languages/html/common/htmlWorker');
import URI from 'vs/base/common/uri';
import ResourceService = require('vs/editor/common/services/resourceServiceImpl');
import MarkerService = require('vs/platform/markers/common/markerService');
import Modes = require('vs/editor/common/modes');
import WinJS = require('vs/base/common/winjs.base');
import modesUtil = require('vs/editor/test/common/modesUtil');
import servicesUtil2 = require('vs/editor/test/common/servicesTestUtils');
import {NULL_THREAD_SERVICE} from 'vs/platform/test/common/nullThreadService';

suite('HTML - worker', () => {

	var mode: Modes.IMode;

	suiteSetup((done) => {
		modesUtil.load('html').then(_mode => {
			mode = _mode;
			done();
		});
	});

	var mockHtmlWorkerEnv = function (url: URI, content: string): { worker: htmlWorker.HTMLWorker; model: mm.MirrorModel; } {
		var resourceService = new ResourceService.ResourceService();

		var model = mm.createTestMirrorModelFromString(content, mode, url);
		resourceService.insert(url, model);

		var markerService = new MarkerService.MainProcessMarkerService(NULL_THREAD_SERVICE);

		let services = servicesUtil2.createMockEditorWorkerServices({
			resourceService: resourceService,
			markerService: markerService
		});

		var worker = new htmlWorker.HTMLWorker(mode.getId(), [], services.resourceService, services.markerService, services.contextService);

		return { worker: worker, model: model };
	};

	var testSuggestionsFor = function(value:string):WinJS.TPromise<Modes.ISuggestResult> {

		var idx = value.indexOf('|');
		var content = value.substr(0, idx) + value.substr(idx + 1);

		var url = URI.parse('test://1');
		var env = mockHtmlWorkerEnv(url, content);

		var position = env.model.getPositionFromOffset(idx);
		return env.worker.suggest(url, position).then(result => result[0]);
	};

	var assertSuggestion = function(completion: Modes.ISuggestResult, label: string, type?: string, codeSnippet?: string) {
		var proposalsFound = completion.suggestions.filter(function(suggestion: Modes.ISuggestion) {
			return suggestion.label === label && (!type || suggestion.type === type) && (!codeSnippet || suggestion.codeSnippet === codeSnippet);
		});
		if (proposalsFound.length !== 1) {
			assert.fail('Suggestion not found: ' + label + ', has ' + completion.suggestions.map(s => s.label).join(', '));
		}
	};

	test('Intellisense', function(testDone): any {
		WinJS.Promise.join([
			testSuggestionsFor('<|').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'iframe');
				assertSuggestion(completion, 'h1');
				assertSuggestion(completion, 'div');
			}),

			testSuggestionsFor('< |').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'iframe');
				assertSuggestion(completion, 'h1');
				assertSuggestion(completion, 'div');
			}),

			testSuggestionsFor('<h|').then((completion) => {
				assert.equal(completion.currentWord, 'h');
				assertSuggestion(completion, 'html');
				assertSuggestion(completion, 'h1');
				assertSuggestion(completion, 'header');
			}),

			testSuggestionsFor('<input|').then((completion) => {
				assert.equal(completion.currentWord, 'input');
				assertSuggestion(completion, 'input');
			}),

			testSuggestionsFor('<input |').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'type');
				assertSuggestion(completion, 'style');
				assertSuggestion(completion, 'onmousemove');
			}),

			testSuggestionsFor('<input t|').then((completion) => {
				assert.equal(completion.currentWord, 't');
				assertSuggestion(completion, 'type');
				assertSuggestion(completion, 'tabindex');
			}),

			testSuggestionsFor('<input type="text" |').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'style');
				assertSuggestion(completion, 'type');
				assertSuggestion(completion, 'size');
			}),

			testSuggestionsFor('<input type="text" s|').then((completion) => {
				assert.equal(completion.currentWord, 's');
				assertSuggestion(completion, 'style');
				assertSuggestion(completion, 'src');
				assertSuggestion(completion, 'size');
			}),

			testSuggestionsFor('<input di| type="text"').then((completion) => {
				assert.equal(completion.currentWord, 'di');
				assertSuggestion(completion, 'disabled', null, 'disabled');
				assertSuggestion(completion, 'dir', null, 'dir="{{}}"');
			}),

			testSuggestionsFor('<input disabled | type="text"').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'dir', null, 'dir="{{}}"');
				assertSuggestion(completion, 'style');
			}),

			testSuggestionsFor('<input type=|').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'text', null, '"text"');
				assertSuggestion(completion, 'checkbox', null, '"checkbox"');
			}),

			testSuggestionsFor('<input type="c|').then((completion) => {
				assert.equal(completion.currentWord, 'c');
				assertSuggestion(completion, 'color', null, 'color');
				assertSuggestion(completion, 'checkbox', null, 'checkbox');
			}),

			testSuggestionsFor('<input type= |').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'color', null, '"color"');
				assertSuggestion(completion, 'checkbox', null, '"checkbox"');
			}),

			testSuggestionsFor('<input src="c" type="color|" ').then((completion) => {
				assert.equal(completion.currentWord, 'color');
				assertSuggestion(completion, 'color', null, 'color');
			}),

			testSuggestionsFor('<div dir=|></div>').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'ltr', null, '"ltr"');
				assertSuggestion(completion, 'rtl', null, '"rtl"');
			}),
			testSuggestionsFor('<ul><|>').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/ul', null, '/ul');
				assertSuggestion(completion, 'li', null, 'li');
			}),
			testSuggestionsFor('<ul><li><|').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/li', null, '/li>');
				assertSuggestion(completion, 'a', null, 'a');
			}),
			testSuggestionsFor('<table></|>').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/table', null, '/table');
			}),
			testSuggestionsFor('<foo></f|').then((completion) => {
				assert.equal(completion.currentWord, 'f');
				assertSuggestion(completion, '/foo', null, '/foo>');
			}),
			testSuggestionsFor('<ul></ |>').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/ul', null, '/ul');
			}),
			testSuggestionsFor('<span></ |').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/span', null, '/span>');
			}),
			testSuggestionsFor('<li><br></ |>').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/li', null, '/li');
			}),
			testSuggestionsFor('<li><br/></ |>').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/li', null, '/li');
			}),
			testSuggestionsFor('<li><div/></|').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/li', null, '/li>');
			}),
			testSuggestionsFor('<li><br/|>').then((completion) => {
				assert.equal(completion.currentWord, '');
				assert.equal(completion.suggestions.length, 0);
			}),
			testSuggestionsFor('<li><br>a/|').then((completion) => {
				assert.equal(completion.currentWord, '');
				assert.equal(completion.suggestions.length, 0);
			}),

			testSuggestionsFor('<a><div></div></|   ').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/a', null, '/a>');
			}),
			testSuggestionsFor('<body><div><div></div></div></|  >').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/body', null, '/body');
			}),
			testSuggestionsFor(['<body>', '  <div>', '    </|'].join('\n')).then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, '/div', null, '  </div>');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('Intellisense aria', function(testDone): any {
		function assertAriaAttributes(completion) {
			assertSuggestion(completion, 'aria-activedescendant');
			assertSuggestion(completion, 'aria-atomic');
			assertSuggestion(completion, 'aria-autocomplete');
			assertSuggestion(completion, 'aria-busy');
			assertSuggestion(completion, 'aria-checked');
			assertSuggestion(completion, 'aria-colcount');
			assertSuggestion(completion, 'aria-colindex');
			assertSuggestion(completion, 'aria-colspan');
			assertSuggestion(completion, 'aria-controls');
			assertSuggestion(completion, 'aria-current');
			assertSuggestion(completion, 'aria-describedat');
			assertSuggestion(completion, 'aria-describedby');
			assertSuggestion(completion, 'aria-disabled');
			assertSuggestion(completion, 'aria-dropeffect');
			assertSuggestion(completion, 'aria-errormessage');
			assertSuggestion(completion, 'aria-expanded');
			assertSuggestion(completion, 'aria-flowto');
			assertSuggestion(completion, 'aria-grabbed');
			assertSuggestion(completion, 'aria-haspopup');
			assertSuggestion(completion, 'aria-hidden');
			assertSuggestion(completion, 'aria-invalid');
			assertSuggestion(completion, 'aria-kbdshortcuts');
			assertSuggestion(completion, 'aria-label');
			assertSuggestion(completion, 'aria-labelledby');
			assertSuggestion(completion, 'aria-level');
			assertSuggestion(completion, 'aria-live');
			assertSuggestion(completion, 'aria-modal');
			assertSuggestion(completion, 'aria-multiline');
			assertSuggestion(completion, 'aria-multiselectable');
			assertSuggestion(completion, 'aria-orientation');
			assertSuggestion(completion, 'aria-owns');
			assertSuggestion(completion, 'aria-placeholder');
			assertSuggestion(completion, 'aria-posinset');
			assertSuggestion(completion, 'aria-pressed');
			assertSuggestion(completion, 'aria-readonly');
			assertSuggestion(completion, 'aria-relevant');
			assertSuggestion(completion, 'aria-required');
			assertSuggestion(completion, 'aria-roledescription');
			assertSuggestion(completion, 'aria-rowcount');
			assertSuggestion(completion, 'aria-rowindex');
			assertSuggestion(completion, 'aria-rowspan');
			assertSuggestion(completion, 'aria-selected');
			assertSuggestion(completion, 'aria-setsize');
			assertSuggestion(completion, 'aria-sort');
			assertSuggestion(completion, 'aria-valuemax');
			assertSuggestion(completion, 'aria-valuemin');
			assertSuggestion(completion, 'aria-valuenow');
			assertSuggestion(completion, 'aria-valuetext');
		}
		WinJS.Promise.join([
			testSuggestionsFor('<div  |> </div >').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertAriaAttributes(completion);
			}),

			testSuggestionsFor('<span  |> </span >').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertAriaAttributes(completion);
			}),

			testSuggestionsFor('<input  |> </input >').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertAriaAttributes(completion);
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('Intellisense Angular', function(testDone): any {
		WinJS.Promise.join([
			testSuggestionsFor('<body  |> </body >').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'ng-controller');
				assertSuggestion(completion, 'data-ng-controller');
			}),

			testSuggestionsFor('<li  |> </li >').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'ng-repeat');
				assertSuggestion(completion, 'data-ng-repeat');
			}),

			testSuggestionsFor('<input  |> </input >').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'ng-model');
				assertSuggestion(completion, 'data-ng-model');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	test('Intellisense Ionic', function(testDone): any {
		WinJS.Promise.join([
			// Try some Ionic tags
			testSuggestionsFor('<|').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'ion-checkbox');
				assertSuggestion(completion, 'ion-content');
				assertSuggestion(completion, 'ion-nav-title');
			}),
			testSuggestionsFor('<ion-re|').then((completion) => {
				assert.equal(completion.currentWord, 'ion-re');
				assertSuggestion(completion, 'ion-refresher');
				assertSuggestion(completion, 'ion-reorder-button');
			}),
			// Try some global attributes (1 with value suggestions, 1 without value suggestions, 1 void)
			testSuggestionsFor('<ion-checkbox |').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'force-refresh-images');
				assertSuggestion(completion, 'collection-repeat');
				assertSuggestion(completion, 'menu-close');
			}),
			// Try some tag-specific attributes (1 with value suggestions, 1 void)
			testSuggestionsFor('<ion-footer-bar |').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'align-title');
				assertSuggestion(completion, 'keyboard-attach');
			}),
			// Try the extended attributes of an existing HTML 5 tag
			testSuggestionsFor('<a |').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'nav-direction');
				assertSuggestion(completion, 'nav-transition');
				assertSuggestion(completion, 'href');
				assertSuggestion(completion, 'hreflang');
			}),
			// Try value suggestion for a tag-specific attribute
			testSuggestionsFor('<ion-side-menu side="|').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'left');
				assertSuggestion(completion, 'primary');
				assertSuggestion(completion, 'right');
				assertSuggestion(completion, 'secondary');
			}),
			// Try a value suggestion for a global attribute
			testSuggestionsFor('<img force-refresh-images="|').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'false');
				assertSuggestion(completion, 'true');
			}),
			// Try a value suggestion for an extended attribute of an existing HTML 5 tag
			testSuggestionsFor('<a nav-transition="|').then((completion) => {
				assert.equal(completion.currentWord, '');
				assertSuggestion(completion, 'android');
				assertSuggestion(completion, 'ios');
				assertSuggestion(completion, 'none');
			})
		]).done(() => testDone(), (errors:any[]) => {
			testDone(errors.reduce((e1, e2) => e1 || e2));
		});
	});

	function testLinkCreation(modelUrl:string, rootUrl:string, tokenContent:string, expected:string): void {
		var _modelUrl = URI.parse(modelUrl);
		var _rootUrl = rootUrl === null ? null : URI.parse(rootUrl);
		var actual = htmlWorker.HTMLWorker._getWorkspaceUrl(_modelUrl, _rootUrl, tokenContent);
		var _actual = actual === null ? null : URI.parse(actual);
		var _expected = expected === null ? null : URI.parse(expected);
		assert.equal(String(_actual), String(_expected));
	}

	test('Link creation', () => {
		testLinkCreation('inmemory://model/1', null, 'javascript:void;', null);
		testLinkCreation('inmemory://model/1', null, ' \tjavascript:alert(7);', null);
		testLinkCreation('inmemory://model/1', null, ' #relative', null);
		testLinkCreation('inmemory://model/1', null, 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('inmemory://model/1', null, 'http://www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', null, 'https://www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', null, '//www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', null, '../../a.js', 'inmemory://model/a.js');

		testLinkCreation('inmemory://model/1', 'inmemory://model/', 'javascript:void;', null);
		testLinkCreation('inmemory://model/1', 'inmemory://model/', ' \tjavascript:alert(7);', null);
		testLinkCreation('inmemory://model/1', 'inmemory://model/', ' #relative', null);
		testLinkCreation('inmemory://model/1', 'inmemory://model/', 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('inmemory://model/1', 'inmemory://model/', 'http://www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', 'inmemory://model/', 'https://www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', 'inmemory://model/', '  //www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('inmemory://model/1', 'inmemory://model/', '../../a.js', 'inmemory://model/a.js');

		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'javascript:void;', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, ' \tjavascript:alert(7);', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, ' #relative', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'http://www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'https://www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, '  //www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'a.js', 'file:///C:/Alex/src/path/to/a.js');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, '/a.js', 'file:///a.js');

		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'javascript:void;', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', ' \tjavascript:alert(7);', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', ' #relative', null);
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', null, 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'http://www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'https://www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'https://www.microsoft.com/?q=1#h', 'https://www.microsoft.com/?q=1#h');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', '  //www.microsoft.com/', 'http://www.microsoft.com/');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', 'a.js', 'file:///C:/Alex/src/path/to/a.js');
		testLinkCreation('file:///C:/Alex/src/path/to/file.txt', 'file:///C:/Alex/src/', '/a.js', 'file:///C:/Alex/src/a.js');

		testLinkCreation('https://www.test.com/path/to/file.txt', null, 'file:///C:\\Alex\\src\\path\\to\\file.txt', 'file:///C:\\Alex\\src\\path\\to\\file.txt');
		testLinkCreation('https://www.test.com/path/to/file.txt', null, '//www.microsoft.com/', 'https://www.microsoft.com/');
		testLinkCreation('https://www.test.com/path/to/file.txt', 'https://www.test.com', '//www.microsoft.com/', 'https://www.microsoft.com/');

		// invalid uris don't throw
		testLinkCreation('https://www.test.com/path/to/file.txt', 'https://www.test.com', '%', 'https://www.test.com/path/to/%25');

		// Bug #18314: Ctrl + Click does not open existing file if folder's name starts with 'c' character
		testLinkCreation('file:///c:/Alex/working_dir/18314-link-detection/test.html', 'file:///c:/Alex/working_dir/18314-link-detection/', '/class/class.js', 'file:///c:/Alex/working_dir/18314-link-detection/class/class.js');
	});
});
