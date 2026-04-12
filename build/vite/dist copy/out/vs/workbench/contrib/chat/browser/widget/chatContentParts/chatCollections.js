/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class ResourcePool {
    get inUse() {
        return this._inUse;
    }
    constructor(_itemFactory, _options) {
        this._itemFactory = _itemFactory;
        this._options = _options;
        this.pool = [];
        this._inUse = new Set;
    }
    get() {
        if (this.pool.length > 0) {
            const item = this.pool.pop();
            this._inUse.add(item);
            return item;
        }
        const item = this._itemFactory();
        this._inUse.add(item);
        return item;
    }
    release(item) {
        this._inUse.delete(item);
        this.pool.push(item);
        this._scheduleTrim();
    }
    _scheduleTrim() {
        const maxIdle = this._options?.maxIdleSize;
        if (maxIdle === undefined || this.pool.length <= maxIdle) {
            return;
        }
        // Debounce: reset the timer on every release so that rapid
        // get/release cycles (streaming, scrolling) don't cause churn.
        if (this._trimTimer !== undefined) {
            clearTimeout(this._trimTimer);
        }
        const delay = this._options?.trimIdleDelay ?? 10_000;
        this._trimTimer = setTimeout(() => {
            this._trimTimer = undefined;
            this._trimIdle();
        }, delay);
    }
    _trimIdle() {
        const maxIdle = this._options?.maxIdleSize;
        if (maxIdle === undefined) {
            return;
        }
        while (this.pool.length > maxIdle) {
            const item = this.pool.pop();
            item.dispose();
        }
    }
    /**
     * Clear and dispose the items in the pool that are not in use.
     */
    clear() {
        if (this._trimTimer !== undefined) {
            clearTimeout(this._trimTimer);
            this._trimTimer = undefined;
        }
        for (const item of this.pool) {
            item.dispose();
        }
        this.pool.length = 0;
    }
    dispose() {
        this.clear();
        for (const item of this._inUse) {
            item.dispose();
        }
        this._inUse.clear();
    }
}
/**
 * A resource pool that supports keyed reuse. On {@link get}, the pool will
 * prefer returning an idle item that was previously {@link release released}
 * with the same key. Keys are best-effort hints — multiple items can share a
 * key and the pool falls back to any idle item when no keyed match is found.
 */
export class KeyedResourcePool {
    get inUse() {
        return this._inUse;
    }
    constructor(_itemFactory, _options) {
        this._itemFactory = _itemFactory;
        this._options = _options;
        this._idle = [];
        this._inUse = new Set();
        this._keyToItems = new Map();
        this._itemToKey = new Map();
    }
    get(key) {
        const candidates = this._keyToItems.get(key);
        if (candidates) {
            for (const item of candidates) {
                if (!this._inUse.has(item)) {
                    const idx = this._idle.indexOf(item);
                    if (idx !== -1) {
                        this._idle.splice(idx, 1);
                        this._inUse.add(item);
                        return item;
                    }
                }
            }
        }
        if (this._idle.length > 0) {
            const item = this._idle.pop();
            this._inUse.add(item);
            return item;
        }
        const item = this._itemFactory();
        this._inUse.add(item);
        return item;
    }
    release(item, key) {
        this._inUse.delete(item);
        this._idle.push(item);
        // Remove old key association if it changed
        const oldKey = this._itemToKey.get(item);
        if (oldKey !== undefined && oldKey !== key) {
            const oldSet = this._keyToItems.get(oldKey);
            if (oldSet) {
                oldSet.delete(item);
                if (oldSet.size === 0) {
                    this._keyToItems.delete(oldKey);
                }
            }
        }
        this._itemToKey.set(item, key);
        let keySet = this._keyToItems.get(key);
        if (!keySet) {
            keySet = new Set();
            this._keyToItems.set(key, keySet);
        }
        keySet.add(item);
        this._scheduleTrim();
    }
    _scheduleTrim() {
        const maxIdle = this._options?.maxIdleSize;
        if (maxIdle === undefined || this._idle.length <= maxIdle) {
            return;
        }
        if (this._trimTimer !== undefined) {
            clearTimeout(this._trimTimer);
        }
        const delay = this._options?.trimIdleDelay ?? 10_000;
        this._trimTimer = setTimeout(() => {
            this._trimTimer = undefined;
            this._trimIdle();
        }, delay);
    }
    _trimIdle() {
        const maxIdle = this._options?.maxIdleSize;
        if (maxIdle === undefined) {
            return;
        }
        while (this._idle.length > maxIdle) {
            const item = this._idle.pop();
            this._removeFromMaps(item);
            item.dispose();
        }
    }
    _removeFromMaps(item) {
        const key = this._itemToKey.get(item);
        if (key !== undefined) {
            const keySet = this._keyToItems.get(key);
            if (keySet) {
                keySet.delete(item);
                if (keySet.size === 0) {
                    this._keyToItems.delete(key);
                }
            }
            this._itemToKey.delete(item);
        }
    }
    clear() {
        if (this._trimTimer !== undefined) {
            clearTimeout(this._trimTimer);
            this._trimTimer = undefined;
        }
        for (const item of this._idle) {
            item.dispose();
        }
        this._idle.length = 0;
        this._keyToItems.clear();
        this._itemToKey.clear();
    }
    dispose() {
        this.clear();
        for (const item of this._inUse) {
            item.dispose();
        }
        this._inUse.clear();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbGxlY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb2xsZWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQW9CaEcsTUFBTSxPQUFPLFlBQVk7SUFLeEIsSUFBVyxLQUFLO1FBQ2YsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxZQUNrQixZQUFxQixFQUNyQixRQUErQjtRQUQvQixpQkFBWSxHQUFaLFlBQVksQ0FBUztRQUNyQixhQUFRLEdBQVIsUUFBUSxDQUF1QjtRQVZoQyxTQUFJLEdBQVEsRUFBRSxDQUFDO1FBR3hCLFdBQU0sR0FBRyxJQUFJLEdBQU0sQ0FBQztJQVF4QixDQUFDO0lBRUwsR0FBRztRQUNGLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDMUIsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUcsQ0FBQztZQUM5QixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUN0QixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEIsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsT0FBTyxDQUFDLElBQU87UUFDZCxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN6QixJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMs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