/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Defined a subset of ES6 built ins that run in IE11
// CHECK WITH http://kangax.github.io/compat-table/es6/#ie11

interface Map<K, V> {
  clear(): void;
  delete(key: K): boolean;
  forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void, thisArg?: any): void;
  get(key: K): V;
  has(key: K): boolean;
  set(key: K, value?: V): Map<K, V>;
  readonly size: number;

  // not supported on IE11:
  // entries(): IterableIterator<[K, V]>;
  // keys(): IterableIterator<K>;
  // values(): IterableIterator<V>;
  // [Symbol.iterator]():IterableIterator<[K,V]>;
  // [Symbol.toStringTag]: string;
}

interface MapConstructor {
  new <K, V>(): Map<K, V>;
  prototype: Map<any, any>;

  // not supported on IE11:
  // new <K, V>(iterable: Iterable<[K, V]>): Map<K, V>;
}
declare var Map: MapConstructor;


interface Set<T> {
  add(value: T): Set<T>;
  clear(): void;
  delete(value: T): boolean;
  forEach(callbackfn: (value: T, index: T, set: Set<T>) => void, thisArg?: any): void;
  has(value: T): boolean;
  readonly size: number;

  // not supported on IE11:
  // entries(): IterableIterator<[T, T]>;
  // keys(): IterableIterator<T>;
  // values(): IterableIterator<T>;
  // [Symbol.iterator]():IterableIterator<T>;
  // [Symbol.toStringTag]: string;
}

interface SetConstructor {
  new <T>(): Set<T>;
  prototype: Set<any>;

  // not supported on IE11:
  // new <T>(iterable: Iterable<T>): Set<T>;
}
declare var Set: SetConstructor;


interface WeakMap<K, V> {
  delete(key: K): boolean;
  get(key: K): V | undefined;
  has(key: K): boolean;
  // IE11 doesn't return this
  // set(key: K, value?: V): this;
  set(key: K, value?: V): undefined;
}

interface WeakMapConstructor {
  new (): WeakMap<any, any>;
  new <K, V>(): WeakMap<K, V>;
  // new <K, V>(entries?: [K, V][]): WeakMap<K, V>;
  readonly prototype: WeakMap<any, any>;
}
declare var WeakMap: WeakMapConstructor;


// /**
//   * Represents a raw buffer of binary data, which is used to store data for the
//   * different typed arrays. ArrayBuffers cannot be read from or written to directly,
//   * but can be passed to a typed array or DataView Object to interpret the raw
//   * buffer as needed.
//   */
// interface ArrayBuffer {
//   /**
//     * Read-only. The length of the ArrayBuffer (in bytes).
//     */
//   readonly byteLength: number;

//   /**
//     * Returns a section of an ArrayBuffer.
//     */
//   slice(begin: number, end?: number): ArrayBuffer;
// }

// interface ArrayBufferConstructor {
//   readonly prototype: ArrayBuffer;
//   new (byteLength: number): ArrayBuffer;
//   isView(arg: any): arg is ArrayBufferView;
// }
// declare const ArrayBuffer: ArrayBufferConstructor;

// interface ArrayBufferView {
//   /**
//     * The ArrayBuffer instance referenced by the array.
//     */
//   buffer: ArrayBuffer;

//   /**
//     * The length in bytes of the array.
//     */
//   byteLength: number;

//   /**
//     * The offset in bytes of the array.
//     */
//   byteOffset: number;
// }

// interface DataView {
//   readonly buffer: ArrayBuffer;
//   readonly byteLength: number;
//   readonly byteOffset: number;
//   /**
//     * Gets the Float32 value at the specified byte offset from the start of the view. There is
//     * no alignment constraint; multi-byte values may be fetched from any offset.
//     * @param byteOffset The place in the buffer at which the value should be retrieved.
//     */
//   getFloat32(byteOffset: number, littleEndian?: boolean): number;

//   /**
//     * Gets the Float64 value at the specified byte offset from the start of the view. There is
//     * no alignment constraint; multi-byte values may be fetched from any offset.
//     * @param byteOffset The place in the buffer at which the value should be retrieved.
//     */
//   getFloat64(byteOffset: number, littleEndian?: boolean): number;

