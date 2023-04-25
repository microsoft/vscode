/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { Iterable } from 'vs/base/common/iterator';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';

interface IDataTransferFile {
	readonly name: string;
	readonly uri?: URI;
	data(): Promise<Uint8Array>;
}

export interface IDataTransferItem {
	readonly id: string;
	asString(): Thenable<string>;
	asFile(): IDataTransferFile | undefined;
	value: any;
}

export function createStringDataTransferItem(stringOrPromise: string | Promise<string>): IDataTransferItem {
	return {
		id: generateUuid(),
		asString: async () => stringOrPromise,
		asFile: () => undefined,
		value: typeof stringOrPromise === 'string' ? stringOrPromise : undefined,
	};
}

export function createFileDataTransferItem(fileName: string, uri: URI | undefined, data: () => Promise<Uint8Array>): IDataTransferItem {
	return {
		id: generateUuid(),
		asString: async () => '',
		asFile: () => ({ name: fileName, uri, data }),
		value: undefined,
	};
}

export class VSDataTransfer {

	private readonly _entries = new Map<string, IDataTransferItem[]>();

	/**
	 * Get the total number of entries in this data transfer.
	 */
	public get size(): number {
		let size = 0;
		this.forEach(() => size++);
		return size;
	}

	/**
	 * Check if this data transfer contains data for `mimeType`.
	 *
	 * This uses exact matching and does not support wildcards.
	 */
	public has(mimeType: string): boolean {
		return this._entries.has(this.toKey(mimeType));
	}

	/**
	 * Check if this data transfer contains data matching `mimeTypeGlob`.
	 *
	 * This allows matching for wildcards, such as `image/*`.
	 *
	 * Use the special `files` mime type to match any file in the data transfer.
	 */
	public matches(mimeTypeGlob: string): boolean {
		// Exact match
		if (this.has(mimeTypeGlob)) {
			return true;
		}

		// Special `files` mime type matches any file
		if (mimeTypeGlob.toLowerCase() === 'files') {
			return Iterable.some(this.values(), item => item.asFile());
		}

		// Anything glob
		if (mimeTypeGlob === '*/*') {
			return this._entries.size > 0;
		}

		// Wildcard, such as `image/*`
		const wildcard = this.toKey(mimeTypeGlob).match(/^([a-z]+)$\/([a-z]+|\*)/i);
		if (!wildcard) {
			return false;
		}

		const [_, type, subtype] = wildcard;
		if (subtype === '*') {
			return Iterable.some(this._entries.keys(), key => key.startsWith(type + '/'));
		}

		return false;
	}

	/**
	 * Retrieve the first entry for `mimeType`.
	 *
	 * Note that if want to find all entries for a given mime type, use {@link VSDataTransfer.entries} instead.
	 */
	public get(mimeType: string): IDataTransferItem | undefined {
		return this._entries.get(this.toKey(mimeType))?.[0];
	}

	/**
	 * Add a new entry to this data transfer.
	 *
	 * This does not replace existing entries for `mimeType`.
	 */
	public append(mimeType: string, value: IDataTransferItem): void {
		const existing = this._entries.get(mimeType);
		if (existing) {
			existing.push(value);
		} else {
			this._entries.set(this.toKey(mimeType), [value]);
		}
	}

	/**
	 * Set the entry for a given mime type.
	 *
	 * This replaces all existing entries for `mimeType`.
	 */
	public replace(mimeType: string, value: IDataTransferItem): void {
		this._entries.set(this.toKey(mimeType), [value]);
	}

	/**
	 * Remove all entries for `mimeType`.
	 */
	public delete(mimeType: string) {
		this._entries.delete(this.toKey(mimeType));
	}

	/**
	 * Iterate over all `[mime, item]` pairs in this data transfer.
	 *
	 * There may be multiple entries for each mime type.
	 */
	public *entries(): Iterable<[string, IDataTransferItem]> {
		for (const [mine, items] of this._entries.entries()) {
			for (const item of items) {
				yield [mine, item];
			}
		}
	}

	/**
	 * Iterate over all items in this data transfer.
	 *
	 * There may be multiple entries for each mime type.
	 */
	public values(): Iterable<IDataTransferItem> {
		return Array.from(this._entries.values()).flat();
	}

	/**
	 * Call `f` for each item and mime in the data transfer.
	 *
	 * There may be multiple entries for each mime type.
	 */
	public forEach(f: (value: IDataTransferItem, mime: string) => void) {
		for (const [mime, item] of this.entries()) {
			f(item, mime);
		}
	}

	private toKey(mimeType: string): string {
		return mimeType.toLowerCase();
	}
}


export const UriList = Object.freeze({
	// http://amundsen.com/hypermedia/urilist/
	create: (entries: ReadonlyArray<string | URI>): string => {
		return distinct(entries.map(x => x.toString())).join('\r\n');
	},
	split: (str: string): string[] => {
		return str.split('\r\n');
	},
	parse: (str: string): string[] => {
		return UriList.split(str).filter(value => !value.startsWith('#'));
	}
});
