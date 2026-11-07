/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { getGapAfterTabStack, getGapBeforeTabStack, getLeastUsedTabStackColor, getSurroundingTabStack, isCustomTabStackColor, parseTabStackColor, TAB_STACK_COLORS, TabStackColor } from '../../../../common/editor/editorGroupTabStacks.js';
import { TestEditorInput } from '../../workbenchTestServices.js';

suite('EditorGroupTabStacks', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('parseTabStackColor accepts presets and #rgb or #rrggbb colors', () => {
		// Parse each value, pairing it with its result
		const values: unknown[] = ['blue', '#ABC', '#AbCdEf', '#abcd', '#aabbccdd', '#ggg', 'grey', 42];

		assert.deepStrictEqual(values.map(value => [value, parseTabStackColor(value)]), [
			// Valid, with hex colors normalized to lowercase #rrggbb
			['blue', 'blue'],
			['#ABC', '#aabbcc'],
			['#AbCdEf', '#abcdef'],

			// Invalid
			['#abcd', undefined],
			['#aabbccdd', undefined],
			['#ggg', undefined],
			['grey', undefined],
			[42, undefined],
		]);
	});

	test('isCustomTabStackColor tells custom colors from preset colors', () => {
		// Check a preset and a custom color, pairing each with its result
		const colors: TabStackColor[] = ['blue', '#aabbcc'];

		assert.deepStrictEqual(colors.map(color => [color, isCustomTabStackColor(color)]), [
			// Preset
			['blue', false],

			// Custom
			['#aabbcc', true],
		]);
	});

	test('getLeastUsedTabStackColor ignores custom colors and picks the earliest preset on ties', () => {
		assert.deepStrictEqual({
			// Ties between unused presets
			noColors: getLeastUsedTabStackColor([]),
			tiesPickEarliest: getLeastUsedTabStackColor(['blue', 'pink']),

			// Custom colors use no preset
			customColorsIgnored: getLeastUsedTabStackColor(['#123456', ...TAB_STACK_COLORS.slice(0, -1)]),

			// Every preset used at least once
			allPresetsUsed: getLeastUsedTabStackColor([...TAB_STACK_COLORS, 'blue']),
		}, {
			noColors: 'blue',
			tiesPickEarliest: 'purple',
			customColorsIgnored: 'gray',
			allPresetsUsed: 'purple',
		});
	});

	test('the gap and surrounding helpers read tab stacks through the lookup', () => {
		// Editors 0 to 4, where 1 and 2 are in tab stack a and 4 is in tab stack b
		const editors: EditorInput[] = ['0', '1', '2', '3', '4'].map(id => disposables.add(new TestEditorInput(URI.file(`/${id}`), 'testTabStacks')));
		const tabStackIds = [undefined, 'a', 'a', undefined, 'b'];
		const getTabStackId = (editor: EditorInput) => tabStackIds[editors.indexOf(editor)];

		// Each result is paired with the index it was asked for
		assert.deepStrictEqual({
			gapAfter: [0, 1].map(index => [index, getGapAfterTabStack(editors, index, 'a', getTabStackId)]),
			gapBefore: [0, 1, 3].map(index => [index, getGapBeforeTabStack(editors, index, 'a', getTabStackId)]),
			surrounding: [1, 2, 3, 5].map(index => [index, getSurroundingTabStack(editors, index, getTabStackId)]),
		}, {
			gapAfter: [[0, 0], [1, 3]],
			gapBefore: [[0, 0], [1, 1], [3, 1]],
			surrounding: [[1, undefined], [2, 'a'], [3, undefined], [5, undefined]],
		});
	});
});
