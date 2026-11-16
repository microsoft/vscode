/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegate.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { CheckboxChip } from './checkboxChip.js';
import { NewWorktreeChoice } from './newWorktreeChoice.js';

/**
 * New Worktree as a checkbox chip beside a composer's workspace picker, sized as the picker's other chips, which a
 * composer shows instead of the picker's New Worktree item where its folder has no worktrees to pick from.
 */
export class NewWorktreeCheckbox extends Disposable {

	readonly element: HTMLElement;

	/**
	 * @param visible Whether the composer shows it.
	 * @param track Reads what changes whether the draft works in a new worktree, such as its configuration.
	 */
	constructor(
		container: HTMLElement,
		choice: Pick<NewWorktreeChoice, 'isSelected' | 'setSelected'>,
		visible: IObservable<boolean>,
		track: (reader: IReader) => void,
		hoverService: IHoverService,
		hoverDelegate?: IHoverDelegate,
	) {
		super();
		const label = localize('newSession.newWorktree', "New Worktree");
		const chip = this._register(new CheckboxChip({
			label,
			ariaLabel: label,
			hoverDelegate,
			slotClassName: 'new-session-new-worktree',
			onToggle: checked => choice.setSelected(checked),
		}, hoverService));
		this.element = chip.render(container);
		this._register(autorun(reader => {
			const shown = visible.read(reader);
			track(reader);
			chip.update({ checked: choice.isSelected(), state: shown ? 'enabled' : 'hidden' });
		}));
	}
}
