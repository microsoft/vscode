/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ICommonCodeEditor, IRange } from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Model } from 'vs/editor/common/model/model';
import { mockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { QuickFixOracle } from 'vs/editor/contrib/quickFix/browser/quickFixModel';
import { CodeActionProviderRegistry, LanguageIdentifier } from 'vs/editor/common/modes';


suite('QuickFix', () => {
	const languageIdentifier = new LanguageIdentifier('foo-lang', 3);

	let uri = URI.parse('untitled:path');
	let model = Model.createFromString('foobar  foo bar\nfarboo far boo', undefined, languageIdentifier, uri);
	let markerService: MarkerService;
	let editor: ICommonCodeEditor;

	let reg = CodeActionProviderRegistry.register(languageIdentifier.language, {
		provideCodeActions() {
			return [{ command: { id: 'test-command', title: 'test', arguments: [] }, score: 1 }];
		}
	});

	setup(() => {
		markerService = new MarkerService();
		editor = mockCodeEditor([], { model });
		editor.setPosition({ lineNumber: 1, column: 1 });
	});

	suiteTeardown(() => {
		reg.dispose();
		model.dispose();
	});

	test('Orcale -> marker added', done => {

		const oracle = new QuickFixOracle(editor, markerService, e => {
			assert.equal(e.type, 'auto');
			assert.ok(e.fixes);

			e.fixes.then(fixes => {
				oracle.dispose();
				assert.equal(fixes.length, 1);
				done();
			}, done);
		});

		// start here
		markerService.changeOne('fake', uri, [{
			startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
			message: 'error',
			severity: 1,
			code: '',
			source: ''
		}]);

	});

	test('Orcale -> position changed', done => {

		markerService.changeOne('fake', uri, [{
			startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
			message: 'error',
			severity: 1,
			code: '',
			source: ''
		}]);

		editor.setPosition({ lineNumber: 2, column: 1 });

		const oracle = new QuickFixOracle(editor, markerService, e => {
			assert.equal(e.type, 'auto');
			assert.ok(e.fixes);

			e.fixes.then(fixes => {
				oracle.dispose();
				assert.equal(fixes.length, 1);
				done();
			}, done);
		});

		// start here
		editor.setPosition({ lineNumber: 1, column: 1 });

	});

	test('Oracle -> ask once per marker/word', () => {
		let counter = 0;
		let reg = CodeActionProviderRegistry.register(languageIdentifier.language, {
			provideCodeActions() {
				counter += 1;
				return [];
			}
		});

		markerService.changeOne('fake', uri, [{
			startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
			message: 'error',
			severity: 1,
			code: '',
			source: ''
		}]);

		let fixes: TPromise<any>[] = [];
		let oracle = new QuickFixOracle(editor, markerService, e => {
			fixes.push(e.fixes);
		});

		editor.setPosition({ lineNumber: 1, column: 3 }); // marker
		editor.setPosition({ lineNumber: 1, column: 6 }); // (same) marker
		editor.setPosition({ lineNumber: 1, column: 8 }); // whitespace
		editor.setPosition({ lineNumber: 2, column: 2 }); // word
		editor.setPosition({ lineNumber: 2, column: 6 }); // (same) word

		return TPromise.join(fixes).then(_ => {
			reg.dispose();
			oracle.dispose();
			assert.equal(counter, 2);
		});
	});

	test('Oracle -> selection wins over marker', () => {

		let range: IRange;
		let reg = CodeActionProviderRegistry.register(languageIdentifier.language, {
			provideCodeActions(doc, _range) {
				range = _range;
				return [];
			}
		});

		markerService.changeOne('fake', uri, [{
			startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
			message: 'error',
			severity: 1,
			code: '',
			source: ''
		}]);

		let fixes: TPromise<any>[] = [];
		let oracle = new QuickFixOracle(editor, markerService, e => {
			fixes.push(e.fixes);
		});

		editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 13 });

		return TPromise.join(fixes).then(_ => {

			// assert selection
			assert.deepEqual(range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 13 });

			range = undefined;
			editor.setSelection({ startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 });

			return TPromise.join(fixes).then(_ => {
				reg.dispose();
				oracle.dispose();

				// assert marker
				assert.deepEqual(range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 });
			});
		});
	});

});
