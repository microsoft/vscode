/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IDelayedHoverOptions } from '../../../../../base/browser/ui/hover/hover.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { Comment, CommentThread } from '../../../../../editor/common/languages.js';
import { createCodeEditorServices } from '../../../../../editor/test/browser/testCodeEditor.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../platform/hover/test/browser/nullHoverService.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { getIconsStyleSheet } from '../../../../../platform/theme/browser/iconsStyleSheet.js';
import { CommentMenus } from '../../browser/commentMenus.js';
import { CommentNode } from '../../browser/commentNode.js';
import { ICommentService } from '../../browser/commentService.js';
import { CommentThreadHeader } from '../../browser/commentThreadHeader.js';
import '../../browser/media/review.css';
import '../../../../browser/media/style.css';
import { TestMenuService } from '../../../../test/browser/workbenchTestServices.js';

suite('Floating comment heading styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(): HTMLElement {
		const editor = dom.$('.monaco-editor');
		editor.style.fontSize = '13px';
		editor.style.setProperty('--vscode-spacing-size40', '4px');
		editor.style.setProperty('--vscode-spacing-size80', '8px');
		editor.style.setProperty('--vscode-spacing-size120', '12px');
		editor.style.setProperty('--vscode-spacing-size120', '12px');
		editor.style.setProperty('--vscode-codiconFontSize', '16px');
		editor.style.setProperty('--vscode-fontSize-heading3', '13px');
		editor.style.setProperty('--vscode-fontSize-label1', '12px');
		editor.style.setProperty('--vscode-fontWeight-semiBold', '600');
		editor.style.setProperty('--vscode-fontWeight-regular', '400');
		editor.style.setProperty('--vscode-strokeThickness', '1px');
		editor.style.setProperty('--vscode-editorWidget-border', 'rgb(85, 85, 85)');
		editor.style.setProperty('--vscode-cornerRadius-large', '8px');
		editor.style.setProperty('--vscode-cornerRadius-medium', '6px');
		mainWindow.document.body.appendChild(editor);
		store.add(toDisposable(() => editor.remove()));
		const floating = dom.append(editor, dom.$('.comment-thread-floating-widget'));
		floating.style.width = '200px';
		return dom.append(floating, dom.$('.review-widget'));
	}

	test('shows a decorative icon in every floating thread heading', () => {
		const instantiationService = createCodeEditorServices(store);
		instantiationService.stub(IMenuService, new TestMenuService());
		instantiationService.stub(IContextMenuService, {});
		const hoverOptions = new Map<HTMLElement, () => IDelayedHoverOptions>();
		instantiationService.stub(IHoverService, {
			...NullHoverService,
			setupDelayedHover: (target, options) => {
				if (typeof options === 'function') {
					hoverOptions.set(target, options);
				}
				return Disposable.None;
			},
		});
		const iconStyles = store.add(getIconsStyleSheet(undefined));
		const style = dom.append(mainWindow.document.head, dom.$('style'));
		style.textContent = iconStyles.getCSS();
		store.add(toDisposable(() => style.remove()));
		const comment: Comment = { body: 'A review comment', uniqueIdInThread: 1, userName: 'Reviewer name' };
		const createHeader = (label: string | undefined, comments: readonly Comment[], defaultTitle: string | undefined, showTitleIcon: boolean) => {
			const thread = new class extends mock<CommentThread<IRange>>() {
				override label = label;
				override comments = comments;
				override readonly onDidChangeComments = Event.None;
			};
			const container = showTitleIcon ? createWidget() : dom.$('div');
			const header = store.add(instantiationService.createInstance(
				CommentThreadHeader,
				container,
				{ collapse: () => { } },
				store.add(instantiationService.createInstance(CommentMenus)),
				thread,
				defaultTitle,
				showTitleIcon
			));
			header.updateHeight(23);
			return { header, thread, title: container.querySelector<HTMLElement>('.review-title')! };
		};
		const unlabeled = createHeader(undefined, [comment], 'Discussion', true);
		const labeled = createHeader('Performance', [comment], 'Discussion', true);
		const empty = createHeader(undefined, [], 'Discussion', true);
		const inline = createHeader('Inline', [comment], undefined, false);
		const withoutIcon = createHeader(undefined, [comment], 'Discussion', false);
		const long = createHeader('A very long title that must not cover the actions', [comment], 'Discussion', true);
		const state = (title: HTMLElement) => ({
			title: title.textContent,
			ariaLabel: title.querySelector('.filename')?.getAttribute('aria-label'),
			icons: Array.from(title.querySelectorAll('.comment-thread-title-icon'), icon => icon.getAttribute('aria-hidden')),
		});

		assert.deepStrictEqual({
			unlabeled: state(unlabeled.title),
			labeled: state(labeled.title),
			empty: state(empty.title),
			inline: state(inline.title),
			withoutIcon: state(withoutIcon.title),
		}, {
			unlabeled: { title: 'Discussion', ariaLabel: 'Discussion', icons: ['true'] },
			labeled: { title: 'Performance', ariaLabel: 'Performance', icons: ['true'] },
			empty: { title: 'Start discussion', ariaLabel: 'Start discussion', icons: ['true'] },
			inline: { title: 'Inline', ariaLabel: 'Inline', icons: [] },
			withoutIcon: { title: 'Discussion', ariaLabel: 'Discussion', icons: [] },
		});

		labeled.thread.label = undefined;
		labeled.header.updateCommentThread(labeled.thread);
		const renamed = state(labeled.title);
		labeled.thread.comments = [];
		labeled.header.updateCommentThread(labeled.thread);
		const cleared = state(labeled.title);
		labeled.thread.label = 'Bot';
		labeled.header.updateCommentThread(labeled.thread);

		assert.deepStrictEqual({
			renamed,
			cleared,
			relabelled: state(labeled.title),
		}, {
			renamed: { title: 'Discussion', ariaLabel: 'Discussion', icons: ['true'] },
			cleared: { title: 'Start discussion', ariaLabel: 'Start discussion', icons: ['true'] },
			relabelled: { title: 'Bot', ariaLabel: 'Bot', icons: ['true'] },
		});

		const icon = long.title.querySelector<HTMLElement>('.comment-thread-title-icon')!;
		const label = long.title.querySelector<HTMLElement>('.filename')!;
		const actions = long.header.domNode.querySelector<HTMLElement>('.review-actions')!;
		const floating = long.title.closest<HTMLElement>('.comment-thread-floating-widget')!;
		const layout = [200, 100].map(width => {
			floating.style.width = `${width}px`;
			const iconRect = icon.getBoundingClientRect();
			return {
				iconVisible: iconRect.width > 0 && iconRect.height > 0,
				iconBeforeLabel: iconRect.right <= label.getBoundingClientRect().left,
				titleClearOfActions: long.title.getBoundingClientRect().right <= actions.getBoundingClientRect().left,
				titleTruncated: label.scrollWidth > label.clientWidth,
				ellipsis: mainWindow.getComputedStyle(label).textOverflow,
				naturalWidth: long.header.measureWidths().natural,
			};
		});
		const naturalWidth = layout[0].naturalWidth;
		assert.deepStrictEqual(layout, [200, 100].map(() => ({
			iconVisible: true,
			iconBeforeLabel: true,
			titleClearOfActions: true,
			titleTruncated: true,
			ellipsis: 'ellipsis',
			naturalWidth,
		})));
		const getHover = hoverOptions.get(label)!;
		const truncatedHover = getHover().content;
		long.thread.label = 'Short title';
		long.header.updateCommentThread(long.thread);
		floating.style.width = '200px';
		const fittingHover = getHover().content;
		floating.style.width = '60px';
		assert.deepStrictEqual({ truncatedHover, fittingHover, renamedHover: getHover().content }, {
			truncatedHover: 'A very long title that must not cover the actions',
			fittingHover: '',
			renamedHover: 'Short title',
		});
	});

	test('keeps message focus inside the rounded card without moving its contents', () => {
		const widget = createWidget();
		const editor = widget.parentElement!.parentElement!;
		editor.classList.add('monaco-workbench');
		editor.style.setProperty('--vscode-focusBorder', 'rgb(0, 120, 212)');
		const body = dom.append(dom.append(widget, dom.$('.comment-thread-body-scrollable')), dom.$('.body'));
		const comments = ['First message', 'Second message'].map(text => {
			const comment = dom.append(body, dom.$('.review-comment'));
			comment.tabIndex = 0;
			comment.textContent = text;
			return comment;
		});
		const bounds = () => comments.map(comment => {
			const rect = comment.getBoundingClientRect();
			return [rect.x, rect.y, rect.width, rect.height];
		});
		const before = bounds();
		const canAssertFocusStyles = mainWindow.document.hasFocus();
		const states = comments.map(comment => {
			comment.focus();
			const style = mainWindow.getComputedStyle(comment);
			return {
				...(canAssertFocusStyles ? { outline: [style.outlineColor, style.outlineStyle, style.outlineWidth], offset: style.outlineOffset, onlyFocusedMessageOutlined: comments.filter(element => mainWindow.getComputedStyle(element).outlineStyle === 'solid').length === 1 } : {}),
				radius: style.borderRadius,
				focused: mainWindow.document.activeElement === comment,
			};
		});

		assert.deepStrictEqual({ states, after: bounds() }, {
			states: comments.map(() => ({
				...(canAssertFocusStyles ? { outline: ['rgb(0, 120, 212)', 'solid', '1px'], offset: '-4px', onlyFocusedMessageOutlined: true } : {}),
				radius: '6px',
				focused: true,
			})),
			after: before,
		});
	});

	test('aligns message content with the author name with or without an avatar', () => {
		const widget = createWidget();
		const floating = widget.parentElement!;
		const body = dom.append(widget, dom.$('.body'));
		const comments = [true, false].map(hasAvatar => {
			const comment = dom.append(body, dom.$('.review-comment'));
			const avatar = dom.append(comment, dom.$('.avatar-container'));
			if (hasAvatar) {
				dom.append(avatar, dom.$('img.avatar'));
			}
			const contents = dom.append(comment, dom.$('.review-comment-contents'));
			const title = dom.append(contents, dom.$('.comment-title'));
			const info = dom.append(title, dom.$('comment-header-info'));
			const author = dom.append(info, dom.$('strong.author'));
			author.textContent = 'Reviewer';
			dom.append(title, dom.$('.comment-actions'));
			const message = dom.append(contents, dom.$('.monaco-scrollable-element'));
			dom.append(message, dom.$('.comment-body')).textContent = 'A message that can wrap within a narrow card.';
			const reactions = dom.append(contents, dom.$('.comment-reactions'));
			const edit = dom.append(contents, dom.$('.edit-container'));
			return { comment, author, message, reactions, edit };
		});
		const layouts = [200, 120].map(width => {
			floating.style.width = `${width}px`;
			return comments.map(({ comment, author, message, reactions, edit }) => {
				const left = comment.getBoundingClientRect().left + parseFloat(mainWindow.getComputedStyle(comment).paddingLeft);
				const right = comment.getBoundingClientRect().right - parseFloat(mainWindow.getComputedStyle(comment).paddingRight);
				return [message, reactions, edit].map(element => ({
					alignedWithAuthor: Math.abs(element.getBoundingClientRect().left - author.getBoundingClientRect().left) <= 1,
					inset: element.getBoundingClientRect().left - left,
					fits: element.getBoundingClientRect().right <= right,
				}));
			});
		});
		const expectedForAvatar = [0, 1, 2].map(() => ({ alignedWithAuthor: true, inset: 26, fits: true }));
		const expectedWithoutAvatar = [0, 1, 2].map(() => ({ alignedWithAuthor: true, inset: 0, fits: true }));
		assert.deepStrictEqual(layouts, [0, 1].map(() => [expectedForAvatar, expectedWithoutAvatar]));
	});

	test('uses a neutral floating avatar for missing and failed author images', async () => {
		const instantiationService = createCodeEditorServices(store);
		instantiationService.stub(IMenuService, new TestMenuService());
		instantiationService.stub(IContextMenuService, {});
		instantiationService.stub(IMarkdownRendererService, {});
		const menus = store.add(instantiationService.createInstance(CommentMenus));
		instantiationService.stub(ICommentService, { getCommentMenus: () => menus, hasReactionHandler: () => false });
		const iconStyles = store.add(getIconsStyleSheet(undefined));
		const style = dom.append(mainWindow.document.head, dom.$('style'));
		style.textContent = iconStyles.getCSS();
		store.add(toDisposable(() => style.remove()));
		const thread = new class extends mock<CommentThread<IRange>>() { };
		const comment: Comment = { body: 'A review comment', uniqueIdInThread: 1, userName: 'Reviewer' };
		const node = store.add(instantiationService.createInstance(
			CommentNode<IRange>, { getLayoutInfo: () => ({ height: 500 }) }, thread, comment, undefined, 'test', URI.parse('test:/file'),
			{ submitComment: async () => { }, collapse: () => { } }, {}, false, true
		));
		const widget = createWidget();
		const body = dom.append(widget, dom.$('.body'));
		dom.append(body, node.domNode);
		const avatar = node.domNode.querySelector<HTMLElement>('.avatar-container')!;
		const author = node.domNode.querySelector<HTMLElement>('.author')!;
		const message = node.domNode.querySelector<HTMLElement>('.comment-body')!;
		const state = () => {
			const icon = avatar.querySelector<HTMLElement>('.comment-avatar-default');
			return {
				fallback: !!icon,
				fallbackCount: avatar.querySelectorAll('.comment-avatar-default').length,
				image: !!avatar.querySelector('img.avatar'),
				hiddenFromAccessibility: avatar.getAttribute('aria-hidden'),
				iconVisible: !!icon && mainWindow.getComputedStyle(icon).display !== 'none',
				iconGlyph: !!icon && !['none', 'normal'].includes(mainWindow.getComputedStyle(icon, '::before').content),
				aligned: Math.abs(author.getBoundingClientRect().left - message.getBoundingClientRect().left) <= 1,
			};
		};
		const initial = state();
		const path = URI.parse('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');
		await node.update({ ...comment, userIconPath: path });
		const withImage = state();
		const oldImage = avatar.querySelector('img')!;
		oldImage.dispatchEvent(new CustomEvent('error'));
		oldImage.dispatchEvent(new CustomEvent('error'));
		const failed = state();
		const otherPath = URI.parse('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==#other');
		await node.update({ ...comment, userIconPath: otherPath });
		oldImage.dispatchEvent(new CustomEvent('error'));
		const replacement = state();
		await node.update(comment);
		const removed = state();

		assert.deepStrictEqual({ initial, withImage, failed, replacement, removed }, {
			initial: { fallback: true, fallbackCount: 1, image: false, hiddenFromAccessibility: 'true', iconVisible: true, iconGlyph: true, aligned: true },
			withImage: { fallback: false, fallbackCount: 0, image: true, hiddenFromAccessibility: 'true', iconVisible: false, iconGlyph: false, aligned: true },
			failed: { fallback: true, fallbackCount: 1, image: false, hiddenFromAccessibility: 'true', iconVisible: true, iconGlyph: true, aligned: true },
			replacement: { fallback: false, fallbackCount: 0, image: true, hiddenFromAccessibility: 'true', iconVisible: false, iconGlyph: false, aligned: true },
			removed: { fallback: true, fallbackCount: 1, image: false, hiddenFromAccessibility: 'true', iconVisible: true, iconGlyph: true, aligned: true },
		});
		widget.parentElement!.classList.remove('comment-thread-floating-widget');
		assert.strictEqual(mainWindow.getComputedStyle(avatar.querySelector<HTMLElement>('.comment-avatar-default')!).display, 'none');
	});

	test('keeps thread actions visible when the title is long', () => {
		const widget = createWidget();
		const head = dom.append(widget, dom.$('.head'));
		head.style.height = '23px';
		head.style.lineHeight = '23px';
		const title = dom.append(head, dom.$('.review-title'));
		title.textContent = 'A very long comment thread title that must not cover the actions';
		const actions = dom.append(head, dom.$('.review-actions'));
		const actionBar = dom.append(actions, dom.$('.monaco-action-bar'));
		actionBar.style.width = '48px';

		assert.deepStrictEqual({
			titleTruncated: title.scrollWidth > title.clientWidth,
			titleNotClippedVertically: title.scrollHeight <= title.clientHeight,
			actionsFit: actions.getBoundingClientRect().right <= head.getBoundingClientRect().right,
			titleWeight: mainWindow.getComputedStyle(title).fontWeight,
		}, { titleTruncated: true, titleNotClippedVertically: true, actionsFit: true, titleWeight: '600' });
	});

	test('keeps the header controls equally inset from the top and right edges', () => {
		const widget = createWidget();
		const floating = widget.parentElement!;
		const editor = floating.parentElement!;
		editor.style.position = 'absolute';
		editor.style.left = '20px';
		editor.style.top = '20px';
		const head = dom.append(widget, dom.$('.head'));
		head.style.height = '23px';
		head.style.lineHeight = '23px';
		const title = dom.append(head, dom.$('.review-title'));
		title.textContent = 'A very long comment thread title that must not cover the actions';
		const actions = dom.append(head, dom.$('.review-actions'));
		const actionBar = store.add(new ActionBar(actions));
		actionBar.push([
			store.add(new Action('resolve', 'Resolve', 'codicon-check')),
			store.add(new Action('close', 'Close', 'codicon-close'))
		], { label: false, icon: true });
		const closeAction = actions.querySelector<HTMLElement>('.codicon-close')!;

		const measure = (width: number) => {
			floating.style.width = `${width}px`;
			const frame = floating.getBoundingClientRect();
			const close = closeAction.getBoundingClientRect();
			const hit = mainWindow.document.elementFromPoint(close.right - 1, close.top + close.height / 2);
			const firstAction = actions.querySelector<HTMLElement>('.action-label')!;
			return {
				equalInsets: Math.abs((close.top - frame.top) - (frame.right - close.right)) <= 1,
				closeInsideFrame: close.right <= frame.right && close.top >= frame.top,
				closeEdgeClickable: hit !== null && closeAction.contains(hit),
				titleTruncated: title.scrollWidth > title.clientWidth,
				titleClearOfActions: title.getBoundingClientRect().right <= firstAction.getBoundingClientRect().left,
			};
		};

		const twoActions = [200, 100].map(measure);
		actionBar.pull(0);
		const oneAction = [200, 100].map(measure);
		const expected = [200, 100].map(() => ({
			equalInsets: true,
			closeInsideFrame: true,
			closeEdgeClickable: true,
			titleTruncated: true,
			titleClearOfActions: true,
		}));
		assert.deepStrictEqual({ twoActions, oneAction }, { twoActions: expected, oneAction: expected });
	});

	test('keeps the avatar and actions at the first line when author details wrap', () => {
		const widget = createWidget();
		const body = dom.append(widget, dom.$('.body'));
		const comment = dom.append(body, dom.$('.review-comment'));
		const avatar = dom.append(comment, dom.$('.avatar-container'));
		const image = dom.append(avatar, dom.$('img.avatar'));
		const contents = dom.append(comment, dom.$('.review-comment-contents'));
		const title = dom.append(contents, dom.$('.comment-title'));
		const info = dom.append(title, dom.$('comment-header-info'));
		const author = dom.append(info, dom.$('strong.author'));
		author.textContent = 'An exceptionally long author name that wraps over several lines';
		const timestamp = dom.append(dom.append(info, dom.$('span.timestamp-container')), dom.$('span.timestamp'));
		timestamp.textContent = '3 hours ago';
		const actions = dom.append(title, dom.$('.comment-actions'));
		actions.style.width = '24px';
		actions.style.height = '22px';

		const infoRect = info.getBoundingClientRect();
		assert.deepStrictEqual({
			wrapped: infoRect.height > actions.getBoundingClientRect().height,
			avatarAtFirstLine: Math.abs(image.getBoundingClientRect().top - infoRect.top) <= 1,
			actionsAtFirstLine: Math.abs(actions.getBoundingClientRect().top - infoRect.top) <= 1,
			metadataIsQuieter: parseFloat(mainWindow.getComputedStyle(timestamp).fontSize) < parseFloat(mainWindow.getComputedStyle(author).fontSize),
		}, { wrapped: true, avatarAtFirstLine: true, actionsAtFirstLine: true, metadataIsQuieter: true });
	});
});
