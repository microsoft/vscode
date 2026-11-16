/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { observableSignal, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NewWorktreeCheckbox } from '../../../browser/chat/newWorktreeCheckbox.js';

suite('NewWorktreeCheckbox', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('a labelled checkbox that shows and sets whether the draft works in a new worktree, shown only as its composer offers it', () => {
		let selected = false;
		const choices: boolean[] = [];
		const visible = observableValue('visible', true);
		const changed = observableSignal('changed');
		const checkbox = disposables.add(new NewWorktreeCheckbox({
			isSelected: () => selected,
			setSelected: value => choices.push(value),
		}, visible, reader => changed.read(reader)));
		mainWindow.document.body.appendChild(checkbox.element);
		const box = checkbox.element.querySelector<HTMLElement>('[role="checkbox"]')!;
		const label = checkbox.element.querySelector<HTMLElement>('.checkbox-label')!;
		const state = () => ({ checked: box.getAttribute('aria-checked'), shown: checkbox.element.style.display !== 'none' });

		const initial = state();
		label.click();
		const clicked = state();
		// Its agent's configuration of the draft now works in a new worktree
		selected = true;
		changed.trigger(undefined);
		const configured = state();
		visible.set(false, undefined);
		const hidden = state();
		checkbox.element.remove();

		assert.deepStrictEqual({ label: label.textContent, title: box.getAttribute('aria-label'), initial, clicked, choices, configured, hidden }, {
			label: 'New Worktree',
			title: 'New Worktree',
			initial: { checked: 'false', shown: true },
			clicked: { checked: 'true', shown: true },
			choices: [true],
			configured: { checked: 'true', shown: true },
			hidden: { checked: 'true', shown: false },
		});
	});
});
