/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from '../../contextmenu.js';
import { ActionBar, ActionsOrientation, IActionViewItemProvider } from '../actionbar/actionbar.js';
import { AnchorAlignment } from '../contextview/contextview.js';
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

export interface IToolBarOptions {
	orientation?: ActionsOrientation;
	actionViewItemProvider?: IActionViewItemProvider;
	ariaLabel?: string;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding | undefined;
	actionRunner?: IActionRunner;
	toggleMenuTitle?: string;
	anchorAlignmentProvider?: () => AnchorAlignment;
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
	 * - `actionMinWidth`: The minimum width of each action item. Defaults to `ACTION_MIN_WIDTH` (24px).
	 */
	responsiveBehavior?: { enabled: boolean; kind: 'last' | 'all'; minItems?: number; actionMinWidth?: number };
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
	private hiddenActions: { action: IAction; size: number }[] = [];
	private readonly disposables = this._register(new DisposableStore());
	private readonly actionMinWidth: number;

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

		// Store effective action min width
		this.actionMinWidth = (options.responsiveBehavior?.actionMinWidth ?? ACTION_MIN_WIDTH) + ACTION_PADDING;

		// Responsive support
		if (this.options.responsiveBehavior?.enabled) {
			this.element.classList.toggle('responsive', true);
			this.element.classList.toggle('responsive-all', this.options.responsiveBehavior.kind === 'all');
			this.element.classList.toggle('responsive-last', this.options.responsiveBehavior.kind === 'last');
			this.element.style.setProperty(ACTION_MIN_WIDTH_VAR, `${this.actionMinWidth - ACTION_PADDING}px`);

			const observer = new ResizeObserver(() => {
				this.updateActions(this.element.getBoundingClientRect().width);
			});
			observer.observe(this.element);
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

	focus(): void {
		this.actionBar.focus();
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

	getItemsLength(): number {
		return this.actionBar.length();
	}

	setAriaLabel(label: string): void {
		this.actionBar.setAriaLabel(label);
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

		this.actionBar.domNode.classList.toggle('has-overflow', this.actionBar.hasAction(this.toggleMenuAction));

		if (this.options.responsiveBehavior?.enabled) {
			// Reset hidden actions
			this.hiddenActions.length = 0;

			// Set the minimum width
			if (this.options.responsiveBehavior?.minItems !== undefined) {
				const itemCount = this.options.responsiveBehavior.minItems;

				// Account for overflow menu
				let overflowWidth = 0;
				if (
					this.originalSecondaryActions.length > 0 ||
					itemCount < this.originalPrimaryActions.length
				) {
					overflowWidth = ACTION_MIN_WIDTH + ACTION_PADDING;
				}

				this.container.style.minWidth = `${itemCount * this.actionMinWidth + overflowWidth}px`;
				this.element.style.minWidth = `${itemCount * this.actionMinWidth + overflowWidth}px`;
			} else {
				this.container.style.minWidth = `${ACTION_MIN_WIDTH + ACTION_PADDING}px`;
				this.element.style.minWidth = `${ACTION_MIN_WIDTH + ACTION_PADDING}px`;
			}

			// Update toolbar actions to fit with container width
			this.updateActions(this.element.getBoundingClientRect().width);
		}
	}

	isEmpty(): boolean {
		return this.actionBar.isEmpty();
	}

	private getKeybindingLabel(action: IAction): string | undefined {
		const key = this.options.getKeyBinding?.(action);

		return key?.getLabel() ?? undefined;
	}

	private updateActions(containerWidth: number) {
		// Actions bar is empty
		if (this.actionBar.isEmpty()) {
			return;
		}

		// Ensure that the container width respects the minimum width of the
		// element which is set based on the `responsiveBehavior.minItems` option
		containerWidth = Math.max(containerWidth, parseInt(this.element.style.minWidth));

		// Each action is assumed to have a minimum width so that actions with a label
		// can shrink to the action's minimum width. We do this so that action visibility
		// takes precedence over the action label.
		const actionBarWidth = (actualWidth: boolean) => {
			if (this.options.responsiveBehavior?.kind === 'last') {
				const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
				const primaryActionsCount = hasToggleMenuAction
					? this.actionBar.length() - 1
					: this.actionBar.length();

				let itemsWidth = 0;
				for (let i = 0; i < primaryActionsCount - 1; i++) {
					itemsWidth += this.actionBar.getWidth(i) + ACTION_PADDING;
				}

				itemsWidth += actualWidth ? this.actionBar.getWidth(primaryActionsCount - 1) : this.actionMinWidth; // item to shrink
				itemsWidth += hasToggleMenuAction ? ACTION_MIN_WIDTH + ACTION_PADDING : 0; // toggle menu action

				return itemsWidth;
			} else {
				return this.actionBar.length() * this.actionMinWidth;
			}
		};

		// Action bar fits and there are no hidden actions to show
		if (actionBarWidth(false) <= containerWidth && this.hiddenActions.length === 0) {
			return;
		}

		if (actionBarWidth(false) > containerWidth) {
			// Check for max items limit
			if (this.options.responsiveBehavior?.minItems !== undefined) {
				const primaryActionsCount = this.actionBar.hasAction(this.toggleMenuAction)
					? this.actionBar.length() - 1
					: this.actionBar.length();

				if (primaryActionsCount <= this.options.responsiveBehavior.minItems) {
					return;
				}
			}

			// Hide actions from the right
			while (actionBarWidth(true) > containerWidth && this.actionBar.length() > 0) {
				const index = this.originalPrimaryActions.length - this.hiddenActions.length - 1;
				if (index < 0) {
					break;
				}

				// Store the action and its size
				const size = Math.min(this.actionMinWidth, this.getItemWidth(index));
				const action = this.originalPrimaryActions[index];
				this.hiddenActions.unshift({ action, size });

				// Remove the action
				this.actionBar.pull(index);

				// There are no secondary actions, but we have actions that we need to hide so we
				// create the overflow menu. This will ensure that another primary action will be
				// removed making space for the overflow menu.
				if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 1) {
					this.actionBar.push(this.toggleMenuAction, {
						icon: this.options.icon ?? true,
						label: this.options.label ?? false,
						keybinding: this.getKeybindingLabel(this.toggleMenuAction),
					});
				}
			}
		} else {
			// Show actions from the top of the toggle menu
			while (this.hiddenActions.length > 0) {
				const entry = this.hiddenActions.shift()!;
				if (actionBarWidth(true) + entry.size > containerWidth) {
					// Not enough space to show the action
					this.hiddenActions.unshift(entry);
					break;
				}

				// Add the action
				this.actionBar.push(entry.action, {
					icon: this.options.icon ?? true,
					label: this.options.label ?? false,
					keybinding: this.getKeybindingLabel(entry.action),
					index: this.originalPrimaryActions.length - this.hiddenActions.length - 1
				});

				// There are no secondary actions, and there is only one hidden item left so we
				// remove the overflow menu making space for the last hidden action to be shown.
				if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 0) {
					this.toggleMenuAction.menuActions = [];
					this.actionBar.pull(this.actionBar.length() - 1);
				}
			}
		}

		// Update overflow menu
		const hiddenActions = this.hiddenActions.map(entry => entry.action);
		if (this.originalSecondaryActions.length > 0 || hiddenActions.length > 0) {
			const secondaryActions = this.originalSecondaryActions.slice(0);
			this.toggleMenuAction.menuActions = Separator.join(hiddenActions, secondaryActions);
		}

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
