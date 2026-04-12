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
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { Action, ActionRunner } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import * as strings from '../../../../base/common/strings.js';
import * as nls from '../../../../nls.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
const collapseIcon = registerIcon('review-comment-collapse', Codicon.chevronUp, nls.localize('collapseIcon', 'Icon to collapse a review comment.'));
const COLLAPSE_ACTION_CLASS = 'expand-review-action ' + ThemeIcon.asClassName(collapseIcon);
const DELETE_ACTION_CLASS = 'expand-review-action ' + ThemeIcon.asClassName(Codicon.trashcan);
function threadHasComments(comments) {
    return !!comments && comments.length > 0;
}
let CommentThreadHeader = class CommentThreadHeader extends Disposable {
    constructor(container, _delegate, _commentMenus, _commentThread, _contextKeyService, _instantiationService, _contextMenuService) {
        super();
        this._delegate = _delegate;
        this._commentMenus = _commentMenus;
        this._commentThread = _commentThread;
        this._contextKeyService = _contextKeyService;
        this._instantiationService = _instantiationService;
        this._contextMenuService = _contextMenuService;
        this._headElement = dom.$('.head');
        container.appendChild(this._headElement);
        this._register(toDisposable(() => this._headElement.remove()));
        this._fillHead();
    }
    _fillHead() {
        const titleElement = dom.append(this._headElement, dom.$('.review-title'));
        this._headingLabel = dom.append(titleElement, dom.$('span.filename'));
        this.createThreadLabel();
        const actionsContainer = dom.append(this._headElement, dom.$('.review-actions'));
        this._actionbarWidget = new ActionBar(actionsContainer, {
            actionViewItemProvider: createActionViewItem.bind(undefined, this._instantiationService)
        });
        this._register(this._actionbarWidget);
        const collapseClass = threadHasComments(this._commentThread.comments) ? COLLAPSE_ACTION_CLASS : DELETE_ACTION_CLASS;
        this._collapseAction = new Action("workbench.action.hideComment" /* CommentCommandId.Hide */, nls.localize('label.collapse', "Collapse"), collapseClass, true, () => this._delegate.collapse());
        if (!threadHasComments(this._commentThread.comments)) {
            const commentsChanged = this._register(new MutableDisposable());
            commentsChanged.value = this._commentThread.onDidChangeComments(() => {
                if (threadHasComments(this._commentThread.comments)) {
                    this._collapseAction.class = COLLAPSE_ACTION_CLASS;
                    commentsChanged.clear();
                }
            });
        }
        const menu = this._commentMenus.getCommentThreadTitleActions(this._contextKeyService);
        this._register(menu);
        this.setActionBarActions(menu);
        this._register(menu);
        this._register(menu.onDidChange(e => {
            this.setActionBarActions(menu);
        }));
        this._register(dom.addDisposableListener(this._headElement, dom.EventType.CONTEXT_MENU, e => {
            return this.onContextMenu(e);
        }));
        this._actionbarWidget.context = this._commentThread;
    }
    setActionBarActions(menu) {
        const groups = menu.getActions({ shouldForwardArgs: true }).reduce((r, [, actions]) => [...r, ...actions], []);
        this._actionbarWidget.clear();
        this._actionbarWidget.push([...groups, this._collapseAction], { label: false, icon: true });
    }
    updateCommentThread(commentThread) {
        this._commentThread = commentThread;
        this._actionbarWidget.context = this._commentThread;
        this.createThreadLabel();
    }
    createThreadLabel() {
        let label;
        label = this._commentThread.label;
        if (label === undefined) {
            if (!(this._commentThread.comments && this._commentThread.comments.length)) {
                label = nls.localize('startThread', "Start discussion");
            }
        }
        if (label) {
            this._headingLabel.textContent = strings.escape(label);
            this._headingLabel.setAttribute('aria-label', label);
        }
    }
    updateHeight(headHeight) {
        this._headElement.style.height = `${headHeight}px`;
        this._headElement.style.lineHeight = this._headElement.style.height;
    }
    onContextMenu(e) {
        const actions = this._commentMenus.getCommentThreadTitleContextActions(this._contextKeyService);
        if (!actions.length) {
            return;
        }
        const event = new StandardMouseEvent(dom.getWindow(this._headElement), e);
        if (!this._contextMenuActionRunner) {
            this._contextMenuActionRunner = this._register(new ActionRunner());
        }
        this._contextMenuService.showContextMenu({
            getAnchor: () => event,
            getActions: () => actions,
            actionRunner: this._contextMenuActionRunner,
            getActionsContext: () => {
                return {
                    commentControlHandle: this._commentThread.controllerHandle,
                    commentThreadHandle: this._commentThread.commentThreadHandle,
                    $mid: 7 /* MarshalledId.CommentThread */
                };
            },
        });
    }
};
CommentThreadHeader = __decorate([
    __param(4, IContextKeyService),
    __param(5, IInstantiationService),
    __param(6, IContextMenuService)
], CommentThreadHeader);
export { CommentThreadHeader };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudFRocmVhZEhlYWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudFRocmVhZEhlYWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFlLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hILE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFHOUQsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUV2RyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDakYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRTlGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBSTVFLE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyx5QkFBeUIsRUFBRSxPQUFPLENB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