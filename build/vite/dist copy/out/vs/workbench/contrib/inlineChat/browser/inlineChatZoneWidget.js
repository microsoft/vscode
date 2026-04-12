var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var InlineChatZoneWidget_1;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener, Dimension } from '../../../../base/browser/dom.js';
import * as aria from '../../../../base/browser/ui/aria/aria.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { assertType } from '../../../../base/common/types.js';
import { StableEditorBottomScrollState } from '../../../../editor/browser/stableEditorScroll.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ChatMode } from '../../chat/common/chatModes.js';
import { ACTION_REGENERATE_RESPONSE, ACTION_REPORT_ISSUE, ACTION_TOGGLE_DIFF, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, MENU_INLINE_CHAT_SIDE, MENU_INLINE_CHAT_WIDGET_SECONDARY, MENU_INLINE_CHAT_WIDGET_STATUS } from '../common/inlineChat.js';
import { EditorBasedInlineChatWidget } from './inlineChatWidget.js';
let InlineChatZoneWidget = class InlineChatZoneWidget extends ZoneWidget {
    static { InlineChatZoneWidget_1 = this; }
    static { this._options = {
        showFrame: true,
        frameWidth: 1,
        // frameColor: 'var(--vscode-inlineChat-border)',
        isResizeable: true,
        showArrow: false,
        isAccessible: true,
        className: 'inline-chat-widget',
        keepEditorSelection: true,
        showInHiddenAreas: true,
        ordinal: 50000,
    }; }
    constructor(location, options, editors, 
    /** @deprecated should go away with inline2 */
    clearDelegate, _instaService, _logService, contextKeyService) {
        super(editors.editor, InlineChatZoneWidget_1._options);
        this._instaService = _instaService;
        this._logService = _logService;
        this.notebookEditor = editors.notebookEditor;
        this._ctxCursorPosition = CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.bindTo(contextKeyService);
        this._disposables.add(toDisposable(() => {
            this._ctxCursorPosition.reset();
        }));
        this.widget = this._instaService.createInstance(EditorBasedInlineChatWidget, location, this.editor, {
            statusMenuId: {
                menu: MENU_INLINE_CHAT_WIDGET_STATUS,
                options: {
                    buttonConfigProvider: (action, index) => {
                        const isSecondary = index > 0;
                        if (new Set([ACTION_REGENERATE_RESPONSE, ACTION_TOGGLE_DIFF, ACTION_REPORT_ISSUE]).has(action.id)) {
                            return { isSecondary, showIcon: true, showLabel: false };
                        }
                        else {
                            return { isSecondary };
                        }
                    }
                }
            },
            secondaryMenuId: MENU_INLINE_CHAT_WIDGET_SECONDARY,
            inZoneWidget: true,
            chatWidgetViewOptions: {
                menus: {
                    telemetrySource: 'interactiveEditorWidget-toolbar',
                    inputSideToolbar: MENU_INLINE_CHAT_SIDE
                },
                clear: clearDelegate,
                ...options,
                rendererOptions: {
                    renderTextEditsAsSummary: (uri) => {
                        // render when dealing with the current file in the editor
                        return isEqual(uri, editors.editor.getModel()?.uri);
                    },
                    renderDetectedCommandsWithRequest: true,
                    ...options?.rendererOptions
                },
                defaultMode: ChatMode.Ask
            }
        });
        this._disposables.add(this.widget);
        let revealFn;
        this._disposables.add(this.widget.chatWidget.onWillMaybeChangeHeight(() => {
            if (this.position) {
                revealFn = this._createZoneAndScrollRestoreFn(this.position);
            }
        }));
        this._disposables.add(this.widget.onDidChangeHeight(() => {
            if (this.position && !this._usesResizeHeight) {
                // only relayout when visible
                revealFn ??= this._createZoneAndScrollRestoreFn(this.position);
                const height = this._computeHeight();
                this._relayout(height.linesValue);
                revealFn?.();
                revealFn = undefined;
            }
        }));
        this.create();
        this._disposables.add(autorun(r => {
            const isBusy = this.widget.requestInProgress.read(r);
            this.domNode.firstElementChild?.classList.toggle('busy', isBusy);
        }));
        this._disposables.add(addDisposableListener(this.domNode, 'click', e => {
            if (!this.editor.hasWidgetFocus() && !this.widget.hasFocus()) {
                this.editor.focus();
            }
        }, true));
        // todo@jrieken listen ONLY when showing
        const updateCursorIsAboveContextKey = () => {
            if (!this.position || !this.editor.hasModel()) {
                this._ctxCursorPosition.reset();
            }
            else if (this.position.lineNumber === this.editor.getPosition().lineNumber) {
                this._ctxCursorPosition.set('above');
            }
            else if (this.position.lineNumber + 1 === this.editor.getPosition().lineNumber) {
                this._ctxCursorPosition.set('below');
            }
            else {
                this._ctxCursorPosition.reset();
            }
        };
        this._disposables.add(this.editor.onDidChangeCursorPosition(e => updateCursorIsAboveContextKey()));
        this._disposables.add(this.editor.onDidFocusEditorText(e => updateCursorIsAboveContextKey()));
        updateCursorIsAboveContextKey();
    }
    _fillContainer(container) {
        container.style.setProperty('--vscode-inlineChat-background', 'var(--vscode-editor-background)');
        container.appendChild(this.widget.domNode);
    }
    _doLayout(heightInPixel) {
        this._updatePadding();
        const info = this.editor.getLayoutInfo();
        const width = info.contentWidth - info.verticalScrollbarWidth;
        // width = Math.min(850, width);
        this._dimension = new Dimension(width, heightInPixel);
        this.widget.layout(this._dimension);
    }
    _computeHeight() {
        const chatContentHeight = this.widget.contentHeight;
        const editorHeight = this.notebookEditor?.getLayoutInfo().height ?? this.editor.getLayoutInfo().height;
        const contentHeight = this._decoratingElementsHeight() + Math.min(chatContentHeight, Math.max(this.widget.minHeight, editorHeight * 0.42));
        const heightInLines = contentHeight / this.editor.getOption(75 /* EditorOption.lineHeight */);
        return { linesValue: heightInLines, pixelsValue: contentHeight };
    }
    _getResizeBounds() {
        const lineHeight = this.editor.getOption(75 /* EditorOption.lineHeight */);
        const decoHeight = this._decoratingElementsHeight();
        const minHeightPx = decoHeight + this.widget.minHeight;
        const maxHeightPx = decoHeight + this.widget.contentHeight;
        return {
            minLines: minHeightPx / lineHeight,
            maxLines: maxHeightPx / lineHeight
        };
    }
    _onWidth(_widthInPixel) {
        if (this._dimension) {
            this._doLayout(this._dimension.height);
        }
    }
    show(position) {
        assertType(this.container);
        this._updatePadding();
        const revealZone = this._createZoneAndScrollRestoreFn(position);
        super.show(position, this._computeHeight().linesValue);
        this.widget.chatWidget.setVisible(true);
        this.widget.focus();
        revealZone();
    }
    _updatePadding() {
        assertType(this.container);
        const info = this.editor.getLayoutInfo();
        const marginWithoutIndentation = info.glyphMarginWidth + info.lineNumbersWidth + info.decorationsWidth;
        this.container.style.paddingLeft = `${marginWithoutIndentation}px`;
    }
    reveal(position) {
        const stickyScroll = this.editor.getOption(131 /* EditorOption.stickyScroll */);
        const magicValue = stickyScroll.enabled ? stickyScroll.maxLineCount : 0;
        this.editor.revealLines(position.lineNumber + magicValue, position.lineNumber + magicValue, 1 /* ScrollType.Immediate */);
        this.updatePositionAndHeight(position);
    }
    updatePositionAndHeight(position) {
        const revealZone = this._createZoneAndScrollRestoreFn(position);
        super.updatePositionAndHeight(position, !this._usesResizeHeight ? this._computeHeight().linesValue : undefined);
        revealZone();
    }
    _createZoneAndScrollRestoreFn(position) {
        const scrollState = StableEditorBottomScrollState.capture(this.editor);
        const lineNumber = position.lineNumber <= 1 ? 1 : 1 + position.lineNumber;
        return () => {
            scrollState.restore(this.editor);
            const scrollTop = this.editor.getScrollTop();
            const lineTop = this.editor.getTopForLineNumber(lineNumber);
            const zoneTop = lineTop - this._computeHeight().pixelsValue;
            const editorHeight = this.editor.getLayoutInfo().height;
            const lineBottom = this.editor.getBottomForLineNumber(lineNumber);
            let newScrollTop = zoneTop;
            let forceScrollTop = false;
            if (lineBottom >= (scrollTop + editorHeight)) {
                // revealing the top of the zone would push out the line we are interested in and
                // therefore we keep the line in the viewport
                newScrollTop = lineBottom - editorHeight;
                forceScrollTop = true;
            }
            if (newScrollTop < scrollTop || forceScrollTop) {
                this._logService.trace('[IE] REVEAL zone', { zoneTop, lineTop, lineBottom, scrollTop, newScrollTop, forceScrollTop });
                this.editor.setScrollTop(newScrollTop, 1 /* ScrollType.Immediate */);
            }
        };
    }
    revealRange(range, isLastLine) {
        // noop
    }
    hide() {
        const scrollState = StableEditorBottomScrollState.capture(this.editor);
        this._ctxCursorPosition.reset();
        this.widget.chatWidget.setVisible(false);
        super.hide();
        aria.status(localize('inlineChatClosed', 'Closed inline chat widget'));
        scrollState.restore(this.editor);
    }
};
InlineChatZoneWidget = InlineChatZoneWidget_1 = __decorate([
    __param(4, IInstantiationService),
    __param(5, ILogService),
    __param(6, IContextKeyService)
], InlineChatZoneWidget);
export { InlineChatZoneWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdFpvbmVXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdFpvbmVXaWRnZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxTQUFTLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNuRixPQUFPLEtBQUssSUFBSSxNQUFNLDBDQUEwQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU5RCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUtqRyxPQUFPLEVBQVksVUFBVSxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBZSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUdyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFMUQsT0FBTyxFQUFFLDBCQUEwQixFQUFFLG1CQUFtQixFQUFFLGtCQUFrQixFQUFFLHFDQUFxQyxFQUFFLHFCQUFxQixFQUFFLGlDQUFpQyxFQUFFLDhCQUE4QixFQUFFLE1B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