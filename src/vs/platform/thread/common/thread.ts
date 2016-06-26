/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator, ServiceIdentifier, IConstructorSignature0} from 'vs/platform/instantiation/common/instantiation';

export const IThreadService = createDecorator<IThreadService>('threadService');

export interface IThreadService {
	serviceId: ServiceIdentifier<any>;
	getRemotable<T>(ctor: IConstructorSignature0<T>): T;
	registerRemotableInstance(ctor: any, instance: any): void;

	get<T>(identifier:ProxyIdentifier<T>): T;
	set<T>(identifier:ProxyIdentifier<T>, value:T): T;
}

export class ProxyIdentifier<T> {
	_proxyIdentifierBrand: void;

	isMain: boolean;
	id: string;

	constructor(isMain: boolean, id: string) {
		this.isMain = isMain;
		this.id = id;
	}
}

export function createMainContextProxyIdentifier<T>(identifier: number): ProxyIdentifier<T> {
	return new ProxyIdentifier(true, 'm' + identifier);
}
export function createExtHostContextProxyIdentifier<T>(identifier: number): ProxyIdentifier<T> {
	return new ProxyIdentifier(false, 'e' + identifier);
}

export class IRemotableCtorMap {
	[identifier: string]: Function;
}

export class Remotable {

	private static PROP_NAME = '$__REMOTABLE_ID';

	public static Registry = {
		MainContext: <IRemotableCtorMap>Object.create(null),
		ExtHostContext: <IRemotableCtorMap>Object.create(null)
	};

	public static getId(ctor: any): string {
		return (ctor[Remotable.PROP_NAME] || null);
	}

	// public static MainContext(identifier: string) {
	// 	return function(target: Function) {
	// 		Remotable._ensureUnique(identifier);
	// 		Remotable.Registry.MainContext[identifier] = target;
	// 		target[Remotable.PROP_NAME] = identifier;
	// 	};
	// }

	// public static ExtHostContext(identifier: string) {
	// 	return function(target: Function) {
	// 		Remotable._ensureUnique(identifier);
	// 		Remotable.Registry.ExtHostContext[identifier] = target;
	// 		target[Remotable.PROP_NAME] = identifier;
	// 	};
	// }

	// private static _ensureUnique(identifier: string): void {
	// 	if (Remotable.Registry.MainContext[identifier] || Remotable.Registry.ExtHostContext[identifier]) {
	// 		throw new Error('Duplicate Remotable identifier found');
	// 	}
	// }
}
