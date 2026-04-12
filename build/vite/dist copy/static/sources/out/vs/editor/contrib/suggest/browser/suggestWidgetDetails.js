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
import { ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import * as nls from '../../../../nls.js';
import { isHighContrast } from '../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
export function canExpandCompletionItem(item) {
    return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}
let SuggestDetailsWidget = class SuggestDetailsWidget {
    constructor(_editor, _themeService, _markdownRendererService) {
        this._editor = _editor;
        this._themeService = _themeService;
        this._markdownRendererService = _markdownRendererService;
        this._onDidClose = new Emitter();
        this.onDidClose = this._onDidClose.event;
        this._onDidChangeContents = new Emitter();
        this.onDidChangeContents = this._onDidChangeContents.event;
        this._disposables = new DisposableStore();
        this._renderDisposeable = new DisposableStore();
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
        this._disposables.add(this._editor.onDidChangeConfiguration(e => {
            if (e.hasChanged(59 /* EditorOption.fontInfo */)) {
                this._configureFont();
            }
        }));
    }
    dispose() {
        this._disposables.dispose();
        this._renderDisposeable.dispose();
        this._onDidClose.dispose();
        this._onDidChangeContents.dispose();
    }
    _configureFont() {
        const options = this._editor.getOptions();
        const fontInfo = options.get(59 /* EditorOption.fontInfo */);
        const fontFamily = fontInfo.getMassagedFontFamily();
        const fontSize = options.get(135 /* EditorOption.suggestFontSize */) || fontInfo.fontSize;
        const lineHeight = options.get(136 /* EditorOption.suggestLineHeight */) || fontInfo.lineHeight;
        const fontWeight = fontInfo.fontWeight;
        const fontSizePx = `${fontSize}px`;
        const lineHeightPx = `${lineHeight}px`;
        this.domNode.style.fontSize = fontSizePx;
        this.domNode.style.lineHeight = `${lineHeight / fontSize}`;
        this.domNode.style.fontWeight = fontWeight;
        this.domNode.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
        this._type.style.fontFamily = fontFamily;
        this._close.style.height = lineHeightPx;
        this._close.style.width = lineHeightPx;
    }
    getLayoutInfo() {
        const lineHeight = this._editor.getOption(136 /* EditorOption.suggestLineHeight */) || this._editor.getOption(59 /* EditorOption.fontInfo */).lineHeight;
        const borderWidth = isHighContrast(this._themeService.getColorTheme().type) ? 2 : 1;
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
        if (explainMode) {
            let md = '';
            md += `score: ${item.score[0]}\n`;
            md += `prefix: ${item.word ?? '(no prefix)'}\n`;
            md += `word: ${item.completion.filterText ? item.completion.filterText + ' (filterText)' : item.textLabel}\n`;
            md += `distance: ${item.distance} (localityBonus-setting)\n`;
            md += `index: ${item.idx}, based on ${item.completion.sortText && `sortText: "${item.completion.sortText}"` || 'label'}\n`;
            md += `commit_chars: ${item.completion.commitCharacters?.join('')}\n`;
            documentation = new MarkdownString().appendCodeblock('empty', md);
            detail = `Provider: ${item.provider._debugDisplayName}`;
        }
        if (!explainMode && !canExpandCompletionItem(item)) {
            this.clearContents();
            return;
        }
        this.domNode.classList.remove('no-docs', 'no-type');
        // --- details
        if (detail) {
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
        // --- documentation
        dom.clearNode(this._docs);
        if (typeof documentation === 'string') {
            this._docs.classList.remove('markdown-docs');
            this._docs.textContent = documentation;
        }
        else if (documentation) {
            this._docs.classList.add('markdown-docs');
            dom.clearNode(this._docs);
            const renderedContents = this._markdownRendererService.render(documentation, {
                context: this._editor,
                asyncRenderCallback: () => {
                    this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
                    this._onDidChangeContents.fire(this);
                }
            });
            this._docs.appendChild(renderedContents.element);
            this._renderDisposeable.add(renderedContents);
        }
        this.domNode.classList.toggle('detail-and-doc', !!detail && !!documentation);
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
        this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
        this._onDidChangeContents.fire(this);
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
    focus() {
        this.domNode.focus();
    }
};
SuggestDetailsWidget = __decorate([
    __param(1, IThemeService),
    __param(2, IMarkdownRendererService)
], SuggestDetailsWidget);
export { SuggestDetailsWidget };
export class SuggestDetailsOverlay {
    constructor(widget, _editor) {
        this.widget = widget;
        this._editor = _editor;
        this.allowEditorOverflow = true;
        this._disposables = new DisposableStore();
        this._added = false;
        this._preferAlignAtTop = true;
        this._resizable = new ResizableHTMLElement();
        this._resizable.domNode.classList.add('suggest-details-container');
        this._resizable.domNode.appendChild(widget.domNode);
        this._resizable.enableSashes(false, true, true, false);
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
                this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size, this._preferAlignAtTop);
            }
        }));
    }
    dispose() {
        this._resizable.dispose();
        this._disposables.dispose();
        this.hide();
    }
    getId() {
        return 'suggest.details';
    }
    getDomNode() {
        return this._resizable.domNode;
    }
    getPosition() {
        return this._topLeft ? { preference: this._topLeft } : null;
    }
    show() {
        if (!this._added) {
            this._editor.addOverlayWidget(this);
            this._added = true;
        }
    }
    hide(sessionEnded = false) {
        this._resizable.clearSashHoverState();
        if (this._added) {
            this._editor.removeOverlayWidget(this);
            this._added = false;
            this._anchorBox = undefined;
            this._topLeft = undefined;
        }
        if (sessionEnded) {
            this._userSize = undefined;
            this.widget.clearContents();
        }
    }
    placeAtAnchor(anchor, preferAlignAtTop) {
        const anchorBox = anchor.getBoundingClientRect();
        this._anchorBox = anchorBox;
        this._preferAlignAtTop = preferAlignAtTop;
        this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size, preferAlignAtTop);
    }
    _placeAtAnchor(anchorBox, size, preferAlignAtTop) {
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
            const left = anchorBox.left;
            const maxSizeTop = new dom.Dimension(anchorBox.width - info.borderHeight, anchorBox.top - info.verticalPadding);
            const top = Math.max(info.verticalPadding, anchorBox.top - size.height);
            return { top, left, fit: maxSizeTop.height - size.height, maxSizeTop, maxSizeBottom: maxSizeTop, minSize: defaultMinSize.with(maxSizeTop.width) };
        })();
        // take first placement that fits or the first with "least bad" fit
        // when the suggest widget is rendering above the cursor (preferAlignAtTop=false), prefer NORTH over SOUTH
        const verticalPlacement = preferAlignAtTop ? southPlacement : northPlacement;
        const placements = [eastPlacement, westPlacement, verticalPlacement];
        const placement = placements.find(p => p.fit >= 0) ?? placements.sort((a, b) => b.fit - a.fit)[0];
        // top/bottom placement
        const bottom = anchorBox.top + anchorBox.height - info.borderHeight;
        let alignAtTop;
        let height = size.height;
        const maxHeight = Math.max(placement.maxSizeTop.height, placement.maxSizeBottom.height);
        if (height > maxHeight) {
            height = maxHeight;
        }
        let maxSize;
        if (preferAlignAtTop) {
            if (height <= placement.maxSizeTop.height) {
                alignAtTop = true;
                maxSize = placement.maxSizeTop;
            }
            else {
                alignAtTop = false;
                maxSize = placement.maxSizeBottom;
            }
        }
        else {
            if (height <= placement.maxSizeBottom.height) {
                alignAtTop = false;
                maxSize = placement.maxSizeBottom;
            }
            else {
                alignAtTop = true;
                maxSize = placement.maxSizeTop;
            }
        }
        let { top, left } = placement;
        if (placement === northPlacement) {
            // For NORTH placement, position the details above the anchor
            top = anchorBox.top - height + info.borderWidth;
        }
        else if (!alignAtTop && height > anchorBox.height) {
            top = bottom - height;
        }
        const editorDomNode = this._editor.getDomNode();
        if (editorDomNode) {
            // get bounding rectangle of the suggest widget relative to the editor
            const editorBoundingBox = editorDomNode.getBoundingClientRect();
            top -= editorBoundingBox.top;
            left -= editorBoundingBox.left;
        }
        this._applyTopLeft({ left, top });
        // enableSashes(north, east, south, west)
        // For NORTH placement: enable north sash (resize upward from top), disable south (can't resize into the anchor)
        // Also enable west sash for horizontal resizing, consistent with SOUTH placement
        // For SOUTH placement and EAST/WEST placements: use existing logic based on alignAtTop
        if (placement === northPlacement) {
            this._resizable.enableSashes(true, false, false, true);
        }
        else {
            this._resizable.enableSashes(!alignAtTop, placement === eastPlacement, alignAtTop, placement !== eastPlacement);
        }
        this._resizable.minSize = placement.minSize;
        this._resizable.maxSize = maxSize;
        this._resizable.layout(height, Math.min(maxSize.width, size.width));
        this.widget.layout(this._resizable.size.width, this._resizable.size.height);
    }
    _applyTopLeft(topLeft) {
        this._topLeft = topLeft;
        this._editor.layoutOverlayWidget(this);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VnZ2VzdFdpZGdldERldGFpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdFdpZGdldERldGFpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNsRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pFLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVsRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUlyRyxNQUFNLFVBQVUsdUJBQXVCLENBQUMsSUFBZ0M7SUFDdkUsT0FBTyxDQUFDLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sS0FBSyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3ZJLENBQUM7QUFFTSxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFvQjtJQXFCaEMsWUFDa0IsT0FBb0IsRUFDdEIsYUFBNkMsRUFDbEMsd0JBQW1FO1FBRjVFLFlBQU8sR0FBUCxPQUFPLENBQWE7UUFDTCxrQkFBYSxHQUFiLGFBQWEsQ0FBZTtRQUNqQiw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTBCO1FBcEI3RSxnQkFBVyxHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFDMUMsZUFBVSxHQUFnQixJQUFJLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQztRQUV6Qyx5QkFBb0IsR0FBRyxJQUFJLE9BQU8sRUFBUSxDQUFDO1FBQ25ELHdCQUFtQixHQUFnQixJQUFJLENBQUMsb0JBQW9CLENBQUMsS0FBSyxDQUFDO1FBUTNELGlCQUFZLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUVyQyx1QkFBa0IsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBQ3BELFVBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBT3pDLElBQUksQ0FBQyxPQUFPLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUd0QyxJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFNUIsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDdEQsdUJBQXVCLEVBQUUsSUFBSTtTQUM3QixDQUFDLENBQUM7UUFDSCxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUV2QyxJQUFJLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDeEQsSUFBSSxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9GLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzNELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFHLFFBQVEsQ0FBQztRQUM1QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMxQixJQUFJLENBQUMsS0FBSyxHQUFHLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFFdkQsSUFBSSxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBRXJELElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUV0QixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQy9ELElBQUksQ0FBQyxDQUFDLFVBQVUsZ0NBQXVCLEVBQUUsQ0FBQztnQkFDekMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3ZCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU87UUFDTixJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNsQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNyQyxDQUFDO0lBRU8sY0FBYztRQUNyQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQzFDLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLGdDQUF1QixDQUFDO1FBQ3BELE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQ3BELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLHdDQUE4QixJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUM7UUFDaEYsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsMENBQWdDLElBQUksUUFBUSxDQUFDLFVBQVUsQ0FBQztRQUN0RixNQUFNLFVBQVUsR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDO1FBQ3ZDLE1BQU0sVUFBVSxHQUFHLEdBQUcsUUFBUSxJQUFJLENBQUM7UUFDbkMsTUFBTSxZQUFZLEdBQUcsR0FBRyxVQUFVLElBQUksQ0FBQztRQUV2QyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEdBQUcsVUFBVSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFVBQVUsR0FBRyxHQUFHLFVBQVUsR0FBRyxRQUFRLEVBQUUsQ0FBQztRQUMzRCxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzNDLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLG1CQUFtQixHQUFHLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQztRQUN0RSxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQ3pDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUM7UUFDeEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLFlBQVksQ0FBQztJQUN4QyxDQUFDO0lBRUQsYUFBYTtRQUNaLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUywwQ0FBZ0MsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsZ0NBQXVCLENBQUMsVUFBVSxDQUFDO1FBQ3RJLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwRixNQUFNLFlBQVksR0FBRyxXQUFXLEdBQUcsQ0FBQyxDQUFDO1FBQ3JDLE9BQU87WUFDTixVQUFVO1lBQ1YsV0FBVztZQUNYLFlBQVk7WUFDWixlQUFlLEVBQUUsRUFBRTtZQUNuQixpQkFBaUIsRUFBRSxFQUFFO1NBQ3JCLENBQUM7SUFDSCxDQUFDO0lBR0QsYUFBYTtRQUNaLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxHQUFHLEdBQUcsQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQy9ELElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQztRQUM1QixJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNsRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxVQUFVLENBQUMsSUFBb0IsRUFBRSxXQUFvQjtRQUNwRCxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFaEMsSUFBSSxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBRWhELElBQUksV0FBVyxFQUFFLENBQUM7WUFDakIsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDO1lBQ1osRUFBRSxJQUFJLFVBQVUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ2xDLEVBQUUsSUFBSSxXQUFXLElBQUksQ0FBQyxJQUFJLElBQUksYUFBYSxJQUFJLENBQUM7WUFDaEQsRUFBRSxJQUFJLFNBQVMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxHQUFHLGVBQWUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxDQUFDO1lBQzlHLEVBQUUsSUFBSSxhQUFhLElBQUksQ0FBQyxRQUFRLDRCQUE0QixDQUFDO1lBQzdELEVBQUUsSUFBSSxVQUFVLElBQUksQ0FBQyxHQUFHLGNBQWMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLElBQUksY0FBYyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsR0FBRyxJQUFJLE9BQU8sSUFBSSxDQUFDO1lBQzNILEVBQUUsSUFBSSxpQkFBaUIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQztZQUN0RSxhQUFhLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ2xFLE1BQU0sR0FBRyxhQUFhLElBQUksQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUN6RCxDQUFDO1FBRUQsSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDcEQsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3JCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVwRCxjQUFjO1FBRWQsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNaLE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUN0RixJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsR0FBRyxZQUFZLENBQUM7WUFDdEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLEdBQUcsWUFBWSxDQUFDO1lBQ2hDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDOUUsQ0FBQzthQUFNLENBQUM7WUFDUCxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxQixJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7WUFDdEIsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDckIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFFRCxvQkFBb0I7UUFDcEIsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDMUIsSUFBSSxPQUFPLGFBQWEsS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUN2QyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDN0MsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsYUFBYSxDQUFDO1FBRXhDLENBQUM7YUFBTSxJQUFJLGFBQWEsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUMxQyxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxQixNQUFNLGdCQUFnQixHQUFHLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNLENBQUMsYUFBYSxFQUFFO2dCQUM1RSxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU87Z0JBQ3JCLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtvQkFDekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUNqRixJQUFJLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN0QyxDQUFDO2FBQ0QsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsYUFBYSxDQUFDLENBQUM7UUFFN0UsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLE1BQU0sQ0FBQztRQUN2QyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUUzQixJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsR0FBRyxDQUFDLENBQUMsRUFBRTtZQUM3QixDQUFDLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDbkIsQ0FBQyxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3JCLENBQUMsQ0FBQztRQUNGLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxFQUFFO1lBQ3pCLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNuQixDQUFDLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN6QixDQUFDLENBQUM7UUFFRixJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFFekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2pGLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVELGFBQWE7UUFDWixJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO1FBQzVCLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQztJQUM3QixDQUFDO0lBRUQsSUFBSSxPQUFPO1FBQ1YsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVELElBQUksSUFBSTtRQUNQLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztJQUNuQixDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQWEsRUFBRSxNQUFjO1FBQ25DLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDakQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNoRCxJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sQ0FBQztZQUNyQixHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZDLENBQUM7UUFDRCxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFFRCxVQUFVLENBQUMsSUFBSSxHQUFHLENBQUM7UUFDbEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDO0lBQzlCLENBQUM7SUFFRCxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUM7UUFDaEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDO0lBQzlCLENBQUM7SUFFRCxTQUFTO1FBQ1IsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQzFCLENBQUM7SUFFRCxZQUFZO1FBQ1gsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUM7SUFDaEQsQ0FBQztJQUVELFFBQVE7UUFDUCxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ3JCLENBQUM7SUFFRCxNQUFNO1FBQ0wsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNuQixDQUFDO0lBRUQsS0FBSztRQUNKLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdEIsQ0FBQztDQUNELENBQUE7QUExT1ksb0JBQW9CO0lBdUI5QixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsd0JBQXdCLENBQUE7R0F4QmQsb0JBQW9CLENBME9oQzs7QUFPRCxNQUFNLE9BQU8scUJBQXFCO0lBYWpDLFlBQ1UsTUFBNEIsRUFDcEIsT0FBb0I7UUFENUIsV0FBTSxHQUFOLE1BQU0sQ0FBc0I7UUFDcEIsWUFBTyxHQUFQLE9BQU8sQ0FBYTtRQWI3Qix3QkFBbUIsR0FBRyxJQUFJLENBQUM7UUFFbkIsaUJBQVksR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRzlDLFdBQU0sR0FBWSxLQUFLLENBQUM7UUFFeEIsc0JBQWlCLEdBQVksSUFBSSxDQUFDO1FBU3pDLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1FBQzdDLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztRQUNuRSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXZELElBQUksVUFBdUMsQ0FBQztRQUM1QyxJQUFJLE9BQWtDLENBQUM7UUFDdkMsSUFBSSxRQUFRLEdBQVcsQ0FBQyxDQUFDO1FBQ3pCLElBQUksU0FBUyxHQUFXLENBQUMsQ0FBQztRQUMxQixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUU7WUFDMUQsVUFBVSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUM7WUFDM0IsT0FBTyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO1FBQ2hDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNyRCxJQUFJLFVBQVUsSUFBSSxPQUFPLEVBQUUsQ0FBQztnQkFDM0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFFMUQsSUFBSSxhQUFhLEdBQUcsS0FBSyxDQUFDO2dCQUMxQixJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDWixTQUFTLEdBQUcsT0FBTyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztvQkFDOUMsYUFBYSxHQUFHLElBQUksQ0FBQztnQkFDdEIsQ0FBQztnQkFDRCxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztvQkFDYixRQUFRLEdBQUcsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztvQkFDL0MsYUFBYSxHQUFHLElBQUksQ0FBQztnQkFDdEIsQ0FBQztnQkFDRCxJQUFJLGFBQWEsRUFBRSxDQUFDO29CQUNuQixJQUFJLENBQUMsYUFBYSxDQUFDO3dCQUNsQixHQUFHLEVBQUUsVUFBVSxDQUFDLEdBQUcsR0FBRyxRQUFRO3dCQUM5QixJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUksR0FBRyxTQUFTO3FCQUNqQyxDQUFDLENBQUM7Z0JBQ0osQ0FBQztZQUNGLENBQUM7WUFDRCxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDWixVQUFVLEdBQUcsU0FBUyxDQUFDO2dCQUN2QixPQUFPLEdBQUcsU0FBUyxDQUFDO2dCQUNwQixRQUFRLEdBQUcsQ0FBQyxDQUFDO2dCQUNiLFNBQVMsR0FBRyxDQUFDLENBQUM7Z0JBQ2QsSUFBSSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQzlCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLEVBQUU7WUFDMUQsSUFBSSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7Z0JBQ3JCLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ2xHLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU87UUFDTixJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDNUIsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2IsQ0FBQztJQUVELEtBQUs7UUFDSixPQUFPLGlCQUFpQixDQUFDO0lBQzFCLENBQUM7SUFFRCxVQUFVO1FBQ1QsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQztJQUNoQyxDQUFDO0lBRUQsV0FBVztRQUNWLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDN0QsQ0FBQztJQUVELElBQUk7UUFDSCxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xCLElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDcEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFDcEIsQ0FBQztJQUNGLENBQUM7SUFFRCxJQUFJLENBQUMsZUFBd0IsS0FBSztRQUNqQyxJQUFJLENBQUMsVUFBVSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFFdEMsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDakIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN2QyxJQUFJLENBQUMsTUFBTSxHQUFHLEtBQUssQ0FBQztZQUNwQixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztZQUM1QixJQUFJLENBQUMsUUFBUSxHQUFHLFNBQVMsQ0FBQztRQUMzQixDQUFDO1FBQ0QsSUFBSSxZQUFZLEVBQUUsQ0FBQztZQUNsQixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztZQUMzQixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQzdCLENBQUM7SUFDRixDQUFDO0lBRUQsYUFBYSxDQUFDLE1BQW1CLEVBQUUsZ0JBQXlCO1FBQzNELE1BQU0sU0FBUyxHQUFHLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQ2pELElBQUksQ0FBQyxVQUFVLEdBQUcsU0FBUyxDQUFDO1FBQzVCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQztRQUMxQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzVGLENBQUM7SUFFRCxjQUFjLENBQUMsU0FBbUMsRUFBRSxJQUFtQixFQUFFLGdCQUF5QjtRQUNqRyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFeEUsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUV6QyxNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbkUsTUFBTSxVQUFVLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQztRQUlqQyxPQUFPO1FBQ1AsTUFBTSxhQUFhLEdBQWMsQ0FBQztZQUNqQyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksR0FBRyxTQUFTLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7WUFDN0csTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQztZQUNsRSxNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN2SCxNQUFNLGFBQWEsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsR0FBRyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDOUgsT0FBTyxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDM0osQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVMLE9BQU87UUFDUCxNQUFNLGFBQWEsR0FBYyxDQUFDO1lBQ2pDLE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUM7WUFDekUsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsU0FBUyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUM5RixNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN2SCxNQUFNLGFBQWEsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsR0FBRyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDOUgsT0FBTyxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDM0osQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVMLFFBQVE7UUFDUixNQUFNLGNBQWMsR0FBYyxDQUFDO1lBQ2xDLE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUM7WUFDNUIsTUFBTSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQyxHQUFHLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQztZQUNqRSxNQUFNLGFBQWEsR0FBRyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxNQUFNLEdBQUcsU0FBUyxDQUFDLEdBQUcsR0FBRyxTQUFTLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN2SixPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsYUFBYSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzVKLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFFTCxRQUFRO1FBQ1IsTUFBTSxjQUFjLEdBQWMsQ0FBQztZQUNsQyxNQUFNLElBQUksR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDO1lBQzVCLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDaEgsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxVQUFVLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLGNBQWMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDbkosQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUVMLG1FQUFtRTtRQUNuRSwwR0FBMEc7UUFDMUcsTUFBTSxpQkFBaUIsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUM7UUFDN0UsTUFBTSxVQUFVLEdBQUcsQ0FBQyxhQUFhLEVBQUUsYUFBYSxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDckUsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWxHLHVCQUF1QjtRQUN2QixNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsR0FBRyxHQUFHLFNBQVMsQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQztRQUNwRSxJQUFJLFVBQW1CLENBQUM7UUFDeEIsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUN6QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDeEYsSUFBSSxNQUFNLEdBQUcsU0FBUyxFQUFFLENBQUM7WUFDeEIsTUFBTSxHQUFHLFNBQVMsQ0FBQztRQUNwQixDQUFDO1FBQ0QsSUFBSSxPQUFzQixDQUFDO1FBQzNCLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztZQUN0QixJQUFJLE1BQU0sSUFBSSxTQUFTLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxDQUFDO2dCQUMzQyxVQUFVLEdBQUcsSUFBSSxDQUFDO2dCQUNsQixPQUFPLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQztZQUNoQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsVUFBVSxHQUFHLEtBQUssQ0FBQztnQkFDbkIsT0FBTyxHQUFHLFNBQVMsQ0FBQyxhQUFhLENBQUM7WUFDbkMsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxNQUFNLElBQUksU0FBUyxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDOUMsVUFBVSxHQUFHLEtBQUssQ0FBQztnQkFDbkIsT0FBTyxHQUFHLFNBQVMsQ0FBQyxhQUFhLENBQUM7WUFDbkMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLFVBQVUsR0FBRyxJQUFJLENBQUM7Z0JBQ2xCLE9BQU8sR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDO1lBQ2hDLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsR0FBRyxTQUFTLENBQUM7UUFDOUIsSUFBSSxTQUFTLEtBQUssY0FBYyxFQUFFLENBQUM7WUFDbEMsNkRBQTZEO1lBQzdELEdBQUcsR0FBRyxTQUFTLENBQUMsR0FBRyxHQUFHLE1BQU0sR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQ2pELENBQUM7YUFBTSxJQUFJLENBQUMsVUFBVSxJQUFJLE1BQU0sR0FBRyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDckQsR0FBRyxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDdkIsQ0FBQztRQUNELE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDaEQsSUFBSSxhQUFhLEVBQUUsQ0FBQztZQUNuQixzRUFBc0U7WUFDdEUsTUFBTSxpQkFBaUIsR0FBRyxhQUFhLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUNoRSxHQUFHLElBQUksaUJBQWlCLENBQUMsR0FBRyxDQUFDO1lBQzdCLElBQUksSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUM7UUFDaEMsQ0FBQztRQUNELElBQUksQ0FBQyxhQUFhLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUVsQyx5Q0FBeUM7UUFDekMsZ0hBQWdIO1FBQ2hILGlGQUFpRjtRQUNqRix1RkFBdUY7UUFDdkYsSUFBSSxTQUFTLEtBQUssY0FBYyxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDeEQsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDLFVBQVUsRUFBRSxTQUFTLEtBQUssYUFBYSxFQUFFLFVBQVUsRUFBRSxTQUFTLEtBQUssYUFBYSxDQUFDLENBQUM7UUFDakgsQ0FBQztRQUVELElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUM7UUFDNUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ2xDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzdFLENBQUM7SUFFTyxhQUFhLENBQUMsT0FBd0I7UUFDN0MsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLENBQUM7UUFDeEIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUN4QyxDQUFDO0NBQ0QifQ==