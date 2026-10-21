/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isWorkingSetFileEditing, withWorkingSetFileEditing } from '../../common/meta/agentWorkingSetFileMeta.js';

suite('agentWorkingSetFileMeta', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('writes a Working Set editing mark, keeping other metadata', () => {
		const editing = withWorkingSetFileEditing({ other: 1 }, true);
		assert.deepStrictEqual({ editing, notEditing: withWorkingSetFileEditing(editing, false) }, {
			editing: { other: 1, 'vscode.workingSetEditing': true },
			notEditing: { other: 1 },
		});
	});

	test('reads only valid values', () => {
		const read = (_meta: Record<string, unknown> | undefined) => isWorkingSetFileEditing({ _meta });
		assert.deepStrictEqual([
			read(undefined),
			read({ 'vscode.workingSetEditing': true }),
			read({ 'vscode.workingSetEditing': 'yes' }),
			read({ 'vscode.workingSetEditing': false }),
		], [false, true, false, false]);
	});
});
