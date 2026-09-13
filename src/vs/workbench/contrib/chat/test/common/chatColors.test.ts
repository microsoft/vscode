/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { activeContrastBorder, chartsGreen, chartsYellow, errorForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { getColorRegistry } from '../../../../../platform/theme/common/colorUtils.js';
import { ColorScheme, isHighContrast } from '../../../../../platform/theme/common/theme.js';
import { ColorThemeData } from '../../../../services/themes/common/colorThemeData.js';
import { chatInputWorkingBorderColor1, chatInputWorkingBorderColor2, chatInputWorkingBorderColor3, chatSessionInProgressBorder, chatSessionNeedsInputBorder, chatSessionUnvisitedBorder, chatThinkingShimmer } from '../../common/widget/chatColors.js';

suite('Chat colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('allows opaque animation colors and deprecates unused accents', () => {
		const ids = [chatThinkingShimmer, chatInputWorkingBorderColor1, chatInputWorkingBorderColor2, chatInputWorkingBorderColor3];
		const colors = getColorRegistry().getColors();

		assert.deepStrictEqual(ids.map(id => {
			const color = colors.find(color => color.id === id);
			return { id, needsTransparency: color?.needsTransparency, deprecated: !!color?.deprecationMessage };
		}), [
			{ id: chatThinkingShimmer, needsTransparency: false, deprecated: false },
			{ id: chatInputWorkingBorderColor1, needsTransparency: false, deprecated: false },
			{ id: chatInputWorkingBorderColor2, needsTransparency: false, deprecated: true },
			{ id: chatInputWorkingBorderColor3, needsTransparency: false, deprecated: true },
		]);
	});

	for (const scheme of Object.values(ColorScheme)) {
		test(`session state borders inherit semantic colors in ${scheme}`, () => {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(scheme, {
				[chartsYellow]: '#cdab12',
				[chartsGreen]: '#12ab34',
				[errorForeground]: '#cd1234',
				[activeContrastBorder]: '#efcd12',
			});

			assert.deepStrictEqual([
				theme.getColor(chatSessionInProgressBorder)?.toString(),
				theme.getColor(chatSessionUnvisitedBorder)?.toString(),
				theme.getColor(chatSessionNeedsInputBorder)?.toString(),
			], isHighContrast(scheme) ? ['#efcd12', '#efcd12', '#efcd12'] : ['#cdab12', '#12ab34', '#cd1234']);
		});

		test(`session state border user overrides take precedence over theme colors in ${scheme}`, () => {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(scheme, {
				[chatSessionInProgressBorder]: '#abcdef',
				[chatSessionUnvisitedBorder]: '#112233',
				[chatSessionNeedsInputBorder]: '#445566',
			});
			const readColors = () => [
				theme.getColor(chatSessionInProgressBorder)?.toString(),
				theme.getColor(chatSessionUnvisitedBorder)?.toString(),
				theme.getColor(chatSessionNeedsInputBorder)?.toString(),
			];
			const themeColors = readColors();
			theme.setCustomColors({ [chatSessionInProgressBorder]: '#fedcba', [chatSessionUnvisitedBorder]: '#778899' });
			const customColors = readColors();
			theme.setCustomColors({});

			assert.deepStrictEqual({ themeColors, customColors, resetColors: readColors() }, {
				themeColors: ['#abcdef', '#112233', '#445566'],
				customColors: ['#fedcba', '#778899', '#445566'],
				resetColors: ['#abcdef', '#112233', '#445566'],
			});
		});
	}
});
