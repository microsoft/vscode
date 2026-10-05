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
import '../../../../editor/browser/widget/codeEditor/editor.css';
import { ThemeTypeSelector } from '../../../../platform/theme/common/theme.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ColorThemeData } from '../../../services/themes/common/colorThemeData.js';
import type { IColorCustomizations } from '../../../services/themes/common/workbenchThemeService.js';
import { getThemeStyleSheet } from './fixtureUtilsCss.js';

interface ThemeVariant {
	readonly id: string;
	readonly colors: IColorCustomizations;
	readonly expected: { readonly border: string; readonly background: string };
}

suite('Component fixture theme CSS', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const variants: readonly ThemeVariant[] = [
		{
			id: `${ThemeTypeSelector.VS_DARK} fixture-dark-modern`,
			colors: { 'editor.lineHighlightBackground': '#242526' },
			expected: { border: '0px none rgb(0, 0, 0)', background: 'rgb(36, 37, 38)' },
		},
		{
			id: `${ThemeTypeSelector.VS} fixture-light-modern`,
			colors: { 'editor.lineHighlightBackground': '#00000000', 'editor.lineHighlightBorder': '#eeeeee' },
			expected: { border: '2px solid rgb(238, 238, 238)', background: 'rgba(0, 0, 0, 0)' },
		},
		{
			id: `${ThemeTypeSelector.VS} fixture-light-2026`,
			colors: { 'editor.lineHighlightBackground': '#fafafa' },
			expected: { border: '0px none rgb(0, 0, 0)', background: 'rgb(250, 250, 250)' },
		},
		{
			id: ThemeTypeSelector.HC_BLACK,
			colors: { 'editor.lineHighlightBackground': '#00000000', 'editor.lineHighlightBorder': '#ffffff' },
			expected: { border: '1px solid rgb(255, 255, 255)', background: 'rgba(0, 0, 0, 0)' },
		},
		{
			id: ThemeTypeSelector.HC_LIGHT,
			colors: { 'editor.lineHighlightBackground': '#00000000', 'editor.lineHighlightBorder': '#0f4a85' },
			expected: { border: '1px solid rgb(15, 74, 133)', background: 'rgba(0, 0, 0, 0)' },
		},
		{
			id: `${ThemeTypeSelector.VS_DARK} fixture-solarized-dark`,
			colors: { 'editor.lineHighlightBackground': '#002b36' },
			expected: { border: '0px none rgb(0, 0, 0)', background: 'rgb(0, 43, 54)' },
		},
		{
			id: `${ThemeTypeSelector.VS} fixture-solarized-light`,
			colors: { 'editor.lineHighlightBackground': '#fdf6e3' },
			expected: { border: '0px none rgb(0, 0, 0)', background: 'rgb(253, 246, 227)' },
		},
	];

	test('does not apply workbench backgrounds to nested editor theme classes', () => {
		const originalStyleSheets = [...mainWindow.document.adoptedStyleSheets];
		disposables.add(toDisposable(() => { mainWindow.document.adoptedStyleSheets = originalStyleSheets; }));
		disposables.add(registerThemingParticipant((_theme, collector) => {
			collector.addRule('.monaco-workbench { background-color: #654321; }');
		}));
		const host = mainWindow.document.body.appendChild($('div'));
		disposables.add(toDisposable(() => host.remove()));

		const actual = variants.map(variant => {
			const id = `${variant.id} workbench-background`;
			const theme = ColorThemeData.createLoadedEmptyTheme(id, id);
			theme.setCustomColors({ 'editor.background': '#123456' });
			mainWindow.document.adoptedStyleSheets = [
				...mainWindow.document.adoptedStyleSheets,
				getThemeStyleSheet(theme),
			];
			const root = host.appendChild($('.monaco-workbench'));
			root.classList.add(...theme.classNames);
			const editor = root.appendChild($('.monaco-editor'));
			editor.classList.add(theme.classNames[0]);
			const scrollable = editor.appendChild($('.monaco-scrollable-element'));
			scrollable.classList.add(theme.classNames[0]);

			return [root, editor, scrollable].map(element => mainWindow.getComputedStyle(element).backgroundColor);
		});

		assert.deepStrictEqual(actual, variants.map(() => [
			'rgb(101, 67, 33)',
			'rgb(18, 52, 86)',
			'rgba(0, 0, 0, 0)',
		]));
	});

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
				id: variant.id,
				...resolveStyle(host, variant.expected),
			}));

			for (const variant of orderedVariants) {
				const theme = ColorThemeData.createLoadedEmptyTheme(variant.id, variant.id);
				theme.setCustomColors(variant.colors);
				mainWindow.document.adoptedStyleSheets = [
					...mainWindow.document.adoptedStyleSheets,
					getThemeStyleSheet(theme),
				];
				const root = host.appendChild($('.monaco-workbench'));
				root.classList.add(...theme.classNames);
				lines.set(variant.id, createCurrentLine(root));
				actual.push({
					outside: getCurrentLineStyle(outsideLine),
					fixtures: [...lines].map(([id, line]) => ({ id, ...getCurrentLineStyle(line) })),
				});
			}

			assert.deepStrictEqual(actual, orderedVariants.map((_, index) => ({
				outside: { border: '0px none rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
				fixtures: expectedStyles.slice(0, index + 1),
			})));
		});

		test(`isolates color variables on nested editor theme classes in ${reverse ? 'reverse' : 'forward'} theme installation order`, () => {
			const originalStyleSheets = [...mainWindow.document.adoptedStyleSheets];
			disposables.add(toDisposable(() => { mainWindow.document.adoptedStyleSheets = originalStyleSheets; }));
			const host = mainWindow.document.body.appendChild($('div'));
			disposables.add(toDisposable(() => host.remove()));
			const orderedVariants = reverse ? [...variants].reverse() : variants;
			const editors: HTMLElement[] = [];
			const actual = [];

			for (const variant of orderedVariants) {
				const theme = ColorThemeData.createLoadedEmptyTheme(variant.id, variant.id);
				theme.setCustomColors(variant.colors);
				mainWindow.document.adoptedStyleSheets = [
					...mainWindow.document.adoptedStyleSheets,
					getThemeStyleSheet(theme),
				];
				const root = host.appendChild($('.monaco-workbench'));
				root.classList.add(...theme.classNames);
				const editor = root.appendChild($('.monaco-editor'));
				editor.classList.add(theme.classNames[0]);
				editor.style.backgroundColor = 'var(--vscode-editor-lineHighlightBackground)';
				editors.push(editor);
				actual.push(editors.map(element => mainWindow.getComputedStyle(element).backgroundColor));
			}

			assert.deepStrictEqual(actual, orderedVariants.map((_, index) =>
				orderedVariants.slice(0, index + 1).map(variant => variant.expected.background)
			));
		});
	}

	test('preserves theme variables on fixture and nested editor roots', () => {
		const originalStyleSheets = [...mainWindow.document.adoptedStyleSheets];
		disposables.add(toDisposable(() => { mainWindow.document.adoptedStyleSheets = originalStyleSheets; }));
		const theme = ColorThemeData.createLoadedEmptyTheme(`${ThemeTypeSelector.VS} fixture-light`, 'Light');
		theme.setCustomColors({ 'editor.background': '#123456' });
		mainWindow.document.adoptedStyleSheets = [
			...mainWindow.document.adoptedStyleSheets,
			getThemeStyleSheet(theme),
		];
		const root = mainWindow.document.body.appendChild($('.monaco-workbench'));
		disposables.add(toDisposable(() => root.remove()));
		root.classList.add(...theme.classNames);
		root.style.backgroundColor = 'var(--vscode-editor-background)';
		const rootBackground = mainWindow.getComputedStyle(root).backgroundColor;
		root.style.setProperty('--vscode-editor-background', '#abcdef');
		const editor = root.appendChild($('.monaco-editor.vs'));
		editor.style.backgroundColor = 'var(--vscode-editor-background)';

		assert.deepStrictEqual({
			rootBackground,
			editorBackground: mainWindow.getComputedStyle(editor).backgroundColor,
		}, {
			rootBackground: 'rgb(18, 52, 86)',
			editorBackground: 'rgb(18, 52, 86)',
		});
	});
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
