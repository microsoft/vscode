/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, dispose, toDisposable } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';
import { BufferDirtyTracker } from './bufferDirtyTracker.js';
export function createObjectCollectionBuffer(propertySpecs, capacity) {
    return new ObjectCollectionBuffer(propertySpecs, capacity);
}
class ObjectCollectionBuffer extends Disposable {
    get bufferUsedSize() {
        return this.viewUsedSize * Float32Array.BYTES_PER_ELEMENT;
    }
    get viewUsedSize() {
        return this._entries.size * this._entrySize;
    }
    get entryCount() {
        return this._entries.size;
    }
    get dirtyTracker() { return this._dirtyTracker; }
    constructor(propertySpecs, capacity) {
        super();
        this.propertySpecs = propertySpecs;
        this.capacity = capacity;
        this._dirtyTracker = new BufferDirtyTracker();
        this._propertySpecsMap = new Map();
        this._entries = new LinkedList();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._onDidChangeBuffer = this._register(new Emitter());
        this.onDidChangeBuffer = this._onDidChangeBuffer.event;
        this.view = new Float32Array(capacity * propertySpecs.length);
        this.buffer = this.view.buffer;
        this._entrySize = propertySpecs.length;
        for (let i = 0; i < propertySpecs.length; i++) {
            const spec = {
                offset: i,
                ...propertySpecs[i]
            };
            this._propertySpecsMap.set(spec.name, spec);
        }
        this._register(toDisposable(() => dispose(this._entries)));
    }
    createEntry(data) {
        if (this._entries.size === this.capacity) {
            this._expandBuffer();
            this._onDidChangeBuffer.fire();
        }
        const value = new ObjectCollectionBufferEntry(this.view, this._propertySpecsMap, this._dirtyTracker, this._entries.size, data);
        const removeFromEntries = this._entries.push(value);
        const listeners = [];
        listeners.push(Event.forward(value.onDidChange, this._onDidChange));
        listeners.push(value.onWillDispose(() => {
            const deletedEntryIndex = value.i;
            removeFromEntries();
            // Shift all entries after the deleted entry to the left
            this.view.set(this.view.subarray(deletedEntryIndex * this._entrySize + 2, this._entries.size * this._entrySize + 2), deletedEntryIndex * this._entrySize);
            // Update entries to reflect the new i
            for (const entry of this._entries) {
                if (entry.i > deletedEntryIndex) {
                    entry.i--;
                }
            }
            this._dirtyTracker.flag(deletedEntryIndex, (this._entries.size - deletedEntryIndex) * this._entrySize);
            dispose(listeners);
        }));
        return value;
    }
    _expandBuffer() {
        this.capacity *= 2;
        const newView = new Float32Array(this.capacity * this._entrySize);
        newView.set(this.view);
        this.view = newView;
        this.buffer = this.view.buffer;
    }
}
class ObjectCollectionBufferEntry extends Disposable {
    constructor(_view, _propertySpecsMap, _dirtyTracker, i, data) {
        super();
        this._view = _view;
        this._propertySpecsMap = _propertySpecsMap;
        this._dirtyTracker = _dirtyTracker;
        this.i = i;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._onWillDispose = this._register(new Emitter());
        this.onWillDispose = this._onWillDispose.event;
        for (const propertySpec of this._propertySpecsMap.values()) {
            this._view[this.i * this._propertySpecsMap.size + propertySpec.offset] = data[propertySpec.name];
        }
        this._dirtyTracker.flag(this.i * this._propertySpecsMap.size, this._propertySpecsMap.size);
    }
    dispose() {
        this._onWillDispose.fire();
        super.dispose();
    }
    set(propertyName, value) {
        const i = this.i * this._propertySpecsMap.size + this._propertySpecsMap.get(propertyName).offset;
        this._view[this._dirtyTracker.flag(i)] = value;
        this._onDidChange.fire();
    }
    get(propertyName) {
        return this._view[this.i * this._propertySpecsMap.size + this._propertySpecsMap.get(propertyName).offset];
    }
    setRaw(data) {
        if (data.length !== this._propertySpecsMap.size) {
            throw new Error(`Data length ${data.length} does not match the number of properties in the collection (${this._propertySpecsMap.size})`);
        }
        this._view.set(data, this.i * this._propertySpecsMap.size);
        this._dirtyTracker.flag(this.i * this._propertySpecsMap.size, this._propertySpecsMap.size);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JqZWN0Q29sbGVjdGlvbkJ1ZmZlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2dwdS9vYmplY3RDb2xsZWN0aW9uQnVmZmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFvQixNQUFNLG1DQUFtQyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsa0JBQWtCLEVBQWtDLE1BQU0seUJBQXlCLENBQUM7QUFpRTdGLE1BQU0sVUFBVSw0QkFBNEIsQ0FDM0MsYUFBZ0IsRUFDaEIsUUFBZ0I7SUFFaEIsT0FBTyxJQUFJLHNCQUFzQixDQUFJLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUMvRCxDQUFDO0FBRUQsTUFBTSxzQkFBdUUsU0FBUSxVQUFVO0lBSTlGLElBQUksY0FBYztRQUNqQixPQUFPLElBQUksQ0FBQyxZQUFZLEdBQUcsWUFBWSxDQUFDLGlCQUFpQixDQUFDO0lBQzNELENBQUM7SUFDRCxJQUFJLFlBQVk7UUFDZixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7SUFDN0MsQ0FBQztJQUNELElBQUksVUFBVTtRQUNiLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7SUFDM0IsQ0FBQztJQUdELElBQUksWUFBWSxLQUFnQyxPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO0lBVzVFLFlBQ1EsYUFBZ0IsRUFDaEIsUUFBZ0I7UUFFdkIsS0FBSyxFQUFFLENBQUM7UUFIRCxrQkFBYSxHQUFi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