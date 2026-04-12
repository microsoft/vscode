/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { isUndefinedOrNull } from '../../../../../base/common/types.js';
/**
 * Updates an error's message and stack trace with a prefix. In V8 the stack
 * string starts with "ErrorName: message\n  at …", so we rebuild the header
 * after mutating the message.
 */
function prefixError(e, prefix) {
    e.message = prefix + e.message;
    if (e.stack) {
        const nlIdx = e.stack.indexOf('\n');
        e.stack = nlIdx !== -1
            ? `${e.name}: ${e.message}${e.stack.slice(nlIdx)}`
            : `${e.name}: ${e.message}`;
    }
}
/**
 * Prepends a path segment to an error as it unwinds through nested extract
 * calls. Each level adds its segment so the final message reads e.g.
 * `.responses[2].content: Cannot read property 'x' of undefined`.
 */
function rethrowWithPathSegment(e, segment) {
    if (e instanceof Error) {
        const part = typeof segment === 'number' ? `[${segment}]` : `.${segment}`;
        const needsSep = !e.message.startsWith('[') && !e.message.startsWith('.');
        prefixError(e, part + (needsSep ? ': ' : ''));
    }
    throw e;
}
/** IMPORTANT: `Key` comes first. Then we should sort in order of least->most expensive to diff */
var TransformKind;
(function (TransformKind) {
    TransformKind[TransformKind["Key"] = 0] = "Key";
    TransformKind[TransformKind["Primitive"] = 1] = "Primitive";
    TransformKind[TransformKind["Array"] = 2] = "Array";
    TransformKind[TransformKind["Object"] = 3] = "Object";
})(TransformKind || (TransformKind = {}));
/**
 * A primitive that will be tracked and compared first. If this is changed, the entire
 * object is thrown out and re-stored.
 */
