/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BrowserFeatures } from '../../canIUse.js';
import * as DOM from '../../dom.js';
import { Disposable, DisposableStore, toDisposable } from '../../../common/lifecycle.js';
import { layout2d } from '../../../common/layout.js';
import * as platform from '../../../common/platform.js';
import './contextview.css';
export { AnchorAlignment, AnchorAxisAlignment, AnchorPosition } from '../../../common/layout.js';
export var ContextViewDOMPosition;
(function (ContextViewDOMPosition) {
    ContextViewDOMPosition[ContextViewDOMPosition["ABSOLUTE"] = 1] = "ABSOLUTE";
    ContextViewDOMPosition[ContextViewDOMPosition["FIXED"] = 2] = "FIXED";
    ContextViewDOMPosition[ContextViewDOMPosition["FIXED_SHADOW"] = 3] = "FIXED_SHADOW";
})(ContextViewDOMPosition || (ContextViewDOMPosition = {}));
export function isAnchor(obj) {
    const anchor = obj;
    return !!anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number';
}
export function getAnchorRect(anchor) {
    // Get the element's position and size (to anchor the view)
    if (DOM.isHTMLElement(anchor)) {
        const elementPosition = DOM.getDomNodePagePosition(anchor);
        // In areas where zoom is applied to the element or its ancestors, we need to adjust the size of the element
        // e.g. The title bar has counter zoom behavior meaning it applies the inverse of zoom level.
        // Window Zoom Level: 1.5, Title Bar Zoom: 1/1.5, Size Multiplier: 1.5
        const zoom = DOM.getDomNodeZoomLevel(anchor);
        return {
            top: elementPosition.top * zoom,
            left: elementPosition.left * zoom,
            width: elementPosition.width * zoom,
            height: elementPosition.height * zoom
        };
    }
    else if (isAnchor(anchor)) {
        return {
            top: anchor.y,
            left: anchor.x,
            width: anchor.width || 1,
            height: anchor.height || 2
        };
    }
    else {
        return {
            top: anchor.posy,
            left: anchor.posx,
            // We are about to position the context view where the mouse
            // cursor is. To prevent the view being exactly under the mouse
            // when showing and thus potentially triggering an action within,
            // we treat the mouse location like a small sized block element.
            width: 2,
            height: 2
        };
    }
}
export class ContextView extends Disposable {
    static { this.BUBBLE_UP_EVENTS = ['click', 'keydown', 'focus', 'blur']; }
    static { this.BUBBLE_DOWN_EVENTS = ['click']; }
    constructor(container, domPosition) {
        super();
        this.container = null;
        this.useFixedPosition = false;
        this.useShadowDOM = false;
        this.delegate = null;
        this.toDisposeOnClean = Disposable.None;
        this.toDisposeOnSetContainer = Disposable.None;
        this.shadowRoot = null;
        this.shadowRootHostElement = null;
        this.view = DOM.$('.context-view');
        DOM.hide(this.view);
        this.setContainer(container, domPosition);
        this._register(toDisposable(() => this.setContainer(null, 1 /* ContextViewDOMPosition.ABSOLUTE */)));
    }
    setContainer(container, domPosition) {
        this.useFixedPosition = domPosition !== 1 /* ContextViewDOMPosition.ABSOLUTE */;
        const usedShadowDOM = this.useShadowDOM;
        this.useShadowDOM = domPosition === 3 /* ContextViewDOMPosition.FIXED_SHADOW */;
        if (container === this.container && usedShadowDOM === this.useShadowDOM) {
            return; // container is the same and no shadow DOM usage has changed
        }
        if (this.container) {
            this.toDisposeOnSetContainer.dispose();
            this.view.remove();
            if (this.shadowRoot) {
                this.shadowRoot = null;
                this.shadowRootHostElement?.remove();
                this.shadowRootHostElement = null;
            }
            this.container = null;
        }
        if (container) {
            this.container = container;
            if (this.useShadowDOM) {
                this.shadowRootHostElement = DOM.$('.shadow-root-host');
                this.container.appendChild(this.shadowRootHostElement);
                this.shadowRoot = this.shadowRootHostElement.attachShadow({ mode: 'open' });
                const style = document.createElement('style');
                style.textContent = SHADOW_ROOT_CSS;
                this.shadowRoot.appendChild(style);
                this.shadowRoot.appendChild(this.view);
                this.shadowRoot.appendChild(DOM.$('slot'));
            }
            else {
                this.container.appendChild(this.view);
            }
            const toDisposeOnSetContainer = new DisposableStore();
            ContextView.BUBBLE_UP_EVENTS.forEach(event => {
                toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container, event, e => {
                    this.onDOMEvent(e, false);
                }));
            });
            ContextView.BUBBLE_DOWN_EVENTS.forEach(event => {
                toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container, event, e => {
                    this.onDOMEvent(e, true);
                }, true));
            });
            this.toDisposeOnSetContainer = toDisposeOnSetContainer;
        }
    }
    show(delegate) {
        if (this.isVisible()) {
            this.hide();
        }
        // Show static box
        DOM.clearNode(this.view);
        this.view.className = 'context-view monaco-component';
        this.view.style.top = '0px';
        this.view.style.left = '0px';
        this.view.style.zIndex = `${2575 + (delegate.layer ?? 0)}`;
        this.view.style.position = this.useFixedPosition ? 'fixed' : 'absolute';
        DOM.show(this.view);
        // Render content
        this.toDisposeOnClean = delegate.render(this.view) || Disposable.None;
        // Set active delegate
        this.delegate = delegate;
        // Layout
        this.doLayout();
        // Focus
        this.delegate.focus?.();
    }
    getViewElement() {
        return this.view;
    }
    layout() {
        if (!this.isVisible()) {
            return;
        }
        if (this.delegate.canRelayout === false && !(platform.isIOS && BrowserFeatures.pointerEvents)) {
            this.hide();
            return;
        }
        this.delegate?.layout?.();
        this.doLayout();
    }
    doLayout() {
        // Check that we still have a delegate - this.delegate.layout may have hidden
        if (!this.isVisible()) {
            return;
        }
        // Get anchor
        const anchor = getAnchorRect(this.delegate.getAnchor());
        const containerWindow = this.container ? DOM.getWindow(this.container) : DOM.getActiveWindow();
        const viewport = { top: containerWindow.pageYOffset, left: containerWindow.pageXOffset, width: containerWindow.innerWidth, height: containerWindow.innerHeight };
        const view = { width: DOM.getTotalWidth(this.view), height: DOM.getTotalHeight(this.view) };
        const anchorPosition = this.delegate.anchorPosition;
        const anchorAlignment = this.delegate.anchorAlignment;
        const anchorAxisAlignment = this.delegate.anchorAxisAlignment;
        const { top, left } = layout2d(viewport, view, anchor, { anchorAlignment, anchorPosition, anchorAxisAlignment });
        this.view.classList.remove('top', 'bottom', 'left', 'right');
        this.view.classList.add(anchorPosition === 0 /* AnchorPosition.BELOW */ ? 'bottom' : 'top');
        this.view.classList.add(anchorAlignment === 0 /* AnchorAlignment.LEFT */ ? 'left' : 'right');
        this.view.classList.toggle('fixed', this.useFixedPosition);
        const containerPosition = DOM.getDomNodePagePosition(this.container);
        // Account for container scroll when positioning the context view
        const containerScrollTop = this.container.scrollTop || 0;
        const containerScrollLeft = this.container.scrollLeft || 0;
        this.view.style.top = `${top - (this.useFixedPosition ? DOM.getDomNodePagePosition(this.view).top : containerPosition.top) + containerScrollTop}px`;
        this.view.style.left = `${left - (this.useFixedPosition ? DOM.getDomNodePagePosition(this.view).left : containerPosition.left) + containerScrollLeft}px`;
        this.view.style.width = 'initial';
    }
    hide(data) {
        const delegate = this.delegate;
        this.delegate = null;
        if (delegate?.onHide) {
            delegate.onHide(data);
        }
        this.toDisposeOnClean.dispose();
        DOM.hide(this.view);
    }
    isVisible() {
        return !!this.delegate;
    }
    onDOMEvent(e, onCapture) {
        if (this.delegate) {
            if (this.delegate.onDOMEvent) {
                this.delegate.onDOMEvent(e, DOM.getWindow(e).document.activeElement);
            }
            else if (onCapture && !DOM.isAncestor(e.target, this.container)) {
                this.hide();
            }
        }
    }
    dispose() {
        this.hide();
        super.dispose();
    }
}
const SHADOW_ROOT_CSS = /* css */ `
	:host {
		all: initial; /* 1st rule so subsequent properties are reset. */
	}

	.codicon[class*='codicon-'] {
		font: normal normal normal 16px/1 codicon;
		display: inline-block;
		text-decoration: none;
		text-rendering: auto;
		text-align: center;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		user-select: none;
		-webkit-user-select: none;
		-ms-user-select: none;
	}

	:host {
		font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", system-ui, "Ubuntu", "Droid Sans", sans-serif;
	}

	:host-context(.mac) { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
	:host-context(.mac:lang(zh-Hans)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif; }
	:host-context(.mac:lang(zh-Hant)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", sans-serif; }
	:host-context(.mac:lang(ja)) { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic Pro", sans-serif; }
	:host-context(.mac:lang(ko)) { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Nanum Gothic", "AppleGothic", sans-serif; }

	:host-context(.windows) { font-family: "Segoe WPC", "Segoe UI", sans-serif; }
	:host-context(.windows:lang(zh-Hans)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft YaHei", sans-serif; }
	:host-context(.windows:lang(zh-Hant)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft Jhenghei", sans-serif; }
	:host-context(.windows:lang(ja)) { font-family: "Segoe WPC", "Segoe UI", "Yu Gothic UI", "Meiryo UI", sans-serif; }
	:host-context(.windows:lang(ko)) { font-family: "Segoe WPC", "Segoe UI", "Malgun Gothic", "Dotom", sans-serif; }

	:host-context(.linux) { font-family: system-ui, "Ubuntu", "Droid Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hans)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans SC", "Source Han Sans CN", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hant)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans TC", "Source Han Sans TW", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ja)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans J", "Source Han Sans JP", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ko)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans K", "Source Han Sans JR", "Source Han Sans", "UnDotum", "FBaekmuk Gulim", sans-serif; }
`;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udGV4dHZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ25ELE9BQU8sS0FBSyxHQUFHLE1BQU0sY0FBYyxDQUFDO0FBRXBDLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3RHLE9BQU8sRUFBK0QsUUFBUSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbEgsT0FBTyxLQUFLLFFBQVEsTUFBTSw2QkFBNkIsQ0FBQztBQUV4RCxPQUFPLG1CQUFtQixDQUFDO0FBRTNCLE9BQU8sRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFakcsTUFBTSxDQUFOLElBQWtCLHNCQUlqQjtBQUpELFdBQWtCLHNCQUFzQjtJQUN2QywyRUFBWSxDQUFBO0lBQ1oscUVBQUssQ0FBQTtJQUNMLG1GQUFZLENBQUE7QUFDYixDQUFDLEVBSmlCLHNCQUFzQixLQUF0QixzQkFBc0IsUUFJdkM7QUFTRCxNQUFNLFVBQVUsUUFBUSxDQUFDLEdBQVk7SUFDcEMsTUFBTSxNQUFNLEdBQUcsR0FBa0QsQ0FBQztJQUVsRSxPQUFPLENBQUMsQ0FBQyxNQUFNLElBQUksT0FBTyxNQUFNLENBQUMsQ0FBQyxLQUFLLFFBQVEsSUFBSSxPQUFPLE1BQU0sQ0FBQyxDQUFDLEtBQUssUUFBUSxDQUFDO0FBQ2pGLENBQUM7QUFnQ0QsTUFBTSxVQUFVLGFBQWEsQ0FBQyxNQUFrRDtJQUMvRSwyREFBMkQ7SUFDM0QsSUFBSSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxF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