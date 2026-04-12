/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { isGridBranchNode } from '../../../../browser/ui/grid/gridview.js';
import { Emitter } from '../../../../common/event.js';
export class TestView {
    get minimumWidth() { return this._minimumWidth; }
    set minimumWidth(size) { this._minimumWidth = size; this._onDidChange.fire(undefined); }
    get maximumWidth() { return this._maximumWidth; }
    set maximumWidth(size) { this._maximumWidth = size; this._onDidChange.fire(undefined); }
    get minimumHeight() { return this._minimumHeight; }
    set minimumHeight(size) { this._minimumHeight = size; this._onDidChange.fire(undefined); }
    get maximumHeight() { return this._maximumHeight; }
    set maximumHeight(size) { this._maximumHeight = size; this._onDidChange.fire(undefined); }
    get element() { this._onDidGetElement.fire(); return this._element; }
    get width() { return this._width; }
    get height() { return this._height; }
    get top() { return this._top; }
    get left() { return this._left; }
    get size() { return [this.width, this.height]; }
    constructor(_minimumWidth, _maximumWidth, _minimumHeight, _maximumHeight) {
        this._minimumWidth = _minimumWidth;
        this._maximumWidth = _maximumWidth;
        this._minimumHeight = _minimumHeight;
        this._maximumHeight = _maximumHeight;
        this._onDidChange = new Emitter();
        this.onDidChange = this._onDidChange.event;
        this._element = document.createElement('div');
        this._onDidGetElement = new Emitter();
        this.onDidGetElement = this._onDidGetElement.event;
        this._width = 0;
        this._height = 0;
        this._top = 0;
        this._left = 0;
        this._onDidLayout = new Emitter();
        this.onDidLayout = this._onDidLayout.event;
        this._onDidFocus = new Emitter();
        this.onDidFocus = this._onDidFocus.event;
        assert(_minimumWidth <= _maximumWidth, 'gridview view minimum width must be <= maximum width');
        assert(_minimumHeight <= _maximumHeight, 'gridview view minimum height must be <= maximum height');
    }
    layout(width, height, top, left) {
        this._width = width;
        this._height = height;
        this._top = top;
        this._left = left;
        this._onDidLayout.fire({ width, height, top, left });
    }
    focus() {
        this._onDidFocus.fire();
    }
    dispose() {
        this._onDidChange.dispose();
        this._onDidGetElement.dispose();
        this._onDidLayout.dispose();
        this._onDidFocus.dispose();
    }
}
export function nodesToArrays(node) {
    if (isGridBranchNode(node)) {
        return node.children.map(nodesToArrays);
    }
    else {
        return node.view;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9icm93c2VyL3VpL2dyaWQvdXRpbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFZLGdCQUFnQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLDZCQUE2QixDQUFDO0FBRTdELE1BQU0sT0FBTyxRQUFRO0lBS3BCLElBQUksWUFBWSxLQUFhLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDekQsSUFBSSxZQUFZLENBQUMsSUFBWSxJQUFJLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWhHLElBQUksWUFBWSxLQUFhLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDekQsSUFBSSxZQUFZLENBQUMsSUFBWSxJQUFJLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWhHLElBQUksYUFBYSxLQUFhLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7SUFDM0QsSUFBSSxhQUFhLENBQUMsSUFBWSxJQUFJLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWxHLElBQUksYUFBYSxLQUFhLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7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