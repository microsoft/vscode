/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import * as dom from '../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { DropdownMenuActionViewItem } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { ToolBar } from '../../../../../base/browser/ui/toolbar/toolbar.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Action } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ReactionAction, ReactionActionViewItem, ToggleReactionsAction } from '../../browser/reactionsAction.js';
import '../../browser/media/review.css';

function getStyleRules(): CSSStyleRule[] {
	return [...mainWindow.document.styleSheets, ...mainWindow.document.adoptedStyleSheets]
		.flatMap(sheet => Array.from(sheet.cssRules))
		.flatMap(rule => rule instanceof CSSImportRule && rule.styleSheet ? Array.from(rule.styleSheet.cssRules) : [rule])
		.filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule);
}

/**
 * Mirrors where the comment node places its reactions: a floating comment without reactions shows its picker before its actions.
 */
function createReactionsContainer(floating: boolean, hasReactions: boolean, contents: HTMLElement, actions: HTMLElement): HTMLElement {
	if (hasReactions) {
		return dom.append(contents, dom.$('.comment-reactions'));
	}
	const reactions = dom.$('.comment-reactions.picker-only');
	if (floating) {
		actions.before(reactions);
	} else {
		contents.appendChild(reactions);
	}
	return reactions;
}

suite('Comment reaction styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const floating of [false, true]) {
		for (const hasReactions of [false, true]) {
			test(`keeps reaction controls stable while pressed (floating: ${floating}, reactions: ${hasReactions})`, () => {
				const editor = dom.$('.monaco-editor');
				editor.style.width = '300px';
				editor.style.setProperty('--vscode-panel-border', 'rgb(100, 100, 100)');
				editor.style.setProperty('--vscode-statusBarItem-activeBackground', 'rgb(50, 50, 50)');
				mainWindow.document.body.appendChild(editor);
				store.add(toDisposable(() => editor.remove()));
				const container = floating ? dom.append(editor, dom.$('.comment-thread-floating-widget')) : editor;
				const widget = dom.append(container, dom.$('.review-widget'));

				// Replace :active with an equally specific class to exercise the real pressed styles without pointer input.
				const pressedRules = getStyleRules().filter(rule => rule.selectorText.includes('.comment-reactions') && rule.selectorText.includes(':active'));
				assert.ok(pressedRules.length > 0);
				dom.append(widget, dom.$('style')).textContent = pressedRules.map(rule => rule.cssText.replaceAll(':active', '.test-pressed')).join('\n');

				const body = dom.append(widget, dom.$('.body'));
				const comment = dom.append(body, dom.$('.review-comment'));
				const contents = dom.append(comment, dom.$('.review-comment-contents'));
				const title = dom.append(contents, dom.$('.comment-title'));
				dom.append(title, dom.$('comment-header-info')).textContent = 'Author';
				const actions = dom.append(title, dom.$('.comment-actions'));
				actions.style.width = '22px';
				actions.style.height = '22px';
				const reactions = createReactionsContainer(floating, hasReactions, contents, actions);
				const pickerAction = store.add(new ToggleReactionsAction(() => { }, 'Toggle Reaction'));
				pickerAction.menuActions = [store.add(new Action('test.reaction', '👍'))];
				const reactionAction = store.add(new ReactionAction('test.reaction', '👍', '', true, undefined, undefined, undefined, 2));
				const menuDelegates: IContextMenuDelegate[] = [];
				const bar = store.add(new ActionBar(reactions, {
					actionViewItemProvider: action => action === pickerAction
						? new DropdownMenuActionViewItem(action, pickerAction.menuActions, { showContextMenu: delegate => menuDelegates.push(delegate) }, {
							classNames: ['toolbar-toggle-pickReactions', ...ThemeIcon.asClassNameArray(Codicon.reactions)]
						})
						: new ReactionActionViewItem(reactionAction)
				}));
				if (hasReactions) {
					bar.push(reactionAction, { label: true, icon: true });
				}
				bar.push(pickerAction, { label: false, icon: true });
				const picker = reactions.querySelector<HTMLElement>('.toolbar-toggle-pickReactions')!;
				const chip = reactions.querySelector<HTMLElement>('.action-label:not(.toolbar-toggle-pickReactions)');
				const bounds = (element: HTMLElement) => {
					const rect = element.getBoundingClientRect();
					return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
				};
				const idle = { picker: bounds(picker), actions: bounds(actions), comment: bounds(comment), chip: chip && bounds(chip) };

				picker.classList.add('test-pressed');
				picker.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
				chip?.classList.add('test-pressed');
				const pressed = { picker: bounds(picker), actions: bounds(actions), comment: bounds(comment), chip: chip && bounds(chip) };
				const expanded = picker.getAttribute('aria-expanded');
				const chipBorder = chip && mainWindow.getComputedStyle(chip).borderTopWidth;
				const chipBorderColor = chip && mainWindow.getComputedStyle(chip).borderTopColor;
				const delegate = menuDelegates.pop();
				assert.ok(delegate);
				delegate.onHide?.(true);
				picker.classList.remove('test-pressed');
				chip?.classList.remove('test-pressed');

				assert.deepStrictEqual({
					pressed,
					afterClose: bounds(picker),
					expanded,
					collapsed: picker.getAttribute('aria-expanded'),
					chipBorder,
					chipBorderColor,
				}, {
					pressed: idle,
					afterClose: idle.picker,
					expanded: 'true',
					collapsed: 'false',
					chipBorder: hasReactions ? '1px' : null,
					chipBorderColor: hasReactions ? 'rgba(0, 0, 0, 0)' : null,
				});
			});
		}
	}
});

