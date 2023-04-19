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

	public get size(): number {
		return this._entries.size;
	}

	/**
	 * Check if this data transfer contains data for a given mime type.
	 *
	 * This uses exact matching and does not support wildcards.
	 */
	public has(mimeType: string): boolean {
		return this._entries.has(this.toKey(mimeType));
	}

	/**
	 * Check if this data transfer contains data matching a given mime type glob.
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

	public get(mimeType: string): IDataTransferItem | undefined {
		return this._entries.get(this.toKey(mimeType))?.[0];
	}

	public append(mimeType: string, value: IDataTransferItem): void {
		const existing = this._entries.get(mimeType);
		if (existing) {
			existing.push(value);
		} else {
			this._entries.set(this.toKey(mimeType), [value]);
		}
	}

	public replace(mimeType: string, value: IDataTransferItem): void {
		this._entries.set(this.toKey(mimeType), [value]);
	}

	public delete(mimeType: string) {
		this._entries.delete(this.toKey(mimeType));
	}

	public *entries(): Iterable<[string, IDataTransferItem]> {
		for (const [mine, items] of this._entries.entries()) {
			for (const item of items) {
				yield [mine, item];
			}
		}
	}

	public values(): Iterable<IDataTransferItem> {
		return Array.from(this._entries.values()).flat();
	}

	public forEach(f: (value: IDataTransferItem, key: string) => void) {
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