//   /**
//     * Gets the Int8 value at the specified byte offset from the start of the view. There is
//     * no alignment constraint; multi-byte values may be fetched from any offset.
//     * @param byteOffset The place in the buffer at which the value should be retrieved.
//     */
//   getInt8(byteOffset: number): number;

//   /**
//     * Gets the Int16 value at the specified byte offset from the start of the view. There is
//     * no alignment constraint; multi-byte values may be fetched from any offset.
//     * @param byteOffset The place in the buffer at which the value should be retrieved.
//     */
//   getInt16(byteOffset: number, littleEndian?: boolean): number;
//   /**
//     * Gets the Int32 value at the specified byte offset from the start of the view. There is
//     * no alignment constraint; multi-byte values may be fetched from any offset.
//     * @param byteOffset The place in the buffer at which the value should be retrieved.
//     */
//   getInt32(byteOffset: number, littleEndian?: boolean): number;

//   /**
//     * Gets the Uint8 value at the specified byte offset from the start of the view. There is
//     * no alignment constraint; multi-byte values may be fetched from any offset.
//     * @param byteOffset The place in the buffer at which the value should be retrieved.
//     */
//   getUint8(byteOffset: number): number;

//   /**
//     * Gets the Uint16 value at the specified byte offset from the start of the view. There is
//     * no alignment constraint; multi-byte values may be fetched from any offset.
//     * @param byteOffset The place in the buffer at which the value should be retrieved.
//     */
//   getUint16(byteOffset: number, littleEndian?: boolean): number;

//   /**
//     * Gets the Uint32 value at the specified byte offset from the start of the view. There is
//     * no alignment constraint; multi-byte values may be fetched from any offset.
//     * @param byteOffset The place in the buffer at which the value should be retrieved.
//     */
//   getUint32(byteOffset: number, littleEndian?: boolean): number;

//   /**
//     * Stores an Float32 value at the specified byte offset from the start of the view.
//     * @param byteOffset The place in the buffer at which the value should be set.
//     * @param value The value to set.
//     * @param littleEndian If false or undefined, a big-endian value should be written,
//     * otherwise a little-endian value should be written.
//     */
//   setFloat32(byteOffset: number, value: number, littleEndian?: boolean): void;

//   /**
//     * Stores an Float64 value at the specified byte offset from the start of the view.
//     * @param byteOffset The place in the buffer at which the value should be set.
//     * @param value The value to set.
//     * @param littleEndian If false or undefined, a big-endian value should be written,
//     * otherwise a little-endian value should be written.
//     */
//   setFloat64(byteOffset: number, value: number, littleEndian?: boolean): void;

//   /**
//     * Stores an Int8 value at the specified byte offset from the start of the view.
//     * @param byteOffset The place in the buffer at which the value should be set.
//     * @param value The value to set.
//     */
//   setInt8(byteOffset: number, value: number): void;

//   /**
//     * Stores an Int16 value at the specified byte offset from the start of the view.
//     * @param byteOffset The place in the buffer at which the value should be set.
//     * @param value The value to set.
//     * @param littleEndian If false or undefined, a big-endian value should be written,
//     * otherwise a little-endian value should be written.
//     */
//   setInt16(byteOffset: number, value: number, littleEndian?: boolean): void;

//   /**
//     * Stores an Int32 value at the specified byte offset from the start of the view.
//     * @param byteOffset The place in the buffer at which the value should be set.
//     * @param value The value to set.
//     * @param littleEndian If false or undefined, a big-endian value should be written,
//     * otherwise a little-endian value should be written.
//     */
//   setInt32(byteOffset: number, value: number, littleEndian?: boolean): void;

//   /**
//     * Stores an Uint8 value at the specified byte offset from the start of the view.
//     * @param byteOffset The place in the buffer at which the value should be set.
//     * @param value The value to set.
//     */
//   setUint8(byteOffset: number, value: number): void;

//   /**
//     * Stores an Uint16 value at the specified byte offset from the start of the view.
//     * @param byteOffset The place in the buffer at which the value should be set.
//     * @param value The value to set.
//     * @param littleEndian If false or undefined, a big-endian value should be written,
//     * otherwise a little-endian value should be written.
//     */
//   setUint16(byteOffset: number, value: number, littleEndian?: boolean): void;

