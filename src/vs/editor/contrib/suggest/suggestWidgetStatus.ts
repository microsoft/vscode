/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IActionViewItemProvider, IAction } from 'vs/base/common/actions';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { format } from 'vs/base/common/strings';
import { suggestWidgetStatusbarMenu } from 'vs/editor/contrib/suggest/suggest';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class SuggestWidgetStatus {

	readonly element: HTMLElement;

	private readonly _disposables = new DisposableStore();

	constructor(
		container: HTMLElement,
		@IKeybindingService keybindingService: IKeybindingService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this.element = dom.append(container, dom.$('.suggest-status-bar'));


		const actionViewItemProvider = <IActionViewItemProvider>(action => {
			const kb = keybindingService.lookupKeybindings(action.id);
			return new class extends ActionViewItem {
				constructor() {
					super(undefined, action, { label: true, icon: false });
				}
				updateLabel() {
					if (isFalsyOrEmpty(kb) || !this.label) {
						return super.updateLabel();
					}
					const { label } = this.getAction();
					this.label.textContent = /{\d}/.test(label)
						? format(this.getAction().label, kb[0].getLabel())
						: `${this.getAction().label} (${kb[0].getLabel()})`;
				}
			};
		});
		const leftActions = new ActionBar(this.element, { actionViewItemProvider });
		const rightActions = new ActionBar(this.element, { actionViewItemProvider });
		const menu = menuService.createMenu(suggestWidgetStatusbarMenu, contextKeyService);
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