suite('Floating comment action visibility', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(floating: boolean, hasReactions: boolean, hasReactionOptions = true) {
		const editor = dom.$('.monaco-editor');
		editor.style.position = 'fixed';
		editor.style.left = '40px';
		editor.style.top = '40px';
		editor.style.width = '300px';
		mainWindow.document.body.appendChild(editor);
		store.add(toDisposable(() => editor.remove()));
		const outside = dom.append(editor, dom.$('button'));
		const container = floating ? dom.append(editor, dom.$('.comment-thread-floating-widget')) : editor;
		const widget = dom.append(container, dom.$('.review-widget'));
		const body = dom.append(widget, dom.$('.body'));
		const menuDelegates: IContextMenuDelegate[] = [];
		const menuProvider = { showContextMenu: (delegate: IContextMenuDelegate) => menuDelegates.push(delegate) };

		function createComment(includeSecondReaction = false) {
			const comment = dom.append(body, dom.$('.review-comment'));
			comment.tabIndex = -1;
			const contents = dom.append(comment, dom.$('.review-comment-contents'));
			const title = dom.append(contents, dom.$('.comment-title'));
			dom.append(title, dom.$('comment-header-info')).textContent = 'Reviewer';
			const actions = dom.append(title, dom.$('.comment-actions'));
			const toolbar = store.add(new ToolBar(actions, menuProvider));
			toolbar.setActions(
				[store.add(new Action('test.edit', 'Edit', 'codicon-edit'))],
				[store.add(new Action('test.more', 'More'))]
			);
			const reactions = createReactionsContainer(floating, hasReactions, contents, actions);
			const pickerAction = store.add(new ToggleReactionsAction(() => { }, 'Toggle Reaction'));
			pickerAction.menuActions = hasReactionOptions ? [store.add(new Action('test.reaction', '👍'))] : [];
			const reactionAction = store.add(new ReactionAction('test.reaction', '👍', '', true, undefined, undefined, undefined, 2));
			const bar = store.add(new ActionBar(reactions, {
				actionViewItemProvider: action => action === pickerAction
					? new DropdownMenuActionViewItem(action, pickerAction.menuActions, menuProvider, {
						classNames: ['toolbar-toggle-pickReactions', ...ThemeIcon.asClassNameArray(Codicon.reactions)]
					})
					: action instanceof ReactionAction ? new ReactionActionViewItem(action) : undefined
			}));
			if (hasReactions) {
				bar.push(reactionAction, { label: true, icon: true });
				if (includeSecondReaction) {
					const secondReaction = store.add(new ReactionAction('test.reaction2', '🎉', '', true, undefined, undefined, undefined, 1));
					bar.push(secondReaction, { label: true, icon: true });
				}
			}
			bar.push(pickerAction, { label: false, icon: true });
			const primary = actions.querySelector<HTMLElement>('.codicon-edit')!;
			const more = actions.querySelector<HTMLElement>('.codicon-toolbar-more')!;
			const picker = reactions.querySelector<HTMLElement>('.toolbar-toggle-pickReactions')!;
			const controls = [primary, more.closest<HTMLElement>('.monaco-dropdown')!, picker.closest<HTMLElement>('.monaco-dropdown')!];
			const chip = reactions.querySelector<HTMLElement>('.action-label:not(.toolbar-toggle-pickReactions)');
			const state = () => ({
				opacity: controls.map(control => mainWindow.getComputedStyle(control).opacity),
				pointerEvents: controls.map(control => mainWindow.getComputedStyle(control).pointerEvents),
				chip: chip ? mainWindow.getComputedStyle(chip).opacity : null,
			});
			const bounds = () => [comment, ...controls, ...(chip ? [chip] : [])].map(element => {
				const rect = element.getBoundingClientRect();
				return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
			});
			return { comment, more, picker, state, bounds };
		}

		return { outside, createComment, menuDelegates };
	}

	for (const floating of [false, true]) {
		test(`aligns the reaction row without changing its spacing (floating: ${floating})`, () => {
			const { createComment } = createFixture(floating, true);
			const { comment, picker } = createComment(true);
			comment.style.setProperty('--vscode-spacing-size40', '4px');
			comment.style.setProperty('--vscode-spacing-size80', '8px');
			const avatar = dom.prepend(comment, dom.$('.avatar-container'));
			dom.append(avatar, dom.$('img.avatar'));
			const contents = comment.querySelector<HTMLElement>('.review-comment-contents')!;
			const reactions = contents.querySelector<HTMLElement>('.comment-reactions')!;
			const scrollable = dom.$('.monaco-scrollable-element');
			const body = dom.append(scrollable, dom.$('.comment-body'));
			body.textContent = 'Review text';
			contents.insertBefore(scrollable, reactions);
			const chips = [...reactions.querySelectorAll<HTMLElement>('.action-label:not(.toolbar-toggle-pickReactions)')];
			const first = chips[0].getBoundingClientRect();
			const second = chips[1].getBoundingClientRect();
			const text = body.getBoundingClientRect();
			const hit = mainWindow.document.elementFromPoint(first.left + 1, first.top + first.height / 2);

			assert.deepStrictEqual({
				firstChipOffset: first.left - text.left,
				avatarOffset: floating ? avatar.getBoundingClientRect().right + parseFloat(mainWindow.getComputedStyle(avatar).marginRight) - text.left : undefined,
				gaps: [second.left - first.right, picker.getBoundingClientRect().left - second.right],
				firstChipClickable: floating ? hit !== null && chips[0].contains(hit) : undefined,
			}, {
				firstChipOffset: floating ? 0 : 4,
				avatarOffset: floating ? 0 : undefined,
				gaps: [4, 4],
				firstChipClickable: floating ? true : undefined,
			});
		});
	}

	test('reveals only the hovered message\'s controls', () => {
		const hoverRules = getStyleRules().filter(rule => rule.selectorText.includes('.review-comment:not(:hover)'));
		assert.ok(hoverRules.length > 0);
		const selectors = hoverRules.map(rule => rule.selectorText);
		store.add(toDisposable(() => hoverRules.forEach((rule, index) => rule.selectorText = selectors[index])));
		hoverRules.forEach(rule => rule.selectorText = rule.selectorText.replaceAll(':hover', '.test-hover'));

		const { outside, createComment } = createFixture(true, true);
		const first = createComment();
		const second = createComment();
		const hidden = { opacity: ['0', '0', '0'], pointerEvents: ['none', 'none', 'none'], chip: '1' };
		const visible = { opacity: ['1', '1', '1'], pointerEvents: ['auto', 'auto', 'auto'], chip: '1' };
		outside.focus();
		const idleBounds = first.bounds();
		const states = [[first.state(), second.state()]];
		first.comment.classList.add('test-hover');
		states.push([first.state(), second.state()]);
		const hoveredBounds = first.bounds();
		first.comment.classList.remove('test-hover');
		second.comment.classList.add('test-hover');
		states.push([first.state(), second.state()]);

		assert.deepStrictEqual({ states, hoveredBounds }, {
			states: [[hidden, hidden], [visible, hidden], [hidden, visible]],
			hoveredBounds: idleBounds,
		});
	});

	for (const hasReactions of [false, true]) {
		test(`aligns reaction controls with message actions (reactions: ${hasReactions})`, () => {
			const { createComment } = createFixture(true, hasReactions);
			const { comment, picker } = createComment();
			comment.style.setProperty('--vscode-spacing-size40', '4px');
			comment.focus();
			const action = comment.querySelector<HTMLElement>('.comment-actions .codicon-edit')!;
			const chip = comment.querySelector<HTMLElement>('.comment-reactions .action-label:not(.toolbar-toggle-pickReactions)');
			const actionRect = action.getBoundingClientRect();
			const pickerRect = picker.getBoundingClientRect();
			const chipRect = chip?.getBoundingClientRect();

			assert.deepStrictEqual({
				pickerSize: [pickerRect.width, pickerRect.height],
				pickerMargin: mainWindow.getComputedStyle(picker.closest<HTMLElement>('.action-item')!).marginLeft,
				chipHeight: chipRect?.height,
				centerOffset: chipRect ? pickerRect.y + pickerRect.height / 2 - (chipRect.y + chipRect.height / 2) : undefined,
			}, {
				pickerSize: [actionRect.width, actionRect.height],
				pickerMargin: '4px',
				chipHeight: chipRect ? actionRect.height : undefined,
				centerOffset: chipRect ? 0 : undefined,
			});
		});

		test(`reveals only the focused message's controls (reactions: ${hasReactions})`, () => {
			const { outside, createComment } = createFixture(true, hasReactions);
			const first = createComment();
			const second = createComment();
			const chip = hasReactions ? '1' : null;
			const hidden = { opacity: ['0', '0', '0'], pointerEvents: ['none', 'none', 'none'], chip };
			const visible = { opacity: ['1', '1', '1'], pointerEvents: ['auto', 'auto', 'auto'], chip };

			outside.focus();
			const idleBounds = first.bounds();
			const states = [[first.state(), second.state()]];
			first.comment.focus();
			states.push([first.state(), second.state()]);
			const focusedBounds = first.bounds();
			second.comment.focus();
			states.push([first.state(), second.state()]);
			first.picker.focus();
			states.push([first.state(), second.state()]);
			outside.focus();
			states.push([first.state(), second.state()]);

			assert.deepStrictEqual({ states, focusedBounds }, {
				states: [
					[hidden, hidden],
					[visible, hidden],
					[hidden, visible],
					[visible, hidden],
					[hidden, hidden],
				],
				focusedBounds: idleBounds,
			});
		});
	}

	for (const control of ['more', 'picker'] as const) {
		test(`keeps the ${control} control visible while its menu is open`, () => {
			const { outside, createComment, menuDelegates } = createFixture(true, true);
			const message = createComment();
			message[control].focus();
			message[control].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			outside.focus();
			const open = { ...message.state(), expanded: message[control].getAttribute('aria-expanded') };
			const delegate = menuDelegates.pop();
			assert.ok(delegate);
			delegate.onHide?.(true);
			const closed = { ...message.state(), expanded: message[control].getAttribute('aria-expanded') };
			const active = control === 'more' ? 1 : 2;
			const expectedOpen = ['0', '0', '0'];
			const expectedPointerEvents = ['none', 'none', 'none'];
			expectedOpen[active] = '1';
			expectedPointerEvents[active] = 'auto';

			assert.deepStrictEqual({ open, closed }, {
				open: { opacity: expectedOpen, pointerEvents: expectedPointerEvents, chip: '1', expanded: 'true' },
				closed: { opacity: ['0', '0', '0'], pointerEvents: ['none', 'none', 'none'], chip: '1', expanded: 'false' },
			});
		});
	}

	test('does not open an empty reaction menu', () => {
		const { outside, createComment, menuDelegates } = createFixture(true, false, false);
		const message = createComment();
		message.comment.focus();
		message.picker.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
		outside.focus();

		assert.deepStrictEqual({
			disabled: message.picker.getAttribute('aria-disabled'),
			expanded: message.picker.getAttribute('aria-expanded'),
			active: message.picker.closest('.monaco-dropdown')?.classList.contains('active'),
			menus: menuDelegates.length,
			state: message.state(),
		}, {
			disabled: 'true',
			expanded: 'false',
			active: false,
			menus: 0,
			state: { opacity: ['0', '0', '0'], pointerEvents: ['none', 'none', 'none'], chip: null },
		});
	});

	test('leaves inline comment controls visible', () => {
		const { outside, createComment } = createFixture(false, true);
		const message = createComment();
		outside.focus();

		assert.deepStrictEqual(message.state(), {
			opacity: ['1', '1', '1'],
			pointerEvents: ['auto', 'auto', 'auto'],
			chip: '1',
		});
	});
});
