/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { safeSetInnerHtml } from '../../../../../base/browser/domSanitize.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from '../../browser/markdownDocumentRenderer.js';


suite('Markdown Document Renderer Test', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let extensionService: IExtensionService;
	let languageService: ILanguageService;

	setup(() => {
		instantiationService = createCodeEditorServices(store);
		extensionService = instantiationService.get(IExtensionService);
		languageService = instantiationService.get(ILanguageService);
	});

	test('Should remove images with relative paths by default', async () => {
		const result = await renderMarkdownDocument('![alt](src/img.png)', extensionService, languageService, {});
		assert.strictEqual(result.toString(), `<p><img alt="alt"></p>\n`);
	});

	test('Can enable images with relative paths using setting', async () => {
		const result = await renderMarkdownDocument('![alt](src/img.png)', extensionService, languageService, {
			sanitizerConfig: {
				allowRelativeMediaPaths: true,
			}
		});

		assert.strictEqual(result.toString(), `<p><img src="src/img.png" alt="alt"></p>\n`);
	});

	test('Default styles preserve explicit table header alignment', async () => {
		const result = await renderMarkdownDocument(
			'| Default | Left | Center | Right |\n| --- | :--- | :---: | ---: |\n| default | left | center | right |',
			extensionService, languageService
		);
		const container = document.createElement('div');
		const shadow = container.attachShadow({ mode: 'open' });
		const style = document.createElement('style');
		style.textContent = DEFAULT_MARKDOWN_STYLES;
		const content = document.createElement('div');
		safeSetInnerHtml(content, result.toString());
		shadow.append(style, content);
		document.body.appendChild(container);
		try {
			const alignments = Array.from(content.querySelectorAll('th'), header =>
				DOM.getWindow(header).getComputedStyle(header).textAlign.replace(/^-(webkit|moz)-/, '')
			);
			assert.deepStrictEqual(alignments, ['left', 'left', 'center', 'right']);
		} finally {
			container.remove();
		}
	});
});
