/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { renderMarkdown } from '../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Color } from '../../../base/common/color.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import '../../browser/media/style.css';

suite('Workbench focus styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		// Hidden Electron windows do not match focus pseudo-classes; run these tests in a browser.
		if (!mainWindow.document.hasFocus()) {
			this.skip();
		}
	});

	for (const { theme, focusBorder, background } of [
		{ theme: 'vs', focusBorder: '#0069CC', background: '#FAFAFD' },
		{ theme: 'vs-dark', focusBorder: '#007FD4', background: '#1E1E1E' },
		{ theme: 'hc-black', focusBorder: '#F38518', background: '#000000' },
		{ theme: 'hc-light', focusBorder: '#006BBD', background: '#FFFFFF' },
	]) {
		test(`markdown links without an explicit tab index have a themed focus outline in ${theme}`, () => {
			const container = append(mainWindow.document.body, $(`.monaco-workbench.${theme}`));
			store.add(toDisposable(() => container.remove()));
			container.style.setProperty('--vscode-focusBorder', focusBorder);
			container.style.backgroundColor = background;
			const markdown = store.add(renderMarkdown(new MarkdownString('[Model Context Protocol (MCP) servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers)')));
			append(container, markdown.element);
			const link = markdown.element.querySelector('a')!;
			link.focus();

			const style = mainWindow.getComputedStyle(link);
			const outlineColor = Color.Format.CSS.parse(style.outlineColor)!;
			const backgroundColor = Color.Format.CSS.parse(mainWindow.getComputedStyle(container).backgroundColor)!;
			assert.deepStrictEqual({
				focused: mainWindow.document.activeElement === link,
				focusVisible: link.matches(':focus-visible'),
				tabIndex: link.getAttribute('tabindex'),
				outlineStyle: style.outlineStyle,
				outlineWidth: style.outlineWidth,
				outlineColor: outlineColor.toString(),
				outlineOffset: style.outlineOffset,
				sufficientContrast: outlineColor.getContrastRatio(backgroundColor) >= 3,
			}, {
				focused: true,
				focusVisible: true,
				tabIndex: null,
				outlineStyle: 'solid',
				outlineWidth: '1px',
				outlineColor: Color.fromHex(focusBorder).toString(),
				outlineOffset: '-1px',
				sufficientContrast: true,
			});
		});
	}
});
