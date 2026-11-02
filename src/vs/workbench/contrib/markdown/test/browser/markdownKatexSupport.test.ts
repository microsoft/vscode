/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getWindow } from '../../../../../base/browser/dom.js';
import { basicMarkupHtmlTags, defaultAllowedAttrs } from '../../../../../base/browser/domSanitize.js';
import { allowedMarkdownHtmlAttributes, renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { assertSnapshot } from '../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MarkedKatexSupport } from '../../browser/markedKatexSupport.js';


suite('Markdown Katex Support Test', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => {
		// `loadExtension` adds the KaTeX stylesheet to the document, so remove it again. Its rules cannot be read in
		// the unit tests (it has another origin), which breaks the later tests that read the rules of every stylesheet.
		for (const element of [...getWindow(document).document.head.children]) {
			if (element.classList.contains('katex')) {
				element.remove();
			}
		}
	});

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

	test('Only rendered math may use katex classes and styles', async () => {
		const katex = await MarkedKatexSupport.loadExtension(getWindow(document), {});
		const md = new MarkdownString([
			'<div class="monaco-button" style="position: fixed; top: 0px; width: 100px">fixed</div>',
			'',
			'<span class="vscode-katex-container" data-latex="x" data-vscode-katex-output="guess" style="position: relative; top: -40px">claims to be math</span>',
			'',
			'<span class="codicon codicon-check" style="color:#ff0000;">kept</span> $x^2$',
		].join('\n'));
		md.supportHtml = true;
		const rendered = store.add(renderMarkdown(md, {
			sanitizerConfig: MarkedKatexSupport.getSanitizerOptions({
				allowedTags: basicMarkupHtmlTags,
				allowedAttributes: allowedMarkdownHtmlAttributes,
			}),
			markedExtensions: [katex],
		}));

		const element = rendered.element;
		assert.deepStrictEqual({
			fixed: element.querySelector('div')?.outerHTML,
			claimsToBeMath: [...element.querySelectorAll('span')].find(e => e.textContent === 'claims to be math')?.outerHTML,
			baseRules: element.querySelector('.codicon')?.outerHTML,
			mathStyled: !!element.querySelector('.vscode-katex-container .katex-html [style]'),
			markerRemoved: !element.querySelector('[data-vscode-katex-output]'),
		}, {
			fixed: '<div>fixed</div>',
			claimsToBeMath: '<span data-latex="x">claims to be math</span>',
			baseRules: '<span class="codicon codicon-check" style="color:#ff0000;">kept</span>',
			mathStyled: true,
			markerRemoved: true,
		});
	});
});

