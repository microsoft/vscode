/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface IRPCProtocol {
	/**
	 * Returns a proxy to an object addressable/named in the extension host process or in the renderer process.
	 */
	getProxy<T>(identifier: ProxyIdentifier<T>): T;

	/**
	 * Register manually created instance.
	 */
	set<T, R extends T>(identifier: ProxyIdentifier<T>, instance: R): R;

	/**
	 * Assert these identifiers are already registered via `.set`.
	 */
	assertRegistered(identifiers: ProxyIdentifier<any>[]): void;
}

export class ProxyIdentifier<T> {
	_proxyIdentifierBrand: void;
	_suppressCompilerUnusedWarning: T;

	public readonly isMain: boolean;
	public readonly id: string;

	constructor(isMain: boolean, id: string) {
		this.isMain = isMain;
		this.id = id;
	}
}

/**
 * Using `isFancy` indicates that arguments or results of type `URI` or `RegExp`
 * will be serialized/deserialized automatically, but this has a performance cost,
 * as each argument/result must be visited.
 */
export function createMainContextProxyIdentifier<T>(identifier: string): ProxyIdentifier<T> {
	return new ProxyIdentifier(true, 'm' + identifier);
}

export function createExtHostContextProxyIdentifier<T>(identifier: string): ProxyIdentifier<T> {
	return new ProxyIdentifier(false, 'e' + identifier);
}
