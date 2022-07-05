/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUri } from '../types/uri';


type ResourceToKey = (uri: IUri) => string;

const defaultResourceToKey = (resource: IUri): string => resource.toString();

export class ResourceMap<T> {

	private readonly map = new Map<string, { readonly uri: IUri; readonly value: T }>();

	private readonly toKey: ResourceToKey;

	constructor(toKey: ResourceToKey = defaultResourceToKey) {
		this.toKey = toKey;
	}

	public set(uri: IUri, value: T): this {
		this.map.set(this.toKey(uri), { uri, value });
		return this;
	}

	public get(resource: IUri): T | undefined {
		return this.map.get(this.toKey(resource))?.value;
	}

	public has(resource: IUri): boolean {
		return this.map.has(this.toKey(resource));
	}

	public get size(): number {
		return this.map.size;
	}

	public clear(): void {
		this.map.clear();
	}

	public delete(resource: IUri): boolean {
		return this.map.delete(this.toKey(resource));
	}

	public *values(): IterableIterator<T> {
		for (const entry of this.map.values()) {
			yield entry.value;
		}
	}

	public *keys(): IterableIterator<IUri> {
		for (const entry of this.map.values()) {
			yield entry.uri;
		}
	}

	public *entries(): IterableIterator<[IUri, T]> {
		for (const entry of this.map.values()) {
			yield [entry.uri, entry.value];
		}
	}

	public [Symbol.iterator](): IterableIterator<[IUri, T]> {
		return this.entries();
	}
}
