/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TrimTextTrailingWhitespaceCommand } from 'vs/editor/common/commands/trimTextTrailingWhitespaceCommand';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Selection } from 'vs/editor/common/core/selection';
import { getEditOperation } from 'vs/editor/test/browser/testCommand';
import { withEditorModel } from 'vs/editor/test/common/testTextModel';

suite('Editor Commands - Trim Text Trailing Whitespace Command', () => {

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('whitespace-only lines should not get deleted', function () {
		assertTrimTextTrailingWhitespaceCommand(['\t  \n', '  \n', '  \t\n', '   \t  \n'], []);
	});

	function assertTrimTextTrailingWhitespaceCommand(text: string[], expected: ISingleEditOperation[]): void {
		return withEditorModel(text, (model) => {
			const op = new TrimTextTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], true);
			const actual = getEditOperation(model, op);
			assert.deepStrictEqual(actual, expected);
		});
	}
});
