/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { renderLabelWithIcons } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IMenuEntryActionViewItemOptions, MenuEntryActionViewItem } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';

/**
 * Action view item for the "Restore Checkpoint" action that adds an inline
 * confirmation affordance: when the current request (and the requests after it)
 * have edits that would be discarded, the first click does not restore but
 * instead turns the button into a "Confirm" button with an adjacent "Cancel"
 * button. A second click on "Confirm" runs the restore, while "Cancel" (or
 * losing focus / pressing Escape) reverts the button to its default state.
 *
 * This gives a lightweight, in-place warning for sessions (such as agent host
 * sessions) where the modal removal-confirmation dialog does not apply.
 */
export class ChatRestoreCheckpointActionViewItem extends MenuEntryActionViewItem {

	private _confirming = false;
	private _cancelButton: HTMLElement | undefined;
	private readonly _confirmDisposables = this._register(new DisposableStore());

	constructor(
		action: MenuItemAction,
		options: IMenuEntryActionViewItemOptions | undefined,
		private readonly _needsConfirmation: (context: unknown) => boolean,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('chat-restore-checkpoint-item');

		const cancelButton = this._cancelButton = dom.append(container, dom.$('a.action-label.chat-restore-checkpoint-cancel'));
		cancelButton.setAttribute('role', 'button');
		// Keep the cancel affordance out of the tab order so it does not break
		// the ActionBar roving-tabindex pattern; keyboard users can use Escape to
		// cancel the inline confirmation.
		cancelButton.tabIndex = -1;
		dom.reset(cancelButton, ...renderLabelWithIcons(`$(close)`));
		const cancelLabel = localize('chat.restoreCheckpoint.cancelTooltip', "Cancel restoring this checkpoint");
		cancelButton.title = cancelLabel;
		cancelButton.setAttribute('aria-label', cancelLabel);
		this._register(dom.addDisposableListener(cancelButton, dom.EventType.CLICK, e => {
			dom.EventHelper.stop(e, true);
			this._setConfirming(false);
			// The cancel button is hidden once confirmation is dismissed, so move
			// focus back to the main action label to avoid losing keyboard focus.
			this.label?.focus();
		}));

		// The action bar runs the action directly on keyboard trigger (Enter /
		// Space) via its own keydown/keyup handling, bypassing onClick. Intercept
		// it here so keyboard activation respects the inline confirmation state
		// just like a mouse click does.
		this._register(dom.addDisposableListener(container, dom.EventType.KEY_DOWN, e => {
			const event = new StandardKeyboardEvent(e);
			if (!event.equals(KeyCode.Enter) && !event.equals(KeyCode.Space)) {
				return;
			}
			if (this._confirming) {
				dom.EventHelper.stop(e, true);
				this._setConfirming(false);
				void super.onClick(new MouseEvent('click'));
				return;
			}
			if (this._needsConfirmation(this._context)) {
				dom.EventHelper.stop(e, true);
				this._setConfirming(true);
			}
			// Otherwise fall through so the action bar runs the restore as usual.
		}));

		this._updateConfirmUI();
	}

	override async onClick(event: MouseEvent): Promise<void> {
		if (this._confirming) {
			this._setConfirming(false);
			return super.onClick(event);
		}

		if (this._needsConfirmation(this._context)) {
			event.preventDefault();
			event.stopPropagation();
			this._setConfirming(true);
			return;
		}

		return super.onClick(event);
	}

	private _setConfirming(value: boolean): void {
		if (this._confirming === value) {
			return;
		}
		this._confirming = value;
		this._confirmDisposables.clear();

		if (value && this.element) {
			// Revert to the default state when focus leaves the button or
			// when the user presses Escape.
			this._confirmDisposables.add(dom.addDisposableListener(this.element, dom.EventType.FOCUS_OUT, e => {
				const next = e.relatedTarget as HTMLElement | null;
				if (!next || !this.element?.contains(next)) {
					this._setConfirming(false);
				}
			}));
			this._confirmDisposables.add(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Escape)) {
					dom.EventHelper.stop(e, true);
					this._setConfirming(false);
					this.label?.focus();
				}
			}));
		}

		this._updateConfirmUI();
	}

	private _updateConfirmUI(): void {
		this.element?.classList.toggle('confirming', this._confirming);
		this._cancelButton?.classList.toggle('hidden', !this._confirming);
		this.updateLabel();
		this.updateTooltip();
	}

	protected override updateLabel(): void {
		if (this._confirming && this.label) {
			dom.reset(this.label, ...renderLabelWithIcons(`${localize('chat.restoreCheckpoint.confirm', "Discard Edits")}`));
			return;
		}
		super.updateLabel();
	}

	protected override getTooltip(): string {
		if (this._confirming) {
			return localize('chat.restoreCheckpoint.confirmTooltip', "Confirm restoring this checkpoint and discarding later edits");
		}
		return super.getTooltip();
	}
}
