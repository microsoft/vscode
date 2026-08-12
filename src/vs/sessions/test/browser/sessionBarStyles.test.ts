/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestColorTheme } from '../../../platform/theme/test/common/testThemeService.js';
import { MODERN_TAB_ACTIVE_BACKGROUND, MODERN_TAB_HOVER_BACKGROUND } from '../../../workbench/common/theme.js';
import { applySessionViewThemeColors } from '../../browser/parts/sessionBarStyles.js';
import { activeSessionViewBackground, activeSessionViewForeground, inactiveSessionViewBackground, inactiveSessionViewForeground } from '../../common/theme.js';

suite('Sessions - SessionBarStyles', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('makes tab action backgrounds opaque against the current session surface', () => {
		const element = document.createElement('div');
		const activeBackground = Color.fromHex('#102030');
		const inactiveBackground = Color.fromHex('#405060');
		const activeTabBackgroundValue = '#A0B0C080';
		const hoverTabBackgroundValue = '#D0E0F040';
		const activeTabBackground = Color.fromHex(activeTabBackgroundValue);
		const hoverTabBackground = Color.fromHex(hoverTabBackgroundValue);
		const theme = new TestColorTheme({
			[activeSessionViewBackground]: activeBackground.toString(),
			[activeSessionViewForeground]: '#F0F0F0',
			[inactiveSessionViewBackground]: inactiveBackground.toString(),
			[inactiveSessionViewForeground]: '#C0C0C0',
			[MODERN_TAB_ACTIVE_BACKGROUND]: activeTabBackgroundValue,
			[MODERN_TAB_HOVER_BACKGROUND]: hoverTabBackgroundValue,
		});

		applySessionViewThemeColors(element, theme, true);
		const activeStyles = {
			background: element.style.getPropertyValue('--session-view-background'),
			foreground: element.style.getPropertyValue('--session-view-foreground'),
			activeActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-active-background'),
			hoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-hover-background'),
		};

		applySessionViewThemeColors(element, theme, false);

		assert.deepStrictEqual({
			activeStyles,
			inactiveStyles: {
				background: element.style.getPropertyValue('--session-view-background'),
				foreground: element.style.getPropertyValue('--session-view-foreground'),
				activeActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-active-background'),
				hoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-hover-background'),
			},
		}, {
			activeStyles: {
				background: activeBackground.toString(),
				foreground: '#f0f0f0',
				activeActionBackground: activeTabBackground.makeOpaque(activeBackground).toString(),
				hoverActionBackground: hoverTabBackground.makeOpaque(activeBackground).toString(),
			},
			inactiveStyles: {
				background: inactiveBackground.toString(),
				foreground: '#c0c0c0',
				activeActionBackground: activeTabBackground.makeOpaque(inactiveBackground).toString(),
				hoverActionBackground: hoverTabBackground.makeOpaque(inactiveBackground).toString(),
			},
		});
	});
});