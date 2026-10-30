/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, getWindow } from '../../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { LanguageService } from '../../../../../../editor/common/services/languageService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import '../../../browser/widget/media/chat.css';

suite('Chat Markdown styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let value: HTMLElement;

	setup(() => {
		const container = $('.monaco-workbench.interactive-item-container');
		store.add(toDisposable(() => container.remove()));
		for (const [name, color] of Object.entries({
			'--vscode-textPreformat-background': 'rgba(0, 0, 0, 0.12)',
			'--vscode-textPreformat-foreground': '#3b3b3b',
			'--vscode-textCodeBlock-background': '#ececec',
			'--vscode-textLink-foreground': '#0069cc',
		})) {
			container.style.setProperty(name, color);
		}
		value = container.appendChild($('.value')).appendChild($('.rendered-markdown'));
		mainWindow.document.body.appendChild(container);
	});

	test('code links have readable code foreground and a non-color link cue', () => {
		const rendered = store.add(renderMarkdown(new MarkdownString('[Normal](https://example.com) and [`code`](https://example.com).')));
		value.appendChild(rendered.element);
		const link = rendered.element.querySelector('a')!;
		const code = rendered.element.querySelector('a code')!;
		const codeStyle = getWindow(code).getComputedStyle(code);
		assert.deepStrictEqual({
			linkColor: getWindow(link).getComputedStyle(link).color,
			codeColor: codeStyle.color,
			codeDecoration: codeStyle.textDecorationLine,
			codeBackground: codeStyle.backgroundColor,
		}, {
			linkColor: 'rgb(0, 105, 204)',
			codeColor: 'rgb(59, 59, 59)',
			codeDecoration: 'underline',
			codeBackground: 'rgba(0, 0, 0, 0.12)',
		});
	});

	test('plain fenced code has one independent code-block background', () => {
		const rendered = store.add(renderMarkdown(new MarkdownString('```text\nplain code\n```')));
		value.appendChild(rendered.element);
		const pre = rendered.element.querySelector('pre')!;
		const code = pre.querySelector('code')!;
		assert.deepStrictEqual({
			block: getWindow(pre).getComputedStyle(pre).backgroundColor,
			code: getWindow(code).getComputedStyle(code).backgroundColor,
		}, {
			block: 'rgb(236, 236, 236)',
			code: 'rgba(0, 0, 0, 0)',
		});
	});

	test('tokenized code uses the code-block fill instead of the inline tint', async () => {
		const languageService = store.add(new LanguageService());
		const renderer = new EditorMarkdownCodeBlockRenderer(new TestConfigurationService({ editor: { fontFamily: 'monospace' } }), languageService);
		const block = await renderer.renderCodeBlock(undefined, 'const value = 1;', {});
		value.appendChild(block);
		const source = block.querySelector('.monaco-tokenized-source')!;
		assert.strictEqual(getWindow(source).getComputedStyle(source).backgroundColor, 'rgb(236, 236, 236)');
	});
});
