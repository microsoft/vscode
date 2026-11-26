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
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { ACTION_ID_NEW_CHAT } from '../../../chat/browser/actions/chatActions.js';
import { NEW_CHAT_ICON_VARIANTS } from '../../../chat/browser/actions/chatNewActions.js';
import { agentsNewSessionButtonBackground, agentsNewSessionButtonBorder, agentsNewSessionButtonForeground, agentsNewSessionButtonHoverBackground } from '../../../../common/agentsColors.js';

/** Tolerance for subpixel layout when comparing widths. */
const FIT_EPSILON = 0.5;

/**
 * The New Chat split button of the Chat view's title while it shows the shared sessions list: "New" with the keybinding of
 * the menu's first action, which it runs, and a chevron that opens the menu, with the same actions as the title's default
 * split button. The keybinding hides when the full button does not fit next to the title's other actions, and the button
 * reports its compact width to the responsive toolbar so that the toolbar overflows it rather than squeezing it.
 */
export class ChatViewNewSplitButtonActionViewItem extends BaseActionViewItem {

	private button: ButtonWithDropdown | undefined;
	private readonly primaryAction: MenuItemAction | undefined;
	private keybindingHint: HTMLElement | undefined;
	private readonly fitObservers = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		action: SubmenuItemAction,
		options: IBaseActionViewItemOptions | undefined,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super(undefined, action, options);
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
		const keybindingHint = this.keybindingHint = DOM.$('span.chat-view-new-split-button-keybinding');
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
			const keybinding = this.lookupPrimaryKeybinding();
			keybindingLabel.set(keybinding);
			keybindingHint.classList.toggle('hidden', !keybinding);
			const name = this.primaryAction?.label ?? localize('chatViewNewSplitButton', "New");
			const keybindingLabelText = keybinding?.getLabel();
			const keybindingAriaLabel = keybinding?.getAriaLabel();
			button.primaryButton.setTitle(keybindingLabelText ? localize('chatViewNewSplitButtonTitle', "{0} ({1})", name, keybindingLabelText) : name);
			button.primaryButton.setAriaLabel(keybindingAriaLabel ? localize('chatViewNewSplitButtonTitle', "{0} ({1})", name, keybindingAriaLabel) : name);
			this.updateKeybindingFit();
		};
		this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateKeybinding));

		// The toolbar attaches the item after rendering it
		this._register(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(container), () => this.observeFit()));
		this.updateEnabled();
	}

	private lookupPrimaryKeybinding() {
		if (!this.primaryAction) {
			return undefined;
		}
		const keybinding = this.keybindingService.lookupKeybinding(this.primaryAction.id);
		// The icon variants of New Chat, which an experiment shows instead of it, run New Chat but have no keybinding of their own
		if (!keybinding && NEW_CHAT_ICON_VARIANTS.some(variant => this.primaryAction?.id === ACTION_ID_NEW_CHAT + variant.idSuffix)) {
			return this.keybindingService.lookupKeybinding(ACTION_ID_NEW_CHAT);
		}
		return keybinding;
	}

	/** The width that the keybinding hint and its gap add to the button, or 0 without a keybinding. */
	private getKeybindingWidth(): number {
		const hint = this.keybindingHint;
		const primary = hint?.parentElement;
		if (!hint || !primary || hint.classList.contains('hidden')) {
			return 0;
		}
		const gap = parseFloat(DOM.getWindow(primary).getComputedStyle(primary).columnGap);
		return hint.getBoundingClientRect().width + (Number.isNaN(gap) ? 0 : gap);
	}

	/** The width of the button without its keybinding, or `undefined` while it is not measurable, such as when hidden. */
	getMinimumWidth(): number | undefined {
		const button = this.element?.firstElementChild;
		const width = DOM.isHTMLElement(button) ? button.getBoundingClientRect().width : 0;
		if (!width) {
			return undefined;
		}
		return Math.ceil(this.element?.classList.contains('narrow') ? width : width - this.getKeybindingWidth());
	}

	/**
	 * Shows the keybinding only when the full button fits next to the other actions of its row. The narrow button keeps the
	 * keybinding hint laid out but invisible, so both widths are measurable without changing what is shown.
	 */
	private updateKeybindingFit(): void {
		const container = this.element;
		const actions = container?.parentElement;
		const button = container?.firstElementChild;
		if (!container || !actions || !DOM.isHTMLElement(button)) {
			return;
		}
		const buttonWidth = button.getBoundingClientRect().width;
		if (!actions.clientWidth || !buttonWidth) {
			return;
		}
		const narrow = container.classList.contains('narrow');
		const keybindingWidth = this.getKeybindingWidth();
		let used = 0;
		for (const child of actions.children) {
			if (DOM.isHTMLElement(child)) {
				const style = DOM.getWindow(child).getComputedStyle(child);
				used += child.getBoundingClientRect().width + (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
			}
		}
		const free = actions.clientWidth - used;
		const fits = narrow
			// Showing the keybinding widens the button by its width
			? free >= keybindingWidth - FIT_EPSILON
			// The toolbar squeezes the items when they do not fit
			: free >= -FIT_EPSILON && container.getBoundingClientRect().width >= buttonWidth - FIT_EPSILON;
		if (fits === narrow) {
			container.classList.toggle('narrow', !fits);
		}
	}

	/**
	 * Updates the keybinding's fit whenever the row of actions changes: its size and visibility, the size of the other
	 * actions and of the button's label and keybinding, and which actions the toolbar shows.
	 */
	private observeFit(): void {
		const container = this.element;
		const actions = container?.parentElement;
		if (!container || !actions) {
			return;
		}
		const store = this.fitObservers.value = new DisposableStore();
		// Updating within the resize observer's callback would resize what it observes in the same frame
		const scheduledUpdate = store.add(new MutableDisposable());
		const scheduleUpdate = () => {
			scheduledUpdate.value ??= DOM.scheduleAtNextAnimationFrame(DOM.getWindow(actions), () => {
				scheduledUpdate.clear();
				this.updateKeybindingFit();
			});
		};
		const observer = store.add(new DOM.DisposableResizeObserver('chatViewNewSplitButton', scheduleUpdate, DOM.getWindow(actions)));
		const observed = store.add(new DisposableStore());
		const observeRow = () => {
			observed.clear();
			// The button's own item is not observed: toggling the keybinding resizes it
			for (const element of [actions, ...actions.children, ...(this.keybindingHint?.parentElement?.children ?? [])]) {
				if (element !== container) {
					observed.add(observer.observe(element));
				}
			}
		};
		store.add(DOM.sharedMutationObserver.observe(actions, store, { childList: true })(() => {
			observeRow();
			this.updateKeybindingFit();
		}));
		observeRow();
		this.updateKeybindingFit();
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
