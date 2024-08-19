/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { Iterable } from 'vs/base/common/iterator';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';

export interface IDataTransferFile {
	readonly id: string;
	readonly name: string;
	readonly uri?: URI;
	data(): Promise<Uint8Array>;
}

export interface IDataTransferItem {
	asString(): Thenable<string>;
	asFile(): IDataTransferFile | undefined;
	value: any;
}

export function createStringDataTransferItem(stringOrPromise: string | Promise<string>): IDataTransferItem {
	return {
		asString: async () => stringOrPromise,
		asFile: () => undefined,
		value: typeof stringOrPromise === 'string' ? stringOrPromise : undefined,
	};
}

export function createFileDataTransferItem(fileName: string, uri: URI | undefined, data: () => Promise<Uint8Array>): IDataTransferItem {
	const file = { id: generateUuid(), name: fileName, uri, data };
	return {
		asString: async () => '',
		asFile: () => file,
		value: undefined,
	};
}

export interface IReadonlyVSDataTransfer extends Iterable<readonly [string, IDataTransferItem]> {
	/**
	 * Get the total number of entries in this data transfer.
	 */
	get size(): number;

	/**
	 * Check if this data transfer contains data for `mimeType`.
	 *
	 * This uses exact matching and does not support wildcards.
	 */
	has(mimeType: string): boolean;

	/**
	 * Check if this data transfer contains data matching `pattern`.
	 *
	 * This allows matching for wildcards, such as `image/*`.
	 *
	 * Use the special `files` mime type to match any file in the data transfer.
	 */
	matches(pattern: string): boolean;

	/**
	 * Retrieve the first entry for `mimeType`.
	 *
	 * Note that if you want to find all entries for a given mime type, use {@link IReadonlyVSDataTransfer.entries} instead.
	 */
	get(mimeType: string): IDataTransferItem | undefined;
}

export class VSDataTransfer implements IReadonlyVSDataTransfer {

	private readonly _entries = new Map<string, IDataTransferItem[]>();

	public get size(): number {
		let size = 0;
		for (const _ of this._entries) {
			size++;
		}
		return size;
	}

	public has(mimeType: string): boolean {
		return this._entries.has(this.toKey(mimeType));
	}

	public matches(pattern: string): boolean {
		const mimes = [...this._entries.keys()];
		if (Iterable.some(this, ([_, item]) => item.asFile())) {
			mimes.push('files');
		}

		return matchesMimeType_normalized(normalizeMimeType(pattern), mimes);
	}

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
	public *[Symbol.iterator](): IterableIterator<readonly [string, IDataTransferItem]> {
		for (const [mine, items] of this._entries) {
			for (const item of items) {
				yield [mine, item];
			}
		}
	}

	private toKey(mimeType: string): string {
		return normalizeMimeType(mimeType);
	}
}

function normalizeMimeType(mimeType: string): string {
	return mimeType.toLowerCase();
}

export function matchesMimeType(pattern: string, mimeTypes: readonly string[]): boolean {
	return matchesMimeType_normalized(
		normalizeMimeType(pattern),
		mimeTypes.map(normalizeMimeType));
}

function matchesMimeType_normalized(normalizedPattern: string, normalizedMimeTypes: readonly string[]): boolean {
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
