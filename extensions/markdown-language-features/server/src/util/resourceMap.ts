/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vscode-uri';


type ResourceToKey = (uri: URI) => string;

const defaultResourceToKey = (resource: URI): string => resource.toString();

export class ResourceMap<T> {

	private readonly map = new Map<string, { readonly uri: URI; readonly value: T }>();

	private readonly toKey: ResourceToKey;

	constructor(toKey: ResourceToKey = defaultResourceToKey) {
		this.toKey = toKey;
	}

	public set(uri: URI, value: T): this {
		this.map.set(this.toKey(uri), { uri, value });
		return this;
	}

	public get(resource: URI): T | undefined {
		return this.map.get(this.toKey(resource))?.value;
	}

	public has(resource: URI): boolean {
		return this.map.has(this.toKey(resource));
	}

	public get size(): number {
		return this.map.size;
	}

	public clear(): void {
		this.map.clear();
	}

	public delete(resource: URI): boolean {
		return this.map.delete(this.toKey(resource));
	}

	public *values(): IterableIterator<T> {
		for (const entry of this.map.values()) {
			yield entry.value;
		}
	}

	public *keys(): IterableIterator<URI> {
		for (const entry of this.map.values()) {
			yield entry.uri;
		}
	}

	public *entries(): IterableIterator<[URI, T]> {
		for (const entry of this.map.values()) {
			yield [entry.uri, entry.value];
		}
	}

	public [Symbol.iterator](): IterableIterator<[URI, T]> {
		return this.entries();
	}
}
