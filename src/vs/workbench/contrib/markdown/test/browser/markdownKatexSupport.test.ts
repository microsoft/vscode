/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { basicMarkupHtmlTags, defaultAllowedAttrs } from '../../../../../base/browser/domSanitize.js';
import { renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { assertSnapshot } from '../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MarkedKatexSupport } from '../../browser/markedKatexSupport.js';


suite('Markdown Katex Support Test', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function renderMarkdownWithKatex(str: string) {
		const katex = await MarkedKatexSupport.loadExtension(getWindow(document), {});
		const rendered = store.add(renderMarkdown(new MarkdownString(str), {
			sanitizerConfig: MarkedKatexSupport.getSanitizerOptions({
				allowedTags: basicMarkupHtmlTags,
				allowedAttributes: defaultAllowedAttrs,
			}),
			markedExtensions: [katex],
		}));
		return rendered;
	}

	test('Basic inline equation', async () => {
		const rendered = await renderMarkdownWithKatex('Hello $\\frac{1}{2}$ World!');
		assert.ok(rendered.element.innerHTML.includes('katex'));
		await assertSnapshot(rendered.element.innerHTML);
	});

	test('Should support inline equation wrapped in parans', async () => {
		const rendered = await renderMarkdownWithKatex('Hello ($\\frac{1}{2}$) World!');
		assert.ok(rendered.element.innerHTML.includes('katex'));
		await assertSnapshot(rendered.element.innerHTML);
	});

	test('Should support blocks immediately after paragraph', async () => {
		const rendered = await renderMarkdownWithKatex([
			'Block example:',
			'$$',
			'\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}',
			'$$',
		].join('\n'));
		assert.ok(rendered.element.innerHTML.includes('katex'));
		await assertSnapshot(rendered.element.innerHTML);
	});

	test('Should not render math when dollar sign is preceded by word character', async () => {
		const rendered = await renderMarkdownWithKatex('for ($i = 1; $i -le 20; $i++) { echo "hello world"; Start-Sleep 1 }');
		assert.ok(!rendered.element.innerHTML.includes('katex'));
		await assertSnapshot(rendered.element.innerHTML);
	});

	test('Should not render math when dollar sign is followed by word character', async () => {
		const rendered = await renderMarkdownWithKatex('The cost is $10dollars for this item');
		assert.ok(!rendered.element.innerHTML.includes('katex'));
		await assertSnapshot(rendered.element.innerHTML);
	});

	test('Should still render math with special characters around dollars', async () => {
		const rendered = await renderMarkdownWithKatex('Hello ($\\frac{1}{2}$) and [$x^2$] work fine');
		assert.ok(rendered.element.innerHTML.includes('katex'));
		await assertSnapshot(rendered.element.innerHTML);
	});

	test('Should still render math at start and end of line', async () => {
		const rendered = await renderMarkdownWithKatex('$\\frac{1}{2}$ at start, and at end $x^2$');
		assert.ok(rendered.element.innerHTML.includes('katex'));
		await assertSnapshot(rendered.element.innerHTML);
	});

	test('Should not render math when dollar signs appear in jQuery expressions', async () => {
		const rendered = await renderMarkdownWithKatex('$.getJSON, $.ajax, $.get and $("#dialogDetalleZona").dialog(...) / $("#dialogDetallePDC").dialog(...)');
		assert.ok(!rendered.element.innerHTML.includes('katex'));
		await assertSnapshot(rendered.element.innerHTML);
	});
});

