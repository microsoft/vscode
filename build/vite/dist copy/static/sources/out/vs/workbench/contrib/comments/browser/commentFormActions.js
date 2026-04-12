/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Button, ButtonWithDropdown } from '../../../../base/browser/ui/button/button.js';
import { ActionRunner } from '../../../../base/common/actions.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
export class CommentFormActions {
    constructor(keybindingService, contextKeyService, contextMenuService, container, actionHandler, maxActions, supportDropdowns) {
        this.keybindingService = keybindingService;
        this.contextKeyService = contextKeyService;
        this.contextMenuService = contextMenuService;
        this.container = container;
        this.actionHandler = actionHandler;
        this.maxActions = maxActions;
        this.supportDropdowns = supportDropdowns;
        this._buttonElements = [];
        this._toDispose = new DisposableStore();
        this._actions = [];
    }
    setActions(menu, hasOnlySecondaryActions = false) {
        this._toDispose.clear();
        this._buttonElements.forEach(b => b.remove());
        this._buttonElements = [];
        const groups = menu.getActions({ shouldForwardArgs: true });
        let isPrimary = !hasOnlySecondaryActions;
        for (const group of groups) {
            const [, actions] = group;
            this._actions = actions;
            for (const current of actions) {
                const dropDownActions = this.supportDropdowns && current instanceof SubmenuItemAction ? current.actions : [];
                const action = dropDownActions.length ? dropDownActions[0] : current;
                let keybinding = this.keybindingService.lookupKeybinding(action.id, this.contextKeyService)?.getLabel();
                if (!keybinding && isPrimary) {
                    keybinding = this.keybindingService.lookupKeybinding("editor.action.submitComment" /* CommentCommandId.Submit */, this.contextKeyService)?.getLabel();
                }
                const title = keybinding ? `${action.label} (${keybinding})` : action.label;
                const actionHandler = this.actionHandler;
                const button = dropDownActions.length ? new ButtonWithDropdown(this.container, {
                    contextMenuProvider: this.contextMenuService,
                    actions: dropDownActions,
                    actionRunner: this._toDispose.add(new class extends ActionRunner {
                        async runAction(action, context) {
                            return actionHandler(action);
                        }
                    }),
                    secondary: !isPrimary,
                    title,
                    addPrimaryActionToDropdown: false,
                    small: true,
                    ...defaultButtonStyles
                }) : new Button(this.container, { secondary: !isPrimary, title, small: true, ...defaultButtonStyles });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudEZvcm1BY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50Rm9ybUFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxZQUFZLEVBQVcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDcEYsT0FBTyxFQUFTLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFJMUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFHMUYsTUFBTSxPQUFPLGtCQUFrQjtJQUs5QixZQUNrQixpQkFBcUMsRUFDckMsaUJBQXFDLEVBQ3JDLGtCQUF1QyxFQUNoRCxTQUFzQixFQUN0QixhQUF3QyxFQUMvQixVQUFtQixFQUNuQixnQkFBMEI7UUFOMUIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFvQjtRQUNyQyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBQ3JDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDaEQsY0FBUyxHQUFULFNBQVMsQ0FBYTtRQUN0QixrQkFBYSxHQUFiLGFBQWEsQ0FBMkI7UUFDL0IsZUFBVSxHQUFWLFVBQVUsQ0FBUztRQUNuQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQVU7UUFYcEMsb0JBQWUsR0FBa0IsRUFBRSxDQUFDO1FBQzNCLGVBQVUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQzVDLGFBQVEsR0FBYyxFQUFFLENBQUM7SUFVN0IsQ0FBQztJQUVMLFVBQVUsQ0FBQyxJQUFXLEVBQUUsMEJBQW1DLEtB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