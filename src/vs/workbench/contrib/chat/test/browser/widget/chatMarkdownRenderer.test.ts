/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatContentMarkdownRenderer } from '../../../browser/widget/chatContentMarkdownRenderer.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';

suite('ChatMarkdownRenderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let testRenderer: ChatContentMarkdownRenderer;
	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		testRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
	});

	test('simple', async () => {
		const md = new MarkdownString('a');
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.textContent);
	});

	test('plain text fast path preserves rendered markdown shape and single tildes', () => {
		const md = new MarkdownString('Hello, ~world~. This is plain.', { isTrusted: true, supportHtml: true, supportThemeIcons: true });
		const result = store.add(testRenderer.render(md));

		assert.deepStrictEqual({
			outerHTML: result.element.outerHTML,
			textContent: result.element.textContent,
		}, {
			outerHTML: '<div class="rendered-markdown"><p>Hello, ~world~. This is plain.</p></div>',
			textContent: 'Hello, ~world~. This is plain.',
		});
	});

	test('plain text fast path reuses target element', () => {
		const md = new MarkdownString('Hello, world.');
		const target = document.createElement('div');
		target.appendChild(document.createElement('span'));
		const result = store.add(testRenderer.render(md, undefined, target));

		assert.deepStrictEqual({
			sameElement: result.element === target,
			outerHTML: target.outerHTML,
		}, {
			sameElement: true,
			outerHTML: '<div class="rendered-markdown"><p>Hello, world.</p></div>',
		});
	});

	test('only renders strikethrough with double tildes', () => {
		const md = new MarkdownString('Keep ~single tildes~ but strike ~~double tildes~~.');
		const result = store.add(testRenderer.render(md, { markedOptions: { gfm: true } }));

		assert.deepStrictEqual({
			outerHTML: result.element.outerHTML,
			textContent: result.element.textContent,
		}, {
			outerHTML: '<div class="rendered-markdown"><p>Keep ~single tildes~ but strike <del>double tildes</del>.</p></div>',
			textContent: 'Keep ~single tildes~ but strike double tildes.',
		});
	});

	test('supportHtml with one-line markdown', async () => {
		const md = new MarkdownString('**hello**');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);

		const md2 = new MarkdownString('1. [_hello_](https://example.com) test **text**');
		md2.supportHtml = true;
		const result2 = store.add(testRenderer.render(md2));
		await assertSnapshot(result2.element.outerHTML);
	});

	test('invalid HTML', async () => {
		const md = new MarkdownString('1<canvas>2<details>3</details></canvas>4');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('invalid HTML with attributes', async () => {
		const md = new MarkdownString('1<details id="id1" style="display: none">2<details id="my id 2">3</details></details>4');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('valid HTML', async () => {
		const md = new MarkdownString(`
<h1>heading</h1>
<ul>
	<li>1</li>
	<li><b>hi</b></li>
</ul>
<pre><code>code here</code></pre>`);
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('mixed valid and invalid HTML', async () => {
		const md = new MarkdownString(`
<h1>heading</h1>
<details>
<ul>
	<li><span><details><i>1</i></details></span></li>
	<li><b>hi</b></li>
</ul>
</details>
<pre><canvas>canvas here</canvas></pre><details></details>`);
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('self-closing elements', async () => {
		{
			const md = new MarkdownString('<area><hr><br><input type="text" value="test">');
			md.supportHtml = true;
			const result = store.add(testRenderer.render(md));
			await assertSnapshot(result.element.outerHTML);
		}
		{
			const md = new MarkdownString('<area><hr><br><input type="checkbox">');
			md.supportHtml = true;
			const result = store.add(testRenderer.render(md));
			await assertSnapshot(result.element.outerHTML);
		}
	});

	test('html comments', async () => {
		const md = new MarkdownString('<!-- comment1 <div></div> --><div>content</div><!-- comment2 -->');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('CDATA', async () => {
		const md = new MarkdownString('<![CDATA[<div>content</div>]]>');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('remote images are disallowed', async () => {
		const md = new MarkdownString('<img src="http://disallowed.com/image.jpg">');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});

	test('code block ending at end of content does not leak body tag', async () => {
		const md = new MarkdownString('text\n```ts\nconst x = 1;\n```');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		const textContent = result.element.textContent;
		assert.ok(!textContent?.includes('</body>'), `Rendered text should not contain </body>, got: ${textContent}`);
	});

	test('fillInIncompleteTokens closes bare codespan when supportHtml is set', () => {
		// Regression: the chat content renderer wraps `supportHtml` markdown
		// in `<body>...</body>`, which produces a trailing html token. The
		// paragraph/codespan fixup in `fillInIncompleteTokens` must still
		// fire so streaming a partial backtick (e.g. the agent host
		// "Created isolated worktree for branch `xyz" announcement) does
		// not leave a bare ` in the DOM until the closing backtick arrives.
		const md = new MarkdownString('Created isolated worktree for branch `xyz', { supportHtml: true });
		const result = store.add(testRenderer.render(md, { fillInIncompleteTokens: true }));

		const codeEl = result.element.querySelector('code');
		assert.ok(codeEl, `Expected a <code> element in: ${result.element.outerHTML}`);
		assert.strictEqual(codeEl!.textContent, 'xyz');
		assert.ok(!result.element.textContent?.includes('`'), `Rendered text should not contain a bare backtick, got: ${result.element.textContent}`);
	});
});
