/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from '../../contextmenu.js';
import * as DOM from '../../dom.js';
import { ActionBar, ActionsOrientation, IActionViewItem, IActionViewItemProvider } from '../actionbar/actionbar.js';
import { BaseActionViewItem } from '../actionbar/actionViewItems.js';
import { AnchorAlignment, IContextViewCloseAnimation } from '../contextview/contextview.js';
import { DropdownMenuActionViewItem } from '../dropdown/dropdownActionViewItem.js';
import { Action, IAction, IActionRunner, Separator, SubmenuAction } from '../../../common/actions.js';
import { Codicon } from '../../../common/codicons.js';
import { ThemeIcon } from '../../../common/themables.js';
import { EventMultiplexer } from '../../../common/event.js';
import { ResolvedKeybinding } from '../../../common/keybindings.js';
import { Disposable, DisposableStore, toDisposable } from '../../../common/lifecycle.js';
import './toolbar.css';
import * as nls from '../../../../nls.js';
import { IHoverDelegate } from '../hover/hoverDelegate.js';
import { createInstantHoverDelegate } from '../hover/hoverDelegateFactory.js';

const ACTION_MIN_WIDTH = 20; /* 20px codicon */
const ACTION_PADDING = 4; /* 4px padding */

const ACTION_MIN_WIDTH_VAR = '--vscode-toolbar-action-min-width';

export interface IToolBarResponsiveBehaviorOptions {
	readonly enabled: boolean;
	readonly kind: 'last' | 'all';
	readonly minItems?: number;
	readonly overflowFrom?: 'start' | 'end';
	readonly actionMinWidth?: number;
	readonly getActionMinWidth?: (action: IAction) => number | undefined;
	readonly allowOverflow?: boolean | (() => boolean);
	readonly getOverflowAction?: (action: IAction, getAnchor: () => HTMLElement | undefined) => IAction;
	readonly observedElement?: HTMLElement;
	readonly getAvailableWidth?: () => number;
}

export interface IToolBarOptions {
	orientation?: ActionsOrientation;
	actionViewItemProvider?: IActionViewItemProvider;
	ariaLabel?: string;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding | undefined;
	actionRunner?: IActionRunner;
	toggleMenuTitle?: string;
	anchorAlignmentProvider?: () => AnchorAlignment;
	dropdownMenuClassName?: string;
	dropdownMenuCloseAnimation?: IContextViewCloseAnimation;
	renderDropdownAsChildElement?: boolean;
	moreIcon?: ThemeIcon;
	allowContextMenu?: boolean;
	skipTelemetry?: boolean;
	hoverDelegate?: IHoverDelegate;
	trailingSeparator?: boolean;

	/**
	 * If true, toggled primary items are highlighted with a background color.
	 */
	highlightToggledItems?: boolean;

	/**
	 * Render action with icons (default: `true`)
	 */
	icon?: boolean;

	/**
	 * Render action with label (default: `false`)
	 */
	label?: boolean;

	/**
	 * Controls the responsive behavior of the primary group of the toolbar.
	 * - `enabled`: Whether the responsive behavior is enabled.
	 * - `kind`: The kind of responsive behavior to apply. Can be either `last` to only shrink the last item, or `all` to shrink all items equally.
	 * - `minItems`: The minimum number of items that should always be visible.
	 * - `overflowFrom`: In `all` mode, overflow actions from this end and restore them in reverse order. Defaults to `end`.
	 * - `actionMinWidth`: The minimum width of each action item. Defaults to `ACTION_MIN_WIDTH` (24px).
	 * - `getActionMinWidth`: Optional per-action minimum width override in pixels.
	 * - `allowOverflow`: Whether actions may move into the overflow menu, or a callback that decides from current presentation state.
	 * - `getOverflowAction`: Replaces an action only while it is rendered in the overflow menu.
	 */
	responsiveBehavior?: IToolBarResponsiveBehaviorOptions;
}

/**
 * A widget that combines an action bar for primary actions and a dropdown for secondary actions.
 */
export class ToolBar extends Disposable {
	private options: IToolBarOptions;
	protected readonly actionBar: ActionBar;
	private toggleMenuAction: ToggleMenuAction;
	private toggleMenuActionViewItem: DropdownMenuActionViewItem | undefined;
	private submenuActionViewItems: DropdownMenuActionViewItem[] = [];
	private hasSecondaryActions: boolean = false;
	private readonly element: HTMLElement;

