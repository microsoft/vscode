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
    async function renderMarkdownWithKatex(str) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Rvd25LYXRleFN1cHBvcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21hcmtkb3duL3Rlc3QvYnJvd3Nlci9tYXJrZG93bkthdGV4U3VwcG9ydC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDL0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDdEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDN0UsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHekUsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtJQUN6QyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELEtBQUssVUFBVSx1QkFBdUIsQ0FBQyxHQUFXO1FBQ2pELE1BQU0sS0FBSyxHQUFHLE1BQU0sa0JBQWtCLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM5RSxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUNsRSxlQUFlLEVBQUUsa0JBQWtCLENBQUMsbUJBQW1CLENBQUM7Z0JB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