/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, dispose, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { LinkedList } from '../../../base/common/linkedList.js';
import { BufferDirtyTracker, type IBufferDirtyTrackerReader } from './bufferDirtyTracker.js';

export interface ObjectCollectionBufferPropertySpec {
	name: string;
}

export type ObjectCollectionPropertyValues<T extends ObjectCollectionBufferPropertySpec[]> = {
	[K in T[number]['name']]: number;
};

export interface IObjectCollectionBuffer<T extends ObjectCollectionBufferPropertySpec[]> extends IDisposable {
	/**
	 * The underlying buffer. This **should not** be modified externally.
	 */
	readonly buffer: ArrayBuffer;
	/**
	 * A view of the underlying buffer. This **should not** be modified externally.
	 */
	readonly view: Float32Array;
	/**
	 * The size of the used portion of the buffer (in bytes).
	 */
	readonly bufferUsedSize: number;
	/**
	 * The size of the used portion of the view (in float32s).
	 */
	readonly viewUsedSize: number;
	/**
	 * The number of entries in the buffer.
	 */
	readonly entryCount: number;

	/**
	 * A tracker for dirty regions in the buffer.
	 */
	readonly dirtyTracker: IBufferDirtyTrackerReader;

	/**
	 * Fires when the buffer is modified.
	 */
	readonly onDidChange: Event<void>;

	/**
	 * Fires when the buffer is recreated.
	 */
	readonly onDidChangeBuffer: Event<void>;

	/**
	 * Creates an entry in the collection. This will return a managed object that can be modified
	 * which will update the underlying buffer.
	 * @param data The data of the entry.
	 */
	createEntry(data: ObjectCollectionPropertyValues<T>): IObjectCollectionBufferEntry<T>;
}

/**
 * An entry in an {@link ObjectCollectionBuffer}. Property values on the entry can be changed and
 * their values will be updated automatically in the buffer.
 */
export interface IObjectCollectionBufferEntry<T extends ObjectCollectionBufferPropertySpec[]> extends IDisposable {
	set(propertyName: T[number]['name'], value: number): void;
	get(propertyName: T[number]['name']): number;
	setRaw(data: ArrayLike<number>): void;
}

export function createObjectCollectionBuffer<T extends ObjectCollectionBufferPropertySpec[]>(
	propertySpecs: T,
	capacity: number
): IObjectCollectionBuffer<T> {
	return new ObjectCollectionBuffer<T>(propertySpecs, capacity);
}

class ObjectCollectionBuffer<T extends ObjectCollectionBufferPropertySpec[]> extends Disposable implements IObjectCollectionBuffer<T> {
	buffer: ArrayBuffer;
	view: Float32Array;

	get bufferUsedSize() {
		return this.viewUsedSize * Float32Array.BYTES_PER_ELEMENT;
	}
	get viewUsedSize() {
		return this._entries.size * this._entrySize;
	}
	get entryCount() {
		return this._entries.size;
	}

	private _dirtyTracker = new BufferDirtyTracker();
	get dirtyTracker(): IBufferDirtyTrackerReader { return this._dirtyTracker; }

	private readonly _propertySpecsMap: Map<string, ObjectCollectionBufferPropertySpec & { offset: number }> = new Map();
	private readonly _entrySize: number;
	private readonly _entries: LinkedList<ObjectCollectionBufferEntry<T>> = new LinkedList();

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _onDidChangeBuffer = this._register(new Emitter<void>());
	readonly onDidChangeBuffer = this._onDidChangeBuffer.event;

	constructor(
		public propertySpecs: T,
		public capacity: number
	) {
		super();

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

	createEntry(data: ObjectCollectionPropertyValues<T>): IObjectCollectionBufferEntry<T> {
		if (this._entries.size === this.capacity) {
			this._expandBuffer();
			this._onDidChangeBuffer.fire();
		}

		const value = new ObjectCollectionBufferEntry(this.view, this._propertySpecsMap, this._dirtyTracker, this._entries.size, data);
		const removeFromEntries = this._entries.push(value);
		const listeners: IDisposable[] = [];
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

	private _expandBuffer() {
		this.capacity *= 2;
		const newView = new Float32Array(this.capacity * this._entrySize);
		newView.set(this.view);
		this.view = newView;
		this.buffer = this.view.buffer;
	}
}

class ObjectCollectionBufferEntry<T extends ObjectCollectionBufferPropertySpec[]> extends Disposable implements IObjectCollectionBufferEntry<T> {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	constructor(
		private _view: Float32Array,
		private _propertySpecsMap: Map<string, ObjectCollectionBufferPropertySpec & { offset: number }>,
		private _dirtyTracker: BufferDirtyTracker,
		public i: number,
		data: ObjectCollectionPropertyValues<T>,
	) {
		super();
		for (const propertySpec of this._propertySpecsMap.values()) {
			this._view[this.i * this._propertySpecsMap.size + propertySpec.offset] = data[propertySpec.name as keyof typeof data];
		}
		this._dirtyTracker.flag(this.i * this._propertySpecsMap.size, this._propertySpecsMap.size);
	}

	override dispose() {
		this._onWillDispose.fire();
		super.dispose();
	}

	set(propertyName: T[number]['name'], value: number): void {
		const i = this.i * this._propertySpecsMap.size + this._propertySpecsMap.get(propertyName)!.offset;
		this._view[this._dirtyTracker.flag(i)] = value;
		this._onDidChange.fire();
	}

	get(propertyName: T[number]['name']): number {
		return this._view[this.i * this._propertySpecsMap.size + this._propertySpecsMap.get(propertyName)!.offset];
	}

	setRaw(data: ArrayLike<number>): void {
		if (data.length !== this._propertySpecsMap.size) {
			throw new Error(`Data length ${data.length} does not match the number of properties in the collection (${this._propertySpecsMap.size})`);
		}
		this._view.set(data, this.i * this._propertySpecsMap.size);
		this._dirtyTracker.flag(this.i * this._propertySpecsMap.size, this._propertySpecsMap.size);
	}
}
