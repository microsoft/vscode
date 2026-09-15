/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { TestColorTheme } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createBrowserCanvasTheme } from '../../electron-browser/browserCanvasTheme.js';

suite('Browser canvas guest theme', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps the complete declared 329-variable contract without leaking arbitrary workbench CSS', async () => {
		const theme = createBrowserCanvasTheme(new TestColorTheme(), 'system-ui');
		const names = Object.keys(theme.cssVariables).sort();
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(names.join('\n')));
		assert.deepStrictEqual({
			count: names.length,
			contract: encodeHex(VSBuffer.wrap(new Uint8Array(digest))),
			stylesheets: Object.keys(theme.stylesheets),
			attributes: Object.keys(theme.attributes).sort(),
			bounded: Object.values(theme.cssVariables).every(value => value.length > 0 && value.length <= 512 && !/[{};]/.test(value)),
		}, {
			count: 329,
			contract: 'e1078b0f0f3180d84554ef6d3ee2dbae7701e08f2053ad211c4d2992fb5e5a8d',
			stylesheets: ['rampa'],
			attributes: ['data-color-mode', 'data-dark-theme', 'data-light-theme', 'data-theme-source', 'data-theme-tone', 'data-visual-mode'],
			bounded: true,
		});
	});

	test('semantic backgrounds, controls, focus and data colors follow the owning theme', () => {
		const theme = createBrowserCanvasTheme(new TestColorTheme({
			'editor.background': '#102030', 'editor.foreground': '#f0e0d0', 'button.background': '#315a81',
			'button.foreground': '#ffffff', 'focusBorder': '#aa55cc', 'terminal.ansiGreen': '#00ab00',
		}), 'Test Font, sans-serif');
		assert.deepStrictEqual({
			background: theme.cssVariables['--background-color-default'], foreground: theme.cssVariables['--text-color-default'],
			button: theme.cssVariables['--background-color-button-primary-rest'], focus: theme.cssVariables['--color-focus-outline'],
			green: theme.cssVariables['--color-data-green-emphasis'], font: theme.cssVariables['--font-sans'],
		}, { background: '#102030', foreground: '#f0e0d0', button: '#315a81', focus: '#aa55cc', green: '#00ab00', font: 'Test Font, sans-serif' });
	});

	test('fresh payloads change dark/light modes and keep high-contrast outline tokens', () => {
		const modes = [ColorScheme.DARK, ColorScheme.LIGHT, ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT]
			.map(type => createBrowserCanvasTheme(new TestColorTheme({ 'contrastBorder': '#ff0000', 'focusBorder': '#00ff00' }, type), 'system-ui'));
		assert.deepStrictEqual(modes.map(theme => ({
			mode: theme.colorScheme, attribute: theme.attributes['data-color-mode'], border: theme.cssVariables['--border-color-default'], focus: theme.cssVariables['--outline-color-focus-default'],
		})), [
			{ mode: 'dark', attribute: 'dark', border: '#ff0000', focus: '#00ff00' },
			{ mode: 'light', attribute: 'light', border: '#ff0000', focus: '#00ff00' },
			{ mode: 'dark', attribute: 'dark', border: '#ff0000', focus: '#00ff00' },
			{ mode: 'light', attribute: 'light', border: '#ff0000', focus: '#00ff00' },
		]);
	});

	test('syntax defaults use the public token metadata API', () => {
		const source = new class extends TestColorTheme {
			override getTokenStyleMetadata(type: string) {
				return { foreground: type === 'comment' ? 1 : undefined, bold: undefined, underline: undefined, strikethrough: undefined, italic: undefined };
			}
			override get tokenColorMap() { return ['', '#cc8844']; }
		}({ 'editor.foreground': '#abcdef' });
		const theme = createBrowserCanvasTheme(source, 'system-ui');
		assert.deepStrictEqual({ comment: theme.cssVariables['--syntax-color-comment'], fallback: theme.cssVariables['--syntax-color-string'] }, { comment: '#cc8844', fallback: '#abcdef' });
	});
});
