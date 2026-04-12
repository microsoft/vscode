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
import * as dom from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { combinedDisposable, Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService, isEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ChatViewId, ChatViewPaneTarget, IQuickChatService, isIChatViewViewContext } from '../chat.js';
import { ChatEditor } from '../widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../widgetHosts/editor/chatEditorInput.js';
let ChatWidgetService = class ChatWidgetService extends Disposable {
    constructor(editorGroupsService, viewsService, quickChatService, layoutService, editorService, chatService) {
        super();
        this.editorGroupsService = editorGroupsService;
        this.viewsService = viewsService;
        this.quickChatService = quickChatService;
        this.layoutService = layoutService;
        this.editorService = editorService;
        this.chatService = chatService;
        this._widgets = [];
        this._lastFocusedWidget = undefined;
        this._onDidAddWidget = this._register(new Emitter());
        this.onDidAddWidget = this._onDidAddWidget.event;
        this._onDidBackgroundSession = this._register(new Emitter());
        this.onDidBackgroundSession = this._onDidBackgroundSession.event;
        this._onDidChangeFocusedWidget = this._register(new Emitter());
        this.onDidChangeFocusedWidget = this._onDidChangeFocusedWidget.event;
        this._onDidChangeFocusedSession = this._register(new Emitter());
        this.onDidChangeFocusedSession = this._onDidChangeFocusedSession.event;
    }
    get lastFocusedWidget() {
        return this._lastFocusedWidget;
    }
    getAllWidgets() {
        return this._widgets;
    }
    getWidgetsByLocations(location) {
        return this._widgets.filter(w => w.location === location);
    }
    getWidgetByInputUri(uri) {
        return this._widgets.find(w => isEqual(w.input.inputUri, uri));
    }
    getWidgetBySessionResource(sessionResource) {
        return this._widgets.find(w => isEqual(w.viewModel?.sessionResource, sessionResource));
    }
    async revealWidget(preserveFocus) {
        const last = this.lastFocusedWidget;
        if (last && await this.reveal(last, preserveFocus)) {
            return last;
        }
        return (await this.viewsService.openView(ChatViewId, !preserveFocus))?.widget;
    }
    async reveal(widget, preserveFocus) {
        if (widget.viewModel?.sessionResource) {
            const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(widget.viewModel.sessionResource, { preserveFocus });
            if (alreadyOpenWidget) {
                return true;
            }
        }
        if (isIChatViewViewContext(widget.viewContext)) {
            const view = await this.viewsService.openView(widget.viewContext.viewId, !preserveFocus);
            if (!preserveFocus) {
                view?.focus();
            }
            return !!view;
        }
        return false;
    }
    async openSession(sessionResource, target, options) {
        // Reveal if already open unless instructed otherwise
        if (typeof target === 'undefined' || options?.revealIfOpened) {
            const alreadyOpenWidget = await this.revealSessionIfAlreadyOpen(sessionResource, options);
            if (alreadyOpenWidget) {
                return alreadyOpenWidget;
            }
        }
        else {
            await this.prepareSessionForMove(sessionResource, target);
        }
        // Load this session in chat view (preferred)
        if (target === ChatViewPaneTarget || typeof target === 'undefined') {
            const chatView = await this.viewsService.openView(ChatViewId, !options?.preserveFocus);
            if (chatView) {
                await chatView.loadSession(sessionResource);
                if (!options?.preserveFocus) {
                    chatView.focusInput();
                }
            }
            return chatView?.widget;
        }
        // Open in chat editor
        const pane = await this.editorService.openEditor({
            resource: sessionResource,
            options: {
                ...options,
                revealIfOpened: options?.revealIfOpened ?? true // always try to reveal if already opened unless explicitly told not to
            }
        }, target);
        return pane instanceof ChatEditor ? pane.widget : undefined;
    }
    async revealSessionIfAlreadyOpen(sessionResource, options) {
        // Already open in chat view?
        const chatView = this.viewsService.getViewWithId(ChatViewId);
        if (chatView?.widget.viewModel?.sessionResource && isEqual(chatView.widget.viewModel.sessionResource, sessionResource)) {
            const view = await this.viewsService.openView(ChatViewId, !options?.preserveFocus);
            if (!options?.preserveFocus) {
                view?.focus();
            }
            return chatView.widget;
        }
        // Already open in an editor?
        const existingEditor = this.findExistingChatEditorByUri(sessionResource);
        if (existingEditor) {
            const existingEditorWindowId = existingEditor.group.windowId;
            // focus transfer to other documents is async. If we depend on the focus
            // being synchronously transferred in consuming code, this can fail, so
            // wait for it to propagate
            const isGroupActive = () => dom.getWindow(this.layoutService.activeContainer).vscodeWindowId === existingEditorWindowId;
            let ensureFocusTransfer;
            if (!isGroupActive() && !options?.preserveFocus) {
                ensureFocusTransfer = Event.toPromise(Event.once(Event.filter(this.layoutService.onDidChangeActiveContainer, isGroupActive)));
            }
            const pane = await existingEditor.group.openEditor(existingEditor.editor, options);
            await ensureFocusTransfer;
            return pane instanceof ChatEditor ? pane.widget : undefined;
        }
        // Already open in quick chat?
        if (isEqual(sessionResource, this.quickChatService.sessionResource)) {
            this.quickChatService.focus();
            return undefined;
        }
        return undefined;
    }
    async prepareSessionForMove(sessionResource, target) {
        const existingWidget = this.getWidgetBySessionResource(sessionResource);
        if (existingWidget) {
            const existingEditor = isIChatViewViewContext(existingWidget.viewContext) ?
                undefined :
                this.findExistingChatEditorByUri(sessionResource);
            if (isIChatViewViewContext(existingWidget.viewContext) && target === ChatViewPaneTarget) {
                return;
            }
            if (!isIChatViewViewContext(existingWidget.viewContext) && target !== ChatViewPaneTarget && existingEditor && this.isSameEditorTarget(existingEditor.group.id, target)) {
                return;
            }
            if (existingEditor) {
                // widget.clear() on an editor leaves behind an empty chat editor
                await this.editorService.closeEditor({ editor: existingEditor.editor, groupId: existingEditor.group.id }, { preserveFocus: true });
            }
            else {
                await existingWidget.clear();
            }
        }
    }
    findExistingChatEditorByUri(sessionUri) {
        for (const group of this.editorGroupsService.groups) {
            for (const editor of group.editors) {
                if (editor instanceof ChatEditorInput && isEqual(editor.sessionResource, sessionUri)) {
                    return { editor, group };
                }
            }
        }
        return undefined;
    }
    isSameEditorTarget(currentGroupId, target) {
        return typeof target === 'number' && target === currentGroupId ||
            target === ACTIVE_GROUP && this.editorGroupsService.activeGroup?.id === currentGroupId ||
            isEditorGroup(target) && target.id === currentGroupId;
    }
    setLastFocusedWidget(widget) {
        if (widget === this._lastFocusedWidget) {
            return;
        }
        this._lastFocusedWidget = widget;
        this._onDidChangeFocusedWidget.fire(widget);
        this._onDidChangeFocusedSession.fire();
    }
    register(newWidget) {
        if (this._widgets.some(widget => widget === newWidget)) {
            throw new Error('Cannot register the same widget multiple times');
        }
        this._widgets.push(newWidget);
        this._onDidAddWidget.fire(newWidget);
        if (!this._lastFocusedWidget) {
            this.setLastFocusedWidget(newWidget);
        }
        return combinedDisposable(newWidget.onDidFocus(() => this.setLastFocusedWidget(newWidget)), newWidget.onDidChangeViewModel(({ previousSessionResource, currentSessionResource }) => {
            if (this._lastFocusedWidget === newWidget && !isEqual(previousSessionResource, currentSessionResource)) {
                this._onDidChangeFocusedSession.fire();
            }
            if (!previousSessionResource || (currentSessionResource && isEqual(previousSessionResource, currentSessionResource))) {
                return;
            }
            // Timeout to ensure it wasn't just moving somewhere else
            void timeout(200).then(() => {
                if (!this.getWidgetBySessionResource(previousSessionResource) && this.chatService.getSession(previousSessionResource)) {
                    this._onDidBackgroundSession.fire(previousSessionResource);
                }
            });
        }), toDisposable(() => {
            this._widgets.splice(this._widgets.indexOf(newWidget), 1);
            if (this._lastFocusedWidget === newWidget) {
                this.setLastFocusedWidget(undefined);
            }
        }));
    }
};
ChatWidgetService = __decorate([
    __param(0, IEditorGroupsService),
    __param(1, IViewsService),
    __param(2, IQuickChatService),
    __param(3, ILayoutService),
    __param(4, IEditorService),
    __param(5, IChatService)
], ChatWidgetService);
export { ChatWidgetService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFdpZGdldFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRXaWRnZXRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBZSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwSCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFbEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUF1QixNQUFNLHFEQUFxRCxDQUFDO0FBQ3hILE9BQU8sRUFBZ0Isb0JBQW9CLEVBQUUsYUFBYSxFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDOUgsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUV2RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFtQyxpQkFBaUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUN4SSxPQUFPLEVBQUUsVUFBVSxFQUFzQixNQUFNLHFDQUFxQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUdwRSxJQUFNLGlCQUFpQixHQUF2QixNQUFNLGlCQUFr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