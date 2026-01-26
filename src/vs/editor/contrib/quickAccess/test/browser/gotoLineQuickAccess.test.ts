/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IEditor } from '../../../../common/editorCommon.js';
import { withTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { AbstractGotoLineQuickAccessProvider } from '../../browser/gotoLineQuickAccess.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';

class TestGotoLineQuickAccessProvider extends AbstractGotoLineQuickAccessProvider {
	protected override onDidActiveTextEditorControlChange = Event.None;
	protected override activeTextEditorControl: IEditor | undefined;
	constructor(private zeroBased: boolean) {
		super();
	}
	protected override readonly storageService = {
		getBoolean: () => this.zeroBased,
		store: () => { }
	} as unknown as IStorageService;

	public parsePositionTest(editor: IEditor, value: string) {
		return super.parsePosition(editor, value);
	}
}

suite('AbstractGotoLineQuickAccessProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function runTest(input: string, expectedLine: number, expectedColumn?: number, zeroBased = false) {
		const provider = new TestGotoLineQuickAccessProvider(zeroBased);
		withTestCodeEditor([
			'line 1',
			'line 2',
			'line 3',
			'line 4',
			'line 5'
		], {}, (editor, _) => {
			const { lineNumber, column } = provider.parsePositionTest(editor, input);
			assert.strictEqual(lineNumber, expectedLine);
			assert.strictEqual(column, expectedColumn ?? 1);
		});
	}

	test('parsePosition works as expected', () => {
		// :line
		runTest('-100', 1);
		runTest('-5', 1);
		runTest('-1', 5);
		runTest('0', 1);
		runTest('1', 1);
		runTest('2', 2);
		runTest('5', 5);
		runTest('6', 5);
		runTest('7', 5);
		runTest('100', 5);

		// :line,column
		runTest('2:-100', 2, 1);
		runTest('2:-5', 2, 2);
		runTest('2:-1', 2, 6);
		runTest('2:0', 2, 1);
		runTest('2:1', 2, 1);
		runTest('2:2', 2, 2);
		runTest('2:6', 2, 6);
		runTest('2:7', 2, 7);
		runTest('2:8', 2, 7);
		runTest('2:100', 2, 7);

		// ::offset (1-based)
		runTest(':-1000', 1, 1);
		runTest(':-10', 4, 5);
		runTest(':-1', 5, 7);
		runTest(':0', 1, 1);
		runTest(':1', 1, 1);
		runTest(':10', 2, 3);
		runTest(':1000', 5, 7);

		// offset (0-based)
		runTest(':-1000', 1, 1, true);
		runTest(':-10', 4, 4, true);
		runTest(':-1', 5, 6, true);
		runTest(':0', 1, 1, true);
		runTest(':1', 1, 2, true);
		runTest(':10', 2, 4, true);
		runTest(':1000', 5, 7, true);

		// :line#column
		// :line,column
		// spaces
		runTest('-1#6', 5, 6);
		runTest('2,4', 2, 4);
		runTest('  2  :  3  ', 2, 3);
	});

	function runTabTest(input: string, expectedLine: number, expectedColumn?: number, zeroBased = false) {
		const provider = new TestGotoLineQuickAccessProvider(zeroBased);
		withTestCodeEditor([
			'\tline 1',
			'\t\tline 2',
			'\tline 3'
		], {}, (editor, _) => {
			const { lineNumber, column } = provider.parsePositionTest(editor, input);
			assert.strictEqual(lineNumber, expectedLine);
			assert.strictEqual(column, expectedColumn ?? 1);
		});
	}

	test('parsePosition works with tabs', () => {
		// :line,column
		runTabTest('1:1', 1, 1);
		runTabTest('1:2', 1, 1);
		runTabTest('1:3', 1, 1);
		runTabTest('1:4', 1, 2);
		runTabTest('1:5', 1, 2);
		runTabTest('1:6', 1, 3);
		runTabTest('1:11', 1, 8);
		runTabTest('1:12', 1, 8);
		runTabTest('1:-5', 1, 3);
		runTabTest('1:-6', 1, 2);
		runTabTest('1:-7', 1, 2);
		runTabTest('1:-8', 1, 1);
		runTabTest('1:-9', 1, 1);
		runTabTest('1:-10', 1, 1);
		runTabTest('1:-11', 1, 1);
		runTabTest('2:1', 2, 1);
		runTabTest('2:2', 2, 1);
		runTabTest('2:3', 2, 1);
		runTabTest('2:4', 2, 2);
		runTabTest('2:5', 2, 2);
		runTabTest('2:8', 2, 3);
		runTabTest('2:9', 2, 3);
		runTabTest('2:11', 2, 5);
	});
});

