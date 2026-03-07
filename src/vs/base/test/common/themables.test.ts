/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ThemeColor, themeColorFromId, ThemeIcon } from '../../common/themables.js';
import { Codicon } from '../../common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Themables', () => {

	suite('ThemeColor', () => {
		test('isThemeColor', () => {
			assert.strictEqual(ThemeColor.isThemeColor(undefined), false);
			assert.strictEqual(ThemeColor.isThemeColor(null), false);
			assert.strictEqual(ThemeColor.isThemeColor('not a color'), false);
			assert.strictEqual(ThemeColor.isThemeColor({}), false);
			assert.strictEqual(ThemeColor.isThemeColor({ id: 42 }), false);
			assert.strictEqual(ThemeColor.isThemeColor({ id: 'my-color' }), true);
			assert.strictEqual(ThemeColor.isThemeColor(themeColorFromId('my-color')), true);
		});

		test('themeColorFromId', () => {
			const color = themeColorFromId('my.color');
			assert.strictEqual(color.id, 'my.color');
			assert.strictEqual(ThemeColor.isThemeColor(color), true);
		});
	});

	suite('ThemeIcon', () => {
		test('isThemeIcon', () => {
			assert.strictEqual(ThemeIcon.isThemeIcon(undefined), false);
			assert.strictEqual(ThemeIcon.isThemeIcon(null), false);
			assert.strictEqual(ThemeIcon.isThemeIcon('not an icon'), false);
			assert.strictEqual(ThemeIcon.isThemeIcon({}), false);
			assert.strictEqual(ThemeIcon.isThemeIcon({ id: 42 }), false);
			assert.strictEqual(ThemeIcon.isThemeIcon({ id: 'my-icon' }), true);
			assert.strictEqual(ThemeIcon.isThemeIcon({ id: 'my-icon', color: 'not a color' }), false);
			assert.strictEqual(ThemeIcon.isThemeIcon({ id: 'my-icon', color: themeColorFromId('my-color') }), true);
		});

		test('asClassNameArray', () => {
			const icon = { id: 'my-icon' };
			assert.deepStrictEqual(ThemeIcon.asClassNameArray(icon), ['codicon', 'codicon-my-icon']);

			const iconWithModifier = { id: 'my-icon~spin' };
			assert.deepStrictEqual(ThemeIcon.asClassNameArray(iconWithModifier), ['codicon', 'codicon-my-icon', 'codicon-modifier-spin']);

			const invalidIcon = { id: 'my icon' };
			assert.deepStrictEqual(ThemeIcon.asClassNameArray(invalidIcon), ['codicon', 'codicon-error']);
		});

		test('asClassName', () => {
			const icon = { id: 'my-icon' };
			assert.strictEqual(ThemeIcon.asClassName(icon), 'codicon codicon-my-icon');

			const iconWithModifier = { id: 'my-icon~spin' };
			assert.strictEqual(ThemeIcon.asClassName(iconWithModifier), 'codicon codicon-my-icon codicon-modifier-spin');
		});

		test('asCSSSelector', () => {
			const icon = { id: 'my-icon' };
			assert.strictEqual(ThemeIcon.asCSSSelector(icon), '.codicon.codicon-my-icon');

			const iconWithModifier = { id: 'my-icon~spin' };
			assert.strictEqual(ThemeIcon.asCSSSelector(iconWithModifier), '.codicon.codicon-my-icon.codicon-modifier-spin');
		});

		test('fromString', () => {
			assert.deepStrictEqual(ThemeIcon.fromString('$(my-icon)'), { id: 'my-icon' });
			assert.deepStrictEqual(ThemeIcon.fromString('$(my-icon~spin)'), { id: 'my-icon~spin' });
			assert.strictEqual(ThemeIcon.fromString('my-icon'), undefined);
			assert.strictEqual(ThemeIcon.fromString('$(my-icon'), undefined);
			assert.strictEqual(ThemeIcon.fromString('my-icon)'), undefined);
		});

		test('fromId', () => {
			assert.deepStrictEqual(ThemeIcon.fromId('my-icon'), { id: 'my-icon' });
		});

		test('modify', () => {
			const icon = { id: 'my-icon' };
			assert.deepStrictEqual(ThemeIcon.modify(icon, 'spin'), { id: 'my-icon~spin' });
			assert.deepStrictEqual(ThemeIcon.modify(icon, 'disabled'), { id: 'my-icon~disabled' });
			assert.deepStrictEqual(ThemeIcon.modify(icon, undefined), { id: 'my-icon' });

			const iconWithModifier = { id: 'my-icon~spin' };
			assert.deepStrictEqual(ThemeIcon.modify(iconWithModifier, 'disabled'), { id: 'my-icon~disabled' });
			assert.deepStrictEqual(ThemeIcon.modify(iconWithModifier, undefined), { id: 'my-icon' });
		});

		test('getModifier', () => {
			assert.strictEqual(ThemeIcon.getModifier({ id: 'my-icon' }), undefined);
			assert.strictEqual(ThemeIcon.getModifier({ id: 'my-icon~spin' }), 'spin');
		});

		test('isEqual', () => {
			assert.strictEqual(ThemeIcon.isEqual({ id: 'my-icon' }, { id: 'my-icon' }), true);
			assert.strictEqual(ThemeIcon.isEqual({ id: 'my-icon' }, { id: 'other-icon' }), false);

			const iconWithColor1 = { id: 'my-icon', color: themeColorFromId('my-color') };
			const iconWithColor2 = { id: 'my-icon', color: themeColorFromId('my-color') };
			const iconWithOtherColor = { id: 'my-icon', color: themeColorFromId('other-color') };

			assert.strictEqual(ThemeIcon.isEqual(iconWithColor1, iconWithColor2), true);
			assert.strictEqual(ThemeIcon.isEqual(iconWithColor1, iconWithOtherColor), false);
			assert.strictEqual(ThemeIcon.isEqual({ id: 'my-icon' }, iconWithColor1), false);
		});

		test('isFile', () => {
			assert.strictEqual(ThemeIcon.isFile(Codicon.file), true);
			assert.strictEqual(ThemeIcon.isFile(Codicon.folder), false);
			assert.strictEqual(ThemeIcon.isFile({ id: 'my-icon' }), false);
			assert.strictEqual(ThemeIcon.isFile(undefined), false);
		});

		test('isFolder', () => {
			assert.strictEqual(ThemeIcon.isFolder(Codicon.folder), true);
			assert.strictEqual(ThemeIcon.isFolder(Codicon.file), false);
			assert.strictEqual(ThemeIcon.isFolder({ id: 'my-icon' }), false);
			assert.strictEqual(ThemeIcon.isFolder(undefined), false);
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
