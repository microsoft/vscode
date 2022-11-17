/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button, ButtonWithDropdown, IButton } from 'vs/base/browser/ui/button/button';
import { IAction } from 'vs/base/common/actions';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IMenu, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

export class CommentFormActions implements IDisposable {
	private _buttonElements: HTMLElement[] = [];
	private readonly _toDispose = new DisposableStore();
	private _actions: IAction[] = [];

	constructor(
		private container: HTMLElement,
		private actionHandler: (action: IAction) => void,
		private contextMenuService?: IContextMenuService
	) { }

	setActions(menu: IMenu, hasOnlySecondaryActions: boolean = false) {
		this._toDispose.clear();

		this._buttonElements.forEach(b => b.remove());

		const groups = menu.getActions({ shouldForwardArgs: true });
		let isPrimary: boolean = !hasOnlySecondaryActions;
		for (const group of groups) {
			const [, actions] = group;

			this._actions = actions;
			for (const action of actions) {
				const submenuAction = action as SubmenuItemAction;

				// Use the first action from the submenu as the primary button.
				const appliedAction: IAction = submenuAction.actions?.length > 0 ? submenuAction.actions[0] : action;
				let button: IButton | undefined;

				// Use dropdown only if submenu contains more than 1 action.
				if (submenuAction.actions?.length > 1 && this.contextMenuService) {
					button = new ButtonWithDropdown(this.container,
						{
							contextMenuProvider: this.contextMenuService,
							actions: submenuAction.actions.slice(1),
							addPrimaryActionToDropdown: false,
							secondary: !isPrimary,
							...defaultButtonStyles
						});
				} else {
					button = new Button(this.container, { secondary: !isPrimary, ...defaultButtonStyles });
				}

				isPrimary = false;
				this._buttonElements.push(button.element);

				this._toDispose.add(button);
				this._toDispose.add(button.onDidClick(() => this.actionHandler(appliedAction)));

				button.enabled = appliedAction.enabled;
				button.label = appliedAction.label;
			}
		}
	}

	triggerDefaultAction() {
		if (this._actions.length) {
			const lastAction = this._actions[0];

			if (lastAction.enabled) {
				this.actionHandler(lastAction);
			}
		}
	}

	dispose() {
		this._toDispose.dispose();
	}
}
