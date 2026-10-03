/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mergeExtensionIdentifiers } from '../../common/extensionsUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Extensions utils', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('mergeExtensionIdentifiers collects first change', () => {
		const result = mergeExtensionIdentifiers(undefined, [{ id: 'ms-vscode.sublime-keybindings' }]);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].id, 'ms-vscode.sublime-keybindings');
	});

	test('mergeExtensionIdentifiers accumulates across debounced events', () => {
		let result = mergeExtensionIdentifiers(undefined, [{ id: 'ms-vscode.sublime-keybindings' }]);
		result = mergeExtensionIdentifiers(result, [{ id: 'ms-vscode.atom-keybindings' }]);
		assert.deepStrictEqual(result.map(r => r.id), ['ms-vscode.sublime-keybindings', 'ms-vscode.atom-keybindings']);
	});

	test('mergeExtensionIdentifiers drops duplicates', () => {
		let result = mergeExtensionIdentifiers(undefined, [{ id: 'ms-vscode.sublime-keybindings' }]);
		result = mergeExtensionIdentifiers(result, [{ id: 'MS-VSCODE.sublime-keybindings' }, { id: 'ms-vscode.sublime-keybindings' }]);
		assert.strictEqual(result.length, 1);
	});

	test('mergeExtensionIdentifiers matches by uuid', () => {
		let result = mergeExtensionIdentifiers(undefined, [{ id: 'a.b', uuid: '123' }]);
		result = mergeExtensionIdentifiers(result, [{ id: 'c.d', uuid: '123' }]);
		assert.strictEqual(result.length, 1);
	});
});
