/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Model } from 'vs/editor/common/model/model';
import { mockCodeEditor } from 'vs/editor/test/common/mocks/mockCodeEditor';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { QuickFixOracle } from 'vs/editor/contrib/quickFix/browser/quickFixModel';
import { CodeActionProviderRegistry, LanguageIdentifier } from 'vs/editor/common/modes';
import { IDisposable } from 'vs/base/common/lifecycle';
import Event from 'vs/base/common/event';
import { Range } from 'vs/editor/common/core/range';

function promiseOnce<T>(event: Event<T>): TPromise<T> {
	return new TPromise<T>(resolve => {
		let reg = event(e => {
			reg.dispose();
			resolve(e);
		});
	});
}

suite('QuickFix', () => {

	const languageIdentifier = new LanguageIdentifier('foo-lang', 3);
	let uri = URI.parse('untitled:path');
	let model: Model;
	let markerService: MarkerService;
	let editor: ICommonCodeEditor;
	let reg: IDisposable;

	setup(() => {
		reg = CodeActionProviderRegistry.register(languageIdentifier.language, {
			provideCodeActions() {
				return [{ id: 'test-command', title: 'test', arguments: [] }];
			}
		});
		markerService = new MarkerService();
		model = Model.createFromString('foobar  foo bar\nfarboo far boo', undefined, languageIdentifier, uri);
		editor = mockCodeEditor([], { model });
		editor.setPosition({ lineNumber: 1, column: 1 });
	});

	teardown(() => {
		reg.dispose();
		editor.dispose();
		model.dispose();
		markerService.dispose();
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

	test('Oracle -> ask once per marker/word', async () => {

		const start = promiseOnce(markerService.onMarkerChanged);

		markerService.changeOne('fake', uri, [{
			startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6,
			message: 'error',
			severity: 1,
			code: '',
			source: ''
		}]);

		await start;

		let counter = 0;
		let reg = CodeActionProviderRegistry.register(languageIdentifier.language, {
			provideCodeActions() {
				counter += 1;
				return [];
			}
		});

		let fixes: TPromise<any>[] = [];
		let oracle = new QuickFixOracle(editor, markerService, e => {
			fixes.push(e.fixes);
		}, 10);

		editor.setPosition({ lineNumber: 1, column: 3 }); // marker
		editor.setPosition({ lineNumber: 1, column: 6 }); // (same) marker

		await TPromise.join([TPromise.timeout(20)].concat(fixes));
		assert.equal(counter, 1);

		// no auto trigger when empty selection
		editor.setPosition({ lineNumber: 1, column: 8 }); // whitespace
		editor.setPosition({ lineNumber: 2, column: 2 }); // word
		editor.setPosition({ lineNumber: 2, column: 6 }); // (same) word
		await TPromise.join([TPromise.timeout(20)].concat(fixes));
		assert.equal(counter, 1);

		// auto trigger on non-empty selection
		editor.setSelection({ startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 6 });
		await TPromise.join([TPromise.timeout(20)].concat(fixes));
		assert.equal(counter, 2);

		reg.dispose();
		oracle.dispose();
	});

	test('Oracle -> selection wins over marker', () => {

		let range: Range;
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
		}, 10);

		editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 13 });

		return TPromise.join<any>([TPromise.timeout(20)].concat(fixes)).then(_ => {

			// -> marker wins
			assert.deepEqual(range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 });

			// 'auto' triggered, non-empty selection BUT within a marker
			editor.setSelection({ startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 4 });

			return TPromise.join([TPromise.timeout(20)].concat(fixes)).then(_ => {
				reg.dispose();
				oracle.dispose();

				// assert marker
				assert.deepEqual(range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 });
			});
		});
	});

	test('Lightbulb is in the wrong place, #29933', async function () {
		let reg = CodeActionProviderRegistry.register(languageIdentifier.language, {
			provideCodeActions(doc, _range) {
				return [];
			}
		});

		editor.getModel().setValue('// @ts-check\n2\ncon\n');

		markerService.changeOne('fake', uri, [{
			startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 4,
			message: 'error',
			severity: 1,
			code: '',
			source: ''
		}]);

		// case 1 - drag selection over multiple lines -> range of enclosed marker, position or marker
		await new TPromise(resolve => {

			let oracle = new QuickFixOracle(editor, markerService, e => {
				assert.equal(e.type, 'auto');
				assert.deepEqual(e.range, { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 4 });
				assert.deepEqual(e.position, { lineNumber: 3, column: 1 });

				oracle.dispose();
				resolve(null);
			}, 5);

			editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 1 });
		});

		// case 2 - selection over multiple lines & manual trigger -> lightbulb
		await new TPromise(resolve => {

			editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 1 });

			let oracle = new QuickFixOracle(editor, markerService, e => {
				assert.equal(e.type, 'manual');
				assert.ok(e.range.equalsRange({ startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 1 }));

				oracle.dispose();
				resolve(null);
			}, 5);

			oracle.trigger('manual');
		});


		reg.dispose();
	});

});
