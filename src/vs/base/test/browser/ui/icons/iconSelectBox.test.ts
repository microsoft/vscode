/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, Dimension } from '../../../../browser/dom.js';
import { IconSelectBox } from '../../../../browser/ui/icons/iconSelectBox.js';
import { unthemedInboxStyles } from '../../../../browser/ui/inputbox/inputBox.js';
import { mainWindow } from '../../../../browser/window.js';
import { Codicon } from '../../../../common/codicons.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('IconSelectBox', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const icons = [Codicon.add, Codicon.lightbulb, Codicon.vm, Codicon.repoForked, Codicon.gitPullRequest, Codicon.terminal, Codicon.beaker, Codicon.rocket];

	function setup() {
		const host = append(mainWindow.document.body, $('div'));
		disposables.add(toDisposable(() => host.remove()));
		const box = disposables.add(new IconSelectBox({ icons, inputBoxStyles: unthemedInboxStyles, showIconInfo: true }));
		append(host, box.domNode);
		box.layout(new Dimension(150, 260));
		const input = box.domNode.querySelector<HTMLInputElement>('input')!;
		const grid = box.domNode.querySelector<HTMLElement>('[role="listbox"]')!;
		box.focus();
		const search = (value: string) => {
			input.value = value;
			input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		};
		return { box, input, grid, search };
	}

	test('search and grid expose the same labelled active option', () => {
		const { box, input, grid } = setup();
		const first = grid.querySelector<HTMLElement>('.focused')!;
		const initial = {
			activeElement: mainWindow.document.activeElement === input,
			inputActive: input.getAttribute('aria-activedescendant'),
			gridActive: grid.getAttribute('aria-activedescendant'),
			selected: first.ariaSelected,
			label: box.domNode.querySelector('.icon-select-id-label')?.textContent,
		};
		box.focusNextRow();
		box.focusNext();
		const option = grid.querySelector<HTMLElement>('.focused')!;
		assert.deepStrictEqual({
			initial,
			role: option.role,
			label: option.ariaLabel,
			selected: option.ariaSelected,
			inputPopup: input.ariaHasPopup,
			inputActive: input.getAttribute('aria-activedescendant'),
			gridActive: grid.getAttribute('aria-activedescendant'),
			activeElement: mainWindow.document.activeElement === grid,
		}, {
			initial: {
				activeElement: true,
				inputActive: first.id,
				gridActive: first.id,
				selected: 'true',
				label: 'Icon name: add',
			},
			role: 'option',
			label: icons[1].id,
			selected: 'true',
			inputPopup: 'listbox',
			inputActive: option.id,
			gridActive: option.id,
			activeElement: true,
		});
	});

	test('Down enters the grid, vertical navigation keeps columns, and Up returns to search', () => {
		const { box, input, grid } = setup();
		box.focusNextRow();
		const entered = { focus: box.getFocus(), grid: mainWindow.document.activeElement === grid };
		const positions: number[] = [];
		for (const move of [() => box.focusNextRow(), () => box.focusNext(), () => box.focusNextRow(), () => box.focusNextRow(), () => box.focusPreviousRow(), () => box.focusPreviousRow()]) {
			move();
			positions.push(box.getFocus()[0]);
		}
		box.focusPreviousRow();
		assert.deepStrictEqual({
			entered,
			positions,
			returnedToSearch: mainWindow.document.activeElement === input,
			focus: box.getFocus(),
			inputActive: input.getAttribute('aria-activedescendant'),
			gridActive: grid.getAttribute('aria-activedescendant'),
			label: box.domNode.querySelector('.icon-select-id-label')?.textContent,
		}, {
			entered: { focus: [0], grid: true },
			positions: [3, 4, 7, 7, 4, 1],
			returnedToSearch: true,
			focus: [1],
			inputActive: `${box.domId}_icons_1`,
			gridActive: `${box.domId}_icons_1`,
			label: 'Icon name: lightbulb',
		});
	});

	test('first, last, and horizontal navigation stop at grid boundaries', () => {
		const { box } = setup();
		box.focusFirst();
		box.focusPrevious();
		const first = box.getFocus();
		box.focusLast();
		box.focusNext();
		assert.deepStrictEqual({ first, last: box.getFocus() }, { first: [0], last: [7] });
	});

	test('empty search results clear stale options and remain safe to navigate', () => {
		const { box, input, grid, search } = setup();
		search('no matching icon');
		box.focusNext();
		box.focusPrevious();
		box.focusNextRow();
		box.focusPreviousRow();
		box.focusFirst();
		box.focusLast();
		const empty = {
			options: grid.querySelectorAll('[role="option"]').length,
			focus: box.getFocus(),
			icon: box.getFocusedIcon(),
			inputActive: input.getAttribute('aria-activedescendant'),
			gridActive: grid.getAttribute('aria-activedescendant'),
			message: grid.querySelector('.icon-no-results')?.textContent,
		};
		search('rocket');
		assert.deepStrictEqual({ empty, recovered: box.getFocusedIcon()?.id, label: box.domNode.querySelector('.icon-select-id-label')?.textContent }, {
			empty: { options: 0, focus: [], icon: undefined, inputActive: null, gridActive: null, message: 'No results' },
			recovered: 'rocket',
			label: 'Icon name: rocket',
		});
	});

	test('filtering reapplies grid geometry to newly rendered options', () => {
		const { grid, search } = setup();
		search('rocket');
		search('');
		assert.deepStrictEqual([...grid.querySelectorAll<HTMLElement>('.icon-container')].map(option => option.style.marginRight), icons.map(() => '4px'));
	});

	test('the grid owns arrow and selection keys without leaking them to the host', () => {
		const { box, input, grid } = setup();
		const leaked: string[] = [];
		disposables.add(toDisposable(() => box.domNode.parentElement?.removeEventListener('keydown', hostKey)));
		const hostKey = (event: KeyboardEvent) => leaked.push(event.key);
		box.domNode.parentElement!.addEventListener('keydown', hostKey);
		const press = (target: HTMLElement, key: string, keyCode: number) => target.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true }));
		press(input, 'ArrowDown', 40);
		press(grid, 'ArrowRight', 39);
		const moved = box.getFocus();
		let selected: string | undefined;
		disposables.add(box.onDidSelect(icon => selected = icon.id));
		press(grid, 'Enter', 13);
		press(grid, 'Tab', 9);
		press(grid, 'Escape', 27);
		assert.deepStrictEqual({ moved, selected, leaked }, { moved: [1], selected: 'lightbulb', leaked: ['Tab', 'Escape'] });
	});

	test('search cursor keys retain native editing without leaking to the host picker', () => {
		const { box, input } = setup();
		const leaked: string[] = [];
		const hostKey = (event: KeyboardEvent) => leaked.push(event.key);
		box.domNode.parentElement!.addEventListener('keydown', hostKey);
		disposables.add(toDisposable(() => box.domNode.parentElement?.removeEventListener('keydown', hostKey)));
		const modifiers: KeyboardEventInit[] = [{}, { ctrlKey: true }, { shiftKey: true }, { ctrlKey: true, shiftKey: true }, { metaKey: true }, { metaKey: true, shiftKey: true }, { altKey: true }];
		const prevented = modifiers.flatMap(modifier => ([['ArrowLeft', 37], ['ArrowRight', 39], ['Home', 36], ['End', 35]] as const).map(([key, keyCode]) => {
			const event = new KeyboardEvent('keydown', { ...modifier, key, keyCode, bubbles: true, cancelable: true });
			input.dispatchEvent(event);
			return event.defaultPrevented;
		}));
		assert.deepStrictEqual({ prevented, leaked, focus: box.getFocus() }, { prevented: modifiers.flatMap(() => [false, false, false, false]), leaked: [], focus: [0] });
	});

	test('focusing the grid preserves the initial selected option and its non-interactive caption', () => {
		const { box, grid } = setup();
		grid.focus();
		const caption = box.domNode.querySelector<HTMLElement>('.icon-select-id-label')!;
		const initial = {
			gridFocused: mainWindow.document.activeElement === grid,
			focus: box.getFocus(),
			active: grid.getAttribute('aria-activedescendant'),
			caption: caption.textContent,
			captionTabIndex: caption.tabIndex,
			interactiveCaption: caption.querySelector('button, a, input, [tabindex]'),
		};
		grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({ initial, focus: box.getFocus(), caption: caption.textContent }, {
			initial: {
				gridFocused: true,
				focus: [0],
				active: `${box.domId}_icons_0`,
				caption: 'Icon name: add',
				captionTabIndex: -1,
				interactiveCaption: null,
			},
			focus: [1],
			caption: 'Icon name: lightbulb',
		});
	});

	test('the caption highlights only the matching icon name', () => {
		const { box, search } = setup();
		search('rock');
		assert.deepStrictEqual({
			caption: box.domNode.querySelector('.icon-select-id-label')?.textContent,
			highlights: [...box.domNode.querySelectorAll('.icon-select-id-label .highlight')].map(element => element.textContent),
		}, { caption: 'Icon name: rocket', highlights: ['rock'] });
	});
});
