/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeybindingLabel } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { OS } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { MenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuId, MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { defaultKeybindingLabelStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ACCEPT_NEXT_USER_MESSAGE_SUGGESTION_COMMAND_ID } from './nextUserMessageSuggestion.js';

export class NextUserMessageSuggestionActionViewItem extends MenuEntryActionViewItem {
	private readonly _keybindingLabel = this._register(new MutableDisposable<KeybindingLabel>());

	override render(container: HTMLElement): void {
		super.render(container);
		this._register(this._keybindingService.onDidUpdateKeybindings(() => {
			this.updateLabel();
			this.updateTooltip();
		}));
	}

	protected override updateLabel(): void {
		if (!this.label) {
			return;
		}
		const keybinding = this._keybindingService.lookupKeybinding(this._action.id);
		if (!keybinding) {
			this._keybindingLabel.clear();
			this.label.textContent = localize('insertSuggestionShort', "Insert");
			return;
		}
		if (!this._keybindingLabel.value) {
			this.label.textContent = '';
			this._keybindingLabel.value = new KeybindingLabel(this.label, OS, { ...defaultKeybindingLabelStyles, disableTitle: true });
		}
		this._keybindingLabel.value.set(keybinding);
	}

	protected override getTooltip(): string {
		const keybinding = this._keybindingService.lookupKeybinding(this._action.id)?.getAriaLabel();
		return keybinding
			? localize('insertSuggestionTooltip', "Insert suggestion ({0}). Does not send.", keybinding)
			: localize('insertSuggestionTooltipUnbound', "Insert suggestion. Does not send.");
	}
}

export class NextUserMessageSuggestionActions extends Disposable {
	static readonly ID = 'sessions.nextUserMessageSuggestionActions';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		super();
		this._register(actionViewItemService.register(MenuId.ChatExecute, ACCEPT_NEXT_USER_MESSAGE_SUGGESTION_COMMAND_ID,
			(action, options, instantiationService) => action instanceof MenuItemAction
				? instantiationService.createInstance(NextUserMessageSuggestionActionViewItem, action, { ...options, keybindingNotRenderedWithLabel: true })
				: undefined, keybindingService.onDidUpdateKeybindings));
	}
}
