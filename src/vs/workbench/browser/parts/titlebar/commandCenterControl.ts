/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reset } from 'vs/base/browser/dom';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IHoverDelegate } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { Action, IAction } from 'vs/base/common/actions';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { assertType } from 'vs/base/common/types';
import { localize } from 'vs/nls';
import { createActionViewItem, createAndFillInContextMenuActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import * as colors from 'vs/platform/theme/common/colorRegistry';
import { WindowTitle } from 'vs/workbench/browser/parts/titlebar/windowTitle';
import { MENUBAR_SELECTION_BACKGROUND, MENUBAR_SELECTION_FOREGROUND, TITLE_BAR_ACTIVE_FOREGROUND } from 'vs/workbench/common/theme';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';

export class CommandCenterControl {

	private readonly _disposables = new DisposableStore();

	private readonly _onDidChangeVisibility = new Emitter<void>();
	readonly onDidChangeVisibility: Event<void> = this._onDidChangeVisibility.event;

	readonly element: HTMLElement = document.createElement('div');

	constructor(
		windowTitle: WindowTitle,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService menuService: IMenuService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IKeybindingService keybindingService: IKeybindingService,
	) {
		this.element.classList.add('command-center');

		const hoverDelegate = new class implements IHoverDelegate {

			private _lastHoverHideTime: number = 0;

			readonly showHover = hoverService.showHover.bind(hoverService);
			readonly placement = 'element';

			get delay(): number {
				return Date.now() - this._lastHoverHideTime < 200
					? 0  // show instantly when a hover was recently shown
					: configurationService.getValue<number>('workbench.hover.delay');
			}

			onDidHideHover() {
				this._lastHoverHideTime = Date.now();
			}
		};

		const titleToolbar = new ToolBar(this.element, contextMenuService, {
			actionViewItemProvider: (action) => {

				if (action instanceof MenuItemAction && action.id === 'workbench.action.quickOpen') {

					class InputLikeViewItem extends MenuEntryActionViewItem {

						private readonly workspaceTitle = document.createElement('span');

						override render(container: HTMLElement): void {
							super.render(container);
							container.classList.add('quickopen');

							assertType(this.label);
							this.label.classList.add('search');

							const searchIcon = renderIcon(Codicon.search);
							searchIcon.classList.add('search-icon');

							this.workspaceTitle.classList.add('search-label');
							this._updateFromWindowTitle();
							reset(this.label, searchIcon, this.workspaceTitle);
							this._renderAllQuickPickItem(container);

							this._store.add(windowTitle.onDidChange(this._updateFromWindowTitle, this));
						}

						private _updateFromWindowTitle() {

							// label: just workspace name and optional decorations
							const { prefix, suffix } = windowTitle.getTitleDecorations();
							let label = windowTitle.workspaceName;
							if (!label) {
								label = localize('label.dfl', "Search");
							}
							if (prefix) {
								label = localize('label1', "{0} {1}", prefix, label);
							}
							if (suffix) {
								label = localize('label2', "{0} {1}", label, suffix);
							}
							this.workspaceTitle.innerText = label;

							// tooltip: full windowTitle
							const kb = keybindingService.lookupKeybinding(action.id)?.getLabel();
							const title = kb
								? localize('title', "Search {0} ({1}) \u2014 {2}", windowTitle.workspaceName, kb, windowTitle.value)
								: localize('title2', "Search {0} \u2014 {1}", windowTitle.workspaceName, windowTitle.value);
							this._applyUpdateTooltip(title);
						}

						private _renderAllQuickPickItem(parent: HTMLElement): void {
							const container = document.createElement('span');
							container.classList.add('all-options');
							parent.appendChild(container);
							const action = new Action('all', localize('all', "Show Search Modes..."), Codicon.chevronDown.classNames, true, () => {
								quickInputService.quickAccess.show('?');
							});
							const dropdown = new ActionViewItem(undefined, action, { icon: true, label: false, hoverDelegate });
							dropdown.render(container);
							this._store.add(dropdown);
							this._store.add(action);
						}
					}
					return instantiationService.createInstance(InputLikeViewItem, action, { hoverDelegate });
				}

				return createActionViewItem(instantiationService, action, { hoverDelegate });
			}
		});
		const menu = this._disposables.add(menuService.createMenu(MenuId.CommandCenter, contextKeyService));
		const menuDisposables = this._disposables.add(new DisposableStore());
		const menuUpdater = () => {
			menuDisposables.clear();
			const actions: IAction[] = [];
			menuDisposables.add(createAndFillInContextMenuActions(menu, undefined, actions));
			titleToolbar.setActions(actions);
		};
		menuUpdater();
		this._disposables.add(menu.onDidChange(menuUpdater));
		this._disposables.add(keybindingService.onDidUpdateKeybindings(() => {
			menuUpdater();
		}));
		this._disposables.add(quickInputService.onShow(this._setVisibility.bind(this, false)));
		this._disposables.add(quickInputService.onHide(this._setVisibility.bind(this, true)));
	}

	private _setVisibility(show: boolean): void {
		this.element.classList.toggle('hide', !show);
		this._onDidChangeVisibility.fire();
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

// --- theme colors

// foreground (inactive and active)
colors.registerColor(
	'commandCenter.foreground',
	{ dark: TITLE_BAR_ACTIVE_FOREGROUND, hcDark: TITLE_BAR_ACTIVE_FOREGROUND, light: TITLE_BAR_ACTIVE_FOREGROUND, hcLight: TITLE_BAR_ACTIVE_FOREGROUND },
	localize('commandCenter-foreground', "Foreground color of the command center"),
	false
);
colors.registerColor(
	'commandCenter.activeForeground',
	{ dark: MENUBAR_SELECTION_FOREGROUND, hcDark: MENUBAR_SELECTION_FOREGROUND, light: MENUBAR_SELECTION_FOREGROUND, hcLight: MENUBAR_SELECTION_FOREGROUND },
	localize('commandCenter-activeForeground', "Active foreground color of the command center"),
	false
);
// background (inactive and active)
colors.registerColor(
	'commandCenter.background',
	{ dark: null, hcDark: null, light: null, hcLight: null },
	localize('commandCenter-background', "Background color of the command center"),
	false
);
const activeBackground = colors.registerColor(
	'commandCenter.activeBackground',
	{ dark: MENUBAR_SELECTION_BACKGROUND, hcDark: MENUBAR_SELECTION_BACKGROUND, light: MENUBAR_SELECTION_BACKGROUND, hcLight: MENUBAR_SELECTION_BACKGROUND },
	localize('commandCenter-activeBackground', "Active background color of the command center"),
	false
);
// border: defaults to active background
colors.registerColor(
	'commandCenter.border',
	{ dark: activeBackground, hcDark: colors.inputBorder, light: activeBackground, hcLight: colors.inputBorder },
	localize('commandCenter-border', "Border color of the command center"),
	false
);
