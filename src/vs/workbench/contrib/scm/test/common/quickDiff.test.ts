/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions, IColorRegistry } from '../../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { IColorTheme } from '../../../../../platform/theme/common/themeService.js';
import '../../common/quickDiff.js';

const colorRegistry = Registry.as<IColorRegistry>(Extensions.ColorContribution);

function getMockTheme(type: ColorScheme): IColorTheme {
	const theme: IColorTheme = {
		type,
		label: '',
		semanticHighlighting: false,
		getColor: colorId => colorRegistry.resolveDefaultColor(colorId, theme),
		defines: () => true,
		getTokenStyleMetadata: () => undefined,
		tokenColorMap: [],
		tokenFontMap: []
	};
	return theme;
}

suite('QuickDiff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('high contrast light gutter colors', () => {
		const theme = getMockTheme(ColorScheme.HIGH_CONTRAST_LIGHT);
		const colorIds = [
			'editorGutter.modifiedBackground',
			'editorGutter.modifiedSecondaryBackground',
			'editorGutter.addedBackground',
			'editorGutter.addedSecondaryBackground',
			'editorGutter.deletedBackground',
			'editorGutter.deletedSecondaryBackground'
		];

		assert.deepStrictEqual(colorIds.map(colorId => Color.Format.CSS.formatHexA(theme.getColor(colorId)!, true)), [
			'#0f4a85',
			'#0f4a85',
			'#007100',
			'#007100',
			'#b5200d',
			'#b5200d'
		]);
	});
});
