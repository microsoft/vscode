/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../common/core/range.js';
import { RenameSymbolProcessor } from '../../browser/model/renameSymbolProcessor.js';
import { createTextModel } from '../../../../test/common/testTextModel.js';

suite('renameSymbolProcessor', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});


	test('Simple Rename', () => {
		const model = createTextModel([
			'const foo = 1;',
		].join('\n'), 'typescript', {});
		disposables.add(model);

		const result = RenameSymbolProcessor.createSingleEdits(model, new Range(1, 7, 1, 10), 'bar');
		assert.strictEqual(result?.renames.edits.length, 1);
		assert.strictEqual(result?.renames.oldName, 'foo');
		assert.strictEqual(result?.renames.newName, 'bar');
	});
});
