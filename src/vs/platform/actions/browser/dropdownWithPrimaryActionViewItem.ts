/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { ActionViewItem, BaseActionViewItem } from '../../../base/browser/ui/actionbar/actionViewItems.js';
import { DropdownMenuActionViewItem } from '../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAction, IActionRunner } from '../../../base/common/actions.js';
import { Event } from '../../../base/common/event.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { ResolvedKeybinding } from '../../../base/common/keybindings.js';
import { MenuEntryActionViewItem } from './menuEntryActionViewItem.js';
import { MenuItemAction } from '../common/actions.js';
import { IContextKeyService } from '../../contextkey/common/contextkey.js';
import { IKeybindingService } from '../../keybinding/common/keybinding.js';
import { INotificationService } from '../../notification/common/notification.js';
import { IThemeService } from '../../theme/common/themeService.js';
import { IContextMenuService } from '../../contextview/browser/contextView.js';
import { IAccessibilityService } from '../../accessibility/common/accessibility.js';
import { IHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegate.js';

export interface IDropdownWithPrimaryActionViewItemOptions {
	actionRunner?: IActionRunner;
	getKeyBinding?: (action: IAction) => ResolvedKeybinding | undefined;
	hoverDelegate?: IHoverDelegate;
	menuAsChild?: boolean;
}

export class DropdownWithPrimaryActionViewItem extends BaseActionViewItem {
	private _primaryAction: ActionViewItem;
	private _dropdown: DropdownMenuActionViewItem;
	private _container: HTMLElement | null = null;
	private _dropdownContainer: HTMLElement | null = null;

	get onDidChangeDropdownVisibility(): Event<boolean> {
		return this._dropdown.onDidChangeVisibility;
	}

	constructor(
		primaryAction: MenuItemAction,
		dropdownAction: IAction,
		dropdownMenuActions: IAction[],
		className: string,
		private readonly _contextMenuProvider: IContextMenuService,
		private readonly _options: IDropdownWithPrimaryActionViewItemOptions | undefined,
		@IKeybindingService _keybindingService: IKeybindingService,
		@INotificationService _notificationService: INotificationService,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IThemeService _themeService: IThemeService,
		@IAccessibilityService _accessibilityService: IAccessibilityService
	) {
		super(null, primaryAction, { hoverDelegate: _options?.hoverDelegate });
		this._primaryAction = new MenuEntryActionViewItem(primaryAction, { hoverDelegate: _options?.hoverDelegate }, _keybindingService, _notificationService, _contextKeyService, _themeService, _contextMenuProvider, _accessibilityService);
		if (_options?.actionRunner) {
			this._primaryAction.actionRunner = _options.actionRunner;
		}

		this._dropdown = new DropdownMenuActionViewItem(dropdownAction, dropdownMenuActions, this._contextMenuProvider, {
			menuAsChild: _options?.menuAsChild ?? true,
			classNames: className ? ['codicon', 'codicon-chevron-down', className] : ['codicon', 'codicon-chevron-down'],
			actionRunner: this._options?.actionRunner,
			keybindingProvider: this._options?.getKeyBinding,
			hoverDelegate: _options?.hoverDelegate
		});
	}

	override setActionContext(newContext: unknown): void {
		super.setActionContext(newContext);
		this._primaryAction.setActionContext(newContext);
		this._dropdown.setActionContext(newContext);
	}

	override render(container: HTMLElement): void {
		this._container = container;
		super.render(this._container);
		this._container.classList.add('monaco-dropdown-with-primary');
		const primaryContainer = DOM.$('.action-container');
		this._primaryAction.render(DOM.append(this._container, primaryContainer));
		this._dropdownContainer = DOM.$('.dropdown-action-container');
		this._dropdown.render(DOM.append(this._container, this._dropdownContainer));
		this._register(DOM.addDisposableListener(primaryContainer, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.RightArrow)) {
				this._primaryAction.element!.tabIndex = -1;
				this._dropdown.focus();
				event.stopPropagation();
			}
		}));
		this._register(DOM.addDisposableListener(this._dropdownContainer, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.equals(KeyCode.LeftArrow)) {
				this._primaryAction.element!.tabIndex = 0;
				this._dropdown.setFocusable(false);
				this._primaryAction.element?.focus();
				event.stopPropagation();
			}
		}));

		this.updateEnabled();
	}

	override focus(fromRight?: boolean): void {
		if (fromRight) {
			this._dropdown.focus();
		} else {
			this._primaryAction.element!.tabIndex = 0;
			this._primaryAction.element!.focus();
		}
	}

	override blur(): void {
		this._primaryAction.element!.tabIndex = -1;
		this._dropdown.blur();
		this._container!.blur();
	}

	override setFocusable(focusable: boolean): void {
		if (focusable) {
			this._primaryAction.element!.tabIndex = 0;
		} else {
			this._primaryAction.element!.tabIndex = -1;
			this._dropdown.setFocusable(false);
		}
	}

	protected override updateEnabled(): void {
		const disabled = !this.action.enabled;
		this.element?.classList.toggle('disabled', disabled);
	}

	update(dropdownAction: IAction, dropdownMenuActions: IAction[], dropdownIcon?: string): void {
		this._dropdown.dispose();
		this._dropdown = new DropdownMenuActionViewItem(dropdownAction, dropdownMenuActions, this._contextMenuProvider, {
			menuAsChild: true,
			classNames: ['codicon', dropdownIcon || 'codicon-chevron-down'],
			actionRunner: this._options?.actionRunner,
			hoverDelegate: this._options?.hoverDelegate,
			keybindingProvider: this._options?.getKeyBinding
		});
		if (this._dropdownContainer) {
			this._dropdown.render(this._dropdownContainer);
		}
	}

	override dispose() {
		this._primaryAction.dispose();
		this._dropdown.dispose();
		super.dispose();
	}
}
