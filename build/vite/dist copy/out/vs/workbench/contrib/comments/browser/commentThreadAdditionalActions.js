/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CommentFormActions } from './commentFormActions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
let CommentThreadAdditionalActions = class CommentThreadAdditionalActions extends Disposable {
    constructor(container, _commentThread, _contextKeyService, _commentMenus, _actionRunDelegate, _keybindingService, _contextMenuService) {
        super();
        this._commentThread = _commentThread;
        this._contextKeyService = _contextKeyService;
        this._commentMenus = _commentMenus;
        this._actionRunDelegate = _actionRunDelegate;
        this._keybindingService = _keybindingService;
        this._contextMenuService = _contextMenuService;
        this._container = dom.append(container, dom.$('.comment-additional-actions'));
        dom.append(this._container, dom.$('.section-separator'));
        this._buttonBar = dom.append(this._container, dom.$('.button-bar'));
        this._createAdditionalActions(this._buttonBar);
    }
    _showMenu() {
        this._container?.classList.remove('hidden');
    }
    _hideMenu() {
        this._container?.classList.add('hidden');
    }
    _enableDisableMenu(menu) {
        const groups = menu.getActions({ shouldForwardArgs: true });
        // Show the menu if at least one action is enabled.
        for (const group of groups) {
            const [, actions] = group;
            for (const action of actions) {
                if (action.enabled) {
                    this._showMenu();
                    return;
                }
                for (const subAction of action.actions ?? []) {
                    if (subAction.enabled) {
                        this._showMenu();
                        return;
                    }
                }
            }
        }
        this._hideMenu();
    }
    _createAdditionalActions(container) {
        const menu = this._commentMenus.getCommentThreadAdditionalActions(this._contextKeyService);
        this._register(menu);
        this._register(menu.onDidChange(() => {
            this._commentFormActions.setActions(menu, /*hasOnlySecondaryActions*/ true);
            this._enableDisableMenu(menu);
        }));
        this._commentFormActions = new CommentFormActions(this._keybindingService, this._contextKeyService, this._contextMenuService, container, async (action) => {
            this._actionRunDelegate?.();
            action.run({
                thread: this._commentThread,
                $mid: 8 /* MarshalledId.CommentThreadInstance */
            });
        }, 4, true);
        this._register(this._commentFormActions);
        this._commentFormActions.setActions(menu, /*hasOnlySecondaryActions*/ true);
        this._enableDisableMenu(menu);
    }
};
CommentThreadAdditionalActions = __decorate([
    __param(5, IKeybindingService),
    __param(6, IContextMenuService)
], CommentThreadAdditionalActions);
export { CommentThreadAdditionalActions };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudFRocmVhZEFkZGl0aW9uYWxBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50VGhyZWFkQWRkaXRpb25hbEFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUl2RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFLbEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFHN0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFFdkYsSUFBTSw4QkFBOEIsR0FBcEMsTUFBTSw4QkFBOEQsU0FBUSxVQUFVO0lBSzVGLFlBQ0MsU0FBc0IsRUFDZCxjQUEwQyxFQUMxQyxrQkFBc0MsRUFDdEMsYUFBMkIsRUFDM0Isa0JBQXVDLEVBQ25CLGtCQUFzQyxFQUNyQyxtQkFBd0M7UUFFckUsS0FBSyxFQUFFLENBQUM7UUFQQSxtQkFBYyxHQUFkLGNBQWMsQ0FBNEI7UUFDMUMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUN0QyxrQkFBYSxHQUFiLGFBQWEsQ0FBYztRQUMzQix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQ25CLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDckMsd0JBQW1CLEdBQW5CLG1CQUFtQixDQUFxQjtRQUlyRSxJQUFJLENBQUMsVUFBVSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDO1FB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