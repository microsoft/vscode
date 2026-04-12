/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Barrier, isThenable, RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { assertNever } from '../../../../base/common/assert.js';
import { applyTestItemUpdate, namespaceTestTag } from './testTypes.js';
import { TestId } from './testId.js';
export var TestItemEventOp;
(function (TestItemEventOp) {
    TestItemEventOp[TestItemEventOp["Upsert"] = 0] = "Upsert";
    TestItemEventOp[TestItemEventOp["SetTags"] = 1] = "SetTags";
    TestItemEventOp[TestItemEventOp["UpdateCanResolveChildren"] = 2] = "UpdateCanResolveChildren";
    TestItemEventOp[TestItemEventOp["RemoveChild"] = 3] = "RemoveChild";
    TestItemEventOp[TestItemEventOp["SetProp"] = 4] = "SetProp";
    TestItemEventOp[TestItemEventOp["Bulk"] = 5] = "Bulk";
    TestItemEventOp[TestItemEventOp["DocumentSynced"] = 6] = "DocumentSynced";
})(TestItemEventOp || (TestItemEventOp = {}));
const strictEqualComparator = (a, b) => a === b;
const diffableProps = {
    range: (a, b) => {
        if (a === b) {
            return true;
        }
        if (!a || !b) {
            return false;
        }
        return a.equalsRange(b);
    },
    busy: strictEqualComparator,
    label: strictEqualComparator,
    description: strictEqualComparator,
    error: strictEqualComparator,
    sortText: strictEqualComparator,
    tags: (a, b) => {
        if (a.length !== b.length) {
            return false;
        }
        if (a.some(t1 => !b.includes(t1))) {
            return false;
        }
        return true;
    },
};
const diffableEntries = Object.entries(diffableProps);
const diffTestItems = (a, b) => {
    let output;
    for (const [key, cmp] of diffableEntries) {
        if (!cmp(a[key], b[key])) {
            if (output) {
                output[key] = b[key];
            }
            else {
                output = { [key]: b[key] };
            }
        }
    }
    return output;
};
/**
 * Maintains a collection of test items for a single controller.
 */
