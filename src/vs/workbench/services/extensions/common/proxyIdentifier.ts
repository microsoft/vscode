/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';

export type RpcProxy<T> = {
	[K in keyof T]: K extends `$${infer _}` ? RpcProxyFunc<T[K]> : never;
};

type RpcProxyFunc<T> = T extends (...args: infer P) => infer R
	? (...args: { [K in keyof P]: SerializableArgument<P[K]> }) => SerializableReturnValue<R>
	: never;

type SerializableArgument<T> = T extends VSBuffer ? T : SerializableValue<T>;

type SerializableValue<T> =
	T extends string | number | boolean | null | undefined | void ? T
	: T extends VSBuffer ? never
	: T extends Function ? never
	: T extends [infer P1, infer P2] ? [SerializableValue<P1>, SerializableValue<P2>]
	: T extends Array<infer P> ? Array<SerializableValue<P>>
	: T extends Object ? { [K in keyof T]: SerializableValue<T[K]> }
	: never;

type SerializableReturnValue<T> =
	T extends VSBuffer ? T
	: T extends Promise<infer P> ? Promise<SerializableReturnValue<P>>
	: SerializableValue<T>;

export interface IRPCProtocol {
	/**
	 * Returns a proxy to an object addressable/named in the extension host process or in the renderer process.
	 */
	getProxy<T>(identifier: ProxyIdentifier<T>): RpcProxy<T>;

	/**
	 * Register manually created instance.
	 */
	set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R;

	/**
	 * Assert these identifiers are already registered via `.set`.
	 */
	assertRegistered(identifiers: ProxyIdentifier<any>[]): void;

	/**
	 * Wait for the write buffer (if applicable) to become empty.
	 */
	drain(): Promise<void>;
}

export class ProxyIdentifier<T> {
	public static count = 0;
	_proxyIdentifierBrand: void = undefined;

	public readonly isMain: boolean;
	public readonly sid: string;
	public readonly nid: number;

	constructor(isMain: boolean, sid: string) {
		this.isMain = isMain;
		this.sid = sid;
		this.nid = (++ProxyIdentifier.count);
	}
}

const identifiers: ProxyIdentifier<any>[] = [];

export function createMainContextProxyIdentifier<T>(identifier: string): ProxyIdentifier<T> {
	const result = new ProxyIdentifier<T>(true, identifier);
	identifiers[result.nid] = result;
	return result;
}

export function createExtHostContextProxyIdentifier<T>(identifier: string): ProxyIdentifier<T> {
	const result = new ProxyIdentifier<T>(false, identifier);
	identifiers[result.nid] = result;
	return result;
}

export function getStringIdentifierForProxy(nid: number): string {
	return identifiers[nid].sid;
}
