/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';

export interface IDataTransferFile {
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

	public has(mimeType: string): boolean {
		return this._entries.has(this.toKey(mimeType));
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
