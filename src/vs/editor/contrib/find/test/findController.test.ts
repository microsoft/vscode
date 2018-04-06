/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import { Emitter } from 'vs/base/common/event';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { Range } from 'vs/editor/common/core/range';
import * as platform from 'vs/base/common/platform';
import { CommonFindController, FindStartFocusAction, IFindStartOptions, NextMatchFindAction, StartFindAction, NextSelectionMatchFindAction } from 'vs/editor/contrib/find/findController';
import { withTestCodeEditor } from 'vs/editor/test/browser/testCodeEditor';
import { HistoryNavigator } from 'vs/base/common/history';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { Delayer } from 'vs/base/common/async';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class TestFindController extends CommonFindController {

	public hasFocus: boolean;
	public delayUpdateHistory: boolean = false;
	public delayedUpdateHistoryPromise: TPromise<void>;

	private readonly _delayedUpdateHistoryEvent: Emitter<void> = new Emitter<void>();

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService storageService: IStorageService,
		@IClipboardService clipboardService: IClipboardService
	) {
		super(editor, contextKeyService, storageService, clipboardService);
		this._updateHistoryDelayer = new Delayer<void>(50);
	}

	protected _start(opts: IFindStartOptions): void {
		super._start(opts);

		if (opts.shouldFocus !== FindStartFocusAction.NoFocusChange) {
			this.hasFocus = true;
		}
	}

	protected _delayedUpdateHistory() {
		if (!this.delayedUpdateHistoryPromise) {
			this.delayedUpdateHistoryPromise = new TPromise<void>((c, e) => {
				const disposable = this._delayedUpdateHistoryEvent.event(() => {
					disposable.dispose();
					this.delayedUpdateHistoryPromise = null;
					c(null);
				});
			});
		}
		if (this.delayUpdateHistory) {
			super._delayedUpdateHistory();
		} else {
			this._updateHistory();
		}
	}

	protected _updateHistory() {
		super._updateHistory();
		this._delayedUpdateHistoryEvent.fire();
	}
}

function fromRange(rng: Range): number[] {
	return [rng.startLineNumber, rng.startColumn, rng.endLineNumber, rng.endColumn];
}