//   /**
//     * Stores an Uint32 value at the specified byte offset from the start of the view.
//     * @param byteOffset The place in the buffer at which the value should be set.
//     * @param value The value to set.
//     * @param littleEndian If false or undefined, a big-endian value should be written,
//     * otherwise a little-endian value should be written.
//     */
//   setUint32(byteOffset: number, value: number, littleEndian?: boolean): void;
// }

// interface DataViewConstructor {
//   new (buffer: ArrayBuffer, byteOffset?: number, byteLength?: number): DataView;
// }
// declare const DataView: DataViewConstructor;


// /**
//   * A typed array of 8-bit integer values. The contents are initialized to 0. If the requested
//   * number of bytes could not be allocated an exception is raised.
//   */
// interface Int8Array {
//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

//   /**
//     * The ArrayBuffer instance referenced by the array.
//     */
//   readonly buffer: ArrayBuffer;

//   /**
//     * The length in bytes of the array.
//     */
//   readonly byteLength: number;

//   /**
//     * The offset in bytes of the array.
//     */
//   readonly byteOffset: number;

//   /**
//     * The length of the array.
//     */
//   readonly length: number;

//   /**
//     * Sets a value or an array of values.
//     * @param index The index of the location to set.
//     * @param value The value to set.
//     */
//   set(index: number, value: number): void;

//   /**
//     * Sets a value or an array of values.
//     * @param array A typed or untyped array of values to set.
//     * @param offset The index in the current array at which the values are to be written.
//     */
//   set(array: ArrayLike<number>, offset?: number): void;

//   /**
//     * Converts a number to a string by using the current locale.
//     */
//   toLocaleString(): string;

//   /**
//     * Returns a string representation of an array.
//     */
//   toString(): string;

//   [index: number]: number;
// }
// interface Int8ArrayConstructor {
//   readonly prototype: Int8Array;
//   new (length: number): Int8Array;
//   new (array: ArrayLike<number>): Int8Array;
//   new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int8Array;

//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

// }
// declare const Int8Array: Int8ArrayConstructor;

// /**
//   * A typed array of 8-bit unsigned integer values. The contents are initialized to 0. If the
//   * requested number of bytes could not be allocated an exception is raised.
//   */
// interface Uint8Array {
//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

//   /**
//     * The ArrayBuffer instance referenced by the array.
//     */
//   readonly buffer: ArrayBuffer;

//   /**
//     * The length in bytes of the array.
//     */
//   readonly byteLength: number;

//   /**
//     * The offset in bytes of the array.
//     */
//   readonly byteOffset: number;

//   /**
//     * The length of the array.
//     */
//   readonly length: number;

//   /**
//     * Sets a value or an array of values.
//     * @param index The index of the location to set.
//     * @param value The value to set.
//     */
//   set(index: number, value: number): void;

//   /**
//     * Sets a value or an array of values.
//     * @param array A typed or untyped array of values to set.
//     * @param offset The index in the current array at which the values are to be written.
//     */
//   set(array: ArrayLike<number>, offset?: number): void;

//   /**
//     * Converts a number to a string by using the current locale.
//     */
//   toLocaleString(): string;

//   /**
//     * Returns a string representation of an array.
//     */
//   toString(): string;

//   [index: number]: number;
// }

// interface Uint8ArrayConstructor {
//   readonly prototype: Uint8Array;
//   new (length: number): Uint8Array;
//   new (array: ArrayLike<number>): Uint8Array;
//   new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint8Array;

//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

// }
// declare const Uint8Array: Uint8ArrayConstructor;


// /**
//   * A typed array of 16-bit signed integer values. The contents are initialized to 0. If the
//   * requested number of bytes could not be allocated an exception is raised.
//   */
// interface Int16Array {
//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

//   /**
//     * The ArrayBuffer instance referenced by the array.
//     */
//   readonly buffer: ArrayBuffer;

//   /**
//     * The length in bytes of the array.
//     */
//   readonly byteLength: number;

//   /**
//     * The offset in bytes of the array.
//     */
//   readonly byteOffset: number;

//   /**
//     * The length of the array.
//     */
//   readonly length: number;

