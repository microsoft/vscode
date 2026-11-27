/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { Comment, CommentThread } from '../../../../../editor/common/languages.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { TestMenuService } from '../../../../test/browser/workbenchTestServices.js';
import { ICommentThreadWidget } from '../../common/commentThreadWidget.js';
import { CommentMenus } from '../../browser/commentMenus.js';
import { CommentNode } from '../../browser/commentNode.js';
import { ICommentService } from '../../browser/commentService.js';

suite('CommentNode', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const longBody = 'A line of a long comment\n'.repeat(40);

	function createCommentNode(body: string | IMarkdownString, collapsibleBody: boolean) {
		const instantiationService = createCodeEditorServices(store);
		instantiationService.stub(IMenuService, new TestMenuService());
		instantiationService.stub(IContextMenuService, {});
		instantiationService.stub(IMarkdownRendererService, {
			// Renders the text with a link after it.
			render: (markdown: IMarkdownString) => {
				const element = dom.$('div', { style: 'white-space: pre-wrap' }, markdown.value, dom.$('a', { href: '#' }, 'Link'));
				return { element, dispose: () => { } };
			}
		});
		const commentMenus = store.add(instantiationService.createInstance(CommentMenus));
		instantiationService.stub(ICommentService, {
			getCommentMenus: () => commentMenus,
			hasReactionHandler: () => false,
			setActiveCommentAndThread: async () => { }
		});
		const comment: Comment = { body, uniqueIdInThread: 1, userName: 'Reviewer' };
		const node = store.add(instantiationService.createInstance(
			CommentNode<IRange>, { getLayoutInfo: () => ({ height: 500 }) }, new class extends mock<CommentThread<IRange>>() { }, comment,
			undefined, 'test', URI.file('/file.ts'), new class extends mock<ICommentThreadWidget>() { }, {}, false, collapsibleBody
		));
		const container = dom.$('div');
		container.style.width = '300px';
		container.appendChild(node.domNode);
		mainWindow.document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		node.layout();

		const toggle = node.domNode.querySelector<HTMLButtonElement>('.comment-body-toggle');
		const getState = () => ({
			collapsed: node.domNode.querySelector('.comment-body')!.classList.contains('collapsed'),
			toggle: toggle && {
				hidden: toggle.classList.contains('hidden'),
				label: toggle.textContent,
				expanded: toggle.getAttribute('aria-expanded')
			}
		});
		return { node, comment, toggle, getState };
	}

	test('shows a long comment of a thread that scrolls its comments in full, with a toggle that collapses it', () => {
		const scrolled = createCommentNode(longBody, false);
		const { node, toggle, getState } = createCommentNode(longBody, true);
		let collapseCount = 0;
		store.add(node.onDidCollapseBody(() => collapseCount++));
		const states = [getState()];
		toggle!.click();
		states.push(getState());
		toggle!.click();
		states.push(getState());

		assert.deepStrictEqual({
			scrollsBody: [!!scrolled.node.domNode.querySelector('.monaco-scrollable-element'), !!node.domNode.querySelector('.monaco-scrollable-element')],
			states,
			collapseCount
		}, {
			scrollsBody: [true, false],
			states: [
				{ collapsed: false, toggle: { hidden: false, label: 'Show Less', expanded: 'true' } },
				{ collapsed: true, toggle: { hidden: false, label: 'Show More', expanded: 'false' } },
				{ collapsed: false, toggle: { hidden: false, label: 'Show Less', expanded: 'true' } },
			],
			collapseCount: 1
		});
	});

	test('only offers to collapse a comment that is taller than a comment that scrolls within its own height', async () => {
		const short = createCommentNode('A short comment', true);
		const { node, comment, toggle, getState } = createCommentNode(longBody, true);
		toggle!.click();
		const collapsed = getState();
		await node.update({ ...comment, body: 'Now a short comment' });

		assert.deepStrictEqual({ short: short.getState(), collapsed, shortened: getState() }, {
			short: { collapsed: false, toggle: { hidden: true, label: 'Show Less', expanded: 'true' } },
			collapsed: { collapsed: true, toggle: { hidden: false, label: 'Show More', expanded: 'false' } },
			shortened: { collapsed: false, toggle: { hidden: true, label: 'Show Less', expanded: 'true' } }
		});
	});

	test('expands a collapsed comment when focus moves into it, such as to a link that it clips', () => {
		const { node, toggle, getState } = createCommentNode({ value: longBody }, true);
		toggle!.click();
		const collapsed = getState();
		// The test window may not have focus, in which case focusing the link wouldn't dispatch its focus events.
		node.domNode.querySelector('.comment-body a')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

		assert.deepStrictEqual({ collapsed, focused: getState() }, {
			collapsed: { collapsed: true, toggle: { hidden: false, label: 'Show More', expanded: 'false' } },
			focused: { collapsed: false, toggle: { hidden: false, label: 'Show Less', expanded: 'true' } }
		});
	});
});
