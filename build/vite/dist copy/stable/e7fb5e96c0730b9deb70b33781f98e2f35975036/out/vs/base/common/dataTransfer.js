/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { distinct } from './arrays.js';
import { Iterable } from './iterator.js';
import { generateUuid } from './uuid.js';
export function createStringDataTransferItem(stringOrPromise, id) {
    return {
        id,
        asString: async () => stringOrPromise,
        asFile: () => undefined,
        value: typeof stringOrPromise === 'string' ? stringOrPromise : undefined,
    };
}
export function createFileDataTransferItem(fileName, uri, data, id) {
    const file = { id: generateUuid(), name: fileName, uri, data };
    return {
        id,
        asString: async () => '',
        asFile: () => file,
        value: undefined,
    };
}
export class VSDataTransfer {
    constructor() {
        this._entries = new Map();
    }
    get size() {
        let size = 0;
        for (const _ of this._entries) {
            size++;
        }
        return size;
    }
    has(mimeType) {
        return this._entries.has(this.toKey(mimeType));
    }
    matches(pattern) {
        const mimes = [...this._entries.keys()];
        if (Iterable.some(this, ([_, item]) => item.asFile())) {
            mimes.push('files');
        }
        return matchesMimeType_normalized(normalizeMimeType(pattern), mimes);
    }
    get(mimeType) {
        return this._entries.get(this.toKey(mimeType))?.[0];
    }
    /**
     * Add a new entry to this data transfer.
     *
     * This does not replace existing entries for `mimeType`.
     */
    append(mimeType, value) {
        const existing = this._entries.get(mimeType);
        if (existing) {
            existing.push(value);
        }
        else {
            this._entries.set(this.toKey(mimeType), [value]);
        }
    }
    /**
     * Set the entry for a given mime type.
     *
     * This replaces all existing entries for `mimeType`.
     */
    replace(mimeType, value) {
        this._entries.set(this.toKey(mimeType), [value]);
    }
    /**
     * Remove all entries for `mimeType`.
     */
    delete(mimeType) {
        this._entries.delete(this.toKey(mimeType));
    }
    /**
     * Iterate over all `[mime, item]` pairs in this data transfer.
     *
     * There may be multiple entries for each mime type.
     */
    *[Symbol.iterator]() {
        for (const [mine, items] of this._entries) {
            for (const item of items) {
                yield [mine, item];
            }
        }
    }
    toKey(mimeType) {
        return normalizeMimeType(mimeType);
    }
}
function normalizeMimeType(mimeType) {
    return mimeType.toLowerCase();
}
export function matchesMimeType(pattern, mimeTypes) {
    return matchesMimeType_normalized(normalizeMimeType(pattern), mimeTypes.map(normalizeMimeType));
}
function matchesMimeType_normalized(normalizedPattern, normalizedMimeTypes) {
    // Anything wildcard
    if (normalizedPattern === '*/*') {
        return normalizedMimeTypes.length > 0;
    }
    // Exact match
    if (normalizedMimeTypes.includes(normalizedPattern)) {
        return true;
    }
    // Wildcard, such as `image/*`
    const wildcard = normalizedPattern.match(/^([a-z]+)\/([a-z]+|\*)$/i);
    if (!wildcard) {
        return false;
    }
    const [_, type, subtype] = wildcard;
    if (subtype === '*') {
        return normalizedMimeTypes.some(mime => mime.startsWith(type + '/'));
    }
    return false;
}
export const UriList = Object.freeze({
    // http://amundsen.com/hypermedia/urilist/
    create: (entries) => {
        return distinct(entries.map(x => x.toString())).join('\r\n');
    },
    split: (str) => {
        return str.split('\r\n');
    },
    parse: (str) => {
        return UriList.split(str).filter(value => !value.startsWith('#'));
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YVRyYW5zZmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vZGF0YVRyYW5zZmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDdkMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUV6QyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBZ0J6QyxNQUFNLFVBQVUsNEJBQTRCLENBQUMsZUFBeUMsRUFBRSxFQUFXO0lBQ2xHLE9BQU87UUFDTixFQUFFO1FBQ0YsUUFBUSxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsZUFBZTtRQUNyQyxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUztRQUN2QixLQUFLLEVBQUUsT0FBTyxlQUFlLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLFNBQVM7S0FDeEUsQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsUUFBZ0IsRUFBRSxHQUFvQixFQUFFLElBQStCLEVBQUUsRUFBVztJQUM5SCxNQUFNLElBQUksR0FBRyxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUMvRCxPQUFPO1FBQ04sRUFBRTtRQUNGLFFBQVEsRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLEVBQUU7UUFDeEIsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUk7UUFDbEIsS0FBSyxFQUFFLFNBQVM7S0FDaEIsQ0FBQztBQUNILENBQUM7QUFnQ0QsTUFBTSxPQUFPLGNBQWM7SUFBM0I7UUFFa0IsYUFBUSxHQUFHLElBQUksR0FBRyxFQUErQixDQUFD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