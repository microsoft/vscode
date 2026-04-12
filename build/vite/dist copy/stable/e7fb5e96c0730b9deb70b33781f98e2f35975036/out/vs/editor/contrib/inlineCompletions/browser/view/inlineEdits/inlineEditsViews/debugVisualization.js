/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { derived } from '../../../../../../../base/common/observable.js';
export function setVisualization(data, visualization) {
    // eslint-disable-next-line local/code-no-any-casts
    data['$$visualization'] = visualization;
}
export function debugLogRects(rects, elem) {
    if (Array.isArray(rects)) {
        const record = {};
        rects.forEach((rect, index) => {
            record[index.toString()] = rect;
        });
        rects = record;
    }
    setVisualization(rects, new ManyRectVisualizer(rects, elem));
    return rects;
}
export function debugLogRect(rect, elem, name) {
    setVisualization(rect, new HtmlRectVisualizer(rect, elem, name));
    return rect;
}
export function debugLogHorizontalOffsetRange(rect, elem, name) {
    setVisualization(rect, new HtmlHorizontalOffsetRangeVisualizer(rect, elem, name, 0, 'above'));
    return rect;
}
export function debugLogHorizontalOffsetRanges(rects, elem) {
    if (Array.isArray(rects)) {
        const record = {};
        rects.forEach((rect, index) => {
            record[index.toString()] = rect;
        });
        rects = record;
    }
    setVisualization(rects, new ManyHorizontalOffsetRangeVisualizer(rects, elem));
    return rects;
}
class ManyRectVisualizer {
    constructor(_rects, _elem) {
        this._rects = _rects;
        this._elem = _elem;
    }
    visualize() {
        const d = [];
        for (const key in this._rects) {
            const v = new HtmlRectVisualizer(this._rects[key], this._elem, key);
            d.push(v.visualize());
        }
        return {
            dispose: () => {
                d.forEach(d => d.dispose());
            }
        };
    }
}
class ManyHorizontalOffsetRangeVisualizer {
    constructor(_rects, _elem) {
        this._rects = _rects;
        this._elem = _elem;
    }
    visualize() {
        const d = [];
        const keys = Object.keys(this._rects);
        keys.forEach((key, index) => {
            // Stagger labels: odd indices go above, even indices go below
            const labelPosition = index % 2 === 0 ? 'above' : 'below';
            const v = new HtmlHorizontalOffsetRangeVisualizer(this._rects[key], this._elem, key, index * 12, labelPosition);
            d.push(v.visualize());
        });
        return {
            dispose: () => {
                d.forEach(d => d.dispose());
            }
        };
    }
}
class HtmlHorizontalOffsetRangeVisualizer {
    constructor(_rect, _elem, _name, _verticalOffset = 0, _labelPosition = 'above') {
        this._rect = _rect;
        this._elem = _elem;
        this._name = _name;
        this._verticalOffset = _verticalOffset;
        this._labelPosition = _labelPosition;
    }
    visualize() {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '100000';
        // Create horizontal line
        const horizontalLine = document.createElement('div');
        horizontalLine.style.position = 'absolute';
        horizontalLine.style.height = '2px';
        horizontalLine.style.backgroundColor = 'green';
        horizontalLine.style.top = '50%';
        horizontalLine.style.transform = 'translateY(-50%)';
        // Create start vertical bar
        const startBar = document.createElement('div');
        startBar.style.position = 'absolute';
        startBar.style.width = '2px';
        startBar.style.height = '8px';
        startBar.style.backgroundColor = 'green';
        startBar.style.left = '0';
        startBar.style.top = '50%';
        startBar.style.transform = 'translateY(-50%)';
        // Create end vertical bar
        const endBar = document.createElement('div');
        endBar.style.position = 'absolute';
        endBar.style.width = '2px';
        endBar.style.height = '8px';
        endBar.style.backgroundColor = 'green';
        endBar.style.right = '0';
        endBar.style.top = '50%';
        endBar.style.transform = 'translateY(-50%)';
        // Create label
        const label = document.createElement('div');
        label.textContent = this._name;
        label.style.position = 'absolute';
        // Position label above or below the line to avoid overlaps
        if (this._labelPosition === 'above') {
            label.style.bottom = '12px';
        }
        else {
            label.style.top = '12px';
        }
        label.style.left = '2px'; // Slight offset from start
        label.style.color = 'green';
        label.style.fontSize = '10px';
        label.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
        label.style.padding = '1px 3px';
        label.style.border = '1px solid green';
        label.style.borderRadius = '2px';
        label.style.whiteSpace = 'nowrap';
        label.style.boxShadow = '0 1px 2px rgba(0,0,0,0.15)';
        label.style.fontFamily = 'monospace';
        container.appendChild(horizontalLine);
        container.appendChild(startBar);
        container.appendChild(endBar);
        container.appendChild(label);
        const updatePosition = () => {
            const elemRect = this._elem.getBoundingClientRect();
            const centerY = this._rect.top + (this._rect.height / 2) + this._verticalOffset;
            const left = elemRect.left + this._rect.left;
            const width = this._rect.width;
            container.style.left = left + 'px';
            container.style.top = (elemRect.top + centerY) + 'px';
            container.style.width = width + 'px';
            container.style.height = '8px';
            horizontalLine.style.width = width + 'px';
        };
        // This is for debugging only
        // eslint-disable-next-line no-restricted-syntax
        document.body.appendChild(container);
        updatePosition();
        const observer = new ResizeObserver(updatePosition);
        observer.observe(this._elem);
        return {
            dispose: () => {
                observer.disconnect();
                container.remove();
            }
        };
    }
}
class HtmlRectVisualizer {
    constructor(_rect, _elem, _name) {
        this._rect = _rect;
        this._elem = _elem;
        this._name = _name;
    }
    visualize() {
        const div = document.createElement('div');
        div.style.position = 'fixed';
        div.style.border = '1px solid red';
        div.style.boxSizing = 'border-box';
        div.style.pointerEvents = 'none';
        div.style.zIndex = '100000';
        const label = document.createElement('div');
        label.textContent = this._name;
        label.style.position = 'absolute';
        label.style.top = '-20px';
        label.style.left = '0';
        label.style.color = 'red';
        label.style.fontSize = '12px';
        label.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
        div.appendChild(label);
        const updatePosition = () => {
            const elemRect = this._elem.getBoundingClientRect();
            console.log(elemRect);
            div.style.left = (elemRect.left + this._rect.left) + 'px';
            div.style.top = (elemRect.top + this._rect.top) + 'px';
            div.style.width = this._rect.width + 'px';
            div.style.height = this._rect.height + 'px';
        };
        // This is for debugging only
        // eslint-disable-next-line no-restricted-syntax
        document.body.appendChild(div);
        updatePosition();
        const observer = new ResizeObserver(updatePosition);
        observer.observe(this._elem);
        return {
            dispose: () => {
                observer.disconnect();
                div.remove();
            }
        };
    }
}
export function debugView(value, reader) {
    if (typeof value === 'object' && value && '$$visualization' in value) {
        const vis = value['$$visualization'];
        debugReadDisposable(vis.visualize(), reader);
    }
}
function debugReadDisposable(d, reader) {
    derived({ name: 'debugReadDisposable' }, (_reader) => {
        _reader.store.add(d);
        return undefined;
    }).read(reader);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdWaXN1YWxpemF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld3MvZGVidWdWaXN1YWxpemF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBVyxPQUFPLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQU9sRixNQUFNLFVBQVUsZ0JBQWdCLENBQUMsSUFBWSxFQUFFLGFBQW1DO0lBQ2pGLG1EQUFtRDtJQUNsRCxJQUFZLENBQUMsaUJBQWlCLENBQUMsR0FBRyxhQUFhLENBQUM7QUFDbEQsQ0FBQztBQUVELE1BQU0sVUFBVSxhQUFhLENBQUMsS0FBb0MsRUFBRSxJQUFpQjtJQUNwRixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUMxQixNQUFNLE1BQU0sR0FBeUIsRUFBRSxDQUFDO1FBQ3hDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDN0IsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQztRQUNqQyxDQUFDLENBQUMsQ0FBQztRQUNILEtBQUssR0FBRyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUVELGdCQUFnQixDQUFDLEtBQUssRUFBRSxJQUFJLGtCQUFrQixDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQzdELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELE1BQU0sVUFBVSxZQUFZLENBQUMsSUFBVSxFQUFFLElBQWlCLEVBQUUsSUFBWTtJQUN2RSxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxrQkFBa0IsQ0FBQyxJ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