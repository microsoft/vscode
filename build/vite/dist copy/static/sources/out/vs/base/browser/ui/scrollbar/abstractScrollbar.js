/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from '../../dom.js';
import { createFastDomNode } from '../../fastDomNode.js';
import { GlobalPointerMoveMonitor } from '../../globalPointerMoveMonitor.js';
import { ScrollbarArrow } from './scrollbarArrow.js';
import { ScrollbarVisibilityController } from './scrollbarVisibilityController.js';
import { Widget } from '../widget.js';
import * as platform from '../../../common/platform.js';
/**
 * The orthogonal distance to the slider at which dragging "resets". This implements "snapping"
 */
const POINTER_DRAG_RESET_DISTANCE = 140;
export class AbstractScrollbar extends Widget {
    constructor(opts) {
        super();
        this._lazyRender = opts.lazyRender;
        this._host = opts.host;
        this._scrollable = opts.scrollable;
        this._scrollByPage = opts.scrollByPage;
        this._scrollbarState = opts.scrollbarState;
        this._visibilityController = this._register(new ScrollbarVisibilityController(opts.visibility, 'visible scrollbar ' + opts.extraScrollbarClassName, 'invisible scrollbar ' + opts.extraScrollbarClassName));
        this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
        this._pointerMoveMonitor = this._register(new GlobalPointerMoveMonitor());
        this._shouldRender = true;
        this.domNode = createFastDomNode(document.createElement('div'));
        this.domNode.setAttribute('role', 'presentation');
        this.domNode.setAttribute('aria-hidden', 'true');
        this._visibilityController.setDomNode(this.domNode);
        this.domNode.setPosition('absolute');
        this._register(dom.addDisposableListener(this.domNode.domNode, dom.EventType.POINTER_DOWN, (e) => this._domNodePointerDown(e)));
    }
    // ----------------- creation
    /**
     * Creates the dom node for an arrow & adds it to the container
     */
    _createArrow(opts) {
        const arrow = this._register(new ScrollbarArrow(opts));
        this.domNode.domNode.appendChild(arrow.bgDomNode);
        this.domNode.domNode.appendChild(arrow.domNode);
    }
    /**
     * Creates the slider dom node, adds it to the container & hooks up the events
     */
    _createSlider(top, left, width, height) {
        this.slider = createFastDomNode(document.createElement('div'));
        this.slider.setClassName('slider');
        this.slider.setPosition('absolute');
        this.slider.setTop(top);
        this.slider.setLeft(left);
        if (typeof width === 'number') {
            this.slider.setWidth(width);
        }
        if (typeof height === 'number') {
            this.slider.setHeight(height);
        }
        this.slider.setLayerHinting(true);
        this.slider.setContain('strict');
        this.domNode.domNode.appendChild(this.slider.domNode);
        this._register(dom.addDisposableListener(this.slider.domNode, dom.EventType.POINTER_DOWN, (e) => {
            if (e.button === 0) {
                e.preventDefault();
                this._sliderPointerDown(e);
            }
        }));
        this.onclick(this.slider.domNode, e => {
            if (e.leftButton) {
                e.stopPropagation();
            }
        });
    }
    // ----------------- Update state
    _onElementSize(visibleSize) {
        if (this._scrollbarState.setVisibleSize(visibleSize)) {
            this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
            this._shouldRender = true;
            if (!this._lazyRender) {
                this.render();
            }
        }
        return this._shouldRender;
    }
    _onElementScrollSize(elementScrollSize) {
        if (this._scrollbarState.setScrollSize(elementScrollSize)) {
            this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
            this._shouldRender = true;
            if (!this._lazyRender) {
                this.render();
            }
        }
        return this._shouldRender;
    }
    _onElementScrollPosition(elementScrollPosition) {
        if (this._scrollbarState.setScrollPosition(elementScrollPosition)) {
            this._visibilityController.setIsNeeded(this._scrollbarState.isNeeded());
            this._shouldRender = true;
            if (!this._lazyRender) {
                this.render();
            }
        }
        return this._shouldRender;
    }
    // ----------------- rendering
    beginReveal() {
        this._visibilityController.setShouldBeVisible(true);
    }
    beginHide() {
        this._visibilityController.setShouldBeVisible(false);
    }
    render() {
        if (!this._shouldRender) {
            return;
        }
        this._shouldRender = false;
        this._renderDomNode(this._scrollbarState.getRectangleLargeSize(), this._scrollbarState.getRectangleSmallSize());
        this._updateSlider(this._scrollbarState.getSliderSize(), this._scrollbarState.getArrowSize() + this._scrollbarState.getSliderPosition());
    }
    // ----------------- DOM events
    _domNodePointerDown(e) {
        if (e.target !== this.domNode.domNode) {
            return;
        }
        this._onPointerDown(e);
    }
    delegatePointerDown(e) {
        const domTop = this.domNode.domNode.getClientRects()[0].top;
        const sliderStart = domTop + this._scrollbarState.getSliderPosition();
        const sliderStop = domTop + this._scrollbarState.getSliderPosition() + this._scrollbarState.getSliderSize();
        const pointerPos = this._sliderPointerPosition(e);
        if (sliderStart <= pointerPos && pointerPos <= sliderStop) {
            // Act as if it was a pointer down on the slider
            if (e.button === 0) {
                e.preventDefault();
                this._sliderPointerDown(e);
            }
        }
        else {
            // Act as if it was a pointer down on the scrollbar
            this._onPointerDown(e);
        }
    }
    _onPointerDown(e) {
        let offsetX;
        let offsetY;
        if (e.target === this.domNode.domNode && typeof e.offsetX === 'number' && typeof e.offsetY === 'number') {
            offsetX = e.offsetX;
            offsetY = e.offsetY;
        }
        else {
            const domNodePosition = dom.getDomNodePagePosition(this.domNode.domNode);
            offsetX = e.pageX - domNodePosition.left;
            offsetY = e.pageY - domNodePosition.top;
        }
        const isMouse = (e.pointerType === 'mouse');
        const isLeftClick = (e.button === 0);
        if (isLeftClick || !isMouse) {
            const offset = this._pointerDownRelativePosition(offsetX, offsetY);
            this._setDesiredScrollPositionNow(this._scrollByPage
                ? this._scrollbarState.getDesiredScrollPositionFromOffsetPaged(offset)
                : this._scrollbarState.getDesiredScrollPositionFromOffset(offset));
        }
        if (isLeftClick) {
            // left button
            e.preventDefault();
            this._sliderPointerDown(e);
        }
    }
    _sliderPointerDown(e) {
        if (!e.target || !(e.target instanceof Element)) {
            return;
        }
        const initialPointerPosition = this._sliderPointerPosition(e);
        const initialPointerOrthogonalPosition = this._sliderOrthogonalPointerPosition(e);
        const initialScrollbarState = this._scrollbarState.clone();
        this.slider.toggleClassName('active', true);
        this._pointerMoveMonitor.startMonitoring(e.target, e.pointerId, e.buttons, (pointerMoveData) => {
            const pointerOrthogonalPosition = this._sliderOrthogonalPointerPosition(pointerMoveData);
            const pointerOrthogonalDelta = Math.abs(pointerOrthogonalPosition - initialPointerOrthogonalPosition);
            if (platform.isWindows && pointerOrthogonalDelta > POINTER_DRAG_RESET_DISTANCE) {
                // The pointer has wondered away from the scrollbar => reset dragging
                this._setDesiredScrollPositionNow(initialScrollbarState.getScrollPosition());
                return;
            }
            const pointerPosition = this._sliderPointerPosition(pointerMoveData);
            const pointerDelta = pointerPosition - initialPointerPosition;
            this._setDesiredScrollPositionNow(initialScrollbarState.getDesiredScrollPositionFromDelta(pointerDelta));
        }, () => {
            this.slider.toggleClassName('active', false);
            this._host.onDragEnd();
        });
        this._host.onDragStart();
    }
    _setDesiredScrollPositionNow(_desiredScrollPosition) {
        const desiredScrollPosition = {};
        this.writeScrollPosition(desiredScrollPosition, _desiredScrollPosition);
        this._scrollable.setScrollPositionNow(desiredScrollPosition);
    }
    updateScrollbarSize(scrollbarSize) {
        this._updateScrollbarSize(scrollbarSize);
        this._scrollbarState.setScrollbarSize(scrollbarSize);
        this._shouldRender = true;
        if (!this._lazyRender) {
            this.render();
        }
    }
    isNeeded() {
        return this._scrollbarState.isNeeded();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RTY3JvbGxiYXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL2Fic3RyYWN0U2Nyb2xsYmFyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sY0FBYyxDQUFDO0FBQ3BDLE9BQU8sRUFBRSxpQkFBaUIsRUFBZSxNQUFNLHNCQUFzQixDQUFDO0FBQ3RFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTdFLE9BQU8sRUFBRSxjQUFjLEVBQXlCLE1BQU0scUJBQXFCLENBQUM7QUFFNUUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGNBQWMsQ0FBQztBQUN0QyxPQUFPLEtBQUssUUFBUSxNQUFNLDZCQUE2QixDQUFDO0FBR3hEOztHQUVHO0FBQ0gsTUFBTSwyQkFBMkIsR0FBRyxHQUFHLENBQUM7QUF3QnhDLE1BQU0sT0FBZ0IsaUJBQWtCLFNBQVEsTUFBTTtJQWVyRCxZQUFZLElBQThCO1FBQ3pDLEtBQUssRUFBRSxDQUFDO1FBQ1IsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ25DLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztRQUN2QixJQUFJLENBQUMsV0FBVyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDbkMsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDO1FBQ3ZDLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQztRQUMzQyxJQUFJLENBQUMscUJBQXFCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLDZCQUE2QixD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