/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/chatViewNewSplitButton.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ButtonWithDropdown } from '../../../../../base/browser/ui/button/button.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ActionRunner, IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { OS } from '../../../../../base/common/platform.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { ACTION_ID_NEW_CHAT } from '../../../chat/browser/actions/chatActions.js';
import { NEW_CHAT_ICON_VARIANTS } from '../../../chat/browser/actions/chatNewActions.js';
import { agentsNewSessionButtonBackground, agentsNewSessionButtonBorder, agentsNewSessionButtonForeground, agentsNewSessionButtonHoverBackground } from '../../../../common/agentsColors.js';

/** The room that the button keeps before the next action, so that it never touches it. */
const MIN_CLEARANCE = 1;

/** The sizes of the button, from the largest, which it tries in order until one fits. */
const enum ButtonSize {
	/** "New", the keybinding and the chevron */
	Full = 'full',
	/** "New" and the chevron */
	Compact = 'compact',
	/** The icon of New Chat and the chevron, as compact as the width that the title reserves for a split button */
	Icon = 'icon',
}

/**
 * The New Chat split button of the Chat view's title while it shows the shared sessions list: "New" with the keybinding of
 * the menu's first action, which it runs, and a chevron that opens the menu, with the same actions as the title's default
 * split button.
 *
 * In a responsive title toolbar, the button picks the largest of its {@link ButtonSize sizes} that keeps room before the
 * next action of the title, checked after layout and before each paint, so it never overlaps it. It starts at the smallest,
 * which fits the width that the toolbar reserves for a split button. In any other toolbar, such as when the Chat view is
 * moved, it shows the icon of New Chat and the chevron.
 */
export class ChatViewNewSplitButtonActionViewItem extends BaseActionViewItem {

	private button: ButtonWithDropdown | undefined;
	private readonly primaryAction: MenuItemAction | undefined;
	private readonly rowObservers = this._register(new MutableDisposable<DisposableStore>());
	private readonly scheduledRowObservers = this._register(new MutableDisposable());
	private size = ButtonSize.Icon;
	/** What the last fit measured in the row, and the size it picked, with which an unchanged row needs no new fit. */
	private lastFit: { readonly row: HTMLElement; readonly inputs: string; readonly size: ButtonSize } | undefined;
	private measuredElements: readonly HTMLElement[] = [];

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

