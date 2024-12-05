/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

type ResourceToKey = (uri: vscode.Uri) => string;

const defaultResourceToKey = (resource: vscode.Uri): string => resource.toString();

export class ResourceMap<T> {

	private readonly _map = new Map<string, { readonly uri: vscode.Uri; readonly value: T }>();

	private readonly _toKey: ResourceToKey;

	constructor(toKey: ResourceToKey = defaultResourceToKey) {
		this._toKey = toKey;
	}

	public set(uri: vscode.Uri, value: T): this {
		this._map.set(this._toKey(uri), { uri, value });
		return this;
	}

	public get(resource: vscode.Uri): T | undefined {
		return this._map.get(this._toKey(resource))?.value;
	}

	public has(resource: vscode.Uri): boolean {
		return this._map.has(this._toKey(resource));
	}

	public get size(): number {
		return this._map.size;
	}

	public clear(): void {
		this._map.clear();
	}

	public delete(resource: vscode.Uri): boolean {
		return this._map.delete(this._toKey(resource));
	}

	public *values(): IterableIterator<T> {
		for (const entry of this._map.values()) {
			yield entry.value;
		}
	}

	public *keys(): IterableIterator<vscode.Uri> {
		for (const entry of this._map.values()) {
			yield entry.uri;
		}
	}

	public *entries(): IterableIterator<[vscode.Uri, T]> {
		for (const entry of this._map.values()) {
			yield [entry.uri, entry.value];
		}
	}

	public [Symbol.iterator](): IterableIterator<[vscode.Uri, T]> {
		return this.entries();
	}
}
