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
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export const enum HiddenItemStrategy {
	Hide = 0,
	RenderInSecondaryGroup = 1
}

export interface IToolBarRenderOptions {
	primaryGroup?: string | ((actionGroup: string) => boolean);
	primaryMaxCount?: number;
	shouldInlineSubmenu?: (action: SubmenuAction, group: string, groupSize: number) => boolean;
	useSeparatorsInPrimaryActions?: boolean;
	hiddenItemStrategy?: HiddenItemStrategy;
}

export type IWorkbenchToolBarOptions = Exclude<IToolBarOptions, { allowContextMenu: boolean }> & {
	contextMenu?: MenuId;

	toolbarOptions?: IToolBarRenderOptions;

	menuOptions?: IMenuActionOptions;

	/**
	 * When set the `workbenchActionExecuted` is automatically send for each invoked action. The `from` property
	 * of the event will the passed `telemetrySource`-value
	 */
	telemetrySource?: string;
};

export class WorkbenchToolBar extends ToolBar {

	private static readonly _mandatoryOptions: IWorkbenchToolBarOptions = { allowContextMenu: true };

	constructor(
		container: HTMLElement,
		menuId: MenuId,
		options: IWorkbenchToolBarOptions | undefined,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		options = { ...options, ...WorkbenchToolBar._mandatoryOptions };
		super(container, contextMenuService, options);

		// update logic
		const sessionDisposable = new DisposableStore();
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
						createAndFillInContextMenuActions(menu, options?.menuOptions, contextMenuActions);
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
		if (options.telemetrySource) {
			this.actionRunner.onDidRun(e => telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: e.action.id, from: options!.telemetrySource! }));
		}
	}

	/**
	 * @deprecated The WorkbenchToolBar does not support this method because it wrorks with menus.
	 */
	override setActions(): void {
		throw new BugIndicatingError('This toolbar is populated from a menu.');
	}
}
