/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from 'vs/base/browser/contextmenu';
import { ActionBar, ActionsOrientation, IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { Action, IAction, IActionRunner, SubmenuAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { EventMultiplexer } from 'vs/base/common/event';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import 'vs/css!./toolbar';
import * as nls from 'vs/nls';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { createInstantHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';



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
	readonly onDidChangeDropdownVisibility = this._onDidChangeDropdownVisibility.event;
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
						(<ToggleMenuAction>action).menuActions,
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

		const primaryActionsToSet = primaryActions ? primaryActions.slice(0) : [];

		// Inject additional action to open secondary actions if present
		this.hasSecondaryActions = !!(secondaryActions && secondaryActions.length > 0);
		if (this.hasSecondaryActions && secondaryActions) {
			this.toggleMenuAction.menuActions = secondaryActions.slice(0);
			primaryActionsToSet.push(this.toggleMenuAction);
		}

		primaryActionsToSet.forEach(action => {
			this.actionBar.push(action, { icon: this.options.icon ?? true, label: this.options.label ?? false, keybinding: this.getKeybindingLabel(action) });
		});
	}

	isEmpty(): boolean {
		return this.actionBar.isEmpty();
	}

	private getKeybindingLabel(action: IAction): string | undefined {
		const key = this.options.getKeyBinding?.(action);

		return key?.getLabel() ?? undefined;
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
