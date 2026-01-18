/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { isUndefinedOrNull } from '../../../../../base/common/types.js';


/** IMPORTANT: `Key` comes first. Then we should sort in order of least->most expensive to diff */
const enum TransformKind {
	Key,
	Primitive,
	Array,
	Object,
}

/** Schema entries sorted with key properties first */
export type SchemaEntries = [string, Transform<unknown, unknown>][];

interface TransformBase<TFrom, TTo> {
	readonly kind: TransformKind;
	/** Extracts the serializable value from the source object */
	extract(from: TFrom): TTo;
}

/** Transform for primitive values (keys and values) that can be compared for equality */
export interface TransformValue<TFrom, TTo> extends TransformBase<TFrom, TTo> {
	readonly kind: TransformKind.Key | TransformKind.Primitive;
	/** Compares two serialized values for equality */
	equals(a: TTo, b: TTo): boolean;
}

/** Transform for arrays with an item schema */
export interface TransformArray<TFrom, TTo> extends TransformBase<TFrom, TTo> {
	readonly kind: TransformKind.Array;
	/** The schema for array items */
	readonly itemSchema: TransformObject<unknown, unknown> | TransformValue<unknown, unknown>;
}

/** Transform for objects with child properties */
export interface TransformObject<TFrom, TTo> extends TransformBase<TFrom, TTo> {
	readonly kind: TransformKind.Object;
	/** Schema entries sorted with Key properties first */
	readonly children: SchemaEntries;
	/** Checks if the object is sealed (won't change). */
	sealed?(obj: TTo, wasSerialized: boolean): boolean;
}

export type Transform<TFrom, TTo> =
	| TransformValue<TFrom, TTo>
	| TransformArray<TFrom, TTo>
	| TransformObject<TFrom, TTo>;

export type Schema<TFrom, TTo> = {
	[K in keyof Required<TTo>]: Transform<TFrom, TTo[K]>
};

/**
 * A primitive that will be tracked and compared first. If this is changed, the entire
 * object is thrown out and re-stored.
 */
export function key<T, R = T>(comparator?: (a: R, b: R) => boolean): TransformValue<T, R> {
	return {
		kind: TransformKind.Key,
		extract: (from: T) => from as unknown as R,
		equals: comparator ?? ((a, b) => a === b),
	};
}

/** A value that will be tracked and replaced if the comparator is not equal. */
export function value<T, R extends string | number | boolean | undefined>(): TransformValue<T, R>;
export function value<T, R>(comparator: (a: R, b: R) => boolean): TransformValue<T, R>;
export function value<T, R>(comparator?: (a: R, b: R) => boolean): TransformValue<T, R> {
	return {
		kind: TransformKind.Primitive,
		extract: (from: T) => {
			let value = from as unknown as R;
			// We map the object to JSON for two reasons (a) reduce issues with references to
			// mutable type that could be held internally in the LogAdapter and (b) to make
			// object comparison work with the data we re-hydrate from disk (e.g. if using
			// objectsEqual, a hydrated URI is not equal to the serialized UriComponents)
			if (!!value && typeof value === 'object') {
				value = JSON.parse(JSON.stringify(value));
			}

			return value;
		},
		equals: comparator ?? ((a, b) => a === b),
	};
}

/** An array that will use the schema to compare items positionally. */
export function array<T, R>(schema: TransformObject<T, R> | TransformValue<T, R>): TransformArray<readonly T[], R[]> {
	return {
		kind: TransformKind.Array,
		itemSchema: schema,
		extract: from => from?.map(item => schema.extract(item)),
	};
}

export interface ObjectOptions<R> {
	/**
	 * Returns true if the object is sealed and will never change again.
	 * When comparing two sealed objects, only key fields are compared
	 * (to detect replacement), but other fields are not diffed.
	 */
	sealed?: (obj: R, wasSerialized: boolean) => boolean;
}

