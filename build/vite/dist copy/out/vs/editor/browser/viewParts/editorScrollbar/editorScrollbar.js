/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../../../base/browser/dom.js';
import { createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { SmoothScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { PartFingerprints, ViewPart } from '../../view/viewPart.js';
import { getThemeTypeSelector } from '../../../../platform/theme/common/themeService.js';
/**
 * The editor scrollbar built on VS Code's scrollable element that sits beside
 * the minimap.
 */
export class EditorScrollbar extends ViewPart {
    constructor(context, linesContent, viewDomNode, overflowGuardDomNode) {
        super(context);
        const options = this._context.configuration.options;
        const scrollbar = options.get(117 /* EditorOption.scrollbar */);
        const mouseWheelScrollSensitivity = options.get(83 /* EditorOption.mouseWheelScrollSensitivity */);
        const fastScrollSensitivity = options.get(49 /* EditorOption.fastScrollSensitivity */);
        const scrollPredominantAxis = options.get(120 /* EditorOption.scrollPredominantAxis */);
        const inertialScroll = options.get(158 /* EditorOption.inertialScroll */);
        const scrollbarOptions = {
            listenOnDomNode: viewDomNode.domNode,
            className: 'editor-scrollable' + ' ' + getThemeTypeSelector(context.theme.type),
            useShadows: false,
            lazyRender: true,
            vertical: scrollbar.vertical,
            horizontal: scrollbar.horizontal,
            verticalHasArrows: scrollbar.verticalHasArrows,
            horizontalHasArrows: scrollbar.horizontalHasArrows,
            verticalScrollbarSize: scrollbar.verticalScrollbarSize,
            verticalSliderSize: scrollbar.verticalSliderSize,
            horizontalScrollbarSize: scrollbar.horizontalScrollbarSize,
            horizontalSliderSize: scrollbar.horizontalSliderSize,
            handleMouseWheel: scrollbar.handleMouseWheel,
            alwaysConsumeMouseWheel: scrollbar.alwaysConsumeMouseWheel,
            arrowSize: scrollbar.arrowSize,
            mouseWheelScrollSensitivity: mouseWheelScrollSensitivity,
            fastScrollSensitivity: fastScrollSensitivity,
            scrollPredominantAxis: scrollPredominantAxis,
            scrollByPage: scrollbar.scrollByPage,
            inertialScroll: inertialScroll,
        };
        this.scrollbar = this._register(new SmoothScrollableElement(linesContent.domNode, scrollbarOptions, this._context.viewLayout.getScrollable()));
        PartFingerprints.write(this.scrollbar.getDomNode(), 6 /* PartFingerprint.ScrollableElement */);
        this.scrollbarDomNode = createFastDomNode(this.scrollbar.getDomNode());
        this.scrollbarDomNode.setPosition('absolute');
        this._setLayout();
        // When having a zone widget that calls .focus() on one of its dom elements,
        // the browser will try desperately to reveal that dom node, unexpectedly
        // changing the .scrollTop of this.linesContent
        const onBrowserDesperateReveal = (domNode, lookAtScrollTop, lookAtScrollLeft) => {
            const newScrollPosition = {};
            if (lookAtScrollTop) {
                const deltaTop = domNode.scrollTop;
                if (deltaTop) {
                    newScrollPosition.scrollTop = this._context.viewLayout.getCurrentScrollTop() + deltaTop;
                    domNode.scrollTop = 0;
                }
            }
            if (lookAtScrollLeft) {
                const deltaLeft = domNode.scrollLeft;
                if (deltaLeft) {
                    newScrollPosition.scrollLeft = this._context.viewLayout.getCurrentScrollLeft() + deltaLeft;
                    domNode.scrollLeft = 0;
                }
            }
            this._context.viewModel.viewLayout.setScrollPosition(newScrollPosition, 1 /* ScrollType.Immediate */);
        };
        // I've seen this happen both on the view dom node & on the lines content dom node.
        this._register(dom.addDisposableListener(viewDomNode.domNode, 'scroll', (e) => onBrowserDesperateReveal(viewDomNode.domNode, true, true)));
        this._register(dom.addDisposableListener(linesContent.domNode, 'scroll', (e) => onBrowserDesperateReveal(linesContent.domNode, true, false)));
        this._register(dom.addDisposableListener(overflowGuardDomNode.domNode, 'scroll', (e) => onBrowserDesperateReveal(overflowGuardDomNode.domNode, true, false)));
        this._register(dom.addDisposableListener(this.scrollbarDomNode.domNode, 'scroll', (e) => onBrowserDesperateReveal(this.scrollbarDomNode.domNode, true, false)));
    }
    dispose() {
        super.dispose();
    }
    _setLayout() {
        const options = this._context.configuration.options;
        const layoutInfo = options.get(165 /* EditorOption.layoutInfo */);
        this.scrollbarDomNode.setLeft(layoutInfo.contentLeft);
        const minimap = options.get(81 /* EditorOption.minimap */);
        const side = minimap.side;
        if (side === 'right') {
            this.scrollbarDomNode.setWidth(layoutInfo.contentWidth + layoutInfo.minimap.minimapWidth);
        }
        else {
            this.scrollbarDomNode.setWidth(layoutInfo.contentWidth);
        }
        this.scrollbarDomNode.setHeight(layoutInfo.height);
    }
    getOverviewRulerLayoutInfo() {
        return this.scrollbar.getOverviewRulerLayoutInfo();
    }
    getDomNode() {
        return this.scrollbarDomNode;
    }
    delegateVerticalScrollbarPointerDown(browserEvent) {
        this.scrollbar.delegateVerticalScrollbarPointerDown(browserEvent);
    }
    delegateScrollFromMouseWheelEvent(browserEvent) {
        this.scrollbar.delegateScrollFromMouseWheelEvent(browserEvent);
    }
    // --- begin event handlers
    onConfigurationChanged(e) {
        if (e.hasChanged(117 /* EditorOption.scrollbar */)
            || e.hasChanged(83 /* EditorOption.mouseWheelScrollSensitivity */)
            || e.hasChanged(49 /* EditorOption.fastScrollSensitivity */)) {
            const options = this._context.configuration.options;
            const scrollbar = options.get(117 /* EditorOption.scrollbar */);
            const mouseWheelScrollSensitivity = options.get(83 /* EditorOption.mouseWheelScrollSensitivity */);
            const fastScrollSensitivity = options.get(49 /* EditorOption.fastScrollSensitivity */);
            const scrollPredominantAxis = options.get(120 /* EditorOption.scrollPredominantAxis */);
            const newOpts = {
                vertical: scrollbar.vertical,
                horizontal: scrollbar.horizontal,
                verticalScrollbarSize: scrollbar.verticalScrollbarSize,
                horizontalScrollbarSize: scrollbar.horizontalScrollbarSize,
                scrollByPage: scrollbar.scrollByPage,
                handleMouseWheel: scrollbar.handleMouseWheel,
                mouseWheelScrollSensitivity: mouseWheelScrollSensitivity,
                fastScrollSensitivity: fastScrollSensitivity,
                scrollPredominantAxis: scrollPredominantAxis
            };
            this.scrollbar.updateOptions(newOpts);
        }
        if (e.hasChanged(165 /* EditorOption.layoutInfo */)) {
            this._setLayout();
        }
        return true;
    }
    onScrollChanged(e) {
        return true;
    }
    onThemeChanged(e) {
        this.scrollbar.updateClassName('editor-scrollable' + ' ' + getThemeTypeSelector(this._context.theme.type));
        return true;
    }
    // --- end event handlers
    prepareRender(ctx) {
        // Nothing to do
    }
    render(ctx) {
        this.scrollbar.renderNow();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yU2Nyb2xsYmFyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvdmlld1BhcnRzL2VkaXRvclNjcm9sbGJhci9lZGl0b3JTY3JvbGxiYXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN6RixPQUFPLEVBQTRCLHVCQUF1QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFL0gsT0FBTyxFQUFtQixnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUtyRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUl6Rjs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sZUFBZ0IsU0FBUSxRQUFRO0lBSzVDLFlBQ0MsT0FBb0IsRUFDcEIsWUFBc0MsRUFDdEMsV0FBcUMsRUFDckMsb0JBQThDO1FBRTlDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUdmLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQztRQUNwRCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsR0FBRyxrQ0FBd0IsQ0FBQztRQUN0RCxNQUFNLDJCQUEyQixHQUFHLE9BQU8sQ0FBQyxHQUFHLG1EQUEwQyxDQUFDO1FBQzFGLE1BQU0scUJBQXFCLEdBQUcsT0FBTyxDQUFDLEdBQUcsNkNBQW9DLENBQUM7UUFDOUUsTUFBTSxxQkFBcUIsR0FBRyxPQUFPLENBQUMsR0FBRyw4Q0FBb0MsQ0FBQztRQUM5RSxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsR0FBRyx1Q0FBNkIsQ0FBQztRQUVoRSxNQUFNLGdCQUFnQixHQUFxQztZ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