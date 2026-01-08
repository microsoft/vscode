/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { isMarkdownString } from '../../../../../base/common/htmlContent.js';
import { equals as objectsEqual } from '../../../../../base/common/objects.js';
import { hasKey } from '../../../../../base/common/types.js';
import { IChatMarkdownContent } from '../chatService/chatService.js';
import { IChatDataSerializerLog, IChatModel, IChatProgressResponseContent, IChatRequestModel, IChatRequestVariableData, ISerializableChatData, ISerializableChatRequestData, SerializedChatResponsePart } from './chatModel.js';

/**
 * ChatModel has lots of properties and lots of ways those properties can mutate.
 * The naive way to store the ChatModel is serializing it to JSON and calling it
 * a day. However, chats can get very, very long, and thus doing so is slow.
 *
 * In this file, we define a `storageSchema` that adapters from the `IChatModel`
 * into the serializable format. This schema tells us what properties in the chat
 * model correspond to the serialized properties, *and how they change*. For
 * example, `Adapt.constant(...)` defines a property that will never be checked
 * for changes after it's written, and `Adapt.primitive(...)` defines a property
 * that will be checked for changes using strict equality each time we store it.
 *
 * We can then use this to generate a log of mutations that we can append to
 * cheaply without rewriting and reserializing the entire request each time.
 */

export namespace Adapt {
	const enum TransformKind {
		Constant,
		Key,
		Primitive,
		DeepCompare,
		Array,
		Object,
		Differentiated,
		Composed,
	}

	export interface Transform<TFrom, TTo> {
		readonly kind: TransformKind;
		/** Extracts the serializable value from the source object */
		extract(from: TFrom): TTo;
		/** Compares two serialized values for equality */
		equals(a: TTo, b: TTo): boolean;
		/** For object transforms, the schema of child properties */
		readonly children?: Schema<TTo, TTo>;
		/** For array transforms, the item schema */
		readonly itemSchema?: Transform<unknown, unknown>;
		/** Whether this is a key field (changes indicate object replacement) */
		readonly isKey?: boolean;
	}

	export type Schema<TFrom, TTo> = {
		[K in keyof Required<TTo>]: Transform<TFrom, TTo[K]>
	};

	/** A property that will initially be tracked but will never be mutated afterwards. */
	export function constant<T, R>(): Transform<T, R> {
		return {
			kind: TransformKind.Constant,
			extract: (from: T) => from as unknown as R,
			equals: () => true, // constants never change
		};
	}

	/**
	 * A primitive that will be tracked and compared first. If this is changed, the entire
	 * object is thrown out and re-stored. Used to detect replacements of entire objects that
	 * otherwise have constant values.
	 */
	export function key<T, R = T>(comparator?: (a: R, b: R) => boolean): Transform<T, R> {
		return {
			kind: TransformKind.Key,
			isKey: true,
			extract: (from: T) => from as unknown as R,
			equals: comparator ?? ((a, b) => a === b),
		};
	}

	/** A primitive that will be tracked and we will use strict equality for change detection. */
	export function primitive<T, R extends string | number | boolean | undefined>(): Transform<T, R>;
	export function primitive<T, R>(comparator: (a: R, b: R) => boolean): Transform<T, R>;
	export function primitive<T, R>(comparator?: (a: R, b: R) => boolean): Transform<T, R> {
		return {
			kind: TransformKind.Primitive,
			extract: (from: T) => from as unknown as R,
			equals: comparator ?? ((a, b) => a === b),
		};
	}

	/** An object that will use an expensive deep equality check for change detection. Use sparingly. */
	export function deepCompare<T, R>(): Transform<T, R> {
		return {
			kind: TransformKind.DeepCompare,
			extract: (from: T) => from as unknown as R,
			equals: (a, b) => objectsEqual(a, b),
		};
	}

	/** An array that will use the schema to compare items positionally. */
	// export function array<T, R>(schema: Transform<T, R>): Transform<T[] | undefined, R[] | undefined>;
	export function array<T, R>(schema: Transform<T, R>): Transform<T[], R[]>;
	export function array<T, R>(schema: Transform<T, R>): Transform<T[] | undefined, R[] | undefined> {
		return {
			kind: TransformKind.Array,
			itemSchema: schema as Transform<unknown, unknown>,
			extract: (from: T[] | undefined) => from?.map(item => schema.extract(item)),
			equals: (a, b) => {
				if (a === b) { return true; }
				if (!a || !b) { return false; }
				if (a.length !== b.length) { return false; }
				for (let i = 0; i < a.length; i++) {
					if (!schema.equals(a[i], b[i])) {
						return false;
					}
				}
				return true;
			},
		};
	}

