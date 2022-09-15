/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from 'vs/base/browser/dom';
import { IToolBarOptions, ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction, Separator, SubmenuAction, WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';
import { coalesceInPlace } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { createAndFillInActionBarActions, createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuActionOptions, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export const enum HiddenItemStrategy {
	Hide = 0,
	RenderInSecondaryGroup = 1
}

export interface IToolBarRenderOptions {
	/**
	 * Determines what groups are considered primary. Defaults to `navigation`. Items of the primary
	 * group are rendered with buttons and the rest is rendered in the secondary popup-menu.
	 */
	primaryGroup?: string | ((actionGroup: string) => boolean);

	/**
	 * Limits the number of items that make it in the primary group. The rest overflows into the
	 * secondary menu.
	 */
	primaryMaxCount?: number;

	/**
	 * Inlinse submenus with just a single item
	 */
	shouldInlineSubmenu?: (action: SubmenuAction, group: string, groupSize: number) => boolean;

	/**
	 * Should the primary group allow for separators.
	 */
	useSeparatorsInPrimaryActions?: boolean;

	/**
	 * Items of the primary group can be hidden. When this happens the item can
	 * - move in to the secondary popup-menu, or
	 * - not be shown at all
	 */
	hiddenItemStrategy?: HiddenItemStrategy;
}

export type IWorkbenchToolBarOptions = IToolBarOptions & {

	/**
	 * Optional options to configure how the toolbar renderes items.
	 */
	toolbarOptions?: IToolBarRenderOptions;

	/**
	 * Optional menu id which items are used for the context menu of the toolbar.
	 */
	contextMenu?: MenuId;

	/**
	 * Optional options how menu actions are created and invoked
	 */
	menuOptions?: IMenuActionOptions;

	/**
	 * When set the `workbenchActionExecuted` is automatically send for each invoked action. The `from` property
	 * of the event will the passed `telemetrySource`-value
	 */
	telemetrySource?: string;

	/** This is controlled by the WorkbenchToolBar */
	allowContextMenu?: never;
	/** This is controlled by the WorkbenchToolBar */
	getKeyBinding?: never;
};

export class WorkbenchToolBar extends ToolBar {

	constructor(
		container: HTMLElement,
		menuId: MenuId,
		options: IWorkbenchToolBarOptions | undefined,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(container, contextMenuService, {
			...options,
			allowContextMenu: true,
			getKeyBinding(action) {
				return keybindingService.lookupKeybinding(action.id) ?? undefined;
			},
		});

		// update logic
		const sessionDisposable = this._store.add(new DisposableStore());
		const menu = this._store.add(menuService.createMenu(menuId, contextKeyService));

		const updateToolbar = () => {

			sessionDisposable.clear();

			const toggleActions: IAction[] = [];
			const primary: IAction[] = [];
			const secondary: IAction[] = [];

			createAndFillInActionBarActions(
				menu,
				options?.menuOptions,
				{ primary, secondary },
				options?.toolbarOptions?.primaryGroup, options?.toolbarOptions?.primaryMaxCount, options?.toolbarOptions?.shouldInlineSubmenu, options?.toolbarOptions?.useSeparatorsInPrimaryActions
			);

			let shouldPrependSeparator = secondary.length > 0;

			// move all hidden items to secondary group
			for (let i = 0; i < primary.length; i++) {
				const action = primary[i];
				if (!(action instanceof MenuItemAction)) {
					continue;
				}
				if (!action.hideActions) {
					continue;
				}

				// collect all toggle actions
				toggleActions.push(action.hideActions.toggle);

				// hidden items move into overflow or ignore
				if (action.hideActions.isHidden) {
					primary[i] = undefined!;
					if (options?.toolbarOptions?.hiddenItemStrategy !== HiddenItemStrategy.Hide) {
						if (shouldPrependSeparator) {
							shouldPrependSeparator = false;
							secondary.unshift(new Separator());
						}
						secondary.unshift(action);
					}
				}
			}
			coalesceInPlace(primary);
			super.setActions(primary, secondary);

			// add context menu for toggle actions
			if (toggleActions.length > 0) {
				sessionDisposable.add(addDisposableListener(this.getElement(), 'contextmenu', e => {

					const action = this.getItemAction(<HTMLElement>e.target);
					if (!(action)) {
						return;
					}
					e.preventDefault();
					e.stopPropagation();

					let actions = toggleActions;

					// add "hide foo" actions
					if (action instanceof MenuItemAction && action.hideActions) {
						actions = [action.hideActions.hide, new Separator(), ...toggleActions];
					}

					// add context menu actions (iff appicable)
					if (options?.contextMenu) {
						const menu = menuService.createMenu(options.contextMenu, contextKeyService);
						const contextMenuActions: IAction[] = [];
						createAndFillInContextMenuActions(menu, { ...options?.menuOptions, renderShortTitle: true, }, contextMenuActions);
						menu.dispose();

						if (contextMenuActions.length > 0) {
							actions = [...actions, new Separator(), ...contextMenuActions];
						}
					}

					contextMenuService.showContextMenu({
						getAnchor: () => e,
						getActions: () => actions,
					});
				}));
			}
		};

		this._store.add(menu.onDidChange(updateToolbar));
		updateToolbar();

		// telemetry logic
		if (options?.telemetrySource) {
			this._store.add(this.actionBar.onDidRun(e => telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>(
				'workbenchActionExecuted',
				{ id: e.action.id, from: options!.telemetrySource! })
			));
		}
	}

	/**
	 * @deprecated The WorkbenchToolBar does not support this method because it works with menus.
	 */
	override setActions(): void {
		throw new BugIndicatingError('This toolbar is populated from a menu.');
	}
}