	private _onDidChangeDropdownVisibility = this._register(new EventMultiplexer<boolean>());
	get onDidChangeDropdownVisibility() { return this._onDidChangeDropdownVisibility.event; }
	private originalPrimaryActions: ReadonlyArray<IAction> = [];
	private originalSecondaryActions: ReadonlyArray<IAction> = [];
	private hiddenActions: IAction[] = [];
	private readonly disposables = this._register(new DisposableStore());

	constructor(private readonly container: HTMLElement, contextMenuProvider: IContextMenuProvider, options: IToolBarOptions = { orientation: ActionsOrientation.HORIZONTAL }) {
		super();

		options.hoverDelegate = options.hoverDelegate ?? this._register(createInstantHoverDelegate());
		this.options = options;

		this.toggleMenuAction = this._register(new ToggleMenuAction(() => this.toggleMenuActionViewItem?.show(), options.toggleMenuTitle));

		this.element = document.createElement('div');
		this.element.className = 'monaco-toolbar';
		container.appendChild(this.element);

		this.actionBar = this._register(new ActionBar(this.element, {
			orientation: options.orientation,
			ariaLabel: options.ariaLabel,
			actionRunner: options.actionRunner,
			allowContextMenu: options.allowContextMenu,
			highlightToggledItems: options.highlightToggledItems,
			hoverDelegate: options.hoverDelegate,
			actionViewItemProvider: (action, viewItemOptions) => {
				if (action.id === ToggleMenuAction.ID) {
					this.toggleMenuActionViewItem = new DropdownMenuActionViewItem(
						action,
						{ getActions: () => this.toggleMenuAction.menuActions },
						contextMenuProvider,
						{
							actionViewItemProvider: this.options.actionViewItemProvider,
							actionRunner: this.actionRunner,
							keybindingProvider: this.options.getKeyBinding,
							classNames: ThemeIcon.asClassNameArray(options.moreIcon ?? Codicon.toolBarMore),
							menuClassName: this.options.dropdownMenuClassName,
							closeAnimation: this.options.dropdownMenuCloseAnimation,
							anchorAlignmentProvider: this.options.anchorAlignmentProvider,
							menuAsChild: !!this.options.renderDropdownAsChildElement,
							skipTelemetry: this.options.skipTelemetry,
							isMenu: true,
							hoverDelegate: this.options.hoverDelegate
						}
					);
					this.toggleMenuActionViewItem.setActionContext(this.actionBar.context);
					this.disposables.add(this._onDidChangeDropdownVisibility.add(this.toggleMenuActionViewItem.onDidChangeVisibility));

					return this.toggleMenuActionViewItem;
				}

				if (options.actionViewItemProvider) {
					const result = options.actionViewItemProvider(action, viewItemOptions);

					if (result) {
						return result;
					}
				}

				if (action instanceof SubmenuAction) {
					const result = new DropdownMenuActionViewItem(
						action,
						action.actions,
						contextMenuProvider,
						{
							actionViewItemProvider: this.options.actionViewItemProvider,
							actionRunner: this.actionRunner,
							keybindingProvider: this.options.getKeyBinding,
							classNames: action.class,
							menuClassName: this.options.dropdownMenuClassName,
							closeAnimation: this.options.dropdownMenuCloseAnimation,
							anchorAlignmentProvider: this.options.anchorAlignmentProvider,
							menuAsChild: !!this.options.renderDropdownAsChildElement,
							skipTelemetry: this.options.skipTelemetry,
							hoverDelegate: this.options.hoverDelegate
						}
					);
					result.setActionContext(this.actionBar.context);
					this.submenuActionViewItems.push(result);
					this.disposables.add(this._onDidChangeDropdownVisibility.add(result.onDidChangeVisibility));

					return result;
				}

				return undefined;
			}
		}));

		// Responsive support
		if (this.options.responsiveBehavior?.enabled) {
			this.element.classList.toggle('responsive', true);
			this.element.classList.toggle('responsive-all', this.options.responsiveBehavior.kind === 'all');
			this.element.classList.toggle('responsive-last', this.options.responsiveBehavior.kind === 'last');
			this.element.style.setProperty(ACTION_MIN_WIDTH_VAR, `${this.getConfiguredActionMinWidth()}px`);

			const observer = new ResizeObserver(() => {
				this.updateActions(this.getAvailableWidth());
			});
			observer.observe(this.options.responsiveBehavior?.observedElement ?? this.element);
			this._store.add(toDisposable(() => observer.disconnect()));
		}
	}

