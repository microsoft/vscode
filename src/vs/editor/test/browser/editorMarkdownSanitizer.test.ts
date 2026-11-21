/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { renderMarkdown } from '../../../base/browser/markdownRenderer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getEditorMarkdownSanitizerConfig } from '../../browser/editorMarkdownSanitizer.js';
import { EditorOption, IEditorMarkdownImagesOptions } from '../../common/config/editorOptions.js';
import { withTestCodeEditor } from './testCodeEditor.js';

suite('Editor Markdown images', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const markdown = {
		value: [
			'![remote](https://attacker.example/collect?leak=1)',
			'![allowed](https://img.shields.io/badge.svg)',
			'![inline](data:image/png;base64,iVBORw0KGgo=)',
			'[link](https://example.com/docs)',
		].join('\n\n')
	};

	function renderImageSources(markdownImages: IEditorMarkdownImagesOptions | undefined): Record<string, string | null> {
		const result: Record<string, string | null> = {};
		withTestCodeEditor('', { markdownImages }, editor => {
			const rendered = renderMarkdown(markdown, { sanitizerConfig: getEditorMarkdownSanitizerConfig(editor) });
			for (const img of rendered.element.querySelectorAll('img')) {
				result[img.getAttribute('alt')!] = img.getAttribute('src');
			}
			result.link = rendered.element.querySelector('a')?.getAttribute('data-href') ?? null;
			rendered.dispose();
		});
		return result;
	}

	test('allows all images by default', () => {
		const sources = renderImageSources(undefined);
		assert.strictEqual(sources.remote, 'https://attacker.example/collect?leak=1');
		assert.strictEqual(sources.allowed, 'https://img.shields.io/badge.svg');
	});

	test('blocks remote images when no origin is allowed, keeps data images and links', () => {
		const sources = renderImageSources({ allowedOrigins: [] });
		assert.strictEqual(sources.remote, null);
		assert.strictEqual(sources.allowed, null);
		assert.strictEqual(sources.inline, 'data:image/png;base64,iVBORw0KGgo=');
		assert.strictEqual(sources.link, 'https://example.com/docs');
	});

	test('allows images from the allowed origins only', () => {
		const sources = renderImageSources({ allowedOrigins: ['https://img.shields.io/ignored-path'] });
		assert.strictEqual(sources.remote, null);
		assert.strictEqual(sources.allowed, 'https://img.shields.io/badge.svg');
	});

	test('validates and normalizes allowed origins', () => {
		withTestCodeEditor('', { markdownImages: { allowedOrigins: ['HTTPS://A.example:443/x', 'http://b.example:8080', 'not a url', 'data:text/plain,x', 42 as unknown as string] } }, editor => {
			assert.deepStrictEqual(editor.getOption(EditorOption.markdownImages), { allowedOrigins: ['https://a.example', 'http://b.example:8080'] });

			editor.updateOptions({ markdownImages: { allowedOrigins: true } });
			assert.deepStrictEqual(editor.getOption(EditorOption.markdownImages), { allowedOrigins: true });
		});
	});

	function renderHtmlMediaSources(value: string, allowedOrigins: string[]): (string | null)[] {
		const result: (string | null)[] = [];
		withTestCodeEditor('', { markdownImages: { allowedOrigins } }, editor => {
			const rendered = renderMarkdown({ value, supportHtml: true }, { sanitizerConfig: getEditorMarkdownSanitizerConfig(editor) });
			for (const el of rendered.element.querySelectorAll('img, video')) {
				result.push(el.getAttribute(el.tagName === 'VIDEO' ? 'poster' : 'src'));
			}
			rendered.dispose();
		});
		return result;
	}

	test('checks the origin the browser requests, not a decoded form of it', () => {
		const value = [
			'<img src="https://trusted.example%2F@attacker.example/x.png">',
			'<video poster="https://trusted.example%2F@attacker.example/poster.png"></video>',
			'<img src="https://trusted.example/ok.png">',
		].join('\n');
		assert.deepStrictEqual(renderHtmlMediaSources(value, ['https://trusted.example']), [null, null, 'https://trusted.example/ok.png']);
	});
});
