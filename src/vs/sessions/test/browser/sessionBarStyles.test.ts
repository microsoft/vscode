/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Color } from '../../../base/common/color.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestColorTheme } from '../../../platform/theme/test/common/testThemeService.js';
import { MODERN_EDITOR_TAB_ACTIVE_BACKGROUND, MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND, MODERN_EDITOR_TAB_HOVER_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BACKGROUND, TAB_UNFOCUSED_HOVER_BACKGROUND } from '../../../workbench/common/theme.js';
import { ColorThemeData } from '../../../workbench/services/themes/common/colorThemeData.js';
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
		const activeHoverTabBackgroundValue = '#70809060';
		const unfocusedActiveTabBackgroundValue = '#8090A050';
		const unfocusedHoverTabBackgroundValue = '#90A0B030';
		const activeTabBackground = Color.fromHex(activeTabBackgroundValue);
		const hoverTabBackground = Color.fromHex(hoverTabBackgroundValue);
		const activeHoverTabBackground = Color.fromHex(activeHoverTabBackgroundValue);
		const unfocusedActiveTabBackground = Color.fromHex(unfocusedActiveTabBackgroundValue);
		const unfocusedHoverTabBackground = Color.fromHex(unfocusedHoverTabBackgroundValue);
		const theme = new TestColorTheme({
			[activeSessionViewBackground]: activeBackground.toString(),
			[activeSessionViewForeground]: '#F0F0F0',
			[inactiveSessionViewBackground]: inactiveBackground.toString(),
			[inactiveSessionViewForeground]: '#C0C0C0',
			[MODERN_EDITOR_TAB_ACTIVE_BACKGROUND]: activeTabBackgroundValue,
			[MODERN_EDITOR_TAB_HOVER_BACKGROUND]: hoverTabBackgroundValue,
			[MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND]: activeHoverTabBackgroundValue,
			[TAB_UNFOCUSED_ACTIVE_BACKGROUND]: unfocusedActiveTabBackgroundValue,
			[TAB_UNFOCUSED_HOVER_BACKGROUND]: unfocusedHoverTabBackgroundValue,
		});

		applySessionViewThemeColors(element, theme, true);
		const activeStyles = {
			background: element.style.getPropertyValue('--session-view-background'),
			foreground: element.style.getPropertyValue('--session-view-foreground'),
			activeActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-active-background'),
			hoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-hover-background'),
			activeHoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-active-hover-background'),
			unfocusedActiveActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-unfocused-active-background'),
			unfocusedHoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-unfocused-hover-background'),
			unfocusedActiveHoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-unfocused-active-hover-background'),
		};

		applySessionViewThemeColors(element, theme, false);

		assert.deepStrictEqual({
			activeStyles,
			inactiveStyles: {
				background: element.style.getPropertyValue('--session-view-background'),
				foreground: element.style.getPropertyValue('--session-view-foreground'),
				activeActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-active-background'),
				hoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-hover-background'),
				activeHoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-active-hover-background'),
				unfocusedActiveActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-unfocused-active-background'),
				unfocusedHoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-unfocused-hover-background'),
				unfocusedActiveHoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-unfocused-active-hover-background'),
			},
		}, {
			activeStyles: {
				background: activeBackground.toString(),
				foreground: '#f0f0f0',
				activeActionBackground: activeTabBackground.makeOpaque(activeBackground).toString(),
				hoverActionBackground: hoverTabBackground.makeOpaque(activeBackground).toString(),
				activeHoverActionBackground: activeHoverTabBackground.makeOpaque(activeBackground).toString(),
				unfocusedActiveActionBackground: unfocusedActiveTabBackground.makeOpaque(activeBackground).toString(),
				unfocusedHoverActionBackground: unfocusedHoverTabBackground.makeOpaque(activeBackground).toString(),
				unfocusedActiveHoverActionBackground: unfocusedHoverTabBackground.makeOpaque(activeBackground).toString(),
			},
			inactiveStyles: {
				background: inactiveBackground.toString(),
				foreground: '#c0c0c0',
				activeActionBackground: activeTabBackground.makeOpaque(inactiveBackground).toString(),
				hoverActionBackground: hoverTabBackground.makeOpaque(inactiveBackground).toString(),
				activeHoverActionBackground: activeHoverTabBackground.makeOpaque(inactiveBackground).toString(),
				unfocusedActiveActionBackground: unfocusedActiveTabBackground.makeOpaque(inactiveBackground).toString(),
				unfocusedHoverActionBackground: unfocusedHoverTabBackground.makeOpaque(inactiveBackground).toString(),
				unfocusedActiveHoverActionBackground: unfocusedHoverTabBackground.makeOpaque(inactiveBackground).toString(),
			},
		});
	});

	test('uses modern tab backgrounds when legacy unfocused colors are not customized', () => {
		const element = document.createElement('div');
		const background = Color.fromHex('#102030');
		const activeTabBackgroundValue = '#A0B0C080';
		const hoverTabBackgroundValue = '#D0E0F040';
		const activeHoverTabBackgroundValue = '#70809060';
		const activeTabBackground = Color.fromHex(activeTabBackgroundValue);
		const hoverTabBackground = Color.fromHex(hoverTabBackgroundValue);
		const activeHoverTabBackground = Color.fromHex(activeHoverTabBackgroundValue);
		const theme = ColorThemeData.createLoadedEmptyTheme('test', 'test');
		theme.setCustomColors({
			[activeSessionViewBackground]: background.toString(),
			[activeSessionViewForeground]: '#F0F0F0',
			[MODERN_EDITOR_TAB_ACTIVE_BACKGROUND]: activeTabBackgroundValue,
			[MODERN_EDITOR_TAB_HOVER_BACKGROUND]: hoverTabBackgroundValue,
			[MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND]: activeHoverTabBackgroundValue,
		});

		applySessionViewThemeColors(element, theme, true);

		assert.deepStrictEqual({
			unfocusedActiveActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-unfocused-active-background'),
			unfocusedHoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-unfocused-hover-background'),
			unfocusedActiveHoverActionBackground: element.style.getPropertyValue('--modern-ui-editor-tab-action-unfocused-active-hover-background'),
		}, {
			unfocusedActiveActionBackground: activeTabBackground.makeOpaque(background).toString(),
			unfocusedHoverActionBackground: hoverTabBackground.makeOpaque(background).toString(),
			unfocusedActiveHoverActionBackground: activeHoverTabBackground.makeOpaque(background).toString(),
		});
	});
});
