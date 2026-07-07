/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IChatInputWorkspacePicker } from '../../chat.js';

/**
 * Toolbar chip that delegates rendering to an externally-owned
 * {@link IChatInputWorkspacePicker}. The picker owns selection state and
 * popup behavior; this view item is a thin lifecycle wrapper so the trigger
 * participates in `MenuWorkbenchToolBar` responsive overflow, refresh, and
 * disposal.
 *
 * Used by the automations dialog: its single `AutomationsWorkspacePicker`
 * instance renders one trigger into the form row and another into the chat
 * input's primary toolbar via this view item.
 */
export class WorkspacePickerInputActionItem extends BaseActionViewItem {

	private readonly _triggerDisposable = this._register(new MutableDisposable());

	constructor(
		action: MenuItemAction,
		private readonly picker: IChatInputWorkspacePicker,
		options?: IBaseActionViewItemOptions,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		// Add `chat-input-picker-item` so the container picks up the standard
		// chat input toolbar chip layout (height, padding, dividers) used by
		// the Mode and Model picker neighbors. Visual sizing of the inner
		// `.sessions-chat-picker-slot` label/icon is overridden in
		// `aiCustomizationManagement.css`. The default sessions-layer
		// styling targets a 18px welcome-flow chip, which is too big here.
		container.classList.add('chat-input-picker-item');
		this._triggerDisposable.value = this.picker.renderTrigger(container);
	}
}
