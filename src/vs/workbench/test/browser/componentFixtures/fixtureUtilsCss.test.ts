/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import '../../../../editor/browser/viewParts/currentLineHighlight/currentLineHighlight.js';
import { ThemeTypeSelector } from '../../../../platform/theme/common/theme.js';
import { ColorThemeData } from '../../../services/themes/common/colorThemeData.js';
import type { IColorCustomizations } from '../../../services/themes/common/workbenchThemeService.js';
import { getThemeStyleSheet } from './fixtureUtilsCss.js';

interface ThemeVariant {
	readonly selector: ThemeTypeSelector;
	readonly colors: IColorCustomizations;
	readonly expected: { readonly border: string; readonly background: string };
}

suite('Component fixture theme CSS', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const variants: readonly ThemeVariant[] = [
		{
			selector: ThemeTypeSelector.VS_DARK,
			colors: { 'editor.lineHighlightBackground': '#242526' },
			expected: { border: '0px none rgb(0, 0, 0)', background: 'rgb(36, 37, 38)' },
		},
		{
			selector: ThemeTypeSelector.VS,
			colors: { 'editor.lineHighlightBackground': '#00000000', 'editor.lineHighlightBorder': '#eeeeee' },
			expected: { border: '2px solid rgb(238, 238, 238)', background: 'rgba(0, 0, 0, 0)' },
		},
		{
			selector: ThemeTypeSelector.HC_BLACK,
			colors: { 'editor.lineHighlightBackground': '#00000000', 'editor.lineHighlightBorder': '#ffffff' },
			expected: { border: '1px solid rgb(255, 255, 255)', background: 'rgba(0, 0, 0, 0)' },
		},
		{
			selector: ThemeTypeSelector.HC_LIGHT,
			colors: { 'editor.lineHighlightBackground': '#00000000', 'editor.lineHighlightBorder': '#0f4a85' },
			expected: { border: '1px solid rgb(15, 74, 133)', background: 'rgba(0, 0, 0, 0)' },
		},
	];

	for (const reverse of [false, true]) {
		test(`isolates active-line styles in ${reverse ? 'reverse' : 'forward'} theme installation order`, () => {
			const originalStyleSheets = [...mainWindow.document.adoptedStyleSheets];
			disposables.add(toDisposable(() => { mainWindow.document.adoptedStyleSheets = originalStyleSheets; }));
			const host = mainWindow.document.body.appendChild($('div'));
			disposables.add(toDisposable(() => host.remove()));
			const outsideLine = createCurrentLine(host);
			const lines = new Map<string, HTMLElement>();
			const actual = [];
			const orderedVariants = reverse ? [...variants].reverse() : variants;
			const expectedStyles = orderedVariants.map(variant => ({
				selector: variant.selector,
				...resolveStyle(host, variant.expected),
			}));

			for (const variant of orderedVariants) {
				const theme = ColorThemeData.createLoadedEmptyTheme(variant.selector, variant.selector);
				theme.setCustomColors(variant.colors);
				mainWindow.document.adoptedStyleSheets = [
					...mainWindow.document.adoptedStyleSheets,
					getThemeStyleSheet(theme),
				];
				const root = host.appendChild($('.monaco-workbench'));
				root.classList.add(...theme.classNames);
				lines.set(variant.selector, createCurrentLine(root));
				actual.push({
					outside: getCurrentLineStyle(outsideLine),
					fixtures: [...lines].map(([selector, line]) => ({ selector, ...getCurrentLineStyle(line) })),
				});
			}

			assert.deepStrictEqual(actual, orderedVariants.map((_, index) => ({
				outside: { border: '0px none rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
				fixtures: expectedStyles.slice(0, index + 1),
			})));
		});
	}
});

function createCurrentLine(parent: HTMLElement): HTMLElement {
	const editor = parent.appendChild($('.monaco-editor.focused'));
	const overlays = editor.appendChild($('.view-overlays'));
	const line = overlays.appendChild($('.current-line.current-line-exact'));
	line.style.color = 'black';
	return line;
}

function resolveStyle(parent: HTMLElement, expected: { border: string; background: string }): { border: string; background: string } {
	const reference = parent.appendChild($('div'));
	reference.style.border = expected.border;
	reference.style.backgroundColor = expected.background;
	return getCurrentLineStyle(reference);
}

function getCurrentLineStyle(line: HTMLElement): { border: string; background: string } {
	const style = mainWindow.getComputedStyle(line);
	return { border: style.border, background: style.backgroundColor };
}