//   /**
//     * Sets a value or an array of values.
//     * @param index The index of the location to set.
//     * @param value The value to set.
//     */
//   set(index: number, value: number): void;

//   /**
//     * Sets a value or an array of values.
//     * @param array A typed or untyped array of values to set.
//     * @param offset The index in the current array at which the values are to be written.
//     */
//   set(array: ArrayLike<number>, offset?: number): void;

//   /**
//     * Converts a number to a string by using the current locale.
//     */
//   toLocaleString(): string;

//   /**
//     * Returns a string representation of an array.
//     */
//   toString(): string;

//   [index: number]: number;
// }

// interface Int16ArrayConstructor {
//   readonly prototype: Int16Array;
//   new (length: number): Int16Array;
//   new (array: ArrayLike<number>): Int16Array;
//   new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int16Array;

//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

// }
// declare const Int16Array: Int16ArrayConstructor;

// /**
//   * A typed array of 16-bit unsigned integer values. The contents are initialized to 0. If the
//   * requested number of bytes could not be allocated an exception is raised.
//   */
// interface Uint16Array {
//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

//   /**
//     * The ArrayBuffer instance referenced by the array.
//     */
//   readonly buffer: ArrayBuffer;

//   /**
//     * The length in bytes of the array.
//     */
//   readonly byteLength: number;

//   /**
//     * The offset in bytes of the array.
//     */
//   readonly byteOffset: number;

//   /**
//     * The length of the array.
//     */
//   readonly length: number;

//   /**
//     * Sets a value or an array of values.
//     * @param index The index of the location to set.
//     * @param value The value to set.
//     */
//   set(index: number, value: number): void;

//   /**
//     * Sets a value or an array of values.
//     * @param array A typed or untyped array of values to set.
//     * @param offset The index in the current array at which the values are to be written.
//     */
//   set(array: ArrayLike<number>, offset?: number): void;

//   /**
//     * Converts a number to a string by using the current locale.
//     */
//   toLocaleString(): string;

//   /**
//     * Returns a string representation of an array.
//     */
//   toString(): string;

//   [index: number]: number;
// }

// interface Uint16ArrayConstructor {
//   readonly prototype: Uint16Array;
//   new (length: number): Uint16Array;
//   new (array: ArrayLike<number>): Uint16Array;
//   new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint16Array;

//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

// }
// declare const Uint16Array: Uint16ArrayConstructor;
// /**
//   * A typed array of 32-bit signed integer values. The contents are initialized to 0. If the
//   * requested number of bytes could not be allocated an exception is raised.
//   */
// interface Int32Array {
//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

//   /**
//     * The ArrayBuffer instance referenced by the array.
//     */
//   readonly buffer: ArrayBuffer;

//   /**
//     * The length in bytes of the array.
//     */
//   readonly byteLength: number;

//   /**
//     * The offset in bytes of the array.
//     */
//   readonly byteOffset: number;

//   /**
//     * The length of the array.
//     */
//   readonly length: number;

//   /**
//     * Sets a value or an array of values.
//     * @param index The index of the location to set.
//     * @param value The value to set.
//     */
//   set(index: number, value: number): void;

//   /**
//     * Sets a value or an array of values.
//     * @param array A typed or untyped array of values to set.
//     * @param offset The index in the current array at which the values are to be written.
//     */
//   set(array: ArrayLike<number>, offset?: number): void;

//   /**
//     * Converts a number to a string by using the current locale.
//     */
//   toLocaleString(): string;

//   /**
//     * Returns a string representation of an array.
//     */
//   toString(): string;

//   [index: number]: number;
// }

// interface Int32ArrayConstructor {
//   readonly prototype: Int32Array;
//   new (length: number): Int32Array;
//   new (array: ArrayLike<number>): Int32Array;
//   new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int32Array;

//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;
// }

// declare const Int32Array: Int32ArrayConstructor;

// /**
//   * A typed array of 32-bit unsigned integer values. The contents are initialized to 0. If the
//   * requested number of bytes could not be allocated an exception is raised.
//   */
// interface Uint32Array {
//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

//   /**
//     * The ArrayBuffer instance referenced by the array.
//     */
//   readonly buffer: ArrayBuffer;

