/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { Action, IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { createActionViewItem, createAndFillInContextMenuActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import * as colors from 'vs/platform/theme/common/colorRegistry';
import { WindowTitle } from 'vs/workbench/browser/parts/titlebar/windowTitle';
import { MENUBAR_SELECTION_BACKGROUND, MENUBAR_SELECTION_FOREGROUND, TITLE_BAR_ACTIVE_FOREGROUND } from 'vs/workbench/common/theme';

export class TitleMenuControl {

	private readonly _disposables = new DisposableStore();

	readonly element: HTMLElement = document.createElement('div');

	constructor(
		windowTitle: WindowTitle,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService menuService: IMenuService,
		@IQuickInputService quickInputService: IQuickInputService,
	) {
		this.element.classList.add('title-menu');
		const titleToolbar = new ToolBar(this.element, contextMenuService, {
			actionViewItemProvider: (action) => {

				if (action instanceof MenuItemAction && action.id === 'workbench.action.quickOpen') {

					class InputLikeViewItem extends MenuEntryActionViewItem {
						override render(container: HTMLElement): void {
							super.render(container);
							container.classList.add('quickopen');
							this._store.add(windowTitle.onDidChange(this._updateFromWindowTitle, this));
							this._updateFromWindowTitle();
							this._renderAllQuickPickItem(container);
						}

						private _updateFromWindowTitle() {
							if (this.label) {
								this.label.classList.add('search');
								this.label.innerText = localize('search', "Search {0}", windowTitle.workspaceName);
								this.label.title = windowTitle.value;
							}
						}

						private _renderAllQuickPickItem(parent: HTMLElement): void {
							const container = document.createElement('span');
							container.classList.add('all-options');
							parent.appendChild(container);
							const action = new Action('all', localize('all', "Show Quick Pick Options..."), Codicon.chevronDown.classNames, true, () => {
								quickInputService.quickAccess.show('?');
							});
							const dropdown = new ActionViewItem(undefined, action, { icon: true, label: false });
							dropdown.render(container);
							this._store.add(dropdown);
							this._store.add(action);
						}
					}
					return instantiationService.createInstance(InputLikeViewItem, action, undefined);
				}

				return createActionViewItem(instantiationService, action);
			}
		});
		const titleMenu = this._disposables.add(menuService.createMenu(MenuId.TitleMenu, contextKeyService));
		const titleMenuDisposables = this._disposables.add(new DisposableStore());
		const updateTitleMenu = () => {
			titleMenuDisposables.clear();
			const actions: IAction[] = [];
			titleMenuDisposables.add(createAndFillInContextMenuActions(titleMenu, undefined, actions));
			titleToolbar.setActions(actions);
		};
		updateTitleMenu();
		this._disposables.add(titleMenu.onDidChange(updateTitleMenu));
		this._disposables.add(quickInputService.onShow(() => this.element.classList.toggle('hide', true)));
		this._disposables.add(quickInputService.onHide(() => this.element.classList.toggle('hide', false)));
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

// --- theme colors

// foreground (inactive and active)
colors.registerColor(
	'titleMenu.foreground',
	{ dark: TITLE_BAR_ACTIVE_FOREGROUND, hcDark: TITLE_BAR_ACTIVE_FOREGROUND, light: TITLE_BAR_ACTIVE_FOREGROUND, hcLight: TITLE_BAR_ACTIVE_FOREGROUND },
	localize('titleMenu-foreground', "Foreground color of the title menu"),
	false
);
colors.registerColor(
	'titleMenu.activeForeground',
	{ dark: MENUBAR_SELECTION_FOREGROUND, hcDark: MENUBAR_SELECTION_FOREGROUND, light: MENUBAR_SELECTION_FOREGROUND, hcLight: MENUBAR_SELECTION_FOREGROUND },
	localize('titleMenu-activeForeground', "Active foreground color of the title menu"),
	false
);
// background (inactive and active)
colors.registerColor(
	'titleMenu.background',
	{ dark: null, hcDark: null, light: null, hcLight: null },
	localize('titleMenu-background', "Background color of the title menu"),
	false
);
const activeBackground = colors.registerColor(
	'titleMenu.activeBackground',
	{ dark: MENUBAR_SELECTION_BACKGROUND, hcDark: MENUBAR_SELECTION_BACKGROUND, light: MENUBAR_SELECTION_BACKGROUND, hcLight: MENUBAR_SELECTION_BACKGROUND },
	localize('titleMenu-activeBackground', "Active background color of the title menu"),
	false
);
// border: defaults to active background
colors.registerColor(
	'titleMenu.border',
	{ dark: activeBackground, hcDark: activeBackground, light: activeBackground, hcLight: activeBackground },
	localize('titleMenu-border', "Border color of the title menu"),
	false
);
