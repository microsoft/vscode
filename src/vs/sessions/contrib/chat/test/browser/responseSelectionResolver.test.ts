/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatWidget } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatResponseViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { resolveResponseSelection } from '../../browser/responseSelectionResolver.js';

function makeResponse(requestId: string): IChatResponseViewModel {
	return upcastPartial<IChatResponseViewModel>({ requestId, setVote: () => undefined });
}

function nextAnimationFrame(node: Node): Promise<void> {
	return new Promise<void>(resolve => dom.scheduleAtNextAnimationFrame(dom.getWindow(node), resolve));
}

function stubSelection(store: DisposableStore, anchorNode: Node, focusNode: Node, text: string, focusOffset?: number): void {
	const doc = anchorNode.ownerDocument!;
	const range = doc.createRange();
	range.setStart(anchorNode, 0);
	range.setEnd(focusNode, focusOffset ?? (focusNode.nodeType === Node.TEXT_NODE ? (focusNode as Text).data.length : focusNode.childNodes.length));

	const targetWindow = dom.getWindow(anchorNode);
	const original = targetWindow.getSelection.bind(targetWindow);
	const mutableWindow = targetWindow as typeof targetWindow & { getSelection: () => Selection | null };
	mutableWindow.getSelection = () => upcastPartial<Selection>({
		toString: () => text,
		isCollapsed: text.length === 0,
		anchorNode,
		focusNode,
		rangeCount: 1,
		getRangeAt: () => range,
	});
	store.add(toDisposable(() => { mutableWindow.getSelection = original; }));
}