export class TestItemCollection extends Disposable {
    get root() {
        return this.options.root;
    }
    constructor(options) {
        super();
        this.options = options;
        this.debounceSendDiff = this._register(new RunOnceScheduler(() => this.flushDiff(), 200));
        this.diffOpEmitter = this._register(new Emitter());
        this.tree = new Map();
        this.tags = new Map();
        this.diff = [];
        /**
         * Fires when an operation happens that should result in a diff.
         */
        this.onDidGenerateDiff = this.diffOpEmitter.event;
        this.root.canResolveChildren = true;
        this.upsertItem(this.root, undefined);
    }
    /**
     * Handler used for expanding test items.
     */
    set resolveHandler(handler) {
        this._resolveHandler = handler;
        for (const test of this.tree.values()) {
            this.updateExpandability(test);
        }
    }
    get resolveHandler() {
        return this._resolveHandler;
    }
    /**
     * Gets a diff of all changes that have been made, and clears the diff queue.
     */
    collectDiff() {
        const diff = this.diff;
        this.diff = [];
        return diff;
    }
    /**
     * Pushes a new diff entry onto the collected diff list.
     */
    pushDiff(diff) {
        switch (diff.op) {
            case 2 /* TestDiffOpType.DocumentSynced */: {
                for (const existing of this.diff) {
                    if (existing.op === 2 /* TestDiffOpType.DocumentSynced */ && existing.uri === diff.uri) {
                        existing.docv = diff.docv;
                        return;
                    }
                }
                break;
            }
            case 1 /* TestDiffOpType.Update */: {
                // Try to merge updates, since they're invoked per-property
                const last = this.diff[this.diff.length - 1];
                if (last) {
                    if (last.op === 1 /* TestDiffOpType.Update */ && last.item.extId === diff.item.extId) {
                        applyTestItemUpdate(last.item, diff.item);
                        return;
                    }
                    if (last.op === 0 /* TestDiffOpType.Add */ && last.item.item.extId === diff.item.extId) {
                        applyTestItemUpdate(last.item, diff.item);
                        return;
                    }
                }
                break;
            }
        }
        this.diff.push(diff);
        if (!this.debounceSendDiff.isScheduled()) {
            this.debounceSendDiff.schedule();
        }
    }
    /**
     * Expands the test and the given number of `levels` of children. If levels
     * is < 0, then all children will be expanded. If it's 0, then only this
     * item will be expanded.
     */
    expand(testId, levels) {
        const internal = this.tree.get(testId);
        if (!internal) {
            return;
        }
        if (internal.expandLevels === undefined || levels > internal.expandLevels) {
            internal.expandLevels = levels;
        }
        // try to avoid awaiting things if the provider returns synchronously in
        // order to keep everything in a single diff and DOM update.
        if (internal.expand === 1 /* TestItemExpandState.Expandable */) {
            const r = this.resolveChildren(internal);
            return !r.isOpen()
                ? r.wait().then(() => this.expandChildren(internal, levels - 1))
                : this.expandChildren(internal, levels - 1);
        }
        else if (internal.expand === 3 /* TestItemExpandState.Expanded */) {
            return internal.resolveBarrier?.isOpen() === false
                ? internal.resolveBarrier.wait().then(() => this.expandChildren(internal, levels - 1))
                : this.expandChildren(internal, levels - 1);
        }
    }
    dispose() {
        for (const item of this.tree.values()) {
            this.options.getApiFor(item.actual).listener = undefined;
        }
        this.tree.clear();
        this.diff = [];
        super.dispose();
    }
    onTestItemEvent(internal, evt) {
        switch (evt.op) {
            case 3 /* TestItemEventOp.RemoveChild */:
                this.removeItem(TestId.joinToString(internal.fullId, evt.id));
                break;
            case 0 /* TestItemEventOp.Upsert */:
                this.upsertItem(evt.item, internal);
                break;
            case 5 /* TestItemEventOp.Bulk */:
                for (const op of evt.ops) {
                    this.onTestItemEvent(internal, op);
                }
                break;
            case 1 /* TestItemEventOp.SetTags */:
                this.diffTagRefs(evt.new, evt.old, internal.fullId.toString());
                break;
            case 2 /* TestItemEventOp.UpdateCanResolveChildren */:
                this.updateExpandability(internal);
                break;
            case 4 /* TestItemEventOp.SetProp */:
                this.pushDiff({
                    op: 1 /* TestDiffOpType.Update */,
                    item: {
                        extId: internal.fullId.toString(),
                        item: evt.update,
                    }
                });
                break;
            case 6 /* TestItemEventOp.DocumentSynced */:
                this.documentSynced(internal.actual.uri);
                break;
            default:
                assertNever(evt);
        }
    }
    documentSynced(uri) {
        if (uri) {
            this.pushDiff({
                op: 2 /* TestDiffOpType.DocumentSynced */,
                uri,
                docv: this.options.getDocumentVersion(uri)
            });
        }
    }
    upsertItem(actual, parent) {
        const fullId = TestId.fromExtHostTestItem(actual, this.root.id, parent?.actual);
        // If this test item exists elsewhere in the tree already (exists at an
        // old ID with an existing parent), remove that old item.
        const privateApi = this.options.getApiFor(actual);
        if (privateApi.parent && privateApi.parent !== parent?.actual) {
            this.options.getChildren(privateApi.parent).delete(actual.id);
        }
        let internal = this.tree.get(fullId.toString());
        // Case 1: a brand new item
        if (!internal) {
            internal = {
                fullId,
                actual,
                expandLevels: parent?.expandLevels /* intentionally undefined or 0 */ ? parent.expandLevels - 1 : undefined,
                expand: 0 /* TestItemExpandState.NotExpandable */, // updated by `connectItemAndChildren`
            };
            actual.tags.forEach(this.incrementTagRefs, this);
            this.tree.set(internal.fullId.toString(), internal);
            this.setItemParent(actual, parent);
            this.pushDiff({
                op: 0 /* TestDiffOpType.Add */,
                item: {
                    controllerId: this.options.controllerId,
                    expand: internal.expand,
                    item: this.options.toITestItem(actual),
                },
            });
            this.connectItemAndChildren(actual, internal, parent);
            return;
        }
        // Case 2: re-insertion of an existing item, no-op
        if (internal.actual === actual) {
            this.connectItem(actual, internal, parent); // re-connect in case the parent changed
            return; // no-op
        }
        // Case 3: upsert of an existing item by ID, with a new instance
        if (internal.actual.uri?.toString() !== actual.uri?.toString()) {
            // If the item has a new URI, re-insert it; we don't support updating
            // URIs on existing test items.
            this.removeItem(fullId.toString());
            return this.upsertItem(actual, parent);
        }
        const oldChildren = this.options.getChildren(internal.actual);
        const oldActual = internal.actual;
        const update = diffTestItems(this.options.toITestItem(oldActual), this.options.toITestItem(actual));
        this.options.getApiFor(oldActual).listener = undefined;
        internal.actual = actual;
        internal.resolveBarrier = undefined;
        internal.expand = 0 /* TestItemExpandState.NotExpandable */; // updated by `connectItemAndChildren`
        if (update) {
            // tags are handled in a special way
            if (update.hasOwnProperty('tags')) {
                this.diffTagRefs(actual.tags, oldActual.tags, fullId.toString());
                delete update.tags;
            }
            this.onTestItemEvent(internal, { op: 4 /* TestItemEventOp.SetProp */, update });
        }
        this.connectItemAndChildren(actual, internal, parent);
        // Remove any orphaned children.
        for (const [_, child] of oldChildren) {
            if (!this.options.getChildren(actual).get(child.id)) {
                this.removeItem(TestId.joinToString(fullId, child.id));
            }
        }
        // Re-expand the element if it was previous expanded (#207574)
        const expandLevels = internal.expandLevels;
        if (expandLevels !== undefined) {
            // Wait until a microtask to allow the extension to finish setting up
            // properties of the element and children before we ask it to expand.
            queueMicrotask(() => {
                if (internal.expand === 1 /* TestItemExpandState.Expandable */) {
                    internal.expandLevels = undefined;
                    this.expand(fullId.toString(), expandLevels);
                }
            });
        }
        // Mark ranges in the document as synced (#161320)
        this.documentSynced(internal.actual.uri);
    }
    diffTagRefs(newTags, oldTags, extId) {
        const toDelete = new Set(oldTags.map(t => t.id));
        for (const tag of newTags) {
            if (!toDelete.delete(tag.id)) {
                this.incrementTagRefs(tag);
            }
        }
        this.pushDiff({
            op: 1 /* TestDiffOpType.Update */,
            item: { extId, item: { tags: newTags.map(v => namespaceTestTag(this.options.controllerId, v.id)) } }
        });
        toDelete.forEach(this.decrementTagRefs, this);
    }
    incrementTagRefs(tag) {
        const existing = this.tags.get(tag.id);
        if (existing) {
            existing.refCount++;
        }
        else {
            this.tags.set(tag.id, { refCount: 1 });
            this.pushDiff({
                op: 6 /* TestDiffOpType.AddTag */, tag: {
                    id: namespaceTestTag(this.options.controllerId, tag.id),
                }
            });
        }
    }
    decrementTagRefs(tagId) {
        const existing = this.tags.get(tagId);
        if (existing && !--existing.refCount) {
            this.tags.delete(tagId);
            this.pushDiff({ op: 7 /* TestDiffOpType.RemoveTag */, id: namespaceTestTag(this.options.controllerId, tagId) });
        }
    }
    setItemParent(actual, parent) {
        this.options.getApiFor(actual).parent = parent && parent.actual !== this.root ? parent.actual : undefined;
    }
    connectItem(actual, internal, parent) {
        this.setItemParent(actual, parent);
        const api = this.options.getApiFor(actual);
        api.parent = parent?.actual;
        api.listener = evt => this.onTestItemEvent(internal, evt);
        this.updateExpandability(internal);
    }
    connectItemAndChildren(actual, internal, parent) {
        this.connectItem(actual, internal, parent);
        // Discover any existing children that might have already been added
        for (const [_, child] of this.options.getChildren(actual)) {
            this.upsertItem(child, internal);
        }
    }
    /**
     * Updates the `expand` state of the item. Should be called whenever the
     * resolved state of the item changes. Can automatically expand the item
     * if requested by a consumer.
     */
    updateExpandability(internal) {
        let newState;
        if (!this._resolveHandler) {
            newState = 0 /* TestItemExpandState.NotExpandable */;
        }
        else if (internal.resolveBarrier) {
            newState = internal.resolveBarrier.isOpen()
                ? 3 /* TestItemExpandState.Expanded */
                : 2 /* TestItemExpandState.BusyExpanding */;
        }
        else {
            newState = internal.actual.canResolveChildren
                ? 1 /* TestItemExpandState.Expandable */
                : 0 /* TestItemExpandState.NotExpandable */;
        }
        if (newState === internal.expand) {
            return;
        }
        internal.expand = newState;
        this.pushDiff({ op: 1 /* TestDiffOpType.Update */, item: { extId: internal.fullId.toString(), expand: newState } });
        if (newState === 1 /* TestItemExpandState.Expandable */ && internal.expandLevels !== undefined) {
            this.resolveChildren(internal);
        }
    }
    /**
     * Expands all children of the item, "levels" deep. If levels is 0, only
     * the children will be expanded. If it's 1, the children and their children
     * will be expanded. If it's <0, it's a no-op.
     */
    expandChildren(internal, levels) {
        if (levels < 0) {
            return;
        }
        const expandRequests = [];
        for (const [_, child] of this.options.getChildren(internal.actual)) {
            const promise = this.expand(TestId.joinToString(internal.fullId, child.id), levels);
            if (isThenable(promise)) {
                expandRequests.push(promise);
            }
        }
        if (expandRequests.length) {
            return Promise.all(expandRequests).then(() => { });
        }
    }
    /**
     * Calls `discoverChildren` on the item, refreshing all its tests.
     */
    resolveChildren(internal) {
        if (internal.resolveBarrier) {
            return internal.resolveBarrier;
        }
        if (!this._resolveHandler) {
            const b = new Barrier();
            b.open();
            return b;
        }
        internal.expand = 2 /* TestItemExpandState.BusyExpanding */;
        this.pushExpandStateUpdate(internal);
        const barrier = internal.resolveBarrier = new Barrier();
        const applyError = (err) => {
            console.error(`Unhandled error in resolveHandler of test controller "${this.options.controllerId}"`, err);
        };
        let r;
        try {
            r = this._resolveHandler(internal.actual === this.root ? undefined : internal.actual);
        }
        catch (err) {
            applyError(err);
        }
        if (isThenable(r)) {
            r.catch(applyError).then(() => {
                barrier.open();
                this.updateExpandability(internal);
            });
        }
        else {
            barrier.open();
            this.updateExpandability(internal);
        }
        return internal.resolveBarrier;
    }
    pushExpandStateUpdate(internal) {
        this.pushDiff({ op: 1 /* TestDiffOpType.Update */, item: { extId: internal.fullId.toString(), expand: internal.expand } });
    }
    removeItem(childId) {
        const childItem = this.tree.get(childId);
        if (!childItem) {
            throw new Error('attempting to remove non-existent child');
        }
        this.pushDiff({ op: 3 /* TestDiffOpType.Remove */, itemId: childId });
        const queue = [childItem];
        while (queue.length) {
            const item = queue.pop();
            if (!item) {
                continue;
            }
            this.options.getApiFor(item.actual).listener = undefined;
            for (const tag of item.actual.tags) {
                this.decrementTagRefs(tag.id);
            }
            this.tree.delete(item.fullId.toString());
            for (const [_, child] of this.options.getChildren(item.actual)) {
                queue.push(this.tree.get(TestId.joinToString(item.fullId, child.id)));
            }
        }
    }
    /**
     * Immediately emits any pending diffs on the collection.
     */
    flushDiff() {
        const diff = this.collectDiff();
        if (diff.length) {
            this.diffOpEmitter.fire(diff);
        }
    }
}
export class DuplicateTestItemError extends Error {
    constructor(id) {
        super(`Attempted to insert a duplicate test item ID ${id}`);
    }
}
export class InvalidTestItemError extends Error {
    constructor(id) {
        super(`TestItem with ID "${id}" is invalid. Make sure to create it from the createTestItem method.`);
    }
}
export class MixedTestItemController extends Error {
    constructor(id, ctrlA, ctrlB) {
        super(`TestItem with ID "${id}" is from controller "${ctrlA}" and cannot be added as a child of an item from controller "${ctrlB}".`);
    }
}
export const createTestItemChildren = (api, getApi, checkCtor) => {
    let mapped = new Map();
    return {
        /** @inheritdoc */
        get size() {
            return mapped.size;
        },
        /** @inheritdoc */
        forEach(callback, thisArg) {
            for (const item of mapped.values()) {
                callback.call(thisArg, item, this);
            }
        },
        /** @inheritdoc */
        [Symbol.iterator]() {
            return mapped.entries();
        },
        /** @inheritdoc */
        replace(items) {
            const newMapped = new Map();
            const toDelete = new Set(mapped.keys());
            const bulk = { op: 5 /* TestItemEventOp.Bulk */, ops: [] };
            for (const item of items) {
                if (!(item instanceof checkCtor)) {
                    throw new InvalidTestItemError(item.id);
                }
                const itemController = getApi(item).controllerId;
                if (itemController !== api.controllerId) {
                    throw new MixedTestItemController(item.id, itemController, api.controllerId);
                }
                if (newMapped.has(item.id)) {
                    throw new DuplicateTestItemError(item.id);
                }
                newMapped.set(item.id, item);
                toDelete.delete(item.id);
                bulk.ops.push({ op: 0 /* TestItemEventOp.Upsert */, item });
            }
            for (const id of toDelete.keys()) {
                bulk.ops.push({ op: 3 /* TestItemEventOp.RemoveChild */, id });
            }
            api.listener?.(bulk);
            // important mutations come after firing, so if an error happens no
            // changes will be "saved":
            mapped = newMapped;
        },
        /** @inheritdoc */
        add(item) {
            if (!(item instanceof checkCtor)) {
                throw new InvalidTestItemError(item.id);
            }
            mapped.set(item.id, item);
            api.listener?.({ op: 0 /* TestItemEventOp.Upsert */, item });
        },
        /** @inheritdoc */
        delete(id) {
            if (mapped.delete(id)) {
                api.listener?.({ op: 3 /* TestItemEventOp.RemoveChild */, id });
            }
        },
        /** @inheritdoc */
        get(itemId) {
            return mapped.get(itemId);
        },
        /** JSON serialization function. */
        toJSON() {
            return Array.from(mapped.values());
        },
    };
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdEl0ZW1Db2xsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdEl0ZW1Db2xsZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLG1CQUFtQixFQUF1QixnQkFBZ0IsRUFBK0QsTUFBTSxnQkFBZ0IsQ0FBQztBQUN6SixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBaUJyQyxNQUFNLENBQU4sSUFBa0IsZUFRakI7QUFSRCxXQUFrQixlQUFlO0lBQ2hDLHlEQUFNLENBQUE7SUFDTiwyREFBTyxDQUFBO0lBQ1AsNkZBQXdCLENBQUE7SUFDeEIsbUVBQVcsQ0FBQTtJQUNYLDJEQUFPLENBQUE7SUFDUCxxREFBSSxDQUFBO0lBQ0oseUVBQWMsQ0FBQTtBQUNmLENBQUMsRUFSaUIsZUFBZSxLQUFmLGVBQWUsUUFRaEM7QUF1RUQsTUFBTSxxQkFBcUIsR0FBRyxDQUFJLENBQUksRUFBRSxDQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDekQsTUFBTSxhQUFhLEdBQStFO0lBQ2pHLEtBQUssRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUNmLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQUMsT0FBTyxJQUFJLENBQUM7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