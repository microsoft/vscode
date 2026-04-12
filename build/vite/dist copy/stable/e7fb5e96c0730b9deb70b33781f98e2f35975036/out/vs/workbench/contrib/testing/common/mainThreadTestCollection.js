/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { AbstractIncrementalTestCollection } from './testTypes.js';
export class MainThreadTestCollection extends AbstractIncrementalTestCollection {
    /**
     * @inheritdoc
     */
    get busyProviders() {
        return this.busyControllerCount;
    }
    /**
     * @inheritdoc
     */
    get rootItems() {
        return this.roots;
    }
    /**
     * @inheritdoc
     */
    get all() {
        return this.getIterator();
    }
    get rootIds() {
        return Iterable.map(this.roots.values(), r => r.item.extId);
    }
    constructor(uriIdentityService, expandActual) {
        super(uriIdentityService);
        this.expandActual = expandActual;
        this.testsByUrl = new ResourceMap();
        this.busyProvidersChangeEmitter = new Emitter();
        this.expandPromises = new WeakMap();
        this.onBusyProvidersChange = this.busyProvidersChangeEmitter.event;
        this.changeCollector = {
            add: node => {
                if (!node.item.uri) {
                    return;
                }
                const s = this.testsByUrl.get(node.item.uri);
                if (!s) {
                    this.testsByUrl.set(node.item.uri, new Set([node]));
                }
                else {
                    s.add(node);
                }
            },
            remove: node => {
                if (!node.item.uri) {
                    return;
                }
                const s = this.testsByUrl.get(node.item.uri);
                if (!s) {
                    return;
                }
                s.delete(node);
                if (s.size === 0) {
                    this.testsByUrl.delete(node.item.uri);
                }
            },
        };
    }
    /**
     * @inheritdoc
     */
    expand(testId, levels) {
        const test = this.items.get(testId);
        if (!test) {
            return Promise.resolve();
        }
        // simple cache to avoid duplicate/unnecessary expansion calls
        const existing = this.expandPromises.get(test);
        if (existing && existing.pendingLvl >= levels) {
            return existing.prom;
        }
        const prom = this.expandActual(test.item.extId, levels);
        const record = { doneLvl: existing ? existing.doneLvl : -1, pendingLvl: levels, prom };
        this.expandPromises.set(test, record);
        return prom.then(() => {
            record.doneLvl = levels;
        });
    }
    /**
     * @inheritdoc
     */
    getNodeById(id) {
        return this.items.get(id);
    }
    /**
     * @inheritdoc
     */
    getNodeByUrl(uri) {
        return this.testsByUrl.get(uri) || Iterable.empty();
    }
    /**
     * @inheritdoc
     */
    getReviverDiff() {
        const ops = [{ op: 4 /* TestDiffOpType.IncrementPendingExtHosts */, amount: this.pendingRootCount }];
        const queue = [this.rootIds];
        while (queue.length) {
            for (const child of queue.pop()) {
                const item = this.items.get(child);
                ops.push({
                    op: 0 /* TestDiffOpType.Add */,
                    item: {
                        controllerId: item.controllerId,
                        expand: item.expand,
                        item: item.item,
                    }
                });
                queue.push(item.children);
            }
        }
        return ops;
    }
    /**
     * Applies the diff to the collection.
     */
    apply(diff) {
        const prevBusy = this.busyControllerCount;
        super.apply(diff);
        if (prevBusy !== this.busyControllerCount) {
            this.busyProvidersChangeEmitter.fire(this.busyControllerCount);
        }
    }
    /**
     * Clears everything from the collection, and returns a diff that applies
     * that action.
     */
    clear() {
        const ops = [];
        for (const root of this.roots) {
            ops.push({ op: 3 /* TestDiffOpType.Remove */, itemId: root.item.extId });
        }
        this.roots.clear();
        this.items.clear();
        return ops;
    }
    /**
     * @override
     */
    createItem(internal) {
        return { ...internal, children: new Set() };
    }
    createChangeCollector() {
        return this.changeCollector;
    }
    *getIterator() {
        const queue = new LinkedList();
        queue.push(this.rootIds);
        while (queue.size > 0) {
            for (const id of queue.pop()) {
                const node = this.getNodeById(id);
                yield node;
                queue.push(node.children);
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFRlc3RDb2xsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vbWFpblRocmVhZFRlc3RDb2xsZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUc3RCxPQUFPLEVBQUUsaUNBQWlDLEVBQWlJLE1BQU0sZ0JBQWdCLENBQUM7QUFFbE0sTUFBTSxPQUFPLHdCQUF5QixTQUFRLGlDQUFnRTtJQVU3Rzs7T0FFRztJQUNILElBQVcsYUFBYTtRQUN2QixPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQztJQUNqQyxDQUFDO0lBRUQ7O09BRUc7SUFDSCxJQUFXLFNBQVM7UUFDbkIsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO0lBQ25CLENBQUM7SUFFRDs7T0FFRztJQUNILElBQVcsR0FBRztRQUNiLE9BQU8sSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxJQUFXLE9BQU87UUFDakIsT0FBTyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFJRCxZQUFZLGtCQUF5QyxFQUFtQixZQUEyRDtRQUNsSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUQ2Qyxp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