		const icon = (this._action as SubmenuItemAction).item.icon;
		const iconElement = renderIcon(ThemeIcon.isThemeIcon(icon) ? icon : Codicon.plus);
		iconElement.classList.add('chat-view-new-split-button-icon');
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
		DOM.reset(button.primaryButton.element, iconElement, label, keybindingHint);
		this.measuredElements = [label, keybindingHint];
		this.setSize(ButtonSize.Icon);

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
			this.fit();
		};
		this._register(Event.runAndSubscribe(this.keybindingService.onDidUpdateKeybindings, updateKeybinding));

		// Notifies once the toolbar attaches the item, after layout and before paint, and when the width of the label or the
		// keybinding changes, such as with their fonts. None resizes when the button changes its size, which would notify in a loop.
		const observer = this._register(new DOM.DisposableResizeObserver('chatViewNewSplitButton.attach', () => {
			this.scheduleRowObservers();
			this.fit();
		}, DOM.getWindow(container)));
		// The separator between the button's parts, which keeps its size
		const separator = button.primaryButton.element.nextElementSibling;
		if (DOM.isHTMLElement(separator)) {
			this._register(observer.observe(separator));
		}
		this._register(observer.observe(label));
		this._register(observer.observe(keybindingHint));
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

	private setSize(size: ButtonSize): void {
		this.size = size;
		this.element?.classList.toggle('compact', size === ButtonSize.Compact);
		this.element?.classList.toggle('icon-only', size === ButtonSize.Icon);
	}

	/**
	 * Picks the largest size with which the button keeps {@link MIN_CLEARANCE} before the next visible action of its row,
	 * and its row does not overflow. Each size is laid out and measured rather than predicted, so the button never touches
	 * the next action. In a toolbar that is not responsive, the button does not shrink with the title, so it is the icon.
	 */
	private fit(): void {
		const container = this.element;
		const row = container?.parentElement;
		if (!container?.isConnected || !row) {
			this.lastFit = undefined;
			return;
		}
		if (!container.closest('.monaco-toolbar.responsive')) {
			this.lastFit = undefined;
			this.setSize(ButtonSize.Icon);
			return;
		}
		// Trying a size lays the row out again, which an unchanged row does not need
		const inputs = this.getFitInputs(row);
		if (this.lastFit?.row === row && this.lastFit.inputs === inputs && this.lastFit.size === this.size) {
			return;
		}
		this.lastFit = { row, inputs, size: this.pickSize(row) };
	}

	private pickSize(row: HTMLElement): ButtonSize {
		for (const size of [ButtonSize.Full, ButtonSize.Compact]) {
			this.setSize(size);
			if (this.getClearance() >= 0 && this.getFreeWidth(row) >= -0.5) {
				return size;
			}
		}
		this.setSize(ButtonSize.Icon);
		return ButtonSize.Icon;
	}

	/**
	 * The widths that the fit depends on and that do not change with the button's size: the row's, the label's and the
	 * keybinding's, and the contents of the other actions, which are zero when they are hidden.
	 */
	private getFitInputs(row: HTMLElement): string {
		const widths = [row.getBoundingClientRect().width, ...this.measuredElements.map(element => element.getBoundingClientRect().width)];
		for (const child of row.children) {
			if (child !== this.element) {
				widths.push((child.firstElementChild ?? child).getBoundingClientRect().width);
			}
		}
		return widths.join(',');
	}

	/**
	 * The room between the right edge of the button and the next visible action of its row less {@link MIN_CLEARANCE}, or
	 * the room before the end of the row without one.
	 */
	private getClearance(): number {
		const container = this.element!;
		const button = container.firstElementChild!;
		for (let next = container.nextElementSibling; next; next = next.nextElementSibling) {
			const rect = next.getBoundingClientRect();
			if (rect.width > 0) {
				return rect.left - button.getBoundingClientRect().right - MIN_CLEARANCE;
			}
		}
		const row = container.parentElement!;
		const style = DOM.getWindow(row).getComputedStyle(row);
		const bound = row.getBoundingClientRect().right - (parseFloat(style.borderRightWidth) || 0) - (parseFloat(style.paddingRight) || 0);
		return bound - button.getBoundingClientRect().right;
	}

	/** The room of the row that its laid out actions, with their margins, leave free, which is negative when they overflow it. */
	private getFreeWidth(row: HTMLElement): number {
		const targetWindow = DOM.getWindow(row);
		const rowStyle = targetWindow.getComputedStyle(row);
		let free = row.getBoundingClientRect().width
			- (parseFloat(rowStyle.borderLeftWidth) || 0) - (parseFloat(rowStyle.borderRightWidth) || 0)
			- (parseFloat(rowStyle.paddingLeft) || 0) - (parseFloat(rowStyle.paddingRight) || 0);
		for (const child of row.children) {
			const style = targetWindow.getComputedStyle(child);
			if (style.display !== 'none') {
				free -= child.getBoundingClientRect().width + (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0);
			}
		}
		return free;
	}

	/**
	 * Observes the item's row and the other actions in it, which move the next action or change the row's room. Observing
	 * them from within the attach observer's callback would notify about shallower elements in the same frame, so this
	 * waits for the next frame; the item's first fit does not need them.
	 */
	private scheduleRowObservers(): void {
		const row = this.element?.parentElement;
		if (!row || this.rowObservers.value) {
			return;
		}
		this.scheduledRowObservers.value ??= DOM.scheduleAtNextAnimationFrame(DOM.getWindow(row), () => {
			this.scheduledRowObservers.clear();
			this.observeRow();
		});
	}

	private observeRow(): void {
		const container = this.element;
		const row = container?.parentElement;
		if (!container || !row) {
			return;
		}
		const store = this.rowObservers.value = new DisposableStore();
		const observer = store.add(new DOM.DisposableResizeObserver('chatViewNewSplitButton.row', () => this.fit(), DOM.getWindow(row)));
		const observedActions = store.add(new DisposableStore());
		const observeActions = () => {
			observedActions.clear();
			observedActions.add(observer.observe(row));
			// The contents of the other actions rather than their items, which the responsive toolbar shrinks and grows as
			// the button changes its size. The button's own item is not observed either.
			for (const child of row.children) {
				if (child !== container) {
					observedActions.add(observer.observe(child.firstElementChild ?? child));
				}
			}
		};
		observeActions();
		// The toolbar adds and removes the other actions, such as when it overflows them. Their elements are deeper than
		// the row, so their first notifications come in the same frame.
		store.add(DOM.sharedMutationObserver.observe(row, store, { childList: true })(() => {
			observeActions();
			this.fit();
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