	export function object<T, R extends object>(schema: Schema<T, R>): Transform<T, R> {
		return {
			kind: TransformKind.Object,
			children: schema as unknown as Schema<R, R>,
			extract: (from: T) => {
				const result: Record<string, unknown> = Object.create(null);
				for (const key of Object.keys(schema) as (keyof R & keyof typeof schema)[]) {
					const transform = schema[key as keyof typeof schema] as Transform<T, R[typeof key]>;
					result[key as string] = transform.extract(from);
				}
				return result as R;
			},
			equals: (a, b) => {
				for (const key of Object.keys(schema) as (keyof R & keyof typeof schema)[]) {
					const transform = schema[key as keyof typeof schema] as Transform<T, R[typeof key]>;
					if (!transform.equals(a[key], b[key])) {
						return false;
					}
				}
				return true;
			},
		};
	}

	export function differentiated<T, R>(
		extract: (obj: T) => R,
		equals: (a: R, b: R) => boolean = objectsEqual,
	): Transform<T, R> {
		return {
			kind: TransformKind.Differentiated,
			extract,
			equals,
		};
	}

	export function t<T, O, R>(getter: (obj: T) => O, schema: Transform<O, R>): Transform<T, R> {
		return {
			kind: TransformKind.Composed,
			children: schema.children as Schema<R, R> | undefined,
			itemSchema: schema.itemSchema,
			isKey: schema.isKey,
			extract: (from: T) => schema.extract(getter(from)),
			equals: schema.equals,
		};
	}


	const enum EntryKind {
		/** Initial complete object state, valid only as the first entry */
		Initial = 0,
		/** Property update */
		Set = 1,
		/** Array push/splice. */
		Push = 2,
	}

	type ObjectPath = (string | number)[];

	type Entry =
		| { kind: EntryKind.Initial; v: unknown }
		/** Update a property of an object, replacing it entirely */
		| { kind: EntryKind.Set; k: ObjectPath; v: unknown }
		/** Pushes 0 or more new entries to an array. If `i` is set, everything after that index is removed */
		| { kind: EntryKind.Push; k: ObjectPath; v?: unknown[]; i?: number };

	/**
	 * An implementation of an append-based mutation logger. Given a `Transform`
	 * definition of an object, it can recreate it from a file on disk. It is
	 * then stateful, and given a `write` call it can update the log in a minimal
	 * way.
	 */
	export class LogAdapter<TFrom, TTo> {
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
			const value = this._transform.extract(current);
			this._previous = value;
			this._entryCount = 1;
			const entry: Entry = { kind: EntryKind.Initial, v: value };
			return VSBuffer.fromString(JSON.stringify(entry) + '\n');
		}

		/**
		 * Reads and reconstructs the state from a log file.
		 */
		read(file: VSBuffer | string): TTo {
			const content = file.toString();
			let state: unknown;
			let lineCount = 0;

			let start = 0;
			const len = content.length;
			while (start < len) {
				let end = content.indexOf('\n', start);
				if (end === -1) {
					end = len;
				}

				if (end > start) {
					const line = content.substring(start, end);
					if (line.length > 0) {
						lineCount++;
						const entry = JSON.parse(line) as Entry;
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
						}
					}
				}
				start = end + 1;
			}

			if (lineCount === 0) {
				throw new Error('Empty log file');
			}

			this._previous = JSON.parse(JSON.stringify(state));
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
				this._previous = JSON.parse(JSON.stringify(currentValue));
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
			this._previous = JSON.parse(JSON.stringify(currentValue));

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
			if (transform.equals(prev, curr)) {
				return;
			}

