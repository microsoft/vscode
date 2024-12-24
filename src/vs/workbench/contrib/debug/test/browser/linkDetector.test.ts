/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isHTMLAnchorElement } from '../../../../../base/browser/dom.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITunnelService } from '../../../../../platform/tunnel/common/tunnel.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { LinkDetector } from '../../browser/linkDetector.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IHighlight } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';

suite('Debug - Link Detector', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let linkDetector: LinkDetector;

	/**
	 * Instantiate a {@link LinkDetector} for use by the functions being tested.
	 */
	setup(() => {
		const instantiationService: TestInstantiationService = <TestInstantiationService>workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ITunnelService, { canTunnel: () => false });
		linkDetector = instantiationService.createInstance(LinkDetector);
	});

	/**
	 * Assert that a given Element is an anchor element.
	 *
	 * @param element The Element to verify.
	 */
	function assertElementIsLink(element: Element) {
		assert(isHTMLAnchorElement(element));
	}

	test('noLinks', () => {
		const input = 'I am a string';
		const expectedOutput = '<span>I am a string</span>';
		const output = linkDetector.linkify(input);

		assert.strictEqual(0, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
	});

	test('trailingNewline', () => {
		const input = 'I am a string\n';
		const expectedOutput = '<span>I am a string\n</span>';
		const output = linkDetector.linkify(input);

		assert.strictEqual(0, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
	});

	test('trailingNewlineSplit', () => {
		const input = 'I am a string\n';
		const expectedOutput = '<span>I am a string\n</span>';
		const output = linkDetector.linkify(input, true);

		assert.strictEqual(0, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
	});

	test('singleLineLink', () => {
		const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
		const expectedOutput = isWindows ? '<span><a tabindex="0">C:\\foo\\bar.js:12:34<\/a><\/span>' : '<span><a tabindex="0">/Users/foo/bar.js:12:34<\/a><\/span>';
		const output = linkDetector.linkify(input);

		assert.strictEqual(1, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('A', output.firstElementChild!.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
		assertElementIsLink(output.firstElementChild!);
		assert.strictEqual(isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34', output.firstElementChild!.textContent);
	});

	test('relativeLink', () => {
		const input = '\./foo/bar.js';
		const expectedOutput = '<span>\./foo/bar.js</span>';
		const output = linkDetector.linkify(input);

		assert.strictEqual(0, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
	});

	test('relativeLinkWithWorkspace', async () => {
		const input = '\./foo/bar.js';
		const output = linkDetector.linkify(input, false, new WorkspaceFolder({ uri: URI.file('/path/to/workspace'), name: 'ws', index: 0 }));
		assert.strictEqual('SPAN', output.tagName);
		assert.ok(output.outerHTML.indexOf('link') >= 0);
	});

	test('singleLineLinkAndText', function () {
		const input = isWindows ? 'The link: C:/foo/bar.js:12:34' : 'The link: /Users/foo/bar.js:12:34';
		const expectedOutput = /^<span>The link: <a tabindex="0">.*\/foo\/bar.js:12:34<\/a><\/span>$/;
		const output = linkDetector.linkify(input);

		assert.strictEqual(1, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('A', output.children[0].tagName);
		assert(expectedOutput.test(output.outerHTML));
		assertElementIsLink(output.children[0]);
		assert.strictEqual(isWindows ? 'C:/foo/bar.js:12:34' : '/Users/foo/bar.js:12:34', output.children[0].textContent);
	});

	test('singleLineMultipleLinks', () => {
		const input = isWindows ? 'Here is a link C:/foo/bar.js:12:34 and here is another D:/boo/far.js:56:78' :
			'Here is a link /Users/foo/bar.js:12:34 and here is another /Users/boo/far.js:56:78';
		const expectedOutput = /^<span>Here is a link <a tabindex="0">.*\/foo\/bar.js:12:34<\/a> and here is another <a tabindex="0">.*\/boo\/far.js:56:78<\/a><\/span>$/;
		const output = linkDetector.linkify(input);

		assert.strictEqual(2, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('A', output.children[0].tagName);
		assert.strictEqual('A', output.children[1].tagName);
		assert(expectedOutput.test(output.outerHTML));
		assertElementIsLink(output.children[0]);
		assertElementIsLink(output.children[1]);
		assert.strictEqual(isWindows ? 'C:/foo/bar.js:12:34' : '/Users/foo/bar.js:12:34', output.children[0].textContent);
		assert.strictEqual(isWindows ? 'D:/boo/far.js:56:78' : '/Users/boo/far.js:56:78', output.children[1].textContent);
	});

	test('multilineNoLinks', () => {
		const input = 'Line one\nLine two\nLine three';
		const expectedOutput = /^<span><span>Line one\n<\/span><span>Line two\n<\/span><span>Line three<\/span><\/span>$/;
		const output = linkDetector.linkify(input, true);

		assert.strictEqual(3, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('SPAN', output.children[0].tagName);
		assert.strictEqual('SPAN', output.children[1].tagName);
		assert.strictEqual('SPAN', output.children[2].tagName);
		assert(expectedOutput.test(output.outerHTML));
	});

	test('multilineTrailingNewline', () => {
		const input = 'I am a string\nAnd I am another\n';
		const expectedOutput = '<span><span>I am a string\n<\/span><span>And I am another\n<\/span><\/span>';
		const output = linkDetector.linkify(input, true);

		assert.strictEqual(2, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('SPAN', output.children[0].tagName);
		assert.strictEqual('SPAN', output.children[1].tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
	});

	test('multilineWithLinks', () => {
		const input = isWindows ? 'I have a link for you\nHere it is: C:/foo/bar.js:12:34\nCool, huh?' :
			'I have a link for you\nHere it is: /Users/foo/bar.js:12:34\nCool, huh?';
		const expectedOutput = /^<span><span>I have a link for you\n<\/span><span>Here it is: <a tabindex="0">.*\/foo\/bar.js:12:34<\/a>\n<\/span><span>Cool, huh\?<\/span><\/span>$/;
		const output = linkDetector.linkify(input, true);

		assert.strictEqual(3, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('SPAN', output.children[0].tagName);
		assert.strictEqual('SPAN', output.children[1].tagName);
		assert.strictEqual('SPAN', output.children[2].tagName);
		assert.strictEqual('A', output.children[1].children[0].tagName);
		assert(expectedOutput.test(output.outerHTML));
		assertElementIsLink(output.children[1].children[0]);
		assert.strictEqual(isWindows ? 'C:/foo/bar.js:12:34' : '/Users/foo/bar.js:12:34', output.children[1].children[0].textContent);
	});

	test('highlightNoLinks', () => {
		const input = 'I am a string';
		const highlights: IHighlight[] = [{ start: 2, end: 5 }];
		const expectedOutput = '<span>I <span class="highlight">am </span>a string</span>';
		const output = linkDetector.linkify(input, false, undefined, false, undefined, highlights);

		assert.strictEqual(1, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
	});

	test('highlightWithLink', () => {
		const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
		const highlights: IHighlight[] = [{ start: 0, end: 5 }];
		const expectedOutput = isWindows ? '<span><a tabindex="0"><span class="highlight">C:\\fo</span>o\\bar.js:12:34</a></span>' : '<span><a tabindex="0"><span class="highlight">/User</span>s/foo/bar.js:12:34</a></span>';
		const output = linkDetector.linkify(input, false, undefined, false, undefined, highlights);

		assert.strictEqual(1, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('A', output.firstElementChild!.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
		assertElementIsLink(output.firstElementChild!);
	});

	test('highlightOverlappingLinkStart', () => {
		const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
		const highlights: IHighlight[] = [{ start: 0, end: 10 }];
		const expectedOutput = isWindows ? '<span><a tabindex="0"><span class="highlight">C:\\foo\\bar</span>.js:12:34</a></span>' : '<span><a tabindex="0"><span class="highlight">/Users/foo</span>/bar.js:12:34</a></span>';
		const output = linkDetector.linkify(input, false, undefined, false, undefined, highlights);

		assert.strictEqual(1, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('A', output.firstElementChild!.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
		assertElementIsLink(output.firstElementChild!);
	});

	test('highlightOverlappingLinkEnd', () => {
		const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
		const highlights: IHighlight[] = [{ start: 10, end: 20 }];
		const expectedOutput = isWindows ? '<span><a tabindex="0">C:\\foo\\bar<span class="highlight">.js:12:34</span></a></span>' : '<span><a tabindex="0">/Users/foo<span class="highlight">/bar.js:12</span>:34</a></span>';
		const output = linkDetector.linkify(input, false, undefined, false, undefined, highlights);

		assert.strictEqual(1, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('A', output.firstElementChild!.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
		assertElementIsLink(output.firstElementChild!);
	});

	test('highlightOverlappingLinkStartAndEnd', () => {
		const input = isWindows ? 'C:\\foo\\bar.js:12:34' : '/Users/foo/bar.js:12:34';
		const highlights: IHighlight[] = [{ start: 5, end: 15 }];
		const expectedOutput = isWindows ? '<span><a tabindex="0">C:\\fo<span class="highlight">o\\bar.js:1</span>2:34</a></span>' : '<span><a tabindex="0">/User<span class="highlight">s/foo/bar.</span>js:12:34</a></span>';
		const output = linkDetector.linkify(input, false, undefined, false, undefined, highlights);

		assert.strictEqual(1, output.children.length);
		assert.strictEqual('SPAN', output.tagName);
		assert.strictEqual('A', output.firstElementChild!.tagName);
		assert.strictEqual(expectedOutput, output.outerHTML);
		assertElementIsLink(output.firstElementChild!);
	});
});
