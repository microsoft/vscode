/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
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
			sanitizerOptions: MarkedKatexSupport.getSanitizerOptions({
				allowedTags: basicMarkupHtmlTags,
				allowedAttributes: defaultAllowedAttrs,
			})
		}, {
			markedExtensions: [katex],
		}));
		return rendered;
	}

	test('Basic inline equation', async () => {
		const rendered = await renderMarkdownWithKatex('Hello $\\frac{1}{2}$ World!');
		await assertSnapshot(rendered.element.innerHTML);
	});

	test('Should support inline equation wrapped in parans', async () => {
		const rendered = await renderMarkdownWithKatex('Hello ($\\frac{1}{2}$) World!');
		await assertSnapshot(rendered.element.innerHTML);
	});
});