			switch (transform.kind) {
				case TransformKind.Constant:
					// Constants don't change
					break;

				case TransformKind.Key:
				case TransformKind.Primitive:
				case TransformKind.DeepCompare:
				case TransformKind.Differentiated:
					// Simple value change - copy path since we're storing it
					entries.push({ kind: EntryKind.Set, k: path.slice(), v: curr });
					break;

				case TransformKind.Array:
					this._diffArray(transform, path, prev as unknown[], curr as unknown[], entries);
					break;

				case TransformKind.Object:
				case TransformKind.Composed:
					if (transform.children) {
						this._diffObject(transform.children as Schema<R, R>, path, prev, curr, entries);
					} else if (transform.itemSchema) {
						// Composed with array
						this._diffArray(transform, path, prev as unknown[], curr as unknown[], entries);
					} else {
						entries.push({ kind: EntryKind.Set, k: path.slice(), v: curr });
					}
					break;

				default:
					assertNever(transform.kind);
			}
		}

		private _diffObject<R>(
			schema: Schema<R, R>,
			path: ObjectPath,
			prev: R,
			curr: R,
			entries: Entry[]
		): void {
			const keys = Object.keys(schema) as (keyof R)[];

			// First check key fields - if any key changed, replace the entire object
			for (const key of keys) {
				const transform = schema[key] as Transform<R, R[typeof key]>;
				if (transform.isKey) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const prevVal: any = prev?.[key];
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const currVal: any = curr?.[key];
					if (!transform.equals(prevVal, currVal)) {
						// Key changed, replace entire object
						entries.push({ kind: EntryKind.Set, k: path.slice(), v: curr });
						return;
					}
				}
			}

			// Diff each property using mutable path
			for (const key of keys) {
				const transform = schema[key] as Transform<R, R[typeof key]>;
				const prevVal = prev?.[key];
				const currVal = curr?.[key];
				path.push(key as string);
				this._diff(transform, path, prevVal, currVal, entries);
				path.pop();
			}
		}

		private _diffArray<T, R>(
			transform: Transform<T, R>,
			path: ObjectPath,
			prev: unknown[] | undefined,
			curr: unknown[] | undefined,
			entries: Entry[]
		): void {
			const prevArr = prev || [];
			const currArr = curr || [];

			if (!transform.itemSchema) {
				// No item schema, use deep compare and replace if different
				if (!objectsEqual(prevArr, currArr)) {
					entries.push({ kind: EntryKind.Set, k: path.slice(), v: currArr });
				}
				return;
			}

			const itemSchema = transform.itemSchema;
			const minLen = Math.min(prevArr.length, currArr.length);

			// If the item schema has children (is an object), we can recurse into it
			// to diff individual properties instead of replacing the entire item.
			// However, we only do this if the key fields match.
			if (itemSchema.children) {
				const childSchema = itemSchema.children as Schema<unknown, unknown>;

				// Diff common elements by recursing into them
				for (let i = 0; i < minLen; i++) {
					const prevItem = prevArr[i];
					const currItem = currArr[i];
					if (!itemSchema.equals(prevItem, currItem)) {
						// Check if key fields match - if not, we need to replace from this point
						if (this._hasKeyMismatch(childSchema, prevItem, currItem)) {
							// Key mismatch: replace from this point onward
							const newItems = currArr.slice(i);
							entries.push({ kind: EntryKind.Push, k: path.slice(), v: newItems.length > 0 ? newItems : undefined, i });
							return;
						}
						// Keys match, recurse into the object
						path.push(i);
						this._diffObject(childSchema, path, prevItem, currItem, entries);
						path.pop();
					}
				}

				// Handle length changes
				if (currArr.length > prevArr.length) {
					const newItems = currArr.slice(prevArr.length);
					entries.push({ kind: EntryKind.Push, k: path.slice(), v: newItems });
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
						const newItems = currArr.slice(prevArr.length);
						entries.push({ kind: EntryKind.Push, k: path.slice(), v: newItems });
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

		private _hasKeyMismatch<R>(schema: Schema<R, R>, prev: R, curr: R): boolean {
			const keys = Object.keys(schema) as (keyof R)[];
			for (const key of keys) {
				const transform = schema[key] as Transform<R, R[typeof key]>;
				if (transform.isKey) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const prevVal: any = prev?.[key];
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const currVal: any = curr?.[key];
					if (!transform.equals(prevVal, currVal)) {
						return true;
					}
				}
			}
			return false;
		}
	}
}

const toJson = <T>(obj: T): T extends { toJSON?(): infer R } ? R : T => {
	const cast = obj as { toJSON?: () => T };
	// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
	return (cast && typeof cast.toJSON === 'function' ? cast.toJSON() : obj) as any;
};

const responsePartSchema = Adapt.differentiated<IChatProgressResponseContent, SerializedChatResponsePart>(
	(obj): SerializedChatResponsePart => obj.kind === 'markdownContent' ? obj.content : toJson(obj),
	(a, b) => {
		// For markdown strings, compare by value
		if (isMarkdownString(a) && isMarkdownString(b)) {
			return a.value === b.value;
		}

		// For objects with a 'kind', check kind first then deep compare if dynamic
		if (hasKey(a, { kind: true }) && hasKey(b, { kind: true })) {
			if (a.kind !== b.kind) {
				return false;
			}

			// Dynamic types that can change after initial push need deep equality
			// Note: these are the *serialized* kind names (e.g. toolInvocationSerialized not toolInvocation)
			switch (a.kind) {
				case 'markdownContent':
					return a.content === (b as IChatMarkdownContent).content;

				case 'toolInvocationSerialized':
				case 'elicitationSerialized':
				case 'progressTaskSerialized':
				case 'textEditGroup':
				case 'multiDiffData':
				case 'mcpServersStarting':
					return objectsEqual(a, b);

				case 'clearToPreviousToolInvocation':
				case 'codeblockUri':
				case 'command':
				case 'confirmation':
				case 'extensions':
				case 'inlineReference':
				case 'markdownVuln':
				case 'notebookEditGroup':
				case 'prepareToolInvocation':
				case 'progressMessage':
				case 'pullRequest':
				case 'thinking':
				case 'undoStop':
				case 'warning':
				case 'treeData':
					return true;
				default: {
					// Hello developer! You are probably here because you added a new chat response type.
					// This logic controls when we'll update chat parts stored on disk as part of the session.
					// If it's a 'static' type that is not expected to change, add it to the 'return true'
					// block above. However it's a type that is going to change, add it to the 'objectsEqual'
					// block or make something more tailored.
					assertNever(a);
				}
			}
		}

		return objectsEqual(a, b);
	}
);


