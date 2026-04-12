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
import './media/agentFeedbackEditorOverlay.css';
import { Disposable, DisposableMap, DisposableStore, combinedDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Event } from '../../../../base/common/event.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { EditorGroupView } from '../../../../workbench/browser/parts/editor/editorGroupView.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { hasSessionAgentFeedback, hasSessionEditorComments, navigateNextFeedbackActionId, navigatePreviousFeedbackActionId, navigationBearingFakeActionId, submitFeedbackActionId } from './agentFeedbackEditorActions.js';
import { assertType } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { getActiveResourceCandidates, getSessionForResource } from './agentFeedbackEditorUtils.js';
import { Menus } from '../../../browser/menus.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { getSessionEditorComments, hasAgentFeedbackComments } from './sessionEditorComments.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
class AgentFeedbackActionViewItem extends ActionViewItem {
    constructor(action, options, _keybindingService, _primaryActionIds = [submitFeedbackActionId]) {
        const isIconOnly = action.id === navigatePreviousFeedbackActionId || action.id === navigateNextFeedbackActionId;
        super(undefined, action, { ...options, icon: isIconOnly, label: !isIconOnly, keybindingNotRenderedWithLabel: true });
        this._keybindingService = _keybindingService;
        this._primaryActionIds = _primaryActionIds;
    }
    render(container) {
        super.render(container);
        if (this._primaryActionIds.includes(this._action.id)) {
            this.element?.classList.add('primary');
        }
    }
    getTooltip() {
        const value = super.getTooltip();
        if (!value || this.options.keybinding) {
            return value;
        }
        return this._keybindingService.appendKeybinding(value, this._action.id);
    }
}
let AgentFeedbackOverlayWidget = class AgentFeedbackOverlayWidget extends Disposable {
    constructor(_instaService, _keybindingService) {
        super();
        this._instaService = _instaService;
        this._keybindingService = _keybindingService;
        this._showStore = this._store.add(new DisposableStore());
        this._navigationBearings = observableValue(this, { activeIdx: -1, totalCount: 0 });
        this._domNode = document.createElement('div');
        this._domNode.classList.add('agent-feedback-editor-overlay-widget');
        this._toolbarNode = document.createElement('div');
        this._toolbarNode.classList.add('agent-feedback-editor-overlay-toolbar');
    }
    getDomNode() {
        return this._domNode;
    }
    show(navigationBearings) {
        this._showStore.clear();
        this._navigationBearings.set(navigationBearings, undefined);
        if (!this._domNode.contains(this._toolbarNode)) {
            this._domNode.appendChild(this._toolbarNode);
        }
        this._showStore.add(this._instaService.createInstance(MenuWorkbenchToolBar, this._toolbarNode, Menus.AgentFeedbackEditorContent, {
            telemetrySource: 'agentFeedback.overlayToolbar',
            hiddenItemStrategy: 0 /* HiddenItemStrategy.Ignore */,
            toolbarOptions: {
                primaryGroup: () => true,
                useSeparatorsInPrimaryActions: true
            },
            menuOptions: { renderShortTitle: true },
            actionViewItemProvider: (action, options) => {
                if (action.id === navigationBearingFakeActionId) {
                    const that = this;
                    return new class extends ActionViewItem {
                        constructor() {
                            super(undefined, action, { ...options, icon: false, label: true, keybindingNotRenderedWithLabel: true });
                        }
                        render(container) {
                            super.render(container);
                            container.classList.add('label-item');
                            this._store.add(autorun(r => {
                                assertType(this.label);
                                const { activeIdx, totalCount } = that._navigationBearings.read(r);
                                if (totalCount > 0) {
                                    const current = activeIdx === -1 ? 1 : activeIdx + 1;
                                    this.label.innerText = localize('nOfM', '{0}/{1}', current, totalCount);
                                }
                                else {
                                    this.label.innerText = localize('zero', '0/0');
                                }
                            }));
                        }
                    };
                }
                return new AgentFeedbackActionViewItem(action, options, this._keybindingService);
            },
        }));
        this._showStore.add(toDisposable(() => this._toolbarNode.remove()));
    }
    hide() {
        this._showStore.clear();
        this._navigationBearings.set({ activeIdx: -1, totalCount: 0 }, undefined);
        this._toolbarNode.remove();
    }
};
AgentFeedbackOverlayWidget = __decorate([
    __param(0, IInstantiationService),
    __param(1, IKeybindingService)
], AgentFeedbackOverlayWidget);
export { AgentFeedbackOverlayWidget };
let AgentFeedbackOverlayController = class AgentFeedbackOverlayController {
    constructor(container, group, agentFeedbackService, sessionsManagementService, instaService, chatEditingService, contextKeyService, codeReviewService) {
        this._store = new DisposableStore();
        this._domNode = document.createElement('div');
        this._domNode.classList.add('agent-feedback-editor-overlay');
        this._domNode.style.position = 'absolute';
        this._domNode.style.bottom = '24px';
        this._domNode.style.right = '24px';
        this._domNode.style.zIndex = '100';
        const widget = this._store.add(instaService.createInstance(AgentFeedbackOverlayWidget));
        this._domNode.appendChild(widget.getDomNode());
        this._store.add(toDisposable(() => this._domNode.remove()));
        const hasCommentsContext = hasSessionEditorComments.bindTo(contextKeyService);
        const hasAgentFeedbackContext = hasSessionAgentFeedback.bindTo(contextKeyService);
        const show = () => {
            if (!container.contains(this._domNode)) {
                container.appendChild(this._domNode);
            }
        };
        const hide = () => {
            if (container.contains(this._domNode)) {
                widget.hide();
                this._domNode.remove();
            }
        };
        const activeSignal = observableSignalFromEvent(this, Event.any(group.onDidActiveEditorChange, group.onDidModelChange, agentFeedbackService.onDidChangeFeedback, agentFeedbackService.onDidChangeNavigation));
        this._store.add(autorun(r => {
            activeSignal.read(r);
            const candidates = getActiveResourceCandidates(group.activeEditorPane?.input);
            let navigationBearings = undefined;
            let hasAgentFeedback = false;
            for (const candidate of candidates) {
                const sessionResource = getSessionForResource(candidate, chatEditingService, sessionsManagementService);
                if (!sessionResource) {
                    continue;
                }
                const comments = getSessionEditorComments(sessionResource, agentFeedbackService.getFeedback(sessionResource), codeReviewService.getReviewState(sessionResource).read(r), codeReviewService.getPRReviewState(sessionResource).read(r));
                if (comments.length > 0) {
                    navigationBearings = agentFeedbackService.getNavigationBearing(sessionResource, comments);
                    hasAgentFeedback = hasAgentFeedbackComments(comments);
                    break;
                }
            }
            if (!navigationBearings) {
                hasCommentsContext.set(false);
                hasAgentFeedbackContext.set(false);
                hide();
                return;
            }
            hasCommentsContext.set(true);
            hasAgentFeedbackContext.set(hasAgentFeedback);
            widget.show(navigationBearings);
            show();
        }));
    }
    dispose() {
        this._store.dispose();
    }
};
AgentFeedbackOverlayController = __decorate([
    __param(2, IAgentFeedbackService),
    __param(3, ISessionsManagementService),
    __param(4, IInstantiationService),
    __param(5, IChatEditingService),
    __param(6, IContextKeyService),
    __param(7, ICodeReviewService)
], AgentFeedbackOverlayController);
let AgentFeedbackEditorOverlay = class AgentFeedbackEditorOverlay {
    static { this.ID = 'chat.agentFeedback.editorOverlay'; }
    constructor(editorGroupsService, instantiationService) {
        this._store = new DisposableStore();
        const editorGroups = observableFromEvent(this, Event.any(editorGroupsService.onDidAddGroup, editorGroupsService.onDidRemoveGroup), () => editorGroupsService.groups);
        const overlayWidgets = this._store.add(new DisposableMap());
        this._store.add(autorun(r => {
            const groups = editorGroups.read(r);
            const toDelete = new Set(overlayWidgets.keys());
            for (const group of groups) {
                if (!(group instanceof EditorGroupView)) {
                    continue;
                }
                toDelete.delete(group);
                if (!overlayWidgets.has(group)) {
                    const scopedInstaService = instantiationService.createChild(new ServiceCollection([IContextKeyService, group.scopedContextKeyService]));
                    const ctrl = scopedInstaService.createInstance(AgentFeedbackOverlayController, group.element, group);
                    overlayWidgets.set(group, combinedDisposable(ctrl, scopedInstaService));
                }
            }
            for (const group of toDelete) {
                overlayWidgets.deleteAndDispose(group);
            }
        }));
    }
    dispose() {
        this._store.dispose();
    }
};
AgentFeedbackEditorOverlay = __decorate([
    __param(0, IEditorGroupsService),
    __param(1, IInstantiationService)
], AgentFeedbackEditorOverlay);
export { AgentFeedbackEditorOverlay };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja0VkaXRvck92ZXJsYXkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrRWRpdG9yT3ZlcmxheS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLHdDQUF3QyxDQUFDO0FBQ2hELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxrQkFBa0IsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwSSxPQUFPLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLGVBQWUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxjQUFjLEVBQThCLE1BQU0sMERBQTBELENBQUM7QUFFdEgsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBc0Isb0JBQW9CLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUMzRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUUxRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDaEcsT0FBTyxFQUFnQixvQkFBb0IsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQ3pILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSx3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