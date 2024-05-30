/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { assertSnapshot } from 'vs/base/test/common/snapshot';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ChatMarkdownRenderer } from 'vs/workbench/contrib/chat/browser/chatMarkdownRenderer';
import { ITrustedDomainService } from 'vs/workbench/contrib/url/browser/trustedDomainService';
import { MockTrustedDomainService } from 'vs/workbench/contrib/url/test/browser/mockTrustedDomainService';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';

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
