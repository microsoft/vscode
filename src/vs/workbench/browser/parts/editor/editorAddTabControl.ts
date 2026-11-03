/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { DropdownMenuActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { getFlatActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { WorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';

export interface IEditorAddTabControlOptions {

	/**
	 * Element before which the control is inserted. Appended to the parent when omitted.
	 */
	readonly before?: HTMLElement;

	/**
	 * Resolves keybindings shown in the dropdown. Defaults to a lookup in the given context key service.
	 */
	readonly keybindingProvider?: (action: IAction) => ResolvedKeybinding | undefined;
}

/**
 * The "Add Tab" (`+`) dropdown that lists the actions of a contributed menu.
 * The control element carries the `hidden` class while the menu has no actions.
 */
export class EditorAddTabControl extends Disposable {

	readonly element: HTMLElement;

	private readonly _onDidChangeVisibility = this._register(new Emitter<void>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	get visible(): boolean {
		return !this.element.classList.contains('hidden');
	}

	constructor(
		parent: HTMLElement,
		menuId: MenuId,
		contextKeyService: IContextKeyService,
		options: IEditorAddTabControlOptions | undefined,
		@IMenuService menuService: IMenuService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.element = $('.tabs-bar-add-tab');
		parent.insertBefore(this.element, options?.before ?? null);

		const menu = this._register(menuService.createMenu(menuId, contextKeyService));
		const getActions = () => getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
		const addTabAction = toAction({
			id: 'editor.tabs.addTab',
			label: localize('addTab', "Add Tab"),
			class: ThemeIcon.asClassName(Codicon.add),
			run: () => { }
		});
		const dropdown = this._register(new DropdownMenuActionViewItem(addTabAction, { getActions }, contextMenuService, {
			classNames: ThemeIcon.asClassNameArray(Codicon.add),
			keybindingProvider: options?.keybindingProvider ?? (action => keybindingService.lookupKeybinding(action.id, contextKeyService))
		}));
		const toolbar = this._register(instantiationService.createInstance(WorkbenchToolBar, this.element, {
			ariaLabel: localize('ariaLabelAddTab', "Add Tab"),
			actionViewItemProvider: action => action === addTabAction ? dropdown : undefined
		}));
		toolbar.setActions([addTabAction]);

		const updateVisibility = () => this.element.classList.toggle('hidden', getActions().length === 0);
		updateVisibility();
		this._register(menu.onDidChange(() => {
			const wasVisible = this.visible;
			updateVisibility();
			if (wasVisible !== this.visible) {
				this._onDidChangeVisibility.fire();
			}
		}));
	}
}
