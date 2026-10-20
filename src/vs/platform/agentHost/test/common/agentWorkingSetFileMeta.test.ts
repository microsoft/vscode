/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isWorkingSetFileEditing, readWorkingSetVersion, withWorkingSetFileEditing, withWorkingSetVersion } from '../../common/meta/agentWorkingSetFileMeta.js';

suite('agentWorkingSetFileMeta', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('writes a Working Set file version and editing mark, keeping other metadata', () => {
		const versioned = withWorkingSetVersion({ other: 1 }, 'tc1');
		const editing = withWorkingSetFileEditing(versioned, true);
		assert.deepStrictEqual({ versioned, editing, notEditing: withWorkingSetFileEditing(editing, false) }, {
			versioned: { other: 1, 'vscode.workingSetVersion': 'tc1' },
			editing: { other: 1, 'vscode.workingSetVersion': 'tc1', 'vscode.workingSetEditing': true },
			notEditing: { other: 1, 'vscode.workingSetVersion': 'tc1' },
		});
	});

	test('reads only valid values', () => {
		const read = (_meta: Record<string, unknown> | undefined) => ({ version: readWorkingSetVersion({ _meta }), editing: isWorkingSetFileEditing({ _meta }) });
		assert.deepStrictEqual([
			read(undefined),
			read({ 'vscode.workingSetVersion': 'tc1', 'vscode.workingSetEditing': true }),
			read({ 'vscode.workingSetVersion': '', 'vscode.workingSetEditing': 'yes' }),
			read({ 'vscode.workingSetVersion': 1, 'vscode.workingSetEditing': false }),
		], [
			{ version: undefined, editing: false },
			{ version: 'tc1', editing: true },
			{ version: undefined, editing: false },
			{ version: undefined, editing: false },
		]);
	});
});