/** An object schema. */
export function object<T, R extends object>(schema: Schema<T, R>, options?: ObjectOptions<R>): TransformObject<T, R> {
	// Sort entries with key properties first for fast key checking
	const entries = (Object.entries(schema) as [string, Transform<T, R[keyof R]>][]).sort(([, a], [, b]) => a.kind - b.kind);
	return {
		kind: TransformKind.Object,
		children: entries as SchemaEntries,
		sealed: options?.sealed,
		extract: (from: T) => {
			if (isUndefinedOrNull(from)) {
				return from as unknown as R;
			}

			const result: Record<string, unknown> = Object.create(null);
			for (const [key, transform] of entries) {
				result[key] = transform.extract(from);
			}
			return result as R;
		},
	};
}

/**
 * Defines a getter on the object to extract a value, compared with the given schema.
 * It should return the value that will get serialized in the resulting log file.
 */
export function t<T, O, R>(getter: (obj: T) => O, schema: Transform<O, R>): Transform<T, R> {
	return {
		...schema,
		extract: (from: T) => schema.extract(getter(from)),
	};
}

/** Shortcut for t(fn, value()) */
export function v<T, R extends string | number | boolean | undefined>(getter: (obj: T) => R): TransformValue<T, R>;
export function v<T, R>(getter: (obj: T) => R, comparator: (a: R, b: R) => boolean): TransformValue<T, R>;
export function v<T, R>(getter: (obj: T) => R, comparator?: (a: R, b: R) => boolean): TransformValue<T, R> {
	const inner = value(comparator!);
	return {
		...inner,
		extract: (from: T) => inner.extract(getter(from)),
	};
}


const enum EntryKind {
	/** Initial complete object state, valid only as the first entry */
	Initial = 0,
	/** Property update */
	Set = 1,
	/** Array push/splice. */
	Push = 2,
	/** Delete a property */
	Delete = 3,
}

type ObjectPath = (string | number)[];

type Entry =
	| { kind: EntryKind.Initial; v: unknown }
	/** Update a property of an object, replacing it entirely */
	| { kind: EntryKind.Set; k: ObjectPath; v: unknown }
	/** Delete a property of an object */
	| { kind: EntryKind.Delete; k: ObjectPath }
	/** Pushes 0 or more new entries to an array. If `i` is set, everything after that index is removed */
	| { kind: EntryKind.Push; k: ObjectPath; v?: unknown[]; i?: number };

const LF = VSBuffer.fromString('\n');

/**
 * An implementation of an append-based mutation logger. Given a `Transform`
 * definition of an object, it can recreate it from a file on disk. It is
 * then stateful, and given a `write` call it can update the log in a minimal
 * way.
 */
export class ObjectMutationLog<TFrom, TTo> {
	private _previous: TTo | undefined;
	private _entryCount = 0;

	constructor(
		private readonly _transform: Transform<TFrom, TTo>,
		private readonly _compactAfterEntries = 512,
	) { }

	/**
	 * Creates an initial log file from the given object.
	 */
	createInitial(current: TFrom): VSBuffer {
		return this.createInitialFromSerialized(this._transform.extract(current));
	}


	/**
	 * Creates an initial log file from the serialized object.
	 */
	createInitialFromSerialized(value: TTo): VSBuffer {
		this._previous = value;
		this._entryCount = 1;
		const entry: Entry = { kind: EntryKind.Initial, v: value };
		return VSBuffer.fromString(JSON.stringify(entry) + '\n');
	}

	/**
	 * Reads and reconstructs the state from a log file.
	 */
	read(content: VSBuffer): TTo {
		let state: unknown;
		let lineCount = 0;

		let start = 0;
		const len = content.byteLength;
		while (start < len) {
			let end = content.indexOf(LF, start);
			if (end === -1) {
				end = len;
			}

			if (end > start) {
				const line = content.slice(start, end);
				if (line.byteLength > 0) {
					lineCount++;
					const entry = JSON.parse(line.toString()) as Entry;
					switch (entry.kind) {
						case EntryKind.Initial:
							state = entry.v;
							break;
						case EntryKind.Set:
							this._applySet(state, entry.k, entry.v);
							break;
						case EntryKind.Push:
							this._applyPush(state, entry.k, entry.v, entry.i);
							break;
						case EntryKind.Delete:
							this._applySet(state, entry.k, undefined);
							break;
						default:
							assertNever(entry);
					}
				}
			}
			start = end + 1;
		}

		if (lineCount === 0) {
			throw new Error('Empty log file');
		}

		this._previous = state as TTo;
		this._entryCount = lineCount;
		return state as TTo;
	}

