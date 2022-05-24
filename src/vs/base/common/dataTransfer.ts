/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';

export interface IDataTransferFile {
	readonly name: string;
	readonly uri?: URI;
	data(): Promise<Uint8Array>;
}

export interface IDataTransferItem {
	asString(): Thenable<string>;
	asFile(): IDataTransferFile | undefined;
	value: any;
}

export class VSDataTransfer {

	private readonly _data = new Map<string, IDataTransferItem>();

	public get size(): number {
		return this._data.size;
	}

	public has(mimeType: string): boolean {
		return this._data.has(mimeType);
	}

	public get(mimeType: string): IDataTransferItem | undefined {
		return this._data.get(mimeType);
	}

	public set(mimeType: string, value: IDataTransferItem): void {
		this._data.set(mimeType, value);
	}

	public setString(mimeType: string, stringOrPromise: string | Promise<string>) {
		this.set(mimeType, {
			asString: async () => stringOrPromise,
			asFile: () => undefined,
			value: typeof stringOrPromise === 'string' ? stringOrPromise : undefined,
		});
	}

	public setFile(mimeType: string, fileName: string, uri: URI | undefined, data: () => Promise<Uint8Array>) {
		this.set(mimeType, {
			asString: async () => '',
			asFile: () => ({ name: fileName, uri, data }),
			value: undefined,
		});
	}

	public entries(): IterableIterator<[string, IDataTransferItem]> {
		return this._data.entries();
	}

	public values(): IterableIterator<IDataTransferItem> {
		return this._data.values();
	}

	public forEach(f: (value: IDataTransferItem, key: string) => void) {
		this._data.forEach(f);
	}
}
