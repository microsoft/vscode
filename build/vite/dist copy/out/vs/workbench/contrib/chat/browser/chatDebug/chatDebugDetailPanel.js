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
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Sash } from '../../../../../base/browser/ui/sash/sash.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatDebugService } from '../../common/chatDebugService.js';
import { formatEventDetail } from './chatDebugEventDetailRenderer.js';
import { renderCustomizationDiscoveryContent, fileListToPlainText } from './chatCustomizationDiscoveryRenderer.js';
import { renderUserMessageContent, renderAgentResponseContent, messageEventToPlainText, renderResolvedMessageContent, resolvedMessageToPlainText } from './chatDebugMessageContentRenderer.js';
import { renderToolCallContent, toolCallContentToPlainText } from './chatDebugToolCallContentRenderer.js';
import { renderModelTurnContent, modelTurnContentToPlainText } from './chatDebugModelTurnContentRenderer.js';
import { renderHookContent, hookContentToPlainText } from './chatDebugHookContentRenderer.js';
const $ = DOM.$;
const DETAIL_PANEL_DEFAULT_WIDTH = 350;
const DETAIL_PANEL_MIN_WIDTH = 200;
const DETAIL_PANEL_MAX_WIDTH = 800;
/**
 * Reusable detail panel that resolves and displays the content of a
 * single {@link IChatDebugEvent}. Used by both the logs view and the
 * flow chart view.
 */
let ChatDebugDetailPanel = class ChatDebugDetailPanel extends Disposable {
    get width() {
        return this._width;
    }
    constructor(parent, chatDebugService, instantiationService, editorService, clipboardService, hoverService, openerService, languageService) {
        super();
        this.chatDebugService = chatDebugService;
        this.instantiationService = instantiationService;
        this.editorService = editorService;
        this.clipboardService = clipboardService;
        this.hoverService = hoverService;
        this.openerService = openerService;
        this.languageService = languageService;
        this._onDidHide = this._register(new Emitter());
        this.onDidHide = this._onDidHide.event;
        this._onDidChangeWidth = this._register(new Emitter());
        this.onDidChangeWidth = this._onDidChangeWidth.event;
        this.detailDisposables = this._register(new DisposableStore());
        this.currentDetailText = '';
        this._width = DETAIL_PANEL_DEFAULT_WIDTH;
        this.element = DOM.append(parent, $('.chat-debug-detail-panel'));
        this.contentContainer = $('.chat-debug-detail-content');
        this.scrollable = this._register(new DomScrollableElement(this.contentContainer, {
            horizontal: 2 /* ScrollbarVisibility.Hidden */,
            vertical: 1 /* ScrollbarVisibility.Auto */,
        }));
        this.element.style.width = `${this._width}px`;
        DOM.hide(this.element);
        // Sash on the parent container, positioned at the left edge of the detail panel
        this.sash = this._register(new Sash(parent, {
            getVerticalSashLeft: () => parent.offsetWidth - this._width,
        }, { orientation: 0 /* Orientation.VERTICAL */ }));
        this.sash.state = 0 /* SashState.Disabled */;
        let sashStartWidth;
        this._register(this.sash.onDidStart(() => sashStartWidth = this._width));
        this._register(this.sash.onDidEnd(() => {
            sashStartWidth = undefined;
            this.sash.layout();
        }));
        this._register(this.sash.onDidChange(e => {
            if (sashStartWidth === undefined) {
                return;
            }
            // Dragging left (negative currentX delta) should increase width
            const delta = e.startX - e.currentX;
            const newWidth = Math.max(DETAIL_PANEL_MIN_WIDTH, Math.min(DETAIL_PANEL_MAX_WIDTH, sashStartWidth + delta));
            this._width = newWidth;
            this.element.style.width = `${newWidth}px`;
            this.sash.layout();
            this._onDidChangeWidth.fire(newWidth);
        }));
        // Handle Ctrl+A / Cmd+A to select all within the detail panel
        this._register(DOM.addDisposableListener(this.element, DOM.EventType.KEY_DOWN, (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                const target = e.target;
                if (target && this.element.contains(target)) {
                    e.preventDefault();
                    const targetWindow = DOM.getWindow(target);
                    const selection = targetWindow.getSelection();
                    if (selection) {
                        const range = targetWindow.document.createRange();
                        range.selectNodeContents(target);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            }
        }));
    }
    async show(event) {
        // Skip re-rendering if we're already showing this event's detail
        if (event.id && event.id === this.currentDetailEventId) {
            return;
        }
        this.currentDetailEventId = event.id;
        const resolved = event.id ? await this.chatDebugService.resolveEvent(event.id) : undefined;
        DOM.show(this.element);
        this.sash.state = 3 /* SashState.Enabled */;
        this.sash.layout();
        DOM.clearNode(this.element);
        DOM.clearNode(this.contentContainer);
        this.detailDisposables.clear();
        // Header with action buttons
        const header = DOM.append(this.element, $('.chat-debug-detail-header'));
        this.headerElement = header;
        this.element.appendChild(this.scrollable.getDomNode());
        const fullScreenButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize('chatDebug.openInEditor', "Open in Editor"), title: localize('chatDebug.openInEditor', "Open in Editor") }));
        fullScreenButton.element.classList.add('chat-debug-detail-button');
        fullScreenButton.icon = Codicon.goToFile;
        this.firstFocusableElement = fullScreenButton.element;
        this.detailDisposables.add(fullScreenButton.onDidClick(() => {
            this.editorService.openEditor({ contents: this.currentDetailText, resource: undefined });
        }));
        const copyButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize('chatDebug.copyToClipboard', "Copy"), title: localize('chatDebug.copyToClipboard', "Copy") }));
        copyButton.element.classList.add('chat-debug-detail-button');
        copyButton.icon = Codicon.copy;
        this.detailDisposables.add(copyButton.onDidClick(() => {
            this.clipboardService.writeText(this.currentDetailText);
        }));
        const closeButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize('chatDebug.closeDetail', "Close"), title: localize('chatDebug.closeDetail', "Close") }));
        closeButton.element.classList.add('chat-debug-detail-button');
        closeButton.icon = Codicon.close;
        this.detailDisposables.add(closeButton.onDidClick(() => {
            this.hide();
        }));
        if (resolved && resolved.kind === 'fileList') {
            this.currentDetailText = fileListToPlainText(resolved);
            const { element: contentEl, disposables: contentDisposables } = this.instantiationService.invokeFunction(accessor => renderCustomizationDiscoveryContent(resolved, this.openerService, accessor.get(IModelService), this.languageService, this.hoverService, accessor.get(ILabelService), this.scrollable));
            this.detailDisposables.add(contentDisposables);
            this.contentContainer.appendChild(contentEl);
        }
        else if (resolved && resolved.kind === 'toolCall') {
            this.currentDetailText = toolCallContentToPlainText(resolved);
            const { element: contentEl, disposables: contentDisposables } = await renderToolCallContent(resolved, this.languageService, this.clipboardService, this.scrollable);
            if (this.currentDetailEventId !== event.id) {
                // Another event was selected while we were rendering
                contentDisposables.dispose();
                return;
            }
            this.detailDisposables.add(contentDisposables);
            this.contentContainer.appendChild(contentEl);
        }
        else if (resolved && resolved.kind === 'message') {
            this.currentDetailText = resolvedMessageToPlainText(resolved);
            const { element: contentEl, disposables: contentDisposables } = await renderResolvedMessageContent(resolved, this.languageService, this.clipboardService, this.scrollable);
            if (this.currentDetailEventId !== event.id) {
                contentDisposables.dispose();
                return;
            }
            this.detailDisposables.add(contentDisposables);
            this.contentContainer.appendChild(contentEl);
        }
        else if (resolved && resolved.kind === 'modelTurn') {
            this.currentDetailText = modelTurnContentToPlainText(resolved);
            const { element: contentEl, disposables: contentDisposables } = await renderModelTurnContent(resolved, this.languageService, this.clipboardService, this.scrollable);
            if (this.currentDetailEventId !== event.id) {
                // Another event was selected while we were rendering
                contentDisposables.dispose();
                return;
            }
            this.detailDisposables.add(contentDisposables);
            this.contentContainer.appendChild(contentEl);
        }
        else if (resolved && resolved.kind === 'hook') {
            this.currentDetailText = hookContentToPlainText(resolved);
            const { element: contentEl, disposables: contentDisposables } = await renderHookContent(resolved, this.languageService, this.clipboardService, this.scrollable);
            if (this.currentDetailEventId !== event.id) {
                // Another event was selected while we were rendering
                contentDisposables.dispose();
                return;
            }
            this.detailDisposables.add(contentDisposables);
            this.contentContainer.appendChild(contentEl);
        }
        else if (event.kind === 'userMessage') {
            this.currentDetailText = messageEventToPlainText(event);
            const { element: contentEl, disposables: contentDisposables } = await renderUserMessageContent(event, this.languageService, this.clipboardService, this.scrollable);
            if (this.currentDetailEventId !== event.id) {
                contentDisposables.dispose();
                return;
            }
            this.detailDisposables.add(contentDisposables);
            this.contentContainer.appendChild(contentEl);
        }
        else if (event.kind === 'agentResponse') {
            this.currentDetailText = messageEventToPlainText(event);
            const { element: contentEl, disposables: contentDisposables } = await renderAgentResponseContent(event, this.languageService, this.clipboardService, this.scrollable);
            if (this.currentDetailEventId !== event.id) {
                contentDisposables.dispose();
                return;
            }
            this.detailDisposables.add(contentDisposables);
            this.contentContainer.appendChild(contentEl);
        }
        else {
            const pre = DOM.append(this.contentContainer, $('pre'));
            pre.tabIndex = 0;
            if (resolved) {
                this.currentDetailText = resolved.value;
            }
            else {
                this.currentDetailText = formatEventDetail(event);
            }
            pre.textContent = this.currentDetailText;
        }
        // Compute height from the parent container and set explicit
        // dimensions so the scrollable element can show proper scrollbars.
        const parentHeight = this.element.parentElement?.clientHeight ?? 0;
        if (parentHeight > 0) {
            this.layout(parentHeight);
        }
        else {
            this.scrollable.scanDomNode();
        }
    }
    get isVisible() {
        return this.element.style.display !== 'none';
    }
    focus() {
        this.firstFocusableElement?.focus();
    }
    /**
     * Set explicit dimensions on the scrollable element so the scrollbar
     * can compute its size. Call after the panel is shown and whenever
     * the available space changes.
     */
    layout(height) {
        const headerHeight = this.headerElement?.offsetHeight ?? 0;
        const scrollableHeight = Math.max(0, height - headerHeight);
        this.contentContainer.style.height = `${scrollableHeight}px`;
        this.scrollable.scanDomNode();
        this.sash.layout();
    }
    layoutSash() {
        this.sash.layout();
    }
    hide() {
        this.currentDetailEventId = undefined;
        this.firstFocusableElement = undefined;
        this.headerElement = undefined;
        DOM.hide(this.element);
        this.sash.state = 0 /* SashState.Disabled */;
        DOM.clearNode(this.element);
        DOM.clearNode(this.contentContainer);
        this.detailDisposables.clear();
        this._onDidHide.fire();
    }
};
ChatDebugDetailPanel = __decorate([
    __param(1, IChatDebugService),
    __param(2, IInstantiationService),
    __param(3, IEditorService),
    __param(4, IClipboardService),
    __param(5, IHoverService),
    __param(6, IOpenerService),
    __param(7, ILanguageService)
], ChatDebugDetailPanel);
export { ChatDebugDetailPanel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdERlYnVnRGV0YWlsUGFuZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdERlYnVnL2NoYXREZWJ1Z0RldGFpbFBhbmVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3pFLE9BQU8sRUFBZSxJQUFJLEVBQWEsTUFBTSw2Q0FBNkMsQ0FBQztBQUMzRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUVyRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUVqRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDckYsT0FBTyxFQUFtQixpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ25ILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSwwQkFBMEIsRUFBRSx1QkFBdUIsRUFBRSw0QkFBNEIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9MLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzFHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzdHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTlGLE1BQU0sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFaEIsTUFBTSwwQkFBMEIsR0FBRyxHQUFHLENBQUM7QUFDdkMsTUFBTSxzQkFBc0IsR0FBRyxHQUFHLENBQUM7QUFDbkMsTUFBTSxzQkFBc0IsR0FBRyxHQUFHLENBQUM7QUFFbkM7Ozs7R0FJRztBQUNJLElBQU0sb0JBQW9CLEdBQTFCLE1BQU0sb0JBQXFCLFNBQVEsVUFBVTtJQW1CbkQsSUFBSSxLQUFLO1FBQ1IsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxZQUNDLE1BQW1CLEVBQ0EsZ0JBQW9ELEVBQ2hELG9CQUE0RCxFQUNuRSxhQUE4QyxFQUMzQyxnQkFBb0QsRUFDeEQsWUFBNEMsRUFDM0MsYUFBOEMsRUFDNUMsZUFBa0Q7UUFFcEUsS0FBSyxFQUFFLENBQUM7UUFSNEIscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFtQjtRQUMvQix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ2xELGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUMxQixxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW1CO1FBQ3ZDLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBQzFCLGtCQUFhLEdBQWIsYUFBYSxDQUFnQjtRQUMzQixvQkFBZSxHQUFmLGVBQWUsQ0FBa0I7UUE3QnBELGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztRQUN6RCxjQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUM7UUFFMUIsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBVSxDQUFDLENBQUM7UUFDbEUscUJBQWdCLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQztRQU94QyxzQkFBaUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksZUFBZSxFQUFFLENBQUMsQ0FBQztRQUNuRSxzQkFBaUIsR0FBVyxFQUFFLENBQUM7UUFHL0IsV0FBTSxHQUFXLDBCQUEwQixDQUFDO1FBaUJuRCxJQUFJLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDLENBQUM7UUFDakUsSUFBSSxDQUFDLGdCQUFnQixHQUFHLENBQUMsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQ3hELElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRTtZQUNoRixVQUFVLG9DQUE0QjtZQUN0QyxRQUFRLGtDQUEwQjtTQUNsQyxDQUFDLENBQUMsQ0FBQztRQUNKLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQztRQUM5QyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUV2QixnRkFBZ0Y7UUFDaEYsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUMzQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNO1NBQzNELEVBQUUsRUFBRSxXQUFXLDhCQUFzQixFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyw2QkFBcUIsQ0FBQztRQUVyQyxJQUFJLGNBQWtDLENBQUM7UUFDdkMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDekUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUU7WUFDdEMsY0FBYyxHQUFHLFNBQVMsQ0FBQztZQUMzQixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ3BCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ3hDLElBQUksY0FBYyxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUNsQyxPQUFPO1lBQ1IsQ0FBQztZQUNELGdFQUFnRTtZQUNoRSxNQUFNLEtBQUssR0FBRyxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUM7WUFDcEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLHNCQUFzQixFQUFFLGNBQWMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQzVHLElBQUksQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDO1lBQ3ZCLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxHQUFHLFFBQVEsSUFBSSxDQUFDO1lBQzNDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbkIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2QyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosOERBQThEO1FBQzlELElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFnQixFQUFFLEVBQUU7WUFDbkcsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLEtBQUssR0FBRyxFQUFFLENBQUM7Z0JBQy9DLE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUE0QixDQUFDO2dCQUM5QyxJQUFJLE1BQU0sSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO29CQUM3QyxDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7b0JBQ25CLE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQzNDLE1BQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxZQUFZLEVBQUUsQ0FBQztvQkFDOUMsSUFBSSxTQUFTLEVBQUUsQ0FBQzt3QkFDZixNQUFNLEtBQUssR0FBRyxZQUFZLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO3dCQUNsRCxLQUFLLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLENBQUM7d0JBQ2pDLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQzt3QkFDNUIsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFDM0IsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFzQjtRQUNoQyxpRUFBaUU7UUFDakUsSUFBSSxLQUFLLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDeEQsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUVyQyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFM0YsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdkIsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLDRCQUFvQixDQUFDO1FBQ3BDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDbkIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDNUIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNyQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFL0IsNkJBQTZCO1FBQzdCLE1BQU0sTUFBTSxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDO1FBQ3hFLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDO1FBQzVCLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUV2RCxNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMxTSxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ25FLGdCQUFnQixDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUM7UUFDdEQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQzNELElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUE2QyxDQUFDLENBQUM7UUFDckksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLDJCQUEyQixFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RMLFVBQVUsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQzdELFVBQVUsQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUMvQixJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ3JELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDekQsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSxPQUFPLENBQUMsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2pMLFdBQVcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQzlELFdBQVcsQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztRQUNqQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ3RELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNiLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLFVBQVUsRUFBRSxDQUFDO1lBQzlDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN2RCxNQUFNLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQ25ILG1DQUFtQyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsYUFBYSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsWUFBWSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUNyTCxDQUFDO1lBQ0YsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDOUMsQ0FBQzthQUFNLElBQUksUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDckQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzlELE1BQU0sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxHQUFHLE1BQU0scUJBQXFCLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNwSyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzVDLHFEQUFxRDtnQkFDckQsa0JBQWtCLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQzdCLE9BQU87WUFDUixDQUFDO1lBQ0QsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQy9DLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDOUMsQ0FBQzthQUFNLElBQUksUUFBUSxJQUFJLFFBQVEsQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDcEQsSUFBSSxDQUFDLGlCQUFpQixHQUFHLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzlELE1BQU0sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxHQUFHLE1BQU0sNEJBQTRCLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMzSyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzVDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUM3QixPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLENBQUM7YUFBTSxJQUFJLFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ3RELElBQUksQ0FBQyxpQkFBaUIsR0FBRywyQkFBMkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMvRCxNQUFNLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxNQUFNLHNCQUFzQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDckssSUFBSSxJQUFJLENBQUMsb0JBQW9CLEtBQUssS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUM1QyxxREFBcUQ7Z0JBQ3JELGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUM3QixPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLENBQUM7YUFBTSxJQUFJLFFBQVEsSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRSxDQUFDO1lBQ2pELElBQUksQ0FBQyxpQkFBaUIsR0FBRyxzQkFBc0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMxRCxNQUFNLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxNQUFNLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDaEssSUFBSSxJQUFJLENBQUMsb0JBQW9CLEtBQUssS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUM1QyxxREFBcUQ7Z0JBQ3JELGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUM3QixPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLENBQUM7YUFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssYUFBYSxFQUFFLENBQUM7WUFDekMsSUFBSSxDQUFDLGlCQUFpQixHQUFHLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3hELE1BQU0sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxHQUFHLE1BQU0sd0JBQXdCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNwSyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzVDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUM3QixPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLENBQUM7YUFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssZUFBZSxFQUFFLENBQUM7WUFDM0MsSUFBSSxDQUFDLGlCQUFpQixHQUFHLHVCQUF1QixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3hELE1BQU0sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxHQUFHLE1BQU0sMEJBQTBCLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUN0SyxJQUFJLElBQUksQ0FBQyxvQkFBb0IsS0FBSyxLQUFLLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzVDLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUM3QixPQUFPO1lBQ1IsQ0FBQztZQUNELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUMvQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDeEQsR0FBRyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUM7WUFDakIsSUFBSSxRQUFRLEVBQUUsQ0FBQztnQkFDZCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQztZQUN6QyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ25ELENBQUM7WUFDRCxHQUFHLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztRQUMxQyxDQUFDO1FBRUQsNERBQTREO1FBQzVELG1FQUFtRTtRQUNuRSxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsRUFBRSxZQUFZLElBQUksQ0FBQyxDQUFDO1FBQ25FLElBQUksWUFBWSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDM0IsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQy9CLENBQUM7SUFDRixDQUFDO0lBRUQsSUFBSSxTQUFTO1FBQ1osT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLEtBQUssTUFBTSxDQUFDO0lBQzlDLENBQUM7SUFFRCxLQUFLO1FBQ0osSUFBSSxDQUFDLHFCQUFxQixFQUFFLEtBQUssRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsTUFBTSxDQUFDLE1BQWM7UUFDcEIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLGFBQWEsRUFBRSxZQUFZLElBQUksQ0FBQyxDQUFDO1FBQzNELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsTUFBTSxHQUFHLFlBQVksQ0FBQyxDQUFDO1FBQzVELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLEdBQUcsZ0JBQWdCLElBQUksQ0FBQztRQUM3RCxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDcEIsQ0FBQztJQUVELFVBQVU7UUFDVCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxJQUFJO1FBQ0gsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFNBQVMsQ0FBQztRQUN0QyxJQUFJLENBQUMscUJBQXFCLEdBQUcsU0FBUyxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxhQUFhLEdBQUcsU0FBUyxDQUFDO1FBQy9CLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyw2QkFBcUIsQ0FBQztRQUNyQyxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1QixHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUMvQixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3hCLENBQUM7Q0FDRCxDQUFBO0FBM1BZLG9CQUFvQjtJQXlCOUIsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxnQkFBZ0IsQ0FBQTtHQS9CTixvQkFBb0IsQ0EyUGhDIn0=