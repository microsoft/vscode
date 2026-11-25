/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { editorWarningForeground } from '../../../platform/theme/common/colors/editorColors.js';
import { listWarningForeground } from '../../../platform/theme/common/colors/listColors.js';
import { ColorScheme, isHighContrast } from '../../../platform/theme/common/theme.js';
import { agentSessionNeedsInputForeground, agentsBackground } from '../../common/agentsColors.js';
import { ColorThemeData } from '../../services/themes/common/colorThemeData.js';

suite('Agent session colors', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const expectedColors = {
		[ColorScheme.DARK]: '#cca700',
		[ColorScheme.LIGHT]: '#b36b00',
		[ColorScheme.HIGH_CONTRAST_DARK]: '#ffd370',
		[ColorScheme.HIGH_CONTRAST_LIGHT]: '#806600',
	};

	for (const scheme of Object.values(ColorScheme)) {
		test(`needs-input indicator is opaque and contrasts with its row in ${scheme}`, () => {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(scheme);
			const foreground = theme.getColor(agentSessionNeedsInputForeground)!;
			const background = theme.getColor(agentsBackground)!;
			const rowBackground = isHighContrast(scheme) ? background : foreground.transparent(0.08).makeOpaque(background);

			assert.deepStrictEqual({
				color: foreground.toString(),
				opaque: foreground.isOpaque(),
				contrastsWithRow: foreground.getContrastRatio(rowBackground) >= 3,
			}, {
				color: expectedColors[scheme],
				opaque: true,
				contrastsWithRow: true,
			});
		});

		test(`needs-input color is customizable independently of warning colors in ${scheme}`, () => {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(scheme, {
				[listWarningForeground]: '#123456',
				[editorWarningForeground]: '#654321',
			});
			const inheritedColor = theme.getColor(agentSessionNeedsInputForeground)?.toString();
			theme.setCustomColors({ [agentSessionNeedsInputForeground]: '#abcdef' });

			assert.deepStrictEqual({
				inheritedColor,
				customColor: theme.getColor(agentSessionNeedsInputForeground)?.toString(),
				warningColor: theme.getColor(listWarningForeground)?.toString(),
			}, {
				inheritedColor: scheme === ColorScheme.DARK ? '#123456' : scheme === ColorScheme.HIGH_CONTRAST_DARK ? '#654321' : expectedColors[scheme],
				customColor: '#abcdef',
				warningColor: '#123456',
			});
		});
	}
});
