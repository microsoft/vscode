/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/part.css';
import { Component } from '../common/component.js';
import { Dimension, size, getActiveDocument, prepend } from '../../base/browser/dom.js';
import { Emitter } from '../../base/common/event.js';
import { assertReturnsDefined } from '../../base/common/types.js';
import { toDisposable } from '../../base/common/lifecycle.js';
/**
 * Parts are layed out in the workbench and have their own layout that
 * arranges an optional title and mandatory content area to show content.
 */
export class Part extends Component {
    get dimension() { return this._dimension; }
    get contentPosition() { return this._contentPosition; }
    constructor(id, options, themeService, storageService, layoutService) {
        super(id, themeService, storageService);
        this.options = options;
        this.layoutService = layoutService;
        this._onDidVisibilityChange = this._register(new Emitter());
        this.onDidVisibilityChange = this._onDidVisibilityChange.event;
        //#region ISerializableView
        this._onDidChange = this._register(new Emitter());
        this._register(layoutService.registerPart(this));
    }
    onThemeChange(theme) {
        // only call if our create() method has been called
        if (this.parent) {
            super.onThemeChange(theme);
        }
    }
    /**
     * Note: Clients should not call this method, the workbench calls this
     * method. Calling it otherwise may result in unexpected behavior.
     *
     * Called to create title and content area of the part.
     */
    create(parent, options) {
        this.parent = parent;
        this.titleArea = this.createTitleArea(parent, options);
        this.contentArea = this.createContentArea(parent, options);
        this.partLayout = new PartLayout(this.options, this.contentArea);
        this.updateStyles();
    }
    /**
     * Returns the overall part container.
     */
    getContainer() {
        return this.parent;
    }
    /**
     * Subclasses override to provide a title area implementation.
     */
    createTitleArea(parent, options) {
        return undefined;
    }
    /**
     * Subclasses override to provide a content area implementation.
     */
    createContentArea(parent, options) {
        return undefined;
    }
    setHeaderArea(headerContainer) {
        if (this.headerArea) {
            throw new Error('Header already exists');
        }
        if (!this.parent || !this.titleArea) {
            return;
        }
        prepend(this.parent, headerContainer);
        headerContainer.classList.add('header-or-footer');
        headerContainer.classList.add('header');
        this.headerArea = headerContainer;
        this.partLayout?.setHeaderVisibility(true);
        this.relayout();
    }
    setFooterArea(footerContainer) {
        if (this.footerArea) {
            throw new Error('Footer already exists');
        }
        if (!this.parent || !this.titleArea) {
            return;
        }
        this.parent.appendChild(footerContainer);
        footerContainer.classList.add('header-or-footer');
        footerContainer.classList.add('footer');
        this.footerArea = footerContainer;
        this.partLayout?.setFooterVisibility(true);
        this.relayout();
    }
    removeHeaderArea() {
        if (this.headerArea) {
            this.headerArea.remove();
            this.headerArea = undefined;
            this.partLayout?.setHeaderVisibility(false);
            this.relayout();
        }
    }
    removeFooterArea() {
        if (this.footerArea) {
            this.footerArea.remove();
            this.footerArea = undefined;
            this.partLayout?.setFooterVisibility(false);
            this.relayout();
        }
    }
    relayout() {
        if (this.dimension && this.contentPosition) {
            this.layout(this.dimension.width, this.dimension.height, this.contentPosition.top, this.contentPosition.left);
        }
    }
    /**
     * Layout title and content area in the given dimension.
     */
    layoutContents(width, height) {
        const partLayout = assertReturnsDefined(this.partLayout);
        return partLayout.layout(width, height);
    }
    get onDidChange() { return this._onDidChange.event; }
    layout(width, height, top, left) {
        this._dimension = new Dimension(width, height);
        this._contentPosition = { top, left };
    }
    setVisible(visible) {
        this._onDidVisibilityChange.fire(visible);
    }
}
class PartLayout {
    static { this.HEADER_HEIGHT = 35; }
    static { this.TITLE_HEIGHT = 35; }
    static { this.Footer_HEIGHT = 35; }
    constructor(options, contentArea) {
        this.options = options;
        this.contentArea = contentArea;
        this.headerVisible = false;
        this.footerVisible = false;
    }
    layout(width, height) {
        // Title Size: Width (Fill), Height (Variable)
        let titleSize;
        if (this.options.hasTitle) {
            titleSize = new Dimension(width, Math.min(height, PartLayout.TITLE_HEIGHT));
        }
        else {
            titleSize = Dimension.None;
        }
        // Header Size: Width (Fill), Height (Variable)
        let headerSize;
        if (this.headerVisible) {
            headerSize = new Dimension(width, Math.min(height, PartLayout.HEADER_HEIGHT));
        }
        else {
            headerSize = Dimension.None;
        }
        // Footer Size: Width (Fill), Height (Variable)
        let footerSize;
        if (this.footerVisible) {
            footerSize = new Dimension(width, Math.min(height, PartLayout.Footer_HEIGHT));
        }
        else {
            footerSize = Dimension.None;
        }
        let contentWidth = width;
        if (this.options && typeof this.options.borderWidth === 'function') {
            contentWidth -= this.options.borderWidth(); // adjust for border size
        }
        // Content Size: Width (Fill), Height (Variable)
        const contentSize = new Dimension(contentWidth, height - titleSize.height - headerSize.height - footerSize.height);
        // Content
        if (this.contentArea) {
            size(this.contentArea, contentSize.width, contentSize.height);
        }
        return { headerSize, titleSize, contentSize, footerSize };
    }
    setFooterVisibility(visible) {
        this.footerVisible = visible;
    }
    setHeaderVisibility(visible) {
        this.headerVisible = visible;
    }
}
export class MultiWindowParts extends Component {
    constructor() {
        super(...arguments);
        this._parts = new Set();
    }
    get parts() { return Array.from(this._parts); }
    registerPart(part) {
        this._parts.add(part);
        return toDisposable(() => this.unregisterPart(part));
    }
    unregisterPart(part) {
        this._parts.delete(part);
    }
    getPart(container) {
        return this.getPartByDocument(container.ownerDocument);
    }
    getPartByDocument(document) {
        if (this._parts.size > 1) {
            for (const part of this._parts) {
                if (part.element?.ownerDocument === document) {
                    return part;
                }
            }
        }
        return this.mainPart;
    }
    get activePart() {
        return this.getPartByDocument(getActiveDocument());
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxrQkFBa0IsQ0FBQztBQUMxQixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFbkQsT0FBTyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQWMsaUJBQWlCLEVBQUUsT0FBTyxFQUFnQixNQUFNLDJCQUEyQixDQUFDO0FBR2xILE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNsRSxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFjM0U7OztHQUdHO0FBQ0gsTUFBTSxPQUFnQixJQUEwQyxTQUFRLFNBQXNCO0lBRzdGLElBQUksU0FBUyxLQUE0QixPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBR2xFLElBQUksZUFBZSxLQUErQixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7SUFZakYsWUFDQyxFQUFVLEVBQ0EsT0FBcUIsRUFDL0IsWUFBMkIsRUFDM0IsY0FBK0IsRUFDWixhQUFzQztRQUV6RCxLQUFLLENBQUMsRUFBRSxFQUFFLFlBQVksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUw5QixZQUFPLEdBQVAsT0FBTyxDQUFjO1FBR1osa0JBQWEsR0FBYixhQUFhLENBQXlCO1FBZmhELDJCQUFzQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVcsQ0FBQyxDQUFDO1FBQ2pFLDBCQUFxQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxLQUFLLENBQUM7UUFzSW5FLDJCQUEyQjtRQUVqQixp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