suite('FindController', () => {
	let queryState: { [key: string]: any; } = {};
	let clipboardState = '';
	let serviceCollection = new ServiceCollection();
	serviceCollection.set(IStorageService, {
		get: (key: string) => queryState[key],
		getBoolean: (key: string) => !!queryState[key],
		store: (key: string, value: any) => { queryState[key] = value; }
	} as IStorageService);

	if (platform.isMacintosh) {
		serviceCollection.set(IClipboardService, <any>{
			readFindText: _ => clipboardState,
			writeFindText: (value: any) => { clipboardState = value; }
		});
	}

	/* test('stores to the global clipboard buffer on start find action', () => {
		withTestCodeEditor([
			'ABC',
			'ABC',
			'XYZ',
			'ABC'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			if (!platform.isMacintosh) {
				assert.ok(true);
				return;
			}
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let startFindAction = new StartFindAction();
			// I select ABC on the first line
			editor.setSelection(new Selection(1, 1, 1, 4));
			// I hit Ctrl+F to show the Find dialog
			startFindAction.run(null, editor);

			assert.deepEqual(findController.getGlobalBufferTerm(), findController.getState().searchString);
			findController.dispose();
		});
	});

	test('reads from the global clipboard buffer on next find action if buffer exists', () => {
		withTestCodeEditor([
			'ABC',
			'ABC',
			'XYZ',
			'ABC'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = 'ABC';

			if (!platform.isMacintosh) {
				assert.ok(true);
				return;
			}

			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let findState = findController.getState();
			let nextMatchFindAction = new NextMatchFindAction();

			nextMatchFindAction.run(null, editor);
			assert.equal(findState.searchString, 'ABC');

			assert.deepEqual(fromRange(editor.getSelection()), [1, 1, 1, 4]);

			findController.dispose();
		});
	});

	test('writes to the global clipboard buffer when text changes', () => {
		withTestCodeEditor([
			'ABC',
			'ABC',
			'XYZ',
			'ABC'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			if (!platform.isMacintosh) {
				assert.ok(true);
				return;
			}

			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let findState = findController.getState();

			findState.change({ searchString: 'ABC' }, true);

			assert.deepEqual(findController.getGlobalBufferTerm(), 'ABC');

			findController.dispose();
		});
	}); */

	test('issue #1857: F3, Find Next, acts like "Find Under Cursor"', () => {
		withTestCodeEditor([
			'ABC',
			'ABC',
			'XYZ',
			'ABC'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			// The cursor is at the very top, of the file, at the first ABC
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let findState = findController.getState();
			let startFindAction = new StartFindAction();
			let nextMatchFindAction = new NextMatchFindAction();

			// I hit Ctrl+F to show the Find dialog
			startFindAction.run(null, editor);

			// I type ABC.
			findState.change({ searchString: 'A' }, true);
			findState.change({ searchString: 'AB' }, true);
			findState.change({ searchString: 'ABC' }, true);

			// The first ABC is highlighted.
			assert.deepEqual(fromRange(editor.getSelection()), [1, 1, 1, 4]);

			// I hit Esc to exit the Find dialog.
			findController.closeFindWidget();
			findController.hasFocus = false;

			// The cursor is now at end of the first line, with ABC on that line highlighted.
			assert.deepEqual(fromRange(editor.getSelection()), [1, 1, 1, 4]);

			// I hit delete to remove it and change the text to XYZ.
			editor.pushUndoStop();
			editor.executeEdits('test', [EditOperation.delete(new Range(1, 1, 1, 4))]);
			editor.executeEdits('test', [EditOperation.insert(new Position(1, 1), 'XYZ')]);
			editor.pushUndoStop();

			// At this point the text editor looks like this:
			//   XYZ
			//   ABC
			//   XYZ
			//   ABC
			assert.equal(editor.getModel().getLineContent(1), 'XYZ');

			// The cursor is at end of the first line.
			assert.deepEqual(fromRange(editor.getSelection()), [1, 4, 1, 4]);

			// I hit F3 to "Find Next" to find the next occurrence of ABC, but instead it searches for XYZ.
			nextMatchFindAction.run(null, editor);

			assert.equal(findState.searchString, 'ABC');
			assert.equal(findController.hasFocus, false);

			findController.dispose();
		});
	});

	test('issue #3090: F3 does not loop with two matches on a single line', () => {
		withTestCodeEditor([
			'import nls = require(\'vs/nls\');'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let nextMatchFindAction = new NextMatchFindAction();

			editor.setPosition({
				lineNumber: 1,
				column: 9
			});

			nextMatchFindAction.run(null, editor);
			assert.deepEqual(fromRange(editor.getSelection()), [1, 26, 1, 29]);

			nextMatchFindAction.run(null, editor);
			assert.deepEqual(fromRange(editor.getSelection()), [1, 8, 1, 11]);

			findController.dispose();
		});
	});

	test('issue #6149: Auto-escape highlighted text for search and replace regex mode', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3  * 5)',
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let startFindAction = new StartFindAction();
			let nextMatchFindAction = new NextMatchFindAction();

			editor.setSelection(new Selection(1, 9, 1, 13));

			findController.toggleRegex();
			startFindAction.run(null, editor);

			nextMatchFindAction.run(null, editor);
			assert.deepEqual(fromRange(editor.getSelection()), [2, 9, 2, 13]);

			nextMatchFindAction.run(null, editor);
			assert.deepEqual(fromRange(editor.getSelection()), [1, 9, 1, 13]);

			findController.dispose();
		});
	});

	test('issue #9043: Clear search scope when find widget is hidden', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			findController.start({
				forceRevealReplace: false,
				seedSearchStringFromSelection: false,
				seedSearchStringFromGlobalClipboard: false,
				shouldFocus: FindStartFocusAction.NoFocusChange,
				shouldAnimate: false
			});

			assert.equal(findController.getState().searchScope, null);

			findController.getState().change({
				searchScope: new Range(1, 1, 1, 5)
			}, false);

			assert.deepEqual(findController.getState().searchScope, new Range(1, 1, 1, 5));

			findController.closeFindWidget();
			assert.equal(findController.getState().searchScope, null);
		});
	});

	test('find term is added to history on state change', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			findController.getState().change({ searchString: '1' }, false);
			findController.getState().change({ searchString: '2' }, false);
			findController.getState().change({ searchString: '3' }, false);

			assert.deepEqual(['1', '2', '3'], toArray(findController.getHistory()));
		});
	});

	test('find term is added with delay', (done) => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			findController.delayUpdateHistory = true;
			findController.getState().change({ searchString: '1' }, false);
			findController.getState().change({ searchString: '2' }, false);
			findController.getState().change({ searchString: '3' }, false);

			findController.delayedUpdateHistoryPromise.then(() => {
				assert.deepEqual(['3'], toArray(findController.getHistory()));
				done();
			}, error => done(error));
		});
	});

	test('show previous find term', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			findController.getState().change({ searchString: '1' }, false);
			findController.getState().change({ searchString: '2' }, false);
			findController.getState().change({ searchString: '3' }, false);

			findController.showPreviousFindTerm();
			assert.deepEqual('2', findController.getState().searchString);
		});
	});

	test('show previous find term do not update history', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			findController.getState().change({ searchString: '1' }, false);
			findController.getState().change({ searchString: '2' }, false);
			findController.getState().change({ searchString: '3' }, false);

			findController.showPreviousFindTerm();
			assert.deepEqual(['1', '2', '3'], toArray(findController.getHistory()));
		});
	});

	test('show next find term', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			findController.getState().change({ searchString: '1' }, false);
			findController.getState().change({ searchString: '2' }, false);
			findController.getState().change({ searchString: '3' }, false);
			findController.getState().change({ searchString: '4' }, false);

			findController.showPreviousFindTerm();
			findController.showPreviousFindTerm();
			findController.showNextFindTerm();
			assert.deepEqual('3', findController.getState().searchString);
		});
	});

	test('show next find term do not update history', () => {
		withTestCodeEditor([
			'var x = (3 * 5)',
			'var y = (3 * 5)',
			'var z = (3 * 5)',
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			findController.getState().change({ searchString: '1' }, false);
			findController.getState().change({ searchString: '2' }, false);
			findController.getState().change({ searchString: '3' }, false);
			findController.getState().change({ searchString: '4' }, false);

			findController.showPreviousFindTerm();
			findController.showPreviousFindTerm();
			findController.showNextFindTerm();
			assert.deepEqual(['1', '2', '3', '4'], toArray(findController.getHistory()));
		});
	});

	test('issue #18111: Regex replace with single space replaces with no space', () => {
		withTestCodeEditor([
			'HRESULT OnAmbientPropertyChange(DISPID   dispid);'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);

			let startFindAction = new StartFindAction();
			startFindAction.run(null, editor);

			findController.getState().change({ searchString: '\\b\\s{3}\\b', replaceString: ' ', isRegex: true }, false);
			findController.moveToNextMatch();

			assert.deepEqual(editor.getSelections().map(fromRange), [
				[1, 39, 1, 42]
			]);

			findController.replace();

			assert.deepEqual(editor.getValue(), 'HRESULT OnAmbientPropertyChange(DISPID dispid);');

			findController.dispose();
		});
	});

	test('issue #24714: Regular expression with ^ in search & replace', () => {
		withTestCodeEditor([
			'',
			'line2',
			'line3'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);

			let startFindAction = new StartFindAction();
			startFindAction.run(null, editor);

			findController.getState().change({ searchString: '^', replaceString: 'x', isRegex: true }, false);
			findController.moveToNextMatch();

			assert.deepEqual(editor.getSelections().map(fromRange), [
				[2, 1, 2, 1]
			]);

			findController.replace();

			assert.deepEqual(editor.getValue(), '\nxline2\nline3');

			findController.dispose();
		});
	});

	function toArray(historyNavigator: HistoryNavigator<string>): string[] {
		let result = [];
		historyNavigator.first();
		if (historyNavigator.current()) {
			do {
				result.push(historyNavigator.current());
			} while (historyNavigator.next());
		}
		return result;
	}

	test('issue #38232: Find Next Selection, regex enabled', () => {
		withTestCodeEditor([
			'([funny]',
			'',
			'([funny]'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let nextSelectionMatchFindAction = new NextSelectionMatchFindAction();

			// toggle regex
			findController.getState().change({ isRegex: true }, false);

			// change selection
			editor.setSelection(new Selection(1, 1, 1, 9));

			// cmd+f3
			nextSelectionMatchFindAction.run(null, editor);

			assert.deepEqual(editor.getSelections().map(fromRange), [
				[3, 1, 3, 9]
			]);

			findController.dispose();
		});
	});

	test('issue #38232: Find Next Selection, regex enabled, find widget open', () => {
		withTestCodeEditor([
			'([funny]',
			'',
			'([funny]'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			clipboardState = '';
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let startFindAction = new StartFindAction();
			let nextSelectionMatchFindAction = new NextSelectionMatchFindAction();

			// cmd+f - open find widget
			startFindAction.run(null, editor);

			// toggle regex
			findController.getState().change({ isRegex: true }, false);

			// change selection
			editor.setSelection(new Selection(1, 1, 1, 9));

			// cmd+f3
			nextSelectionMatchFindAction.run(null, editor);

			assert.deepEqual(editor.getSelections().map(fromRange), [
				[3, 1, 3, 9]
			]);

			findController.dispose();
		});
	});
});

suite('FindController query options persistence', () => {
	let queryState: { [key: string]: any; } = {};
	queryState['editor.isRegex'] = false;
	queryState['editor.matchCase'] = false;
	queryState['editor.wholeWord'] = false;
	let serviceCollection = new ServiceCollection();
	serviceCollection.set(IStorageService, {
		get: (key: string) => queryState[key],
		getBoolean: (key: string) => !!queryState[key],
		store: (key: string, value: any) => { queryState[key] = value; }
	} as IStorageService);

	test('matchCase', () => {
		withTestCodeEditor([
			'abc',
			'ABC',
			'XYZ',
			'ABC'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			queryState = { 'editor.isRegex': false, 'editor.matchCase': true, 'editor.wholeWord': false };
			// The cursor is at the very top, of the file, at the first ABC
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let findState = findController.getState();
			let startFindAction = new StartFindAction();

			// I hit Ctrl+F to show the Find dialog
			startFindAction.run(null, editor);

			// I type ABC.
			findState.change({ searchString: 'ABC' }, true);
			// The second ABC is highlighted as matchCase is true.
			assert.deepEqual(fromRange(editor.getSelection()), [2, 1, 2, 4]);

			findController.dispose();
		});
	});

	queryState = { 'editor.isRegex': false, 'editor.matchCase': false, 'editor.wholeWord': true };

	test('wholeWord', () => {
		withTestCodeEditor([
			'ABC',
			'AB',
			'XYZ',
			'ABC'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			queryState = { 'editor.isRegex': false, 'editor.matchCase': false, 'editor.wholeWord': true };
			// The cursor is at the very top, of the file, at the first ABC
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			let findState = findController.getState();
			let startFindAction = new StartFindAction();

			// I hit Ctrl+F to show the Find dialog
			startFindAction.run(null, editor);

			// I type AB.
			findState.change({ searchString: 'AB' }, true);
			// The second AB is highlighted as wholeWord is true.
			assert.deepEqual(fromRange(editor.getSelection()), [2, 1, 2, 3]);

			findController.dispose();
		});
	});

	test('toggling options is saved', () => {
		withTestCodeEditor([
			'ABC',
			'AB',
			'XYZ',
			'ABC'
		], { serviceCollection: serviceCollection }, (editor, cursor) => {
			queryState = { 'editor.isRegex': false, 'editor.matchCase': false, 'editor.wholeWord': true };
			// The cursor is at the very top, of the file, at the first ABC
			let findController = editor.registerAndInstantiateContribution<TestFindController>(TestFindController);
			findController.toggleRegex();
			assert.equal(queryState['editor.isRegex'], true);

			findController.dispose();
		});
	});
});