	set actionRunner(actionRunner: IActionRunner) {
		this.actionBar.actionRunner = actionRunner;
	}

	get actionRunner(): IActionRunner {
		return this.actionBar.actionRunner;
	}

	set context(context: unknown) {
		this.actionBar.context = context;
		this.toggleMenuActionViewItem?.setActionContext(context);
		for (const actionViewItem of this.submenuActionViewItems) {
			actionViewItem.setActionContext(context);
		}
	}

	getElement(): HTMLElement {
		return this.element;
	}

	/** Focuses the item at `index`, or the first item when no index is given. */
	focus(index?: number): void {
		this.actionBar.focus(index);
	}

	getItemsWidth(): number {
		let itemsWidth = 0;
		for (let i = 0; i < this.actionBar.length(); i++) {
			itemsWidth += this.actionBar.getWidth(i);
		}
		return itemsWidth;
	}

	getItemAction(indexOrElement: number | HTMLElement) {
		return this.actionBar.getAction(indexOrElement);
	}

	getItemWidth(index: number): number {
		return this.actionBar.getWidth(index);
	}

	getItemElement(index: number): HTMLElement | undefined {
		const element = this.actionBar.getContainer().firstElementChild?.children.item(index);
		return DOM.isHTMLElement(element) ? element : undefined;
	}

	getItemViewItem(index: number): IActionViewItem | undefined {
		return this.actionBar.viewItems[index];
	}

	private getUnshrunkItemWidth(index: number): number {
		const actionItem = this.actionBar.getContainer().firstElementChild?.children.item(index);
		if (!DOM.isHTMLElement(actionItem)) {
			return this.actionBar.getWidth(index);
		}

		const previousFlexShrink = actionItem.style.flexShrink;
		const previousMinWidth = actionItem.style.minWidth;
		try {
			actionItem.style.flexShrink = '0';
			if (!previousMinWidth) {
				actionItem.style.minWidth = '0';
			}
			return this.actionBar.getWidth(index);
		} finally {
			actionItem.style.flexShrink = previousFlexShrink;
			actionItem.style.minWidth = previousMinWidth;
		}
	}

	getItemsLength(): number {
		return this.actionBar.length();
	}

	hasOverflow(): boolean {
		return this.actionBar.hasAction(this.toggleMenuAction);
	}

	setAriaLabel(label: string): void {
		this.actionBar.setAriaLabel(label);
	}

	/**
	 * Force the responsive overflow logic to re-evaluate item visibility.
	 * Call this after action view items change their rendered size externally
	 * (e.g. label text changes) without the toolbar being notified.
	 */
	relayout(): void {
		if (this.options.responsiveBehavior?.enabled) {
			const width = this.getAvailableWidth();
			this.updateActions(width);
		}
	}

