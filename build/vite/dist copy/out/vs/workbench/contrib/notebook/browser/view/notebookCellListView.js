/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ListView } from '../../../../../base/browser/ui/list/listView.js';
import { ConstantTimePrefixSumComputer } from '../../../../../editor/common/model/prefixSumComputer.js';
export class NotebookCellsLayout {
    get paddingTop() {
        return this._paddingTop;
    }
    set paddingTop(paddingTop) {
        this._size = this._size + paddingTop - this._paddingTop;
        this._paddingTop = paddingTop;
    }
    get count() {
        return this._items.length;
    }
    /**
     * Returns the sum of the sizes of all items in the range map.
     */
    get size() {
        return this._size;
    }
    constructor(topPadding) {
        this._items = [];
        this._whitespace = [];
        this._prefixSumComputer = new ConstantTimePrefixSumComputer([]);
        this._size = 0;
        this._paddingTop = 0;
        this._paddingTop = topPadding ?? 0;
        this._size = this._paddingTop;
    }
    getWhitespaces() {
        return this._whitespace;
    }
    restoreWhitespace(items) {
        this._whitespace = items;
        this._size = this._paddingTop + this._items.reduce((total, item) => total + item.size, 0) + this._whitespace.reduce((total, ws) => total + ws.size, 0);
    }
    /**
     */
    splice(index, deleteCount, items) {
        const inserts = items ?? [];
        // Perform the splice operation on the items array.
        this._items.splice(index, deleteCount, ...inserts);
        this._size = this._paddingTop + this._items.reduce((total, item) => total + item.size, 0) + this._whitespace.reduce((total, ws) => total + ws.size, 0);
        this._prefixSumComputer.removeValues(index, deleteCount);
        // inserts should also include whitespaces
        const newSizes = [];
        for (let i = 0; i < inserts.length; i++) {
            const insertIndex = i + index;
            const existingWhitespaces = this._whitespace.filter(ws => ws.afterPosition === insertIndex + 1);
            if (existingWhitespaces.length > 0) {
                newSizes.push(inserts[i].size + existingWhitespaces.reduce((acc, ws) => acc + ws.size, 0));
            }
            else {
                newSizes.push(inserts[i].size);
            }
        }
        this._prefixSumComputer.insertValues(index, newSizes);
        // Now that the items array has been updated, and the whitespaces are updated elsewhere, if an item is removed/inserted, the accumlated size of the items are all updated.
        // Loop through all items from the index where the splice started, to the end
        for (let i = index; i < this._items.length; i++) {
            const existingWhitespaces = this._whitespace.filter(ws => ws.afterPosition === i + 1);
            if (existingWhitespaces.length > 0) {
                this._prefixSumComputer.setValue(i, this._items[i].size + existingWhitespaces.reduce((acc, ws) => acc + ws.size, 0));
            }
            else {
                this._prefixSumComputer.setValue(i, this._items[i].size);
            }
        }
    }
    insertWhitespace(id, afterPosition, size) {
        let priority = 0;
        const existingWhitespaces = this._whitespace.filter(ws => ws.afterPosition === afterPosition);
        if (existingWhitespaces.length > 0) {
            priority = Math.max(...existingWhitespaces.map(ws => ws.priority)) + 1;
        }
        this._whitespace.push({ id, afterPosition: afterPosition, size, priority });
        this._size += size; // Update the total size to include the whitespace
        this._whitespace.sort((a, b) => {
            if (a.afterPosition === b.afterPosition) {
                return a.priority - b.priority;
            }
            return a.afterPosition - b.afterPosition;
        });
        // find item size of index
        if (afterPosition > 0) {
            const index = afterPosition - 1;
            const itemSize = this._items[index].size;
            const accSize = itemSize + size;
            this._prefixSumComputer.setValue(index, accSize);
        }
    }
    changeOneWhitespace(id, afterPosition, size) {
        const whitespaceIndex = this._whitespace.findIndex(ws => ws.id === id);
        if (whitespaceIndex !== -1) {
            const whitespace = this._whitespace[whitespaceIndex];
            const oldAfterPosition = whitespace.afterPosition;
            whitespace.afterPosition = afterPosition;
            const oldSize = whitespace.size;
            const delta = size - oldSize;
            whitespace.size = size;
            this._size += delta;
            if (oldAfterPosition > 0 && oldAfterPosition <= this._items.length) {
                const index = oldAfterPosition - 1;
                const itemSize = this._items[index].size;
                const accSize = itemSize;
                this._prefixSumComputer.setValue(index, accSize);
            }
            if (afterPosition > 0 && afterPosition <= this._items.length) {
                const index = afterPosition - 1;
                const itemSize = this._items[index].size;
                const accSize = itemSize + size;
                this._prefixSumComputer.setValue(index, accSize);
            }
        }
    }
    removeWhitespace(id) {
        const whitespaceIndex = this._whitespace.findIndex(ws => ws.id === id);
        if (whitespaceIndex !== -1) {
            const whitespace = this._whitespace[whitespaceIndex];
            this._whitespace.splice(whitespaceIndex, 1);
            this._size -= whitespace.size; // Reduce the total size by the size of the removed whitespace
            if (whitespace.afterPosition > 0) {
                const index = whitespace.afterPosition - 1;
                const itemSize = this._items[index].size;
                const remainingWhitespaces = this._whitespace.filter(ws => ws.afterPosition === whitespace.afterPosition);
                const accSize = itemSize + remainingWhitespaces.reduce((acc, ws) => acc + ws.size, 0);
                this._prefixSumComputer.setValue(index, accSize);
            }
        }
    }
    /**
     * find position of whitespace
     * @param id: id of the whitespace
     * @returns: position in the list view
     */
    getWhitespacePosition(id) {
        const whitespace = this._whitespace.find(ws => ws.id === id);
        if (!whitespace) {
            throw new Error('Whitespace not found');
        }
        const afterPosition = whitespace.afterPosition;
        if (afterPosition === 0) {
            // find all whitespaces at the same position but with higher priority (smaller number)
            const whitespaces = this._whitespace.filter(ws => ws.afterPosition === afterPosition && ws.priority < whitespace.priority);
            return whitespaces.reduce((acc, ws) => acc + ws.size, 0) + this.paddingTop;
        }
        const whitespaceBeforeFirstItem = this._whitespace.filter(ws => ws.afterPosition === 0).reduce((acc, ws) => acc + ws.size, 0);
        // previous item index
        const index = afterPosition - 1;
        const previousItemPosition = this._prefixSumComputer.getPrefixSum(index);
        const previousItemSize = this._items[index].size;
        return previousItemPosition + previousItemSize + whitespaceBeforeFirstItem + this.paddingTop;
    }
    indexAt(position) {
        if (position < 0) {
            return -1;
        }
        const whitespaceBeforeFirstItem = this._whitespace.filter(ws => ws.afterPosition === 0).reduce((acc, ws) => acc + ws.size, 0);
        const offset = position - (this._paddingTop + whitespaceBeforeFirstItem);
        if (offset <= 0) {
            return 0;
        }
        if (offset >= (this._size - this._paddingTop - whitespaceBeforeFirstItem)) {
            return this.count;
        }
        return this._prefixSumComputer.getIndexOf(Math.trunc(offset)).index;
    }
    indexAfter(position) {
        const index = this.indexAt(position);
        return Math.min(index + 1, this._items.length);
    }
    positionAt(index) {
        if (index < 0) {
            return -1;
        }
        if (this.count === 0) {
            return -1;
        }
        // index is zero based, if index+1 > this.count, then it points to the fictitious element after the last element of this array.
        if (index >= this.count) {
            return -1;
        }
        const whitespaceBeforeFirstItem = this._whitespace.filter(ws => ws.afterPosition === 0).reduce((acc, ws) => acc + ws.size, 0);
        return this._prefixSumComputer.getPrefixSum(index /** count */) + this._paddingTop + whitespaceBeforeFirstItem;
    }
}
export class NotebookCellListView extends ListView {
    constructor() {
        super(...arguments);
        this._lastWhitespaceId = 0;
        this._renderingStack = 0;
    }
    get inRenderingTransaction() {
        return this._renderingStack > 0;
    }
    get notebookRangeMap() {
        return this.rangeMap;
    }
    render(previousRenderRange, renderTop, renderHeight, renderLeft, scrollWidth, updateItemsInDOM) {
        this._renderingStack++;
        super.render(previousRenderRange, renderTop, renderHeight, renderLeft, scrollWidth, updateItemsInDOM);
        this._renderingStack--;
    }
    _rerender(renderTop, renderHeight, inSmoothScrolling) {
        this._renderingStack++;
        super._rerender(renderTop, renderHeight, inSmoothScrolling);
        this._renderingStack--;
    }
    createRangeMap(paddingTop) {
        const existingMap = this.rangeMap;
        if (existingMap) {
            const layout = new NotebookCellsLayout(paddingTop);
            layout.restoreWhitespace(existingMap.getWhitespaces());
            return layout;
        }
        else {
            return new NotebookCellsLayout(paddingTop);
        }
    }
    insertWhitespace(afterPosition, size) {
        const scrollTop = this.scrollTop;
        const id = `${++this._lastWhitespaceId}`;
        const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
        const elementPosition = this.elementTop(afterPosition);
        const aboveScrollTop = scrollTop > elementPosition;
        this.notebookRangeMap.insertWhitespace(id, afterPosition, size);
        const newScrolltop = aboveScrollTop ? scrollTop + size : scrollTop;
        this.render(previousRenderRange, newScrolltop, this.lastRenderHeight, undefined, undefined, false);
        this._rerender(newScrolltop, this.renderHeight, false);
        this.eventuallyUpdateScrollDimensions();
        return id;
    }
    changeOneWhitespace(id, newAfterPosition, newSize) {
        const scrollTop = this.scrollTop;
        const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
        const currentPosition = this.notebookRangeMap.getWhitespacePosition(id);
        if (currentPosition > scrollTop) {
            this.notebookRangeMap.changeOneWhitespace(id, newAfterPosition, newSize);
            this.render(previousRenderRange, scrollTop, this.lastRenderHeight, undefined, undefined, false);
            this._rerender(scrollTop, this.renderHeight, false);
            this.eventuallyUpdateScrollDimensions();
        }
        else {
            this.notebookRangeMap.changeOneWhitespace(id, newAfterPosition, newSize);
            this.eventuallyUpdateScrollDimensions();
        }
    }
    removeWhitespace(id) {
        const scrollTop = this.scrollTop;
        const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
        this.notebookRangeMap.removeWhitespace(id);
        this.render(previousRenderRange, scrollTop, this.lastRenderHeight, undefined, undefined, false);
        this._rerender(scrollTop, this.renderHeight, false);
        this.eventuallyUpdateScrollDimensions();
    }
    getWhitespacePosition(id) {
        return this.notebookRangeMap.getWhitespacePosition(id);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsTGlzdFZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXcvbm90ZWJvb2tDZWxsTGlzdFZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBRTNFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBWXhHLE1BQU0sT0FBTyxtQkFBbUI7SUFPL0IsSUFBSSxVQUFVO1FBQ2IsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDO0lBQ3pCLENBQUM7SUFFRCxJQUFJLFVBQVUsQ0FBQyxVQUFrQjtRQUNoQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsVUFBVSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDeEQsSUFBSSxDQUFDLFdBQVcsR0FBRyxVQUFVLENBQUM7SUFDL0IsQ0FBQztJQUVELElBQUksS0FBSztRQUNSLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDM0IsQ0FBQztJQUVEOztPQUVHO0lBQ0gsSUFBSSxJQUFJO1FBQ1AsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ25CLENBQUM7SUFFRCxZQUFZLFVBQW1CO1FBMUJ2QixXQUFNLEdBQVksRUFBRSxDQUFDO1FBQ3JCLGdCQUFXLEdBQWtCLEVBQUUsQ0FBQztRQUM5Qix1QkFBa0IsR0FBa0MsSUFBSSw2QkFBNkIsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM1RixVQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ1YsZ0JBQVcsR0FBRyxDQUFDLENBQUM7UUF1QnZCLElBQUksQ0FBQyxXQUFXLEdBQUcsVUFBVSxJQUFJLENBQUMsQ0FBQztRQUNuQyxJQUFJ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