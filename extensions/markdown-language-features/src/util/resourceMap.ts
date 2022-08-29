/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

type ResourceToKey = (uri: vscode.Uri) => string;

const defaultResourceToKey = (resource: vscode.Uri): string => resource.toString();

export class ResourceMap<T> {

	private readonly map = new Map<string, { readonly uri: vscode.Uri; readonly value: T }>();

	private readonly toKey: ResourceToKey;

	constructor(toKey: ResourceToKey = defaultResourceToKey) {
		this.toKey = toKey;
	}

	public set(uri: vscode.Uri, value: T): this {
		this.map.set(this.toKey(uri), { uri, value });
		return this;
	}

	public get(resource: vscode.Uri): T | undefined {
		return this.map.get(this.toKey(resource))?.value;
	}

	public has(resource: vscode.Uri): boolean {
		return this.map.has(this.toKey(resource));
	}

	public get size(): number {
		return this.map.size;
	}

	public clear(): void {
		this.map.clear();
	}

	public delete(resource: vscode.Uri): boolean {
		return this.map.delete(this.toKey(resource));
	}

	public *values(): IterableIterator<T> {
		for (const entry of this.map.values()) {
			yield entry.value;
		}
	}

	public *keys(): IterableIterator<vscode.Uri> {
		for (const entry of this.map.values()) {
			yield entry.uri;
		}
	}

	public *entries(): IterableIterator<[vscode.Uri, T]> {
		for (const entry of this.map.values()) {
			yield [entry.uri, entry.value];
		}
	}

	public [Symbol.iterator](): IterableIterator<[vscode.Uri, T]> {
		return this.entries();
	}
}