	/**
	 * Writes updates to the log. Returns the operation type and data to write.
	 */
	write(current: TFrom): { op: 'append' | 'replace'; data: VSBuffer } {
		const currentValue = this._transform.extract(current);

		if (!this._previous || this._entryCount > this._compactAfterEntries) {
			// No previous state, create initial
			this._previous = currentValue;
			this._entryCount = 1;
			const entry: Entry = { kind: EntryKind.Initial, v: currentValue };
			return { op: 'replace', data: VSBuffer.fromString(JSON.stringify(entry) + '\n') };
		}

		// Generate diff entries
		const entries: Entry[] = [];
		const path: ObjectPath = [];
		this._diff(this._transform, path, this._previous, currentValue, entries);

		if (entries.length === 0) {
			// No changes
			return { op: 'append', data: VSBuffer.fromString('') };
		}

		this._entryCount += entries.length;
		this._previous = currentValue;

		// Append entries - build string directly
		let data = '';
		for (const e of entries) {
			data += JSON.stringify(e) + '\n';
		}
		return { op: 'append', data: VSBuffer.fromString(data) };
	}

	private _applySet(state: unknown, path: ObjectPath, value: unknown): void {
		if (path.length === 0) {
			return; // Root replacement handled by caller
		}

		let current = state as Record<string | number, unknown>;
		for (let i = 0; i < path.length - 1; i++) {
			current = current[path[i]] as Record<string | number, unknown>;
		}

		current[path[path.length - 1]] = value;
	}

	private _applyPush(state: unknown, path: ObjectPath, values: unknown[] | undefined, startIndex: number | undefined): void {
		let current = state as Record<string | number, unknown>;
		for (let i = 0; i < path.length - 1; i++) {
			current = current[path[i]] as Record<string | number, unknown>;
		}

		const arrayKey = path[path.length - 1];
		const arr = current[arrayKey] as unknown[] || [];

		if (startIndex !== undefined) {
			arr.length = startIndex;
		}

		if (values && values.length > 0) {
			arr.push(...values);
		}

		current[arrayKey] = arr;
	}

	private _diff<T, R>(
		transform: Transform<T, R>,
		path: ObjectPath,
		prev: R,
		curr: R,
		entries: Entry[]
	): void {
		if (transform.kind === TransformKind.Key || transform.kind === TransformKind.Primitive) {
			// Simple value change - copy path since we're storing it
			if (!transform.equals(prev, curr)) {
				entries.push({ kind: EntryKind.Set, k: path.slice(), v: curr });
			}
		} else if (isUndefinedOrNull(prev) || isUndefinedOrNull(curr)) {
			if (prev !== curr) {
				if (curr === undefined) {
					entries.push({ kind: EntryKind.Delete, k: path.slice() });
				} else if (curr === null) {
					entries.push({ kind: EntryKind.Set, k: path.slice(), v: null });
				} else {
					entries.push({ kind: EntryKind.Set, k: path.slice(), v: curr });
				}
			}
		} else if (transform.kind === TransformKind.Array) {
			this._diffArray(transform, path, prev as unknown[], curr as unknown[], entries);
		} else if (transform.kind === TransformKind.Object) {
			this._diffObject(transform.children, path, prev, curr, entries, transform.sealed as ((obj: unknown, wasSerialized: boolean) => boolean) | undefined);
		} else {
			throw new Error(`Unknown transform kind ${JSON.stringify(transform)}`);
		}
	}

	private _diffObject(
		children: SchemaEntries,
		path: ObjectPath,
		prev: unknown,
		curr: unknown,
		entries: Entry[],
		sealed?: (obj: unknown, wasSerialized: boolean) => boolean,
	): void {
		const prevObj = prev as Record<string, unknown> | undefined;
		const currObj = curr as Record<string, unknown>;

		// First check key fields (sorted to front) - if any key changed, replace the entire object
		let i = 0;
		for (; i < children.length; i++) {
			const [key, transform] = children[i];
			if (transform.kind !== TransformKind.Key) {
				break; // Keys are sorted to front, so we can stop
			}
			if (!transform.equals(prevObj?.[key], currObj[key])) {
				// Key changed, replace entire object
				entries.push({ kind: EntryKind.Set, k: path.slice(), v: curr });
				return;
			}
		}

		// If both objects are sealed, we've already verified keys match above,
		// so we can skip diffing the other properties since sealed objects don't change
		if (sealed && sealed(prev, true) && sealed(curr, false)) {
			return;
		}

		// Diff each property using mutable path
		for (; i < children.length; i++) {
			const [key, transform] = children[i];
			path.push(key);
			this._diff(transform, path, prevObj?.[key], currObj[key], entries);
			path.pop();
		}
	}

	private _diffArray<T, R>(
		transform: TransformArray<T, R>,
		path: ObjectPath,
		prev: unknown[] | undefined,
		curr: unknown[] | undefined,
		entries: Entry[]
	): void {
		const prevArr = prev || [];
		const currArr = curr || [];

		const itemSchema = transform.itemSchema;
		const minLen = Math.min(prevArr.length, currArr.length);

		// If the item schema is an object, we can recurse into it to diff individual
		// properties instead of replacing the entire item. However, we only do this
		// if the key fields match.
		if (itemSchema.kind === TransformKind.Object) {
			const childEntries = itemSchema.children;

			// Diff common elements by recursing into them
			for (let i = 0; i < minLen; i++) {
				const prevItem = prevArr[i];
				const currItem = currArr[i];

				// Check if key fields match - if not, we need to replace from this point
				if (this._hasKeyMismatch(childEntries, prevItem, currItem)) {
					// Key mismatch: replace from this point onward
					const newItems = currArr.slice(i);
					entries.push({ kind: EntryKind.Push, k: path.slice(), v: newItems.length > 0 ? newItems : undefined, i });
					return;
				}

				// Keys match, recurse into the object
				path.push(i);
				this._diffObject(childEntries, path, prevItem, currItem, entries, itemSchema.sealed);
				path.pop();
			}

			// Handle length changes
			if (currArr.length > prevArr.length) {
				entries.push({ kind: EntryKind.Push, k: path.slice(), v: currArr.slice(prevArr.length) });
			} else if (currArr.length < prevArr.length) {
				entries.push({ kind: EntryKind.Push, k: path.slice(), i: currArr.length });
			}
		} else {
			// No children schema, use the original positional comparison
			let firstMismatch = -1;

			for (let i = 0; i < minLen; i++) {
				if (!itemSchema.equals(prevArr[i], currArr[i])) {
					firstMismatch = i;
					break;
				}
			}

			if (firstMismatch === -1) {
				// All common elements match
				if (currArr.length > prevArr.length) {
					// New items appended
					entries.push({ kind: EntryKind.Push, k: path.slice(), v: currArr.slice(prevArr.length) });
				} else if (currArr.length < prevArr.length) {
					// Items removed from end
					entries.push({ kind: EntryKind.Push, k: path.slice(), i: currArr.length });
				}
				// else: same length, all match - no change
			} else {
				// Mismatch found, rewrite from that point
				const newItems = currArr.slice(firstMismatch);
				entries.push({ kind: EntryKind.Push, k: path.slice(), v: newItems.length > 0 ? newItems : undefined, i: firstMismatch });
			}
		}
	}

	private _hasKeyMismatch(children: SchemaEntries, prev: unknown, curr: unknown): boolean {
		const prevObj = prev as Record<string, unknown> | undefined;
		const currObj = curr as Record<string, unknown>;
		for (const [key, transform] of children) {
			if (transform.kind !== TransformKind.Key) {
				break; // Keys are sorted to front, so we can stop
			}
			if (!transform.equals(prevObj?.[key], currObj[key])) {
				return true;
			}
		}
		return false;
	}
}
