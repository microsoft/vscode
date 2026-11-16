/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../../base/browser/dom.js';
import { CheckboxActionViewItem } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Action } from '../../../../../base/common/actions.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { NewWorktreeChoice } from './newWorktreeChoice.js';

/**
 * New Worktree as a labelled checkbox beside a composer's workspace picker, which a composer shows instead of the picker's
 * New Worktree item where its folder has no worktrees to pick from.
 */
export class NewWorktreeCheckbox extends Disposable {

	readonly element: HTMLElement;
	private readonly _action: Action;

	/**
	 * @param visible Whether the composer shows it.
	 * @param track Reads what changes whether the draft works in a new worktree, such as its configuration.
	 */
	constructor(
		private readonly _choice: Pick<NewWorktreeChoice, 'isSelected' | 'setSelected'>,
		visible: IObservable<boolean>,
		track: (reader: IReader) => void,
	) {
		super();
		this.element = $('.new-session-new-worktree');
		this._action = this._register(new Action('newSession.newWorktree', localize('newSession.newWorktree', "New Worktree"), undefined, true, async () => this._choice.setSelected(!!this._action.checked)));
		const item = this._register(new CheckboxActionViewItem(undefined, this._action, { label: true, checkboxStyles: defaultCheckboxStyles }));
		item.render(this.element);
		this._register(autorun(reader => {
			this.element.style.display = visible.read(reader) ? '' : 'none';
			track(reader);
			this._action.checked = this._choice.isSelected();
		}));
	}
}
