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
	public readonly isFancy: boolean;

	constructor(isMain: boolean, id: string, isFancy: boolean) {
		this.isMain = isMain;
		this.id = id;
		this.isFancy = isFancy;
	}
}

export const enum ProxyType {
	NativeJSON = 0,
	CustomMarshaller = 1
}

/**
 * Using `isFancy` indicates that arguments or results of type `URI` or `RegExp`
 * will be serialized/deserialized automatically, but this has a performance cost,
 * as each argument/result must be visited.
 */
export function createMainContextProxyIdentifier<T>(identifier: string, type: ProxyType = ProxyType.NativeJSON): ProxyIdentifier<T> {
	return new ProxyIdentifier(true, 'm' + identifier, type === ProxyType.CustomMarshaller);
}

export function createExtHostContextProxyIdentifier<T>(identifier: string, type: ProxyType = ProxyType.NativeJSON): ProxyIdentifier<T> {
	return new ProxyIdentifier(false, 'e' + identifier, type === ProxyType.CustomMarshaller);
}
