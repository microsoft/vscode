/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { assertSnapshot } from '../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatMarkdownRenderer } from '../../browser/chatMarkdownRenderer.js';
import { ITrustedDomainService } from '../../../url/browser/trustedDomainService.js';
import { MockTrustedDomainService } from '../../../url/test/browser/mockTrustedDomainService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('ChatMarkdownRenderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let testRenderer: ChatMarkdownRenderer;
	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		instantiationService.stub(ITrustedDomainService, new MockTrustedDomainService(['http://allowed.com']));
		testRenderer = instantiationService.createInstance(ChatMarkdownRenderer, {});
	});

	test('simple', async () => {
		const md = new MarkdownString('a');
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.textContent);
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
		const md = new MarkdownString('<area><hr><br><input type="text" value="test">');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
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

	test('remote images', async () => {
		const md = new MarkdownString('<img src="http://allowed.com/image.jpg"> <img src="http://disallowed.com/image.jpg">');
		md.supportHtml = true;
		const result = store.add(testRenderer.render(md));
		await assertSnapshot(result.element.outerHTML);
	});
});