const requestSchema = Adapt.object<IChatRequestModel, ISerializableChatRequestData>({
	// request parts
	requestId: Adapt.t(m => m.id, Adapt.key()),
	timestamp: Adapt.t(m => m.timestamp, Adapt.constant()),
	confirmation: Adapt.t(m => m.confirmation, Adapt.constant()),
	message: Adapt.t(m => m.message, Adapt.deepCompare()),
	shouldBeRemovedOnSend: Adapt.t(m => m.shouldBeRemovedOnSend, Adapt.deepCompare()),
	isHidden: Adapt.t(() => undefined, Adapt.primitive()), // deprecated, always undefined for new da, Adapt.constant(t)a
	agent: Adapt.t(m => m.response?.agent, Adapt.primitive((a, b) => a?.id === b?.id)),
	modelId: Adapt.t(m => m.modelId, Adapt.primitive()),
	editedFileEvents: Adapt.t(m => m.editedFileEvents, Adapt.deepCompare()),
	variableData: Adapt.t(m => m.variableData, Adapt.object<IChatRequestVariableData, IChatRequestVariableData>({
		variables: Adapt.t(v => v.variables, Adapt.array(Adapt.primitive((a, b) => a.name === b.name))),
	})),
	isCanceled: Adapt.t(() => undefined, Adapt.primitive()), // deprecated, modelState is used inste, Adapt.constant(a)d

	// response parts (from ISerializableChatResponseData via response.toJSON())
	response: Adapt.t(m => m.response?.entireResponse.value, Adapt.array(responsePartSchema)),
	responseId: Adapt.t(m => m.response?.id, Adapt.primitive()),
	result: Adapt.t(m => m.response?.result, Adapt.deepCompare()),
	responseMarkdownInfo: Adapt.t(
		m => m.response?.codeBlockInfos?.map(info => ({ suggestionId: info.suggestionId })),
		Adapt.deepCompare(),
	),
	followups: Adapt.t(m => m.response?.followups, Adapt.deepCompare()),
	modelState: Adapt.t(m => m.response?.state, Adapt.deepCompare()),
	vote: Adapt.t(m => m.response?.vote, Adapt.primitive()),
	voteDownReason: Adapt.t(m => m.response?.voteDownReason, Adapt.primitive()),
	slashCommand: Adapt.t(m => m.response?.slashCommand, Adapt.primitive((a, b) => a?.name === b?.name)),
	usedContext: Adapt.t(m => m.response?.usedContext, Adapt.deepCompare()),
	contentReferences: Adapt.t(m => m.response?.contentReferences, Adapt.deepCompare()),
	codeCitations: Adapt.t(m => m.response?.codeCitations, Adapt.deepCompare()),
	timeSpentWaiting: Adapt.t(m => m.response?.timestamp, Adapt.primitive()), // based on response timestamp
});


export const storageSchema = Adapt.object<IChatModel, ISerializableChatData>({
	version: Adapt.t(() => 3, Adapt.constant()),
	creationDate: Adapt.t(m => m.timestamp, Adapt.constant()),
	customTitle: Adapt.t(m => m.hasCustomTitle ? m.title : undefined, Adapt.primitive()),
	initialLocation: Adapt.t(m => m.initialLocation, Adapt.constant()),
	inputState: Adapt.t(m => m.inputModel.toJSON(), Adapt.deepCompare()),
	responderUsername: Adapt.t(m => m.responderUsername, Adapt.primitive()),
	sessionId: Adapt.t(m => m.sessionId, Adapt.constant()),
	requests: Adapt.t(m => m.getRequests(), Adapt.array(requestSchema)),
});

export class ChatSessionOperationLog extends Adapt.LogAdapter<IChatModel, ISerializableChatData> implements IChatDataSerializerLog {
	public static looksLikeLog(contents: string): boolean {
		const ln = contents.indexOf('\n');
		if (ln === -1) {
			return false;
		}
		try {
			const entry = JSON.parse(contents.substring(0, ln)) as { kind: number };
			return !!entry && typeof entry.kind === 'number' && entry.kind === 0;
		} catch {
			return false;
		}
	}

	constructor() {
		super(storageSchema, 1024);
	}
}