	setActions(primaryActions: ReadonlyArray<IAction>, secondaryActions?: ReadonlyArray<IAction>): void {
		this.clear();

		// Store primary and secondary actions as rendered initially
		this.originalPrimaryActions = primaryActions ? primaryActions.slice(0) : [];
		this.originalSecondaryActions = secondaryActions ? secondaryActions.slice(0) : [];

		const primaryActionsToSet = primaryActions ? primaryActions.slice(0) : [];

		// Inject additional action to open secondary actions if present
		this.hasSecondaryActions = !!(secondaryActions && secondaryActions.length > 0);
		if (this.hasSecondaryActions && secondaryActions) {
			this.toggleMenuAction.menuActions = secondaryActions.slice(0);
			primaryActionsToSet.push(this.toggleMenuAction);
		}

		if (primaryActionsToSet.length > 0 && this.options.trailingSeparator) {
			primaryActionsToSet.push(new Separator());
		}

		primaryActionsToSet.forEach(action => {
			this.actionBar.push(action, { icon: this.options.icon ?? true, label: this.options.label ?? false, keybinding: this.getKeybindingLabel(action) });
		});

		this.updateOverflowClassName();
		this.applyResponsiveActionMinWidths();

		if (this.options.responsiveBehavior?.enabled) {
			// Reset hidden actions
			this.hiddenActions.length = 0;

			// Set the minimum width
			if (this.options.responsiveBehavior.minItems !== undefined) {
				const itemCount = this.options.responsiveBehavior.minItems;
				const requiredActions = this.overflowFromStart
					? this.originalPrimaryActions.slice(Math.max(0, this.originalPrimaryActions.length - itemCount))
					: this.originalPrimaryActions.slice(0, itemCount);
				const primaryActionsMinWidth = requiredActions.reduce((total, action) => total + this.getActionMinWidth(action), 0);

				// Account for overflow menu
				let overflowWidth = 0;
				if (
					this.originalSecondaryActions.length > 0 ||
					itemCount < this.originalPrimaryActions.length
				) {
					overflowWidth = ACTION_MIN_WIDTH + ACTION_PADDING;
				}

				const separatorWidth = this.options.trailingSeparator && !this.actionBar.isEmpty() ? this.actionBar.getWidth(this.actionBar.length() - 1) + ACTION_PADDING : 0;
				this.container.style.minWidth = `${primaryActionsMinWidth + overflowWidth + separatorWidth}px`;
				this.element.style.minWidth = `${primaryActionsMinWidth + overflowWidth + separatorWidth}px`;
			} else {
				const minimumActionWidth = this.originalPrimaryActions.length > 0 ? this.getActionMinWidth(this.originalPrimaryActions[0]) : ACTION_MIN_WIDTH + ACTION_PADDING;
				this.container.style.minWidth = `${minimumActionWidth}px`;
				this.element.style.minWidth = `${minimumActionWidth}px`;
			}

			// Update toolbar actions to fit with container width
			this.updateActions(this.getAvailableWidth());
		}
	}

	isEmpty(): boolean {
		return this.actionBar.isEmpty();
	}

	private get overflowFromStart(): boolean {
		return this.options.responsiveBehavior?.kind === 'all' && this.options.responsiveBehavior.overflowFrom === 'start';
	}

	private getKeybindingLabel(action: IAction): string | undefined {
		const key = this.options.getKeyBinding?.(action);

		return key?.getLabel() ?? undefined;
	}

	private getConfiguredActionMinWidth(action?: IAction): number {
		if (action?.id === ToggleMenuAction.ID) {
			return ACTION_MIN_WIDTH;
		}

		return this.options.responsiveBehavior?.getActionMinWidth?.(action ?? this.toggleMenuAction)
			?? this.options.responsiveBehavior?.actionMinWidth
			?? ACTION_MIN_WIDTH;
	}

	private getActionMinWidth(action?: IAction): number {
		return this.getConfiguredActionMinWidth(action) + ACTION_PADDING;
	}

	private getAvailableWidth(): number {
		if (this.options.responsiveBehavior?.getAvailableWidth) {
			return this.options.responsiveBehavior.getAvailableWidth();
		}
		return this.element.getBoundingClientRect().width;
	}

	private applyResponsiveActionMinWidths(): void {
		if (!this.options.responsiveBehavior?.enabled) {
			return;
		}

		if (this.options.responsiveBehavior.kind === 'last') {
			const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
			const shrinkableIndex = hasToggleMenuAction ? this.actionBar.length() - 2 : this.actionBar.length() - 1;
			const shrinkableAction = shrinkableIndex >= 0 ? this.actionBar.getAction(shrinkableIndex) : undefined;
			const minWidth = `${this.getConfiguredActionMinWidth(shrinkableAction)}px`;
			if (this.element.style.getPropertyValue(ACTION_MIN_WIDTH_VAR) !== minWidth) {
				this.element.style.setProperty(ACTION_MIN_WIDTH_VAR, minWidth);
			}
			return;
		}

		const actionsContainer = this.actionBar.getContainer().firstElementChild;
		if (!DOM.isHTMLElement(actionsContainer)) {
			return;
		}

		for (let i = 0; i < actionsContainer.children.length; i++) {
			const actionItem = actionsContainer.children.item(i);
			if (!DOM.isHTMLElement(actionItem)) {
				continue;
			}

			const action = this.actionBar.getAction(i);
			const minWidth = action instanceof Separator ? '0px' : `${this.getConfiguredActionMinWidth(action)}px`;
			if (action instanceof Separator) {
				actionItem.style.flexShrink = '0';
			}
			if (actionItem.style.minWidth !== minWidth) {
				actionItem.style.minWidth = minWidth;
			}
		}
	}

	private updateActions(containerWidth: number) {
		// Actions bar is empty
		if (this.actionBar.isEmpty()) {
			return;
		}

		this.applyResponsiveActionMinWidths();

		// Ensure that the container width respects the minimum width of the
		// element which is set based on the `responsiveBehavior.minItems` option
		const parsedMinWidth = parseInt(this.element.style.minWidth);
		containerWidth = Math.max(containerWidth, Number.isNaN(parsedMinWidth) ? 0 : parsedMinWidth);

		// Each action is assumed to have a minimum width so that actions with a label
		// can shrink to the action's minimum width. We do this so that action visibility
		// takes precedence over the action label.
		const isActionItemVisible = (index: number): boolean => {
			const element = this.getItemElement(index);
			return !element || DOM.getWindow(element).getComputedStyle(element).display !== 'none';
		};
		const getVisiblePrimaryActionIndexes = (): number[] => {
			const indexes: number[] = [];
			for (let index = 0; index < this.actionBar.length(); index++) {
				const action = this.actionBar.getAction(index);
				if (action && this.originalPrimaryActions.includes(action) && isActionItemVisible(index)) {
					indexes.push(index);
				}
			}
			return indexes;
		};
		const getVisiblePrimaryActionCount = () => getVisiblePrimaryActionIndexes()
			.reduce((count, index) => count + (this.actionBar.getAction(index) instanceof Separator ? 0 : 1), 0);
		const getActionsToHide = (): IAction[] => {
			const indexes = getVisiblePrimaryActionIndexes();
			const actionIndex = (this.overflowFromStart ? indexes : indexes.slice().reverse())
				.find(index => !(this.actionBar.getAction(index) instanceof Separator));
			if (actionIndex === undefined) {
				return [];
			}

			let startIndex = actionIndex;
			let endIndex = actionIndex;
			const step = this.overflowFromStart ? 1 : -1;
			for (let index = actionIndex + step; index >= 0 && index < this.actionBar.length(); index += step) {
				const action = this.actionBar.getAction(index);
				if (!(action instanceof Separator) || !this.originalPrimaryActions.includes(action) || !isActionItemVisible(index)) {
					break;
				}
				startIndex = Math.min(startIndex, index);
				endIndex = Math.max(endIndex, index);
			}

			const actions: IAction[] = [];
			for (let index = startIndex; index <= endIndex; index++) {
				const action = this.actionBar.getAction(index);
				if (action) {
					actions.push(action);
				}
			}
			return actions;
		};
		const getActionsToRestore = (): IAction[] => {
			if (this.hiddenActions.length === 0) {
				return [];
			}

			if (this.overflowFromStart) {
				let startIndex = this.hiddenActions.length - 1;
				while (startIndex > 0 && this.hiddenActions[startIndex] instanceof Separator) {
					startIndex--;
				}
				return this.hiddenActions.slice(startIndex);
			}

			let endIndex = 0;
			while (endIndex < this.hiddenActions.length - 1 && this.hiddenActions[endIndex] instanceof Separator) {
				endIndex++;
			}
			return this.hiddenActions.slice(0, endIndex + 1);
		};
		const actionBarMinimumWidth = () => {
			if (this.options.responsiveBehavior?.kind === 'last') {
				const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
				const primaryActionIndexes = getVisiblePrimaryActionIndexes();
				if (primaryActionIndexes.length === 0) {
					return hasToggleMenuAction ? ACTION_MIN_WIDTH + ACTION_PADDING : 0;
				}

				let itemsWidth = 0;
				for (const index of primaryActionIndexes.slice(0, -1)) {
					itemsWidth += this.actionBar.getWidth(index) + ACTION_PADDING;
				}

				const action = this.actionBar.getAction(primaryActionIndexes.at(-1)!);
				itemsWidth += this.getActionMinWidth(action); // item to shrink
				itemsWidth += hasToggleMenuAction ? ACTION_MIN_WIDTH + ACTION_PADDING : 0; // toggle menu action

				return itemsWidth;
			} else {
				let itemsWidth = 0;
				for (let i = 0; i < this.actionBar.length(); i++) {
					if (isActionItemVisible(i)) {
						const action = this.actionBar.getAction(i);
						itemsWidth += action instanceof Separator ? this.actionBar.getWidth(i) + ACTION_PADDING : this.getActionMinWidth(action);
					}
				}
				return itemsWidth;
			}
		};

		const projectedActionBarMinimumWidth = (actionsToAdd: readonly IAction[], keepToggleMenuAction: boolean) => {
			let itemsWidth = actionsToAdd.reduce((width, action) => width + this.getActionMinWidth(action), 0);
			if (this.options.responsiveBehavior?.kind === 'last') {
				const primaryActionIndexes = getVisiblePrimaryActionIndexes();
				for (const [position, index] of primaryActionIndexes.entries()) {
					const itemWidth = position === primaryActionIndexes.length - 1
						? this.getUnshrunkItemWidth(index)
						: this.actionBar.getWidth(index);
					itemsWidth += itemWidth + ACTION_PADDING;
				}
			} else {
				for (let i = 0; i < this.actionBar.length(); i++) {
					const action = this.actionBar.getAction(i);
					if (action && action !== this.toggleMenuAction && isActionItemVisible(i)) {
						itemsWidth += action instanceof Separator ? this.actionBar.getWidth(i) + ACTION_PADDING : this.getActionMinWidth(action);
					}
				}
			}
			if (keepToggleMenuAction) {
				itemsWidth += ACTION_MIN_WIDTH + ACTION_PADDING;
			}
			return itemsWidth;
		};

		let minimumWidth = actionBarMinimumWidth();

		// Action bar fits and there are no hidden actions to show
		if (minimumWidth <= containerWidth && this.hiddenActions.length === 0) {
			return;
		}

		const focusedElement = DOM.getActiveElement();
		const focusedAction = DOM.isHTMLElement(focusedElement) ? this.actionBar.getAction(focusedElement) : undefined;
		const previousHiddenActionsCount = this.hiddenActions.length;

		if (minimumWidth > containerWidth) {
			const allowOverflow = this.options.responsiveBehavior?.allowOverflow;
			if (allowOverflow === false || (typeof allowOverflow === 'function' && !allowOverflow())) {
				return;
			}

			// Check for max items limit
			if (this.options.responsiveBehavior?.minItems !== undefined) {
				const primaryActionsCount = getVisiblePrimaryActionCount();

				if (primaryActionsCount <= this.options.responsiveBehavior.minItems) {
					return;
				}
			}

			// Hide actions from the configured end.
			while (minimumWidth > containerWidth && this.actionBar.length() > 0) {
				if (
					this.options.responsiveBehavior?.minItems !== undefined
					&& getVisiblePrimaryActionCount() <= this.options.responsiveBehavior.minItems
				) {
					break;
				}

				const actionsToHide = getActionsToHide();
				if (actionsToHide.length === 0) {
					break;
				}
				for (const action of actionsToHide) {
					this.hiddenActions.push(action);
					const index = this.actionBar.viewItems.findIndex(item => item.action === action);
					if (index !== -1) {
						this.actionBar.pull(index);
					}
				}
				this.hiddenActions.sort((a, b) => this.originalPrimaryActions.indexOf(a) - this.originalPrimaryActions.indexOf(b));

				// There are no secondary actions, but we have actions that we need to hide so we
				// create the overflow menu. This will ensure that another primary action will be
				// removed making space for the overflow menu.
				if (this.originalSecondaryActions.length === 0 && !this.actionBar.hasAction(this.toggleMenuAction)) {
					this.actionBar.push(this.toggleMenuAction, {
						icon: this.options.icon ?? true,
						label: this.options.label ?? false,
						keybinding: this.getKeybindingLabel(this.toggleMenuAction),
						index: this.options.trailingSeparator ? this.actionBar.length() - 1 : undefined,
					});
					this.updateOverflowClassName();
				}

				this.applyResponsiveActionMinWidths();
				minimumWidth = actionBarMinimumWidth();
			}
		} else {
			// Restore actions in reverse overflow order.
			while (this.hiddenActions.length > 0) {
				const actionsToRestore = getActionsToRestore();
				const keepToggleMenuAction = this.originalSecondaryActions.length > 0 || this.hiddenActions.length > actionsToRestore.length;
				if (projectedActionBarMinimumWidth(actionsToRestore, keepToggleMenuAction) > containerWidth) {
					// Not enough space to show the action
					break;
				}

				for (const action of actionsToRestore) {
					this.hiddenActions.splice(this.hiddenActions.indexOf(action), 1);
					const visibleActions = new Set(this.actionBar.viewItems.map(item => item.action));
					this.actionBar.push(action, {
						icon: this.options.icon ?? true,
						label: this.options.label ?? false,
						keybinding: this.getKeybindingLabel(action),
						index: this.originalPrimaryActions
							.slice(0, this.originalPrimaryActions.indexOf(action))
							.reduce((index, precedingAction) => index + (visibleActions.has(precedingAction) ? 1 : 0), 0)
					});
				}

				// There are no secondary actions, and there is only one hidden item left so we
				// remove the overflow menu making space for the last hidden action to be shown.
				if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 0) {
					this.toggleMenuAction.menuActions = [];
					this.actionBar.pull(this.actionBar.viewItems.findIndex(item => item.action === this.toggleMenuAction));
					this.updateOverflowClassName();
				}

				this.applyResponsiveActionMinWidths();
			}
		}

		// Update overflow menu
		const hiddenActions = this.hiddenActions.map(action => this.options.responsiveBehavior?.getOverflowAction?.(
			action,
			() => this.toggleMenuActionViewItem?.element,
		) ?? action);
		if (this.originalSecondaryActions.length > 0 || hiddenActions.length > 0) {
			const secondaryActions = this.originalSecondaryActions.slice(0);
			this.toggleMenuAction.menuActions = Separator.clean(Separator.join(hiddenActions, secondaryActions));
		}

		this.updateOverflowClassName();
		this.applyResponsiveActionMinWidths();
		if (this.hiddenActions.length === previousHiddenActionsCount) {
			return;
		}

		// Rebuild the roving tab stop after items have been removed or inserted.
		for (let i = 0; i < this.actionBar.length(); i++) {
			const viewItem = this.getItemViewItem(i);
			if (viewItem instanceof BaseActionViewItem) {
				viewItem.setFocusable(false);
			}
		}
		if (focusedAction) {
			const index = Array.from({ length: this.actionBar.length() }, (_, index) => index)
				.find(index => this.actionBar.getAction(index) === focusedAction);
			const overflowIndex = Array.from({ length: this.actionBar.length() }, (_, index) => index)
				.find(index => this.actionBar.getAction(index) === this.toggleMenuAction);
			this.actionBar.focus(index ?? overflowIndex);
			if (index !== undefined && DOM.isHTMLElement(focusedElement) && DOM.isAncestor(focusedElement, this.getItemElement(index) ?? null) && DOM.getActiveElement() !== focusedElement) {
				// Keep compound controls on their previously focused child.
				const viewItem = this.getItemViewItem(index);
				if (viewItem instanceof BaseActionViewItem) {
					viewItem.setFocusable(false);
				}
				focusedElement.tabIndex = 0;
				focusedElement.focus({ preventScroll: true });
			}
		} else {
			this.actionBar.setFocusable(true);
		}
	}

	private updateOverflowClassName(): void {
		this.actionBar.domNode.classList.toggle('has-overflow', this.actionBar.hasAction(this.toggleMenuAction));
	}

	private clear(): void {
		this.submenuActionViewItems = [];
		this.disposables.clear();
		this.actionBar.clear();
	}

	override dispose(): void {
		this.clear();
		this.disposables.dispose();
		this.element.remove();
		super.dispose();
	}
}

export class ToggleMenuAction extends Action {

	static readonly ID = 'toolbar.toggle.more';

	private _menuActions: ReadonlyArray<IAction>;
	private toggleDropdownMenu: () => void;

	constructor(toggleDropdownMenu: () => void, title?: string) {
		title = title || nls.localize('moreActions', "More Actions...");
		super(ToggleMenuAction.ID, title, undefined, true);

		this._menuActions = [];
		this.toggleDropdownMenu = toggleDropdownMenu;
	}

	override async run(): Promise<void> {
		this.toggleDropdownMenu();
	}

	get menuActions(): ReadonlyArray<IAction> {
		return this._menuActions;
	}

	set menuActions(actions: ReadonlyArray<IAction>) {
		this._menuActions = actions;
	}
}