suite('resolveResponseSelection', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const store = disposables.add(new DisposableStore());
		const doc = dom.getActiveDocument();
		const widgetDomNode = doc.createElement('div');
		doc.body.appendChild(widgetDomNode);
		store.add(toDisposable(() => widgetDomNode.remove()));
		return { store, doc, widgetDomNode };
	}

	test('resolves a plain markdown selection within a single response', () => {
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const textNode = doc.createTextNode('hello world');
		markdown.appendChild(textNode);
		widgetDomNode.appendChild(markdown);

		const response = makeResponse('turn-1');
		stubSelection(store, textNode, textNode, 'hello world');
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => response,
		});

		const resolved = resolveResponseSelection(widget);
		assert.ok(resolved);
		assert.strictEqual(resolved!.response, response);
		assert.strictEqual(resolved!.text, 'hello world');
	});

	test('preserves leading whitespace while dropping the trailing newline artifact', () => {
		// Leading whitespace is part of what the user selected (e.g. starting
		// mid-indentation); only the newline browsers append when a line
		// selection spills into the next block should be dropped.
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const textNode = doc.createTextNode('    indented text');
		markdown.appendChild(textNode);
		widgetDomNode.appendChild(markdown);

		stubSelection(store, textNode, textNode, '    indented text\n');
		const response = makeResponse('turn-1');
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => response,
		});

		assert.strictEqual(resolveResponseSelection(widget)?.text, '    indented text');
	});

	test('resolves a line selection that ends at the start of the element after the markdown', async () => {
		// A triple-click selects the whole line and parks the selection's focus
		// at offset 0 of the *next* block, which for the last line of a
		// response lands outside the markdown part entirely.
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const paragraph = doc.createElement('p');
		const textNode = doc.createTextNode('hello world');
		paragraph.appendChild(textNode);
		markdown.appendChild(paragraph);
		const footer = doc.createElement('div');
		footer.appendChild(doc.createTextNode('response toolbar'));
		widgetDomNode.appendChild(markdown);
		widgetDomNode.appendChild(footer);

		const response = makeResponse('turn-1');
		stubSelection(store, textNode, footer, 'hello world\n', 0);
		await nextAnimationFrame(widgetDomNode);
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => response,
		});

		const resolved = resolveResponseSelection(widget);
		assert.ok(resolved);
		assert.strictEqual(resolved!.response, response);
		assert.strictEqual(resolved!.text, 'hello world');
	});

	test('rejects a selection that genuinely extends into content after the markdown', () => {
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const textNode = doc.createTextNode('hello world');
		markdown.appendChild(textNode);
		const footer = doc.createElement('div');
		const footerText = doc.createTextNode('response toolbar');
		footer.appendChild(footerText);
		widgetDomNode.appendChild(markdown);
		widgetDomNode.appendChild(footer);

		stubSelection(store, textNode, footerText, 'hello world response toolbar');
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => makeResponse('turn-1'),
		});

		assert.strictEqual(resolveResponseSelection(widget), undefined);
	});

	test('rejects a collapsed (empty) selection', () => {
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const textNode = doc.createTextNode('hello world');
		markdown.appendChild(textNode);
		widgetDomNode.appendChild(markdown);

		stubSelection(store, textNode, textNode, '');
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => makeResponse('turn-1'),
		});

		assert.strictEqual(resolveResponseSelection(widget), undefined);
	});

	test('rejects a selection inside an embedded code editor', () => {
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const editor = doc.createElement('div');
		editor.classList.add('monaco-editor');
		const textNode = doc.createTextNode('const x = 1;');
		editor.appendChild(textNode);
		markdown.appendChild(editor);
		widgetDomNode.appendChild(markdown);

		stubSelection(store, textNode, textNode, 'const x = 1;');
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => makeResponse('turn-1'),
		});

		assert.strictEqual(resolveResponseSelection(widget), undefined);
	});

	test('rejects a selection inside tool-invocation UI', () => {
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const tool = doc.createElement('div');
		tool.classList.add('chat-tool-invocation-part');
		const textNode = doc.createTextNode('ran a tool');
		tool.appendChild(textNode);
		markdown.appendChild(tool);
		widgetDomNode.appendChild(markdown);

		stubSelection(store, textNode, textNode, 'ran a tool');
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => makeResponse('turn-1'),
		});

		assert.strictEqual(resolveResponseSelection(widget), undefined);
	});

	test('rejects a selection spanning two different responses', () => {
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const partA = doc.createElement('span');
		const partB = doc.createElement('span');
		const textNode1 = doc.createTextNode('first response');
		const textNode2 = doc.createTextNode('second response');
		partA.appendChild(textNode1);
		partB.appendChild(textNode2);
		markdown.appendChild(partA);
		markdown.appendChild(partB);
		widgetDomNode.appendChild(markdown);

		stubSelection(store, textNode1, textNode2, 'first response second response');
		const responseA = makeResponse('turn-1');
		const responseB = makeResponse('turn-2');
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: (node: HTMLElement) => node === partA ? responseA : responseB,
		});

		assert.strictEqual(resolveResponseSelection(widget), undefined);
	});

	test('resolves through a display:contents wrapper', () => {
		// `display: contents` elements have no box of their own, so a visibility
		// check reports them as invisible even though their descendants render
		// and are selectable. Both endpoints live inside such wrappers here, so
		// pruning them drops every contributing node and rejects the selection.
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const paragraph = doc.createElement('p');
		const makeWrapped = (text: string) => {
			const wrapper = doc.createElement('span');
			wrapper.style.display = 'contents';
			const node = doc.createTextNode(text);
			wrapper.appendChild(node);
			paragraph.appendChild(wrapper);
			return node;
		};
		const firstText = makeWrapped('hello ');
		const lastText = makeWrapped('world');
		markdown.appendChild(paragraph);
		widgetDomNode.appendChild(markdown);

		const response = makeResponse('turn-1');
		stubSelection(store, firstText, lastText, 'hello world');
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => response,
		});

		assert.strictEqual(resolveResponseSelection(widget)?.text, 'hello world');
	});

	test('ignores unrendered text when finding the selection endpoints', async () => {
		// The transcript contains `<style>` elements and display:none metadata
		// that a triple-click's range spans but the user cannot see or select.
		// Treating them as endpoints puts the endpoint outside the response's
		// markdown and rejects an otherwise valid selection.
		const { store, doc, widgetDomNode } = setup();
		const markdown = doc.createElement('div');
		markdown.classList.add('chat-markdown-part');
		const paragraph = doc.createElement('p');
		const textNode = doc.createTextNode('hello world');
		paragraph.appendChild(textNode);
		markdown.appendChild(paragraph);
		const style = doc.createElement('style');
		style.appendChild(doc.createTextNode('.monaco-list { color: red; }'));
		const hiddenMeta = doc.createElement('div');
		hiddenMeta.style.display = 'none';
		hiddenMeta.appendChild(doc.createTextNode('+55 -0'));
		const footer = doc.createElement('div');
		widgetDomNode.appendChild(markdown);
		widgetDomNode.appendChild(style);
		widgetDomNode.appendChild(hiddenMeta);
		widgetDomNode.appendChild(footer);

		const response = makeResponse('turn-1');
		stubSelection(store, textNode, footer, 'hello world\n', 0);
		await nextAnimationFrame(widgetDomNode);
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => response,
		});

		assert.strictEqual(resolveResponseSelection(widget)?.text, 'hello world');
	});

	test('rejects a selection outside the markdown scope', () => {
		const { store, doc, widgetDomNode } = setup();
		const other = doc.createElement('div');
		const textNode = doc.createTextNode('not markdown');
		other.appendChild(textNode);
		widgetDomNode.appendChild(other);

		stubSelection(store, textNode, textNode, 'not markdown');
		const widget = upcastPartial<IChatWidget>({
			domNode: widgetDomNode,
			getElementFromNode: () => makeResponse('turn-1'),
		});

		assert.strictEqual(resolveResponseSelection(widget), undefined);
	});
});
