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
import { BaseActionViewItem } from '../actionbar/actionViewItems.js';

const ACTION_MIN_WIDTH = 24; /* 20px codicon + 4px left padding*/

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
	 * Hiding actions that are not visible
	 */
	responsive?: boolean;
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

	constructor(container: HTMLElement, contextMenuProvider: IContextMenuProvider, options: IToolBarOptions = { orientation: ActionsOrientation.HORIZONTAL }) {
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

		// Responsive support
		if (this.options.responsive) {
			this.element.classList.add('responsive');

			const observer = new ResizeObserver(() => {
				this.setToolbarMaxWidth(this.element.getBoundingClientRect().width);
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

		if (this.options.responsive) {
			// Reset hidden actions
			this.hiddenActions.length = 0;

			// Set `responsive` class
			this.setToolbarResponsiveAction();

			// Update toolbar to fit with container width
			this.setToolbarMaxWidth(this.element.getBoundingClientRect().width);
		}
	}

	isEmpty(): boolean {
		return this.actionBar.isEmpty();
	}

	private getKeybindingLabel(action: IAction): string | undefined {
		const key = this.options.getKeyBinding?.(action);

		return key?.getLabel() ?? undefined;
	}

	private getItemsWidthResponsive(): number {
		let itemsWidth = 0;
		for (let index = 0; index < this.actionBar.length(); index++) {
			// If the last visible primary action is wider than 24px, it means that it has a label. We
			// need to return the minimum width (24px) for this action so that we allow it to shrink to
			// the minimum width.
			const width = index === this.originalPrimaryActions.length - this.hiddenActions.length - 1
				? Math.min(ACTION_MIN_WIDTH, this.actionBar.getWidth(index))
				: this.actionBar.getWidth(index);

			itemsWidth += width;
		}

		return itemsWidth;
	}

	private setToolbarMaxWidth(maxWidth: number) {
		if (
			this.actionBar.isEmpty() ||
			(this.getItemsWidthResponsive() <= maxWidth && this.hiddenActions.length === 0)
		) {
			return;
		}

		if (this.getItemsWidthResponsive() > maxWidth) {
			// Hide actions from the right
			while (this.getItemsWidthResponsive() > maxWidth && this.actionBar.length() > 0) {
				const index = this.originalPrimaryActions.length - this.hiddenActions.length - 1;
				if (index < 0) {
					break;
				}

				// Store the action and its size
				const size = Math.min(ACTION_MIN_WIDTH, this.getItemWidth(index));
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
				if (this.getItemsWidthResponsive() + entry.size > maxWidth) {
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
				if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 1) {
					this.toggleMenuAction.menuActions = [];
					this.actionBar.pull(this.actionBar.length() - 1);
				}
			}
		}

		// Update `responsive` class
		this.setToolbarResponsiveAction();

		// Update overflow menu
		const hiddenActions = this.hiddenActions.map(entry => entry.action);
		if (this.originalSecondaryActions.length > 0 || hiddenActions.length > 0) {
			const secondaryActions = this.originalSecondaryActions.slice(0);
			this.toggleMenuAction.menuActions = Separator.join(hiddenActions, secondaryActions);
		}
	}

	private setToolbarResponsiveAction(): void {
		// Set the `responsive` class on the last visible primary action
		for (let index = 0; index < this.actionBar.viewItems.length; index++) {
			if (this.actionBar.viewItems[index] instanceof BaseActionViewItem) {
				const isLastVisiblePrimaryAction = index === this.originalPrimaryActions.length - this.hiddenActions.length - 1;
				(this.actionBar.viewItems[index] as BaseActionViewItem).element?.classList.toggle('responsive', isLastVisiblePrimaryAction);
			}
		}
	}

	private clear(): void {
		this.submenuActionViewItems = [];
		this.disposables.clear();
		this.actionBar.clear();
	}

	override dispose(): void {
		this.clear();
		this.disposables.dispose();
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
