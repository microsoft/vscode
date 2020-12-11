/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IActionViewItemProvider, IAction } from 'vs/base/common/actions';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { suggestWidgetStatusbarMenu } from 'vs/editor/contrib/suggest/suggest';
import { localize } from 'vs/nls';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

class StatusBarViewItem extends MenuEntryActionViewItem {

	updateLabel() {
		const kb = this._keybindingService.lookupKeybinding(this._action.id);
		if (!kb) {
			return super.updateLabel();
		}
		if (this.label) {
			this.label.textContent = localize('ddd', '{0} ({1})', this._action.label, StatusBarViewItem.symbolPrintEnter(kb));
		}
	}

	static symbolPrintEnter(kb: ResolvedKeybinding) {
		return kb.getLabel()?.replace(/\benter\b/gi, '\u23CE');
	}
}

export class SuggestWidgetStatus {

	readonly element: HTMLElement;

	private readonly _disposables = new DisposableStore();

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this.element = dom.append(container, dom.$('.suggest-status-bar'));

		const actionViewItemProvider = <IActionViewItemProvider>(action => {
			return action instanceof MenuItemAction
				? instantiationService.createInstance(StatusBarViewItem, action)
				: undefined;
		});
		const leftActions = new ActionBar(this.element, { actionViewItemProvider });
		const rightActions = new ActionBar(this.element, { actionViewItemProvider });
		const menu = menuService.createMenu(suggestWidgetStatusbarMenu, contextKeyService);

		leftActions.domNode.classList.add('left');
		rightActions.domNode.classList.add('right');

		const renderMenu = () => {
			const left: IAction[] = [];
			const right: IAction[] = [];
			for (let [group, actions] of menu.getActions()) {
				if (group === 'left') {
					left.push(...actions);
				} else {
					right.push(...actions);
				}
			}
			leftActions.clear();
			leftActions.push(left);
			rightActions.clear();
			rightActions.push(right);
		};
		this._disposables.add(menu.onDidChange(() => renderMenu()));
		this._disposables.add(menu);
	}

	dispose(): void {
		this._disposables.dispose();
		this.element.remove();
	}
}
