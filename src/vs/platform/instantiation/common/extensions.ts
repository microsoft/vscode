/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { SyncDescriptor } from './descriptors';
import { ServiceIdentifier, IConstructorSignature0 } from './instantiation';

export const Services = 'di.services';

export interface IServiceContribution<T> {
	id: ServiceIdentifier<T>;
	descriptor: SyncDescriptor<T>;
}

const _registry: IServiceContribution<any>[] = [];

export function registerSingleton<T>(id: ServiceIdentifier<T>, ctor: IConstructorSignature0<T>): void {
	_registry.push({ id, descriptor: new SyncDescriptor<T>(ctor) });
}

export function getServices(): IServiceContribution<any>[] {
	return _registry;
}