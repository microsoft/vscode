/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button, ButtonWithDropdown } from 'vs/base/browser/ui/button/button';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IMenu } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { defaultButtonStyles } from 'vs/platform/theme/browser/defaultStyles';
import { CommentCommandId } from 'vs/workbench/contrib/comments/common/commentCommandIds';

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
		private readonly maxActions?: number
	) { }

	setActions(menu: IMenu, hasOnlySecondaryActions: boolean = false) {
		this._toDispose.clear();

		this._buttonElements.forEach(b => b.remove());
		this._buttonElements = [];

		const groups = menu.getActions({ shouldForwardArgs: true });
		let isPrimary: boolean = !hasOnlySecondaryActions;
		for (const group of groups) {
			const [groupId, actions] = group;

			this._actions = actions;
			for (const current of groupId === 'inline' ? actions : [actions]) {
				const [action, dropDownActions] = Array.isArray(current) ? [current[0], current.slice(1)] : [current, []];
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
