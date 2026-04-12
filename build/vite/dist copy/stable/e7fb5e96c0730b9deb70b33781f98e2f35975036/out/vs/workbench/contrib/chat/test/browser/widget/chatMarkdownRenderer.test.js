/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { assertSnapshot } from '../../../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatContentMarkdownRenderer } from '../../../browser/widget/chatContentMarkdownRenderer.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
suite('ChatMarkdownRenderer', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let testRenderer;
    setup(() => {
        const instantiationService = store.add(workbenchInstantiationService(undefined, store));
        testRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdE1hcmtkb3duUmVuZGVyZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0TWFya2Rvd25SZW5kZXJlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDckcsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFckcsS0FBSyxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtJQUNsQyxNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksWUFBeUMsQ0FBQztJQUM5QyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsTUFBTSxvQkFBb0IsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLFlBQVksR0FBRyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsMkJBQTJCLENBQUMsQ0FBQztJQUNqRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxRQUFRLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDekIsTUFBTSxFQUFFLEdBQUcsSUFBSSxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkMsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxD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