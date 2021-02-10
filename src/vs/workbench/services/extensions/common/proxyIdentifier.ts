/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

	/**
	 * Wait for the write buffer (if applicable) to become empty.
	 */
	drain(): Promise<void>;
}

export class ProxyIdentifier<T> {
	public static count = 0;
	_proxyIdentifierBrand: void;

	public readonly isMain: boolean;
	public readonly sid: string;
	public readonly nid: number;
	private _allowMethods: Set<string>;
	private _allowAllMethods: boolean;

	constructor(isMain: boolean, sid: string) {
		this.isMain = isMain;
		this.sid = sid;
		this.nid = (++ProxyIdentifier.count);
		this._allowMethods = new Set<string>();
		this._allowAllMethods = false;
	}

	public allow(methods: string[]): void {
		for (const method of methods) {
			this._allowMethods.add(method);
		}
	}

	public allowAll(): void {
		this._allowAllMethods = true;
	}

	public isAllowed(method: string): boolean {
		if (this._allowAllMethods) {
			return true;
		}
		return this._allowMethods.has(method);
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

export function getIdentifierForProxy(nid: number): ProxyIdentifier<any> {
	return identifiers[nid];
}
