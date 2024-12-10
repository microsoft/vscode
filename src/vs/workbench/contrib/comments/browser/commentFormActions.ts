/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button, ButtonWithDropdown } from '../../../../base/browser/ui/button/button.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { IMenu, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { CommentCommandId } from '../common/commentCommandIds.js';

export class CommentFormActions implements IDisposable {
	private _buttonElements: HTMLElement[] = [];
	private readonly _toDispose = new DisposableStore();
	private _actions: IAction[] = [];

	constructor(
		private readonly keybindingService: IKeybindingService,
		private readonly contextKeyService: IContextKeyService,
		private readonly contextMenuService: IContextMenuService,
		private container: HTMLElement,
		private actionHandler: (action: IAction) => void,
		private readonly maxActions?: number,
		private readonly supportDropdowns?: boolean,
	) { }

	setActions(menu: IMenu, hasOnlySecondaryActions: boolean = false) {
		this._toDispose.clear();

		this._buttonElements.forEach(b => b.remove());
		this._buttonElements = [];

		const groups = menu.getActions({ shouldForwardArgs: true });
		let isPrimary: boolean = !hasOnlySecondaryActions;
		for (const group of groups) {
			const [, actions] = group;

			this._actions = actions;
			for (const current of actions) {
				const dropDownActions = this.supportDropdowns && current instanceof SubmenuItemAction ? current.actions : [];
				const action = dropDownActions.length ? dropDownActions[0] : current;
				let keybinding = this.keybindingService.lookupKeybinding(action.id, this.contextKeyService)?.getLabel();
				if (!keybinding && isPrimary) {
					keybinding = this.keybindingService.lookupKeybinding(CommentCommandId.Submit, this.contextKeyService)?.getLabel();
				}
				const title = keybinding ? `${action.label} (${keybinding})` : action.label;
				const actionHandler = this.actionHandler;
				const button = dropDownActions.length ? new ButtonWithDropdown(this.container, {
					contextMenuProvider: this.contextMenuService,
					actions: dropDownActions,
					actionRunner: new class extends ActionRunner {
						protected override async runAction(action: IAction, context?: unknown): Promise<void> {
							return actionHandler(action);
						}
					},
					secondary: !isPrimary,
					title,
					addPrimaryActionToDropdown: false,
					...defaultButtonStyles
				}) : new Button(this.container, { secondary: !isPrimary, title, ...defaultButtonStyles });

				isPrimary = false;
				this._buttonElements.push(button.element);

				this._toDispose.add(button);
				this._toDispose.add(button.onDidClick(() => this.actionHandler(action)));

				button.enabled = action.enabled;
				button.label = action.label;
				if ((this.maxActions !== undefined) && (this._buttonElements.length >= this.maxActions)) {
					console.warn(`An extension has contributed more than the allowable number of actions to a comments menu.`);
					return;
				}
			}
		}
	}

	triggerDefaultAction() {
		if (this._actions.length) {
			const lastAction = this._actions[0];

			if (lastAction.enabled) {
				return this.actionHandler(lastAction);
			}
		}
	}

	dispose() {
		this._toDispose.dispose();
	}
}
