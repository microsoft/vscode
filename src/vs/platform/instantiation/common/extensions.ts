/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from './descriptors';
import { ServiceIdentifier, IConstructorSignature0 } from './instantiation';

const _registry: [ServiceIdentifier<any>, SyncDescriptor<any>][] = [];

export function registerSingleton<T>(id: ServiceIdentifier<T>, ctor: IConstructorSignature0<T>, supportsDelayedInstantiation?: boolean): void {
	_registry.push([id, new SyncDescriptor<T>(ctor, [], supportsDelayedInstantiation)]);
}

export function getSingletonServiceDescriptors(): [ServiceIdentifier<any>, SyncDescriptor<any>][] {
	return _registry;
}
