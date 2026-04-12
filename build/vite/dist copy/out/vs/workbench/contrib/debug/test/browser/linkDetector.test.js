/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isHTMLAnchorElement } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITunnelService } from '../../../../../platform/tunnel/common/tunnel.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { LinkDetector } from '../../browser/linkDetector.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
suite('Debug - Link Detector', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    let linkDetector;
    /**
     * Instantiate a {@link LinkDetector} for use by the functions being tested.
     */
    setup(() => {
        const instantiationService = workbenchInstantiationService(undefined, disposables);
        instantiationService.stub(ITunnelService, { canTunnel: () => false });
        linkDetector = instantiationService.createInstance(LinkDetector);
    });
    /**
     * Assert that a given Element is an anchor element.
     *
     * @param element The Element to verify.
     */
    function assertElementIsLink(element) {
        assert(isHTMLAnchorElement(element));
    }
    test('noLinks', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = 'I am a string';
        const expectedOutput = '<span>I am a string</span>';
        const output = linkDetector.linkify(input, hoverBehavior);
        assert.strictEqual(0, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        hoverBehavior.store.dispose();
    });
    test('trailingNewline', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = 'I am a string\n';
        const expectedOutput = '<span>I am a string\n</span>';
        const output = linkDetector.linkify(input, hoverBehavior);
        assert.strictEqual(0, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        hoverBehavior.store.dispose();
    });
    test('trailingNewlineSplit', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = 'I am a string\n';
        const expectedOutput = '<span>I am a string\n</span>';
        const output = linkDetector.linkify(input, hoverBehavior, true);
        assert.strictEqual(0, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        hoverBehavior.store.dispose();
    });
    test('singleLineLink', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
        const expectedOutput = isWindows ? '<span><a tabindex="0">C:\\foo\\bar.js:12:34<\/a><\/span>' : '<span><a tabindex="0">/Users/foo/bar.js:12:34<\/a><\/span>';
        const output = linkDetector.linkify(input, hoverBehavior);
        assert.strictEqual(1, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.firstElementChild.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        assertElementIsLink(output.firstElementChild);
        assert.strictEqual(isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34', output.firstElementChild.textContent);
        hoverBehavior.store.dispose();
    });
    test('allows links with @ (#282635)', () => {
        if (!isWindows) {
            const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
            const input = '(/home/alexey_korepov/projects/dt2/playwright/node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/lib/client/errors.js:56:16)';
            const expectedOutput = '<span>(<a tabindex="0">/home/alexey_korepov/projects/dt2/playwright/node_modules/.pnpm/playwright-core@1.57.0/node_modules/playwright-core/lib/client/errors.js:56:16</a>)</span>';
            const output = linkDetector.linkify(input, hoverBehavior);
            assert.strictEqual(expectedOutput, output.outerHTML);
            assert.strictEqual(1, output.children.length);
            hoverBehavior.store.dispose();
        }
    });
    test('relativeLink', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = '\./foo/bar.js';
        const expectedOutput = '<span>\./foo/bar.js</span>';
        const output = linkDetector.linkify(input, hoverBehavior);
        assert.strictEqual(0, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        hoverBehavior.store.dispose();
    });
    test('relativeLinkWithWorkspace', async () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = '\./foo/bar.js';
        const output = linkDetector.linkify(input, hoverBehavior, false, new WorkspaceFolder({ uri: URI.file('/path/to/workspace'), name: 'ws', index: 0 }));
        assert.strictEqual('SPAN', output.tagName);
        assert.ok(output.outerHTML.indexOf('link') >= 0);
        hoverBehavior.store.dispose();
    });
    test('singleLineLinkAndText', function () {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'The link: C:/foo/bar.js:12:34' : 'The link: /Users/foo/bar.js:12:34';
        const expectedOutput = /^<span>The link: <a tabindex="0">.*\/foo\/bar.js:12:34<\/a><\/span>$/;
        const output = linkDetector.linkify(input, hoverBehavior);
        assert.strictEqual(1, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.children[0].tagName);
        assert(expectedOutput.test(output.outerHTML));
        assertElementIsLink(output.children[0]);
        assert.strictEqual(isWindows ? 'C:/foo/bar.js:12:34' : '/Users/foo/bar.js:12:34', output.children[0].textContent);
        hoverBehavior.store.dispose();
    });
    test('singleLineMultipleLinks', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'Here is a link C:/foo/bar.js:12:34 and here is another D:/boo/far.js:56:78' :
            'Here is a link /Users/foo/bar.js:12:34 and here is another /Users/boo/far.js:56:78';
        const expectedOutput = /^<span>Here is a link <a tabindex="0">.*\/foo\/bar.js:12:34<\/a> and here is another <a tabindex="0">.*\/boo\/far.js:56:78<\/a><\/span>$/;
        const output = linkDetector.linkify(input, hoverBehavior);
        assert.strictEqual(2, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.children[0].tagName);
        assert.strictEqual('A', output.children[1].tagName);
        assert(expectedOutput.test(output.outerHTML));
        assertElementIsLink(output.children[0]);
        assertElementIsLink(output.children[1]);
        assert.strictEqual(isWindows ? 'C:/foo/bar.js:12:34' : '/Users/foo/bar.js:12:34', output.children[0].textContent);
        assert.strictEqual(isWindows ? 'D:/boo/far.js:56:78' : '/Users/boo/far.js:56:78', output.children[1].textContent);
        hoverBehavior.store.dispose();
    });
    test('multilineNoLinks', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = 'Line one\nLine two\nLine three';
        const expectedOutput = /^<span><span>Line one\n<\/span><span>Line two\n<\/span><span>Line three<\/span><\/span>$/;
        const output = linkDetector.linkify(input, hoverBehavior, true);
        assert.strictEqual(3, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('SPAN', output.children[0].tagName);
        assert.strictEqual('SPAN', output.children[1].tagName);
        assert.strictEqual('SPAN', output.children[2].tagName);
        assert(expectedOutput.test(output.outerHTML));
        hoverBehavior.store.dispose();
    });
    test('multilineTrailingNewline', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = 'I am a string\nAnd I am another\n';
        const expectedOutput = '<span><span>I am a string\n<\/span><span>And I am another\n<\/span><\/span>';
        const output = linkDetector.linkify(input, hoverBehavior, true);
        assert.strictEqual(2, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('SPAN', output.children[0].tagName);
        assert.strictEqual('SPAN', output.children[1].tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        hoverBehavior.store.dispose();
    });
    test('multilineWithLinks', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'I have a link for you\nHere it is: C:/foo/bar.js:12:34\nCool, huh?' :
            'I have a link for you\nHere it is: /Users/foo/bar.js:12:34\nCool, huh?';
        const expectedOutput = /^<span><span>I have a link for you\n<\/span><span>Here it is: <a tabindex="0">.*\/foo\/bar.js:12:34<\/a>\n<\/span><span>Cool, huh\?<\/span><\/span>$/;
        const output = linkDetector.linkify(input, hoverBehavior, true);
        assert.strictEqual(3, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('SPAN', output.children[0].tagName);
        assert.strictEqual('SPAN', output.children[1].tagName);
        assert.strictEqual('SPAN', output.children[2].tagName);
        assert.strictEqual('A', output.children[1].children[0].tagName);
        assert(expectedOutput.test(output.outerHTML));
        assertElementIsLink(output.children[1].children[0]);
        assert.strictEqual(isWindows ? 'C:/foo/bar.js:12:34' : '/Users/foo/bar.js:12:34', output.children[1].children[0].textContent);
        hoverBehavior.store.dispose();
    });
    test('highlightNoLinks', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = 'I am a string';
        const highlights = [{ start: 2, end: 5 }];
        const expectedOutput = '<span>I <span class="highlight">am </span>a string</span>';
        const output = linkDetector.linkify(input, hoverBehavior, false, undefined, false, highlights);
        assert.strictEqual(1, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        hoverBehavior.store.dispose();
    });
    test('highlightWithLink', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
        const highlights = [{ start: 0, end: 5 }];
        const expectedOutput = isWindows ? '<span><a tabindex="0"><span class="highlight">C:\\fo</span>o\\bar.js:12:34</a></span>' : '<span><a tabindex="0"><span class="highlight">/User</span>s/foo/bar.js:12:34</a></span>';
        const output = linkDetector.linkify(input, hoverBehavior, false, undefined, false, highlights);
        assert.strictEqual(1, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.firstElementChild.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        assertElementIsLink(output.firstElementChild);
        hoverBehavior.store.dispose();
    });
    test('highlightOverlappingLinkStart', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
        const highlights = [{ start: 0, end: 10 }];
        const expectedOutput = isWindows ? '<span><a tabindex="0"><span class="highlight">C:\\foo\\bar</span>.js:12:34</a></span>' : '<span><a tabindex="0"><span class="highlight">/Users/foo</span>/bar.js:12:34</a></span>';
        const output = linkDetector.linkify(input, hoverBehavior, false, undefined, false, highlights);
        assert.strictEqual(1, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.firstElementChild.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        assertElementIsLink(output.firstElementChild);
        hoverBehavior.store.dispose();
    });
    test('highlightOverlappingLinkEnd', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
        const highlights = [{ start: 10, end: 20 }];
        const expectedOutput = isWindows ? '<span><a tabindex="0">C:\\foo\\bar<span class="highlight">.js:12:34</span></a></span>' : '<span><a tabindex="0">/Users/foo<span class="highlight">/bar.js:12</span>:34</a></span>';
        const output = linkDetector.linkify(input, hoverBehavior, false, undefined, false, highlights);
        assert.strictEqual(1, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.firstElementChild.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        assertElementIsLink(output.firstElementChild);
        hoverBehavior.store.dispose();
    });
    test('highlightOverlappingLinkStartAndEnd', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
        const highlights = [{ start: 5, end: 15 }];
        const expectedOutput = isWindows ? '<span><a tabindex="0">C:\\fo<span class="highlight">o\\bar.js:1</span>2:34</a></span>' : '<span><a tabindex="0">/User<span class="highlight">s/foo/bar.</span>js:12:34</a></span>';
        const output = linkDetector.linkify(input, hoverBehavior, false, undefined, false, highlights);
        assert.strictEqual(1, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.firstElementChild.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        assertElementIsLink(output.firstElementChild);
        hoverBehavior.store.dispose();
    });
    test('csharpStackTraceFormatWithLine', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'C:\\foo\\bar.cs:line 6' : '/Users/foo/bar.cs:line 6';
        const expectedOutput = isWindows ? '<span><a tabindex="0">C:\\foo\\bar.cs:line 6<\/a><\/span>' : '<span><a tabindex="0">/Users/foo/bar.cs:line 6<\/a><\/span>';
        const output = linkDetector.linkify(input, hoverBehavior);
        assert.strictEqual(1, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.firstElementChild.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        assertElementIsLink(output.firstElementChild);
        assert.strictEqual(isWindows ? 'C:\\foo\\bar.cs:line 6' : '/Users/foo/bar.cs:line 6', output.firstElementChild.textContent);
        hoverBehavior.store.dispose();
    });
    test('csharpStackTraceFormatWithLineAndColumn', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'C:\\foo\\bar.cs:line 6:10' : '/Users/foo/bar.cs:line 6:10';
        const expectedOutput = isWindows ? '<span><a tabindex="0">C:\\foo\\bar.cs:line 6:10<\/a><\/span>' : '<span><a tabindex="0">/Users/foo/bar.cs:line 6:10<\/a><\/span>';
        const output = linkDetector.linkify(input, hoverBehavior);
        assert.strictEqual(1, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.firstElementChild.tagName);
        assert.strictEqual(expectedOutput, output.outerHTML);
        assertElementIsLink(output.firstElementChild);
        assert.strictEqual(isWindows ? 'C:\\foo\\bar.cs:line 6:10' : '/Users/foo/bar.cs:line 6:10', output.firstElementChild.textContent);
        hoverBehavior.store.dispose();
    });
    test('mixedStackTraceFormats', () => {
        const hoverBehavior = { type: 2 /* DebugLinkHoverBehavior.None */, store: new DisposableStore() };
        const input = isWindows ? 'C:\\foo\\bar.js:12:34 and C:\\baz\\qux.cs:line 6' :
            '/Users/foo/bar.js:12:34 and /Users/baz/qux.cs:line 6';
        // Use flexible path separator matching for cross-platform compatibility
        const expectedOutput = isWindows ?
            /^<span><a tabindex="0">.*\\foo\\bar\.js:12:34<\/a> and <a tabindex="0">.*\\baz\\qux\.cs:line 6<\/a><\/span>$/ :
            /^<span><a tabindex="0">.*\/foo\/bar\.js:12:34<\/a> and <a tabindex="0">.*\/baz\/qux\.cs:line 6<\/a><\/span>$/;
        const output = linkDetector.linkify(input, hoverBehavior);
        assert.strictEqual(2, output.children.length);
        assert.strictEqual('SPAN', output.tagName);
        assert.strictEqual('A', output.children[0].tagName);
        assert.strictEqual('A', output.children[1].tagName);
        assert(expectedOutput.test(output.outerHTML));
        assertElementIsLink(output.children[0]);
        assertElementIsLink(output.children[1]);
        assert.strictEqual(isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34', output.children[0].textContent);
        assert.strictEqual(isWindows ? 'C:\\baz\\qux.cs:line 6' : '/Users/baz/qux.cs:line 6', output.children[1].textContent);
        hoverBehavior.store.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlua0RldGVjdG9yLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy90ZXN0L2Jyb3dzZXIvbGlua0RldGVjdG9yLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUEwQixZQUFZLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNyRixPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUdsRyxLQUFLLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO0lBRW5DLE1BQU0sV0FBVyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFDOUQsSUFBSSxZQUEwQixDQUFDO0lBRS9COztPQUVHO0lBQ0gsS0FBSyxDQUFDLEdBQUcsRUFBRTtRQUNWLE1BQU0sb0JBQW9CLEdBQXVELDZCQUE2QixDQUFDLFNBQVMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN2SSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLEtB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