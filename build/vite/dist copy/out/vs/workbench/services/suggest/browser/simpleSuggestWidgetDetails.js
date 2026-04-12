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
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import * as nls from '../../../../nls.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
export function canExpandCompletionItem(item) {
    return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}
export const SuggestDetailsClassName = 'suggest-details';
export var SimpleSuggestDetailsPlacement;
(function (SimpleSuggestDetailsPlacement) {
    SimpleSuggestDetailsPlacement[SimpleSuggestDetailsPlacement["East"] = 0] = "East";
    SimpleSuggestDetailsPlacement[SimpleSuggestDetailsPlacement["West"] = 1] = "West";
    SimpleSuggestDetailsPlacement[SimpleSuggestDetailsPlacement["South"] = 2] = "South";
    SimpleSuggestDetailsPlacement[SimpleSuggestDetailsPlacement["North"] = 3] = "North";
})(SimpleSuggestDetailsPlacement || (SimpleSuggestDetailsPlacement = {}));
let SimpleSuggestDetailsWidget = class SimpleSuggestDetailsWidget {
    constructor(_getFontInfo, onDidFontInfoChange, _getAdvancedExplainModeDetails, instaService, markdownRendererService) {
        this._getFontInfo = _getFontInfo;
        this._getAdvancedExplainModeDetails = _getAdvancedExplainModeDetails;
        this.markdownRendererService = markdownRendererService;
        this._onDidClose = new Emitter();
        this.onDidClose = this._onDidClose.event;
        this._onDidChangeContents = new Emitter();
        this.onDidChangeContents = this._onDidChangeContents.event;
        this._disposables = new DisposableStore();
        this._renderDisposeable = this._disposables.add(new DisposableStore());
        this._borderWidth = 1;
        this._size = new dom.Dimension(330, 0);
        this.domNode = dom.$('.suggest-details');
        this.domNode.classList.add('no-docs');
        this._body = dom.$('.body');
        this._scrollbar = new DomScrollableElement(this._body, {
            alwaysConsumeMouseWheel: true,
        });
        dom.append(this.domNode, this._scrollbar.getDomNode());
        this._disposables.add(this._scrollbar);
        this._header = dom.append(this._body, dom.$('.header'));
        this._close = dom.append(this._header, dom.$('span' + ThemeIcon.asCSSSelector(Codicon.close)));
        this._close.title = nls.localize('details.close', "Close");
        this._close.role = 'button';
        this._close.tabIndex = -1;
        this._type = dom.append(this._header, dom.$('p.type'));
        this._docs = dom.append(this._body, dom.$('p.docs'));
        this._configureFont();
        this._disposables.add(onDidFontInfoChange(() => this._configureFont()));
    }
    _configureFont() {
        const fontInfo = this._getFontInfo();
        const fontFamily = fontInfo.fontFamily;
        const fontSize = fontInfo.fontSize;
        const lineHeight = fontInfo.lineHeight;
        const fontWeight = fontInfo.fontWeight;
        const fontSizePx = `${fontSize}px`;
        const lineHeightPx = `${lineHeight}px`;
        this.domNode.style.fontSize = fontSizePx;
        this.domNode.style.lineHeight = `${lineHeight / fontSize}`;
        this.domNode.style.fontWeight = fontWeight;
        // this.domNode.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
        this._type.style.fontFamily = fontFamily;
        this._close.style.height = lineHeightPx;
        this._close.style.width = lineHeightPx;
    }
    dispose() {
        this._disposables.dispose();
        this._onDidClose.dispose();
        this._onDidChangeContents.dispose();
    }
    getLayoutInfo() {
        const lineHeight = this._getFontInfo().lineHeight;
        const borderWidth = this._borderWidth;
        const borderHeight = borderWidth * 2;
        return {
            lineHeight,
            borderWidth,
            borderHeight,
            verticalPadding: 22,
            horizontalPadding: 14
        };
    }
    renderLoading() {
        this._type.textContent = nls.localize('loading', "Loading...");
        this._docs.textContent = '';
        this.domNode.classList.remove('no-docs', 'no-type');
        this.layout(this.size.width, this.getLayoutInfo().lineHeight * 2);
        this._onDidChangeContents.fire(this);
    }
    renderItem(item, explainMode) {
        this._renderDisposeable.clear();
        let { detail, documentation } = item.completion;
        let md = '';
        if (explainMode) {
            md += `score: ${item.score[0]}\n`;
            md += `prefix: ${item.word ?? '(no prefix)'}\n`;
            const vs = item.completion.replacementRange;
            md += `valueSelection: ${vs ? `[${vs[0]}, ${vs[1]}]` : 'undefined'}\n`;
            md += `index: ${item.idx}\n`;
            if (this._getAdvancedExplainModeDetails) {
                const advancedDetails = this._getAdvancedExplainModeDetails();
                if (advancedDetails) {
                    md += `${advancedDetails}\n`;
                }
            }
            detail = `Provider: ${item.completion.provider}`;
            documentation = new MarkdownString().appendCodeblock('empty', md);
        }
        const hasDetail = typeof detail === 'string' ? detail.trim().length > 0 : !!detail;
        const hasDocs = typeof documentation === 'string'
            ? documentation.trim().length > 0
            : !!(documentation && documentation.value?.trim().length > 0);
        const updateSize = () => {
            this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
            this._onDidChangeContents.fire(this);
        };
        if (!explainMode && (!canExpandCompletionItem(item) || (!hasDetail && !hasDocs))) {
            this.clearContents();
            return;
        }
        this.domNode.classList.remove('no-docs', 'no-type');
        // --- details
        if (hasDetail && detail) {
            const cappedDetail = detail.length > 100000 ? `${detail.substr(0, 100000)}…` : detail;
            this._type.textContent = cappedDetail;
            this._type.title = cappedDetail;
            dom.show(this._type);
            this._type.classList.toggle('auto-wrap', !/\r?\n^\s+/gmi.test(cappedDetail));
        }
        else {
            dom.clearNode(this._type);
            this._type.title = '';
            dom.hide(this._type);
            this.domNode.classList.add('no-type');
        }
        // // --- documentation
        dom.clearNode(this._docs);
        if (hasDocs && typeof documentation === 'string') {
            this._docs.classList.remove('markdown-docs');
            this._docs.textContent = documentation;
        }
        else if (hasDocs && documentation && typeof documentation !== 'string') {
            this._docs.classList.add('markdown-docs');
            dom.clearNode(this._docs);
            const renderedContents = this.markdownRendererService.render(documentation, {
                asyncRenderCallback: () => {
                    updateSize();
                }
            });
            this._docs.appendChild(renderedContents.element);
            this._renderDisposeable.add(renderedContents);
        }
        else {
            this._docs.classList.remove('markdown-docs');
        }
        this.domNode.classList.toggle('detail-and-doc', hasDetail && hasDocs);
        this.domNode.style.userSelect = 'text';
        this.domNode.tabIndex = -1;
        this._close.onmousedown = e => {
            e.preventDefault();
            e.stopPropagation();
        };
        this._close.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            this._onDidClose.fire();
        };
        this._body.scrollTop = 0;
        updateSize();
    }
    clearContents() {
        this.domNode.classList.add('no-docs');
        this._type.textContent = '';
        this._docs.textContent = '';
    }
    get isEmpty() {
        return this.domNode.classList.contains('no-docs');
    }
    get size() {
        return this._size;
    }
    layout(width, height) {
        const newSize = new dom.Dimension(width, height);
        if (!dom.Dimension.equals(newSize, this._size)) {
            this._size = newSize;
            dom.size(this.domNode, width, height);
        }
        this._scrollbar.scanDomNode();
    }
    scrollDown(much = 8) {
        this._body.scrollTop += much;
    }
    scrollUp(much = 8) {
        this._body.scrollTop -= much;
    }
    scrollTop() {
        this._body.scrollTop = 0;
    }
    scrollBottom() {
        this._body.scrollTop = this._body.scrollHeight;
    }
    pageDown() {
        this.scrollDown(80);
    }
    pageUp() {
        this.scrollUp(80);
    }
    set borderWidth(width) {
        this._borderWidth = width;
    }
    get borderWidth() {
        return this._borderWidth;
    }
    focus() {
        this.domNode.focus();
    }
};
SimpleSuggestDetailsWidget = __decorate([
    __param(3, IInstantiationService),
    __param(4, IMarkdownRendererService)
], SimpleSuggestDetailsWidget);
export { SimpleSuggestDetailsWidget };
export class SimpleSuggestDetailsOverlay {
    constructor(widget, _container, preventPlacements) {
        this.widget = widget;
        this._container = _container;
        this._disposables = new DisposableStore();
        this._added = false;
        this._resizable = this._disposables.add(new ResizableHTMLElement());
        this._resizable.domNode.classList.add('suggest-details-container');
        this._resizable.domNode.appendChild(widget.domNode);
        this._resizable.enableSashes(false, true, true, false);
        this._preventPlacements = preventPlacements && preventPlacements.length ? new Set(preventPlacements) : undefined;
        let topLeftNow;
        let sizeNow;
        let deltaTop = 0;
        let deltaLeft = 0;
        this._disposables.add(this._resizable.onDidWillResize(() => {
            topLeftNow = this._topLeft;
            sizeNow = this._resizable.size;
        }));
        this._disposables.add(this._resizable.onDidResize(e => {
            if (topLeftNow && sizeNow) {
                this.widget.layout(e.dimension.width, e.dimension.height);
                let updateTopLeft = false;
                if (e.west) {
                    deltaLeft = sizeNow.width - e.dimension.width;
                    updateTopLeft = true;
                }
                if (e.north) {
                    deltaTop = sizeNow.height - e.dimension.height;
                    updateTopLeft = true;
                }
                if (updateTopLeft) {
                    this._applyTopLeft({
                        top: topLeftNow.top + deltaTop,
                        left: topLeftNow.left + deltaLeft,
                    });
                }
            }
            if (e.done) {
                topLeftNow = undefined;
                sizeNow = undefined;
                deltaTop = 0;
                deltaLeft = 0;
                this._userSize = e.dimension;
            }
        }));
        this._disposables.add(this.widget.onDidChangeContents(() => {
            if (this._anchorBox) {
                this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size);
            }
        }));
    }
    dispose() {
        this.widget.dispose();
        this._disposables.dispose();
        this.hide();
    }
    getId() {
        return 'suggest.details';
    }
    getDomNode() {
        return this._resizable.domNode;
    }
    show() {
        if (!this._added) {
            this._container.appendChild(this._resizable.domNode);
            this._added = true;
        }
    }
    hide(sessionEnded = false) {
        this._resizable.clearSashHoverState();
        if (this._added) {
            this._container.removeChild(this._resizable.domNode);
            this._added = false;
            this._anchorBox = undefined;
            // this._topLeft = undefined;
        }
        if (sessionEnded) {
            this._userSize = undefined;
            this.widget.clearContents();
        }
    }
    placeAtAnchor(anchor) {
        const anchorBox = anchor.getBoundingClientRect();
        this._anchorBox = anchorBox;
        this.widget.layout(this._resizable.size.width, this._resizable.size.height);
        this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size);
    }
    _placeAtAnchor(anchorBox, size) {
        const bodyBox = dom.getClientArea(this.getDomNode().ownerDocument.body);
        const info = this.widget.getLayoutInfo();
        const defaultMinSize = new dom.Dimension(220, 2 * info.lineHeight);
        const defaultTop = anchorBox.top;
        // EAST
        const eastPlacement = (function () {
            const width = bodyBox.width - (anchorBox.left + anchorBox.width + info.borderWidth + info.horizontalPadding);
            const left = -info.borderWidth + anchorBox.left + anchorBox.width;
            const maxSizeTop = new dom.Dimension(width, bodyBox.height - anchorBox.top - info.borderHeight - info.verticalPadding);
            const maxSizeBottom = maxSizeTop.with(undefined, anchorBox.top + anchorBox.height - info.borderHeight - info.verticalPadding);
            return { top: defaultTop, left, fit: width - size.width, maxSizeTop, maxSizeBottom, minSize: defaultMinSize.with(Math.min(width, defaultMinSize.width)) };
        })();
        // WEST
        const westPlacement = (function () {
            const width = anchorBox.left - info.borderWidth - info.horizontalPadding;
            const left = Math.max(info.horizontalPadding, anchorBox.left - size.width - info.borderWidth);
            const maxSizeTop = new dom.Dimension(width, bodyBox.height - anchorBox.top - info.borderHeight - info.verticalPadding);
            const maxSizeBottom = maxSizeTop.with(undefined, anchorBox.top + anchorBox.height - info.borderHeight - info.verticalPadding);
            return { top: defaultTop, left, fit: width - size.width, maxSizeTop, maxSizeBottom, minSize: defaultMinSize.with(Math.min(width, defaultMinSize.width)) };
        })();
        // SOUTH
        const southPlacement = (function () {
            const left = anchorBox.left;
            const top = -info.borderWidth + anchorBox.top + anchorBox.height;
            const maxSizeBottom = new dom.Dimension(anchorBox.width - info.borderHeight, bodyBox.height - anchorBox.top - anchorBox.height - info.verticalPadding);
            return { top, left, fit: maxSizeBottom.height - size.height, maxSizeBottom, maxSizeTop: maxSizeBottom, minSize: defaultMinSize.with(maxSizeBottom.width) };
        })();
        // NORTH
        const northPlacement = (function () {
            const width = Math.max(anchorBox.width - info.borderHeight, 0);
            const left = anchorBox.left;
            const maxHeightAbove = Math.max(anchorBox.top - info.verticalPadding, 0);
            const heightForTop = Math.min(size.height, maxHeightAbove);
            const top = anchorBox.top - info.borderWidth - heightForTop;
            const maxSize = new dom.Dimension(width, Math.max(maxHeightAbove, 0));
            return { top, left, fit: maxSize.height - size.height, maxSizeTop: maxSize, maxSizeBottom: maxSize, minSize: defaultMinSize.with(maxSize.width) };
        })();
        // take first placement that fits or the first with "least bad" fit
        const placementEntries = [
            [0 /* SimpleSuggestDetailsPlacement.East */, eastPlacement],
            [2 /* SimpleSuggestDetailsPlacement.South */, southPlacement],
            [3 /* SimpleSuggestDetailsPlacement.North */, northPlacement],
            [1 /* SimpleSuggestDetailsPlacement.West */, westPlacement]
        ];
        const orientations = (this._preventPlacements
            ? placementEntries.filter(([direction]) => !this._preventPlacements.has(direction))
            : placementEntries).map(([, entry]) => entry);
        const candidates = orientations.length ? orientations : placementEntries.map(([, entry]) => entry);
        const placement = candidates.find(p => p.fit >= 0)
            ?? candidates.reduce((best, current) => !best || current.fit > best.fit ? current : best, undefined)
            ?? eastPlacement;
        // top/bottom placement
        const bottom = anchorBox.top + anchorBox.height - info.borderHeight;
        let alignAtTop;
        let height = size.height;
        const maxHeight = Math.max(placement.maxSizeTop.height, placement.maxSizeBottom.height);
        if (height > maxHeight) {
            height = maxHeight;
        }
        let maxSize;
        // if (preferAlignAtTop) {
        if (height <= placement.maxSizeTop.height) {
            alignAtTop = true;
            maxSize = placement.maxSizeTop;
        }
        else {
            alignAtTop = false;
            maxSize = placement.maxSizeBottom;
        }
        // } else {
        // 	if (height <= placement.maxSizeBottom.height) {
        // 		alignAtTop = false;
        // 		maxSize = placement.maxSizeBottom;
        // 	} else {
        // 		alignAtTop = true;
        // 		maxSize = placement.maxSizeTop;
        // 	}
        // }
        let { top, left } = placement;
        if (!alignAtTop && height > anchorBox.height) {
            top = bottom - height;
        }
        const editorDomNode = this._container;
        if (editorDomNode) {
            // get bounding rectangle of the suggest widget relative to the editor
            const editorBoundingBox = editorDomNode.getBoundingClientRect();
            top -= editorBoundingBox.top;
            left -= editorBoundingBox.left;
        }
        this._applyTopLeft({ left, top });
        this._resizable.enableSashes(!alignAtTop, placement === eastPlacement, alignAtTop, placement !== eastPlacement);
        this._resizable.minSize = placement.minSize;
        this._resizable.maxSize = maxSize;
        this._resizable.layout(height, Math.min(maxSize.width, size.width));
        this.widget.layout(this._resizable.size.width, this._resizable.size.height);
    }
    _applyTopLeft(topLeft) {
        this._topLeft = topLeft;
        // this._editor.layoutOverlayWidget(this);
        this._resizable.domNode.style.top = `${topLeft.top}px`;
        this._resizable.domNode.style.left = `${topLeft.left}px`;
        this._resizable.domNode.style.position = 'absolute';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlU3VnZ2VzdFdpZGdldERldGFpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc3VnZ2VzdC9icm93c2VyL3NpbXBsZVN1Z2dlc3RXaWRnZXREZXRhaWxzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzFGLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFFMUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBR25HLE1BQU0sVUFBVSx1QkFBdUIsQ0FBQyxJQUFzQztJQUM3RSxPQUFPLENBQUMsQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxLQUFLLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFD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