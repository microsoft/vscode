/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableSignal, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { NewWorktreeCheckbox } from '../../../browser/chat/newWorktreeCheckbox.js';

suite('NewWorktreeCheckbox', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/** A workspace picker row with a dropdown chip, as the picker renders its triggers, and New Worktree beside it. */
	function render(choice: { selected: boolean; readonly choices: boolean[] }) {
		const row = append(mainWindow.document.body, $('.sessions-workspace-category-picker'));
		disposables.add(toDisposable(() => row.remove()));
		const sibling = append(append(row, $('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot')), $('a.action-label'));
		append(sibling, $('span.sessions-chat-dropdown-label', undefined, 'Workspace'));
		const visible = observableValue('visible', true);
		const changed = observableSignal('changed');
		const checkbox = disposables.add(new NewWorktreeCheckbox(row, {
			isSelected: () => choice.selected,
			setSelected: value => {
				choice.choices.push(value);
				return Promise.resolve(true);
			},
		}, visible, reader => changed.read(reader), NullHoverService));
		return { checkbox, sibling, visible, changed };
	}

	test('a labelled checkbox that shows and sets whether the draft works in a new worktree, shown only as its composer offers it', () => {
		const choice = { selected: false, choices: [] as boolean[] };
		const { checkbox, visible, changed } = render(choice);
		const box = checkbox.element.querySelector<HTMLElement>('[role="checkbox"]')!;
		const label = checkbox.element.querySelector<HTMLElement>('.sessions-chat-dropdown-label')!;
		const state = () => ({ checked: box.getAttribute('aria-checked'), shown: !checkbox.element.classList.contains('hidden') });

		const initial = state();
		label.click();
		const clicked = state();
		// Its agent's configuration of the draft now works in a new worktree
		choice.selected = true;
		changed.trigger(undefined);
		const configured = state();
		visible.set(false, undefined);
		const hidden = state();

		assert.deepStrictEqual({ label: label.textContent, ariaLabel: box.getAttribute('aria-label'), initial, clicked, choices: choice.choices, configured, hidden }, {
			label: 'New Worktree',
			ariaLabel: 'New Worktree',
			initial: { checked: 'false', shown: true },
			clicked: { checked: 'true', shown: true },
			choices: [true],
			configured: { checked: 'true', shown: true },
			hidden: { checked: 'true', shown: false },
		});
	});

	test('is a chip of the picker\'s row, as its dropdown chips are: a 14px box, and its label and row as theirs', () => {
		const { checkbox, sibling } = render({ selected: false, choices: [] });
		const box = checkbox.element.querySelector<HTMLElement>('[role="checkbox"]')!;
		const row = box.parentElement!;
		const label = row.querySelector<HTMLElement>('span')!;
		const siblingLabel = sibling.querySelector<HTMLElement>('span')!;
		const fontSize = (element: HTMLElement) => mainWindow.getComputedStyle(element).fontSize;

		assert.deepStrictEqual({
			box: { width: box.offsetWidth, height: box.offsetHeight },
			slot: checkbox.element.classList.contains('sessions-chat-picker-slot'),
			row: row.className === sibling.className,
			label: label.className === siblingLabel.className,
			labelFontAsSibling: fontSize(label) === fontSize(siblingLabel),
		}, {
			box: { width: 14, height: 14 },
			slot: true,
			row: true,
			label: true,
			labelFontAsSibling: true,
		});
	});
});
