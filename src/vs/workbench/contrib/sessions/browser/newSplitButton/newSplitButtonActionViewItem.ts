/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, reset } from '../../../../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { ActionWithDropdownActionViewItem } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { KeybindingLabel } from '../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ActionRunner, IAction } from '../../../../../base/common/actions.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { ResolvedKeybinding } from '../../../../../base/common/keybindings.js';
import { OS } from '../../../../../base/common/platform.js';
import { localize } from '../../../../../nls.js';
import { MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import './media/newSplitButton.css';

/** The options of a {@link NewSplitButtonActionViewItem}. */
export interface INewSplitButtonOptions {
	/** The label of the primary part of the button. Defaults to "New". */
	readonly label?: string;
	/**
	 * The action whose keybinding the button shows when the primary action has none, such as the canonical action of
	 * variants of the primary action that have no keybinding of their own.
	 */
	readonly keybindingActionId?: string;
}

/**
 * Runs the actions of the menu of a {@link NewSplitButtonActionViewItem}, and reports a failure itself: the menu closes as the
 * action starts and no longer listens to its end, and the button may be gone by then too.
 */
class NewSplitButtonMenuActionRunner extends ActionRunner {

	constructor(private readonly _notificationService: INotificationService) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		try {
			await action.run(context);
		} catch (error) {
			if (!isCancellationError(error)) {
				this._notificationService.error(error);
			}
		}
	}
}

/**
 * A "New" split button, the split button of the Extensions editor with the surface of the New button of the Agents window:
 * its label with the keybinding of its primary action in a chip runs the primary action, and its dropdown opens the actions of its
 * menu.
 *
 * To use it in a toolbar, return it from the toolbar's action view item provider for the menu's {@link SubmenuItemAction}:
 * `instantiationService.createInstance(NewSplitButtonActionViewItem, menu, primaryAction, options, { label })`, where the
 * primary action is one of the menu's {@link MenuItemAction}s, usually its first; plain actions are not supported. The toolbar keeps knowing the button as the menu, so it can
 * move it into its overflow menu. A toolbar that fits its items by their widths, such as a part title with `overflowsLast`,
 * asks it for the width it needs with {@link getMinimumWidth}.
 */
export class NewSplitButtonActionViewItem extends ActionWithDropdownActionViewItem {

	/** The class of the filled label buttons of action bars, such as the split buttons of the Extensions editor. */
	private static readonly FILLED_LABEL_CLASS = 'filled-label';

	private readonly _keybindingHint = $('span.new-split-button-keybinding');
	private readonly _keybindingLabel = this._register(new KeybindingLabel(this._keybindingHint, OS, {
		disableTitle: true,
		keybindingLabelBackground: 'transparent',
		keybindingLabelForeground: 'inherit',
		keybindingLabelBorder: 'transparent',
		keybindingLabelBottomBorder: undefined,
		keybindingLabelShadow: undefined,
	}));

	/**
	 * @param menu The menu the button stands for, whose actions its dropdown opens.
	 * @param _primaryAction The menu item action the label runs, whose keybinding the button shows.
	 * @param options The options the toolbar gives its action view items.
	 * @param _buttonOptions The label of the button, and where to find a keybinding when the primary action has none.
	 */
	constructor(
		menu: SubmenuItemAction,
		private readonly _primaryAction: MenuItemAction,
		options: IActionViewItemOptions | undefined,
		private readonly _buttonOptions: INewSplitButtonOptions | undefined,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
	) {
		const menuActionRunner = new NewSplitButtonMenuActionRunner(notificationService);
		super(null, menu, {
			...options,
			icon: false,
			label: true,
			menuActionsOrProvider: { getActions: () => menu.actions },
			menuActionClassNames: [NewSplitButtonActionViewItem.FILLED_LABEL_CLASS],
			menuActionRunner,
			filledSplitButton: true,
		}, contextMenuService);
		this._register(menuActionRunner);
		this._register(_keybindingService.onDidUpdateKeybindings(() => {
			this.updateLabel();
			this.updateTooltip();
		}));
	}

	/** The dropdown, created here after the first update, takes the toolbar's context and the primary action's enablement. */
	override render(container: HTMLElement): void {
		super.render(container);
		this.element?.classList.add('new-split-button');
		this.dropdownMenuActionViewItem?.setActionContext(this._context);
		this.updateEnabled();
	}

	override setActionContext(context: unknown): void {
		super.setActionContext(context);
		this.dropdownMenuActionViewItem?.setActionContext(context);
	}

	/**
	 * The width the button needs, for a toolbar to fit it. It is measured unshrunk and without the minimum width the toolbar
	 * gave it from an earlier measure, as part titles measure their items, so that it can need less than before.
	 */
	getMinimumWidth(): number | undefined {
		const element = this.element;
		if (!element) {
			return undefined;
		}
		const { minWidth, flexShrink } = element.style;
		try {
			element.style.minWidth = '0';
			element.style.flexShrink = '0';
			const width = element.getBoundingClientRect().width;
			return width ? Math.ceil(width) : undefined;
		} finally {
			element.style.minWidth = minWidth;
			element.style.flexShrink = flexShrink;
		}
	}

	/** The label runs the primary action. */
	override getActionToRun(): IAction {
		return this._primaryAction;
	}

	protected override updateLabel(): void {
		if (this.label) {
			const keybinding = this.getKeybinding();
			this._keybindingLabel.set(keybinding);
			reset(this.label, this._buttonOptions?.label ?? localize('newSplitButton.label', "New"), ...(keybinding ? [this._keybindingHint] : []));
		}
	}

	/** The button, with its dropdown, is disabled when the primary action is. */
	protected override updateEnabled(): void {
		const enabled = this._primaryAction.enabled;
		this.element?.classList.toggle('disabled', !enabled);
		this.label?.classList.toggle('disabled', !enabled);
		if (enabled) {
			this.label?.removeAttribute('aria-disabled');
		} else {
			this.label?.setAttribute('aria-disabled', 'true');
		}
		if (this.dropdownMenuActionViewItem) {
			this.dropdownMenuActionViewItem.action.enabled = enabled;
		}
	}

	protected override updateClass(): void {
		super.updateClass();
		this.label?.classList.add(NewSplitButtonActionViewItem.FILLED_LABEL_CLASS);
	}

	/** The primary action with its keybinding. */
	protected override getTooltip(): string {
		const keybindingLabel = this.getKeybinding()?.getLabel();
		return keybindingLabel
			? localize('newSplitButton.tooltip', "{0} ({1})", this._primaryAction.label, keybindingLabel)
			: this._primaryAction.label;
	}

	/** The primary action with its keybinding as a screen reader speaks it, such as "Command+N" rather than the glyphs of the tooltip. */
	protected override updateAriaLabel(): void {
		if (this.label) {
			const keybindingAriaLabel = this.getKeybinding()?.getAriaLabel();
			this.label.setAttribute('aria-label', keybindingAriaLabel
				? localize('newSplitButton.ariaLabel', "{0} ({1})", this._primaryAction.label, keybindingAriaLabel)
				: this._primaryAction.label);
		}
	}

	private getKeybinding(): ResolvedKeybinding | undefined {
		const fallbackId = this._buttonOptions?.keybindingActionId;
		return this._keybindingService.lookupKeybinding(this._primaryAction.id) ?? (fallbackId ? this._keybindingService.lookupKeybinding(fallbackId) : undefined);
	}
}
