/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { ProxyIdentifier } from 'vs/workbench/services/thread/common/threadService';
import { IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostContext } from 'vs/workbench/api/node/extHost.protocol';

export type IExtHostNamedCustomer<T extends IDisposable> = [ProxyIdentifier<T>, IExtHostCustomerCtor<T>];

export type IExtHostCustomerCtor<T extends IDisposable> = IConstructorSignature1<IExtHostContext, T>;

export function extHostNamedCustomer<T extends IDisposable>(id: ProxyIdentifier<T>) {
	return function (ctor: IExtHostCustomerCtor<T>): void {
		ExtHostCustomersRegistryImpl.INSTANCE.registerNamedCustomer(id, ctor);
	};
}

export function extHostCustomer<T extends IDisposable>(ctor: IExtHostCustomerCtor<T>): void {
	ExtHostCustomersRegistryImpl.INSTANCE.registerCustomer(ctor);
}

export namespace ExtHostCustomersRegistry {

	export function getNamedCustomers(): IExtHostNamedCustomer<IDisposable>[] {
		return ExtHostCustomersRegistryImpl.INSTANCE.getNamedCustomers();
	}

	export function getCustomers(): IExtHostCustomerCtor<IDisposable>[] {
		return ExtHostCustomersRegistryImpl.INSTANCE.getCustomers();
	}
}

class ExtHostCustomersRegistryImpl {

	public static INSTANCE = new ExtHostCustomersRegistryImpl();

	private _namedCustomers: IExtHostNamedCustomer<any>[];
	private _customers: IExtHostCustomerCtor<any>[];

	constructor() {
		this._namedCustomers = [];
		this._customers = [];
	}

	public registerNamedCustomer<T extends IDisposable>(id: ProxyIdentifier<T>, ctor: IExtHostCustomerCtor<T>): void {
		const entry: IExtHostNamedCustomer<T> = [id, ctor];
		this._namedCustomers.push(entry);
	}
	public getNamedCustomers(): IExtHostNamedCustomer<any>[] {
		return this._namedCustomers;
	}

	public registerCustomer<T extends IDisposable>(ctor: IExtHostCustomerCtor<T>): void {
		this._customers.push(ctor);
	}
	public getCustomers(): IExtHostCustomerCtor<any>[] {
		return this._customers;
	}
}