//   /**
//     * The length in bytes of the array.
//     */
//   readonly byteLength: number;

//   /**
//     * The offset in bytes of the array.
//     */
//   readonly byteOffset: number;

//   /**
//     * The length of the array.
//     */
//   readonly length: number;

//   /**
//     * Sets a value or an array of values.
//     * @param index The index of the location to set.
//     * @param value The value to set.
//     */
//   set(index: number, value: number): void;

//   /**
//     * Sets a value or an array of values.
//     * @param array A typed or untyped array of values to set.
//     * @param offset The index in the current array at which the values are to be written.
//     */
//   set(array: ArrayLike<number>, offset?: number): void;

//   /**
//     * Converts a number to a string by using the current locale.
//     */
//   toLocaleString(): string;

//   /**
//     * Returns a string representation of an array.
//     */
//   toString(): string;

//   [index: number]: number;
// }

// interface Uint32ArrayConstructor {
//   readonly prototype: Uint32Array;
//   new (length: number): Uint32Array;
//   new (array: ArrayLike<number>): Uint32Array;
//   new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint32Array;

//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;
// }

// declare const Uint32Array: Uint32ArrayConstructor;

// /**
//   * A typed array of 32-bit float values. The contents are initialized to 0. If the requested number
//   * of bytes could not be allocated an exception is raised.
//   */
// interface Float32Array {
//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

//   /**
//     * The ArrayBuffer instance referenced by the array.
//     */
//   readonly buffer: ArrayBuffer;

//   /**
//     * The length in bytes of the array.
//     */
//   readonly byteLength: number;

//   /**
//     * The offset in bytes of the array.
//     */
//   readonly byteOffset: number;

//   /**
//     * The length of the array.
//     */
//   readonly length: number;

//   /**
//     * Sets a value or an array of values.
//     * @param index The index of the location to set.
//     * @param value The value to set.
//     */
//   set(index: number, value: number): void;

//   /**
//     * Sets a value or an array of values.
//     * @param array A typed or untyped array of values to set.
//     * @param offset The index in the current array at which the values are to be written.
//     */
//   set(array: ArrayLike<number>, offset?: number): void;

//   /**
//     * Converts a number to a string by using the current locale.
//     */
//   toLocaleString(): string;

//   /**
//     * Returns a string representation of an array.
//     */
//   toString(): string;

//   [index: number]: number;
// }

// interface Float32ArrayConstructor {
//   readonly prototype: Float32Array;
//   new (length: number): Float32Array;
//   new (array: ArrayLike<number>): Float32Array;
//   new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Float32Array;

//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

// }
// declare const Float32Array: Float32ArrayConstructor;

// /**
//   * A typed array of 64-bit float values. The contents are initialized to 0. If the requested
//   * number of bytes could not be allocated an exception is raised.
//   */
// interface Float64Array {
//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;

//   /**
//     * The ArrayBuffer instance referenced by the array.
//     */
//   readonly buffer: ArrayBuffer;

//   /**
//     * The length in bytes of the array.
//     */
//   readonly byteLength: number;

//   /**
//     * The offset in bytes of the array.
//     */
//   readonly byteOffset: number;

//   /**
//     * The length of the array.
//     */
//   readonly length: number;

//   /**
//     * Sets a value or an array of values.
//     * @param index The index of the location to set.
//     * @param value The value to set.
//     */
//   set(index: number, value: number): void;

//   /**
//     * Sets a value or an array of values.
//     * @param array A typed or untyped array of values to set.
//     * @param offset The index in the current array at which the values are to be written.
//     */
//   set(array: ArrayLike<number>, offset?: number): void;

//   /**
//     * Converts a number to a string by using the current locale.
//     */
//   toLocaleString(): string;

//   /**
//     * Returns a string representation of an array.
//     */
//   toString(): string;

//   [index: number]: number;
// }

// interface Float64ArrayConstructor {
//   readonly prototype: Float64Array;
//   new (length: number): Float64Array;
//   new (array: ArrayLike<number>): Float64Array;
//   new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Float64Array;

//   /**
//     * The size in bytes of each element in the array.
//     */
//   readonly BYTES_PER_ELEMENT: number;
// }

// declare const Float64Array: Float64ArrayConstructor;
