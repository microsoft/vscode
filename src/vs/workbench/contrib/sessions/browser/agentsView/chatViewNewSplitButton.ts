/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/chatViewNewSplitButton.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ActionRunner, IAction } from '../../../../../base/common/actions.js';
import { Event } from '../../../../../base/common/event.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { agentsNewSessionButtonBackground, agentsNewSessionButtonBorder, agentsNewSessionButtonForeground, agentsNewSessionButtonHoverBackground } from '../../../../common/agentsColors.js';

/** The width of the title below which the split button leaves out the keybinding of its primary action. */
export const CHAT_VIEW_NEW_SPLIT_BUTTON_NARROW_WIDTH = 300;

/** The options of {@link ChatViewNewSplitButtonActionViewItem}. */
export interface IChatViewNewSplitButtonOptions extends IBaseActionViewItemOptions {
	/** Creates the resize observer of the title, which tests replace. */
	readonly resizeObserverCtor?: typeof ResizeObserver;
}

/**
 * The New Chat split button of the Chat view's title while it shows the shared sessions list: "New" with the keybinding of
 * the menu's first action, which it runs, and a chevron that opens the menu, with the same actions as the title's default
 * split button. The keybinding hides while the title is narrower than {@link CHAT_VIEW_NEW_SPLIT_BUTTON_NARROW_WIDTH}.
 */
export class ChatViewNewSplitButtonActionViewItem extends BaseActionViewItem {

	private button: ButtonWithDropdown | undefined;
	private readonly primaryAction: MenuItemAction | undefined;

	constructor(
		action: SubmenuItemAction,
		private readonly splitButtonOptions: IChatViewNewSplitButtonOptions | undefined,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(undefined, action, splitButtonOptions);
		this.primaryAction = action.actions.find(action => action instanceof MenuItemAction);
	}

	override render(container: HTMLElement): void {
		this.element = container;
		container.classList.add('chat-view-new-split-button');

		// The menu's actions run as the title runs them: with its runner and the context of the title
		const actionRunner = this._register(new class extends ActionRunner {
			constructor(private readonly item: ChatViewNewSplitButtonActionViewItem) { super(); }
			protected override async runAction(action: IAction): Promise<void> {
				await this.item.actionRunner.run(action, this.item._context);
			}
		}(this));
		const button = this.button = this._register(new ButtonWithDropdown(container, {
			...defaultButtonStyles,
			buttonSecondaryBackground: asCssVariable(agentsNewSessionButtonBackground),
			buttonSecondaryForeground: asCssVariable(agentsNewSessionButtonForeground),
			buttonSecondaryHoverBackground: asCssVariable(agentsNewSessionButtonHoverBackground),
			buttonSecondaryBorder: asCssVariable(agentsNewSessionButtonBorder),
			secondary: true,
			hoverDelegate: this.options.hoverDelegate,
			contextMenuProvider: this.contextMenuService,
			actions: { getActions: () => (this._action as SubmenuItemAction).actions },
			actionRunner,
			addPrimaryActionToDropdown: false,
		}));

		const label = DOM.$('span.chat-view-new-split-button-label', undefined, localize('chatViewNewSplitButton', "New"));
		const keybindingHint = DOM.$('span.chat-view-new-split-button-keybinding');
		keybindingHint.setAttribute('aria-hidden', 'true');
		const keybindingLabel = this._register(new KeybindingLabel(keybindingHint, OS, {
			disableTitle: true,
			keybindingLabelBackground: 'transparent',
			keybindingLabelForeground: 'inherit',
			keybindingLabelBorder: 'transparent',
			keybindingLabelBottomBorder: undefined,
			keybindingLabelShadow: undefined,
		}));
		DOM.reset(button.primaryButton.element, label, keybindingHint);

		this._register(button.onDidClick(() => {
			if (this.primaryAction?.enabled) {
				void this.actionRunner.run(this.primaryAction, this._context);
			}
		}));
		this._register(DOM.addDisposableListener(button.primaryButton.element, DOM.EventType.KEY_DOWN, event => {
			if (new StandardKeyboardEvent(event).equals(KeyCode.RightArrow)) {
				this.focus(true);
				DOM.EventHelper.stop(event, true);
			}
		}));
		this._register(DOM.addDisposableListener(button.dropdownButton.element, DOM.EventType.KEY_DOWN, event => {
			if (this.isPrimaryEnabled() && new StandardKeyboardEvent(event).equals(KeyCode.LeftArrow)) {
				this.focus();
				DOM.EventHelper.stop(event, true);
			}
		}));

		const updateKeybinding = () => {
			const keybinding = this.primaryAction && this.keybindingService.lookupKeybinding(this.primaryAction.id);
			keybindingLabel.set(keybinding);
			keybindingHint.classList.toggle('hidden', !keybinding);
			const name = this.primaryAction?.label ?? localize('chatViewNewSplitButton', "New");
			const keybindingLabelText = keybinding?.getLabel();
			const keybindingAriaLabel = keybinding?.getAriaLabel();
			button.primaryButton.setTitle(keybindingLabelText ? localize('chatViewNewSplitButtonTitle', "{0} ({1})", name, keybindingLabelText) : name);
			button.primaryButton.setAriaLabel(keybindingAriaLabel ? localize('chatViewNewSplitButtonTitle', "{0} ({1})", name, keybindingAriaLabel) : name);
		};
		this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateKeybinding));

		this.observeTitleWidth(container);
		this.updateEnabled();
	}

	/** Hides the keybinding while the title, of the view or of its container, is narrow, once the toolbar has added the button to it. */
	private observeTitleWidth(container: HTMLElement): void {
		this._register(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(container), () => {
			const title = container.closest<HTMLElement>('.pane-header, .composite.title');
			if (!title) {
				return;
			}
			const update = () => container.classList.toggle('narrow', title.clientWidth < CHAT_VIEW_NEW_SPLIT_BUTTON_NARROW_WIDTH);
			const observer = this._register(new DOM.DisposableResizeObserver('chatViewNewSplitButton', update, DOM.getWindow(title), { resizeObserverCtor: this.splitButtonOptions?.resizeObserverCtor }));
			this._register(observer.observe(title));
			update();
		}));
	}

	private isPrimaryEnabled(): boolean {
		return !!this.primaryAction?.enabled;
	}

	override isEnabled(): boolean {
		return this._action.enabled;
	}

	override focus(fromRight = false): void {
		if (!this.button) {
			return;
		}
		const dropdown = fromRight || !this.isPrimaryEnabled();
		this.button.primaryButton.element.tabIndex = dropdown ? -1 : 0;
		this.button.dropdownButton.element.tabIndex = dropdown ? 0 : -1;
		(dropdown ? this.button.dropdownButton : this.button.primaryButton).focus();
	}

	override blur(): void {
		this.button?.primaryButton.element.blur();
		this.button?.dropdownButton.element.blur();
		this.setFocusable(false);
	}

	override setFocusable(focusable: boolean): void {
		if (this.button) {
			this.button.primaryButton.element.tabIndex = focusable && this.isPrimaryEnabled() ? 0 : -1;
			this.button.dropdownButton.element.tabIndex = focusable && !this.isPrimaryEnabled() ? 0 : -1;
		}
	}

	protected override updateEnabled(): void {
		if (this.button) {
			const focusable = this.button.primaryButton.element.tabIndex === 0 || this.button.dropdownButton.element.tabIndex === 0;
			this.button.primaryButton.enabled = this.isPrimaryEnabled();
			this.setFocusable(focusable);
		}
	}
}