export function key(comparator) {
    return {
        kind: 0 /* TransformKind.Key */,
        extract: (from) => from,
        equals: comparator ?? ((a, b) => a === b),
    };
}
export function value(comparator) {
    return {
        kind: 1 /* TransformKind.Primitive */,
        extract: (from) => {
            let value = from;
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
export function array(schema) {
    return {
        kind: 2 /* TransformKind.Array */,
        itemSchema: schema,
        extract: from => from?.map((item, i) => {
            try {
                return schema.extract(item);
            }
            catch (e) {
                rethrowWithPathSegment(e, i);
            }
        }),
    };
}
/** An object schema. */
export function object(schema, options) {
    // Sort entries with key properties first for fast key checking
    const entries = Object.entries(schema).sort(([, a], [, b]) => a.kind - b.kind);
    return {
        kind: 3 /* TransformKind.Object */,
        children: entries,
        sealed: options?.sealed,
        extract: (from) => {
            if (isUndefinedOrNull(from)) {
                return from;
            }
            const result = Object.create(null);
            for (const [key, transform] of entries) {
                try {
                    result[key] = transform.extract(from);
                }
                catch (e) {
                    rethrowWithPathSegment(e, key);
                }
            }
            return result;
        },
    };
}
/**
 * Defines a getter on the object to extract a value, compared with the given schema.
 * It should return the value that will get serialized in the resulting log file.
 */
export function t(getter, schema) {
    return {
        ...schema,
        extract: (from) => schema.extract(getter(from)),
    };
}
export function v(getter, comparator) {
    const inner = value(comparator);
    return {
        ...inner,
        extract: (from) => inner.extract(getter(from)),
    };
}
var EntryKind;
(function (EntryKind) {
    /** Initial complete object state, valid only as the first entry */
    EntryKind[EntryKind["Initial"] = 0] = "Initial";
    /** Property update */
    EntryKind[EntryKind["Set"] = 1] = "Set";
    /** Array push/splice. */
    EntryKind[EntryKind["Push"] = 2] = "Push";
    /** Delete a property */
    EntryKind[EntryKind["Delete"] = 3] = "Delete";
})(EntryKind || (EntryKind = {}));
const LF = VSBuffer.fromString('\n');
/**
 * An implementation of an append-based mutation logger. Given a `Transform`
 * definition of an object, it can recreate it from a file on disk. It is
 * then stateful, and given a `write` call it can update the log in a minimal
 * way.
 */
export class ObjectMutationLog {
    constructor(_transform, _compactAfterEntries = 512) {
        this._transform = _transform;
        this._compactAfterEntries = _compactAfterEntries;
        this._entryCount = 0;
    }
    /**
     * Creates an initial log file from the given object.
     */
    createInitial(current) {
        return this.createInitialFromSerialized(this._transform.extract(current));
    }
    /**
     * Creates an initial log file from the serialized object.
     */
    createInitialFromSerialized(value) {
        this._previous = value;
        this._entryCount = 1;
        const entry = { kind: 0 /* EntryKind.Initial */, v: value };
        return VSBuffer.fromString(JSON.stringify(entry) + '\n');
    }
    /**
     * Reads and reconstructs the state from a log file.
     */
    read(content) {
        let state;
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
                    const entry = JSON.parse(line.toString());
                    switch (entry.kind) {
                        case 0 /* EntryKind.Initial */:
                            state = entry.v;
                            break;
                        case 1 /* EntryKind.Set */:
                            this._applySet(state, entry.k, entry.v);
                            break;
                        case 2 /* EntryKind.Push */:
                            this._applyPush(state, entry.k, entry.v, entry.i);
                            break;
                        case 3 /* EntryKind.Delete */:
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
        this._previous = state;
        this._entryCount = lineCount;
        return state;
    }
    /**
     * Writes updates to the log. Returns the operation type and data to write.
     */
    write(current) {
        const currentValue = this._transform.extract(current);
        if (!this._previous || this._entryCount > this._compactAfterEntries) {
            // No previous state, create initial
            this._previous = currentValue;
            this._entryCount = 1;
            const entry = { kind: 0 /* EntryKind.Initial */, v: currentValue };
            return { op: 'replace', data: VSBuffer.fromString(JSON.stringify(entry) + '\n') };
        }
        // Generate diff entries
        const entries = [];
        const path = [];
        try {
            this._diff(this._transform, path, this._previous, currentValue, entries);
        }
        catch (e) {
            if (e instanceof Error) {
                const pathStr = path.map(s => typeof s === 'number' ? `[${s}]` : `.${s}`).join('') || '<root>';
                prefixError(e, `error diffing at ${pathStr}: `);
            }
            throw e;
        }
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
    _applySet(state, path, value) {
        if (path.length === 0) {
            return; // Root replacement handled by caller
        }
        let current = state;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;
    }
    _applyPush(state, path, values, startIndex) {
        let current = state;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        const arrayKey = path[path.length - 1];
        const arr = current[arrayKey] || [];
        if (startIndex !== undefined) {
            arr.length = startIndex;
        }
        if (values && values.length > 0) {
            arr.push(...values);
        }
        current[arrayKey] = arr;
    }
    _diff(transform, path, prev, curr, entries) {
        if (transform.kind === 0 /* TransformKind.Key */ || transform.kind === 1 /* TransformKind.Primitive */) {
            // Simple value change - copy path since we're storing it
            if (!transform.equals(prev, curr)) {
                entries.push({ kind: 1 /* EntryKind.Set */, k: path.slice(), v: curr });
            }
        }
        else if (isUndefinedOrNull(prev) || isUndefinedOrNull(curr)) {
            if (prev !== curr) {
                if (curr === undefined) {
                    entries.push({ kind: 3 /* EntryKind.Delete */, k: path.slice() });
                }
                else if (curr === null) {
                    entries.push({ kind: 1 /* EntryKind.Set */, k: path.slice(), v: null });
                }
                else {
                    entries.push({ kind: 1 /* EntryKind.Set */, k: path.slice(), v: curr });
                }
            }
        }
        else if (transform.kind === 2 /* TransformKind.Array */) {
            this._diffArray(transform, path, prev, curr, entries);
        }
        else if (transform.kind === 3 /* TransformKind.Object */) {
            this._diffObject(transform.children, path, prev, curr, entries, transform.sealed);
        }
        else {
            throw new Error(`Unknown transform kind ${JSON.stringify(transform)}`);
        }
    }
    _diffObject(children, path, prev, curr, entries, sealed) {
        const prevObj = prev;
        const currObj = curr;
        // First check key fields (sorted to front) - if any key changed, replace the entire object
        let i = 0;
        for (; i < children.length; i++) {
            const [key, transform] = children[i];
            if (transform.kind !== 0 /* TransformKind.Key */) {
                break; // Keys are sorted to front, so we can stop
            }
            if (!transform.equals(prevObj?.[key], currObj[key])) {
                // Key changed, replace entire object
                entries.push({ kind: 1 /* EntryKind.Set */, k: path.slice(), v: curr });
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
    _diffArray(transform, path, prev, curr, entries) {
        const prevArr = prev || [];
        const currArr = curr || [];
        const itemSchema = transform.itemSchema;
        const minLen = Math.min(prevArr.length, currArr.length);
        // If the item schema is an object, we can recurse into it to diff individual
        // properties instead of replacing the entire item. However, we only do this
        // if the key fields match.
        if (itemSchema.kind === 3 /* TransformKind.Object */) {
            const childEntries = itemSchema.children;
            // Diff common elements by recursing into them
            for (let i = 0; i < minLen; i++) {
                const prevItem = prevArr[i];
                const currItem = currArr[i];
                // Check if key fields match - if not, we need to replace from this point
                if (this._hasKeyMismatch(childEntries, prevItem, currItem)) {
                    // Key mismatch: replace from this point onward
                    const newItems = currArr.slice(i);
                    entries.push({ kind: 2 /* EntryKind.Push */, k: path.slice(), v: newItems.length > 0 ? newItems : undefined, i });
                    return;
                }
                // Keys match, recurse into the object
                path.push(i);
                this._diffObject(childEntries, path, prevItem, currItem, entries, itemSchema.sealed);
                path.pop();
            }
            // Handle length changes
            if (currArr.length > prevArr.length) {
                entries.push({ kind: 2 /* EntryKind.Push */, k: path.slice(), v: currArr.slice(prevArr.length) });
            }
            else if (currArr.length < prevArr.length) {
                entries.push({ kind: 2 /* EntryKind.Push */, k: path.slice(), i: currArr.length });
            }
        }
        else {
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
                    entries.push({ kind: 2 /* EntryKind.Push */, k: path.slice(), v: currArr.slice(prevArr.length) });
                }
                else if (currArr.length < prevArr.length) {
                    // Items removed from end
                    entries.push({ kind: 2 /* EntryKind.Push */, k: path.slice(), i: currArr.length });
                }
                // else: same length, all match - no change
            }
            else {
                // Mismatch found, rewrite from that point
                const newItems = currArr.slice(firstMismatch);
                entries.push({ kind: 2 /* EntryKind.Push */, k: path.slice(), v: newItems.length > 0 ? newItems : undefined, i: firstMismatch });
            }
        }
    }
    _hasKeyMismatch(children, prev, curr) {
        const prevObj = prev;
        const currObj = curr;
        for (const [key, transform] of children) {
            if (transform.kind !== 0 /* TransformKind.Key */) {
                break; // Keys are sorted to front, so we can stop
            }
            if (!transform.equals(prevObj?.[key], currObj[key])) {
                return true;
            }
        }
        return false;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JqZWN0TXV0YXRpb25Mb2cuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9vYmplY3RNdXRhdGlvbkxvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXhFOzs7O0dBSUc7QUFDSCxTQUFTLFdBQVcsQ0FBQyxDQUFRLEVBQUUsTUFBYztJQUM1QyxDQUFDLENBQUMsT0FBTyxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDO0lBQy9CLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ2IsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLEtBQUssR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDO1lBQ3JCLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNsRCxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUM5QixDQUFDO0FBQ0YsQ0FBQztBQUVEOzs7O0dBSUc7QUFDSCxTQUFTLHNCQUFzQixDQUFDLENBQVUsRUFBRSxPQUF3QjtJQUNuRSxJQUFJLENBQUMsWUFBWSxLQUFLLEVBQUUsQ0FBQztRQUN4QixNQUFNLElBQUksR0FBRyxPQUFPLE9B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