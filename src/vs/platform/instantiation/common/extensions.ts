/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from './descriptors';
import { BrandedService, ServiceIdentifier } from './instantiation';

const _registry: [ServiceIdentifier<any>, SyncDescriptor<any>][] = [];

export const enum InstantiationType {
	/**
	 * Instantiate this service as soon as a consumer depends on it. _Note_ that this
	 * is more costly as some upfront work is done that is likely not needed
	 */
	Eager = 0,

	/**
	 * Instantiate this service as soon as a consumer uses it. This is the _better_
	 * way of registering a service.
	 */
	Delayed = 1
}

export function registerSingleton<T, Services extends BrandedService[]>(id: ServiceIdentifier<T>, ctor: new (...services: Services) => T, supportsDelayedInstantiation: InstantiationType): void;
export function registerSingleton<T, Services extends BrandedService[]>(id: ServiceIdentifier<T>, descriptor: SyncDescriptor<any>): void;
export function registerSingleton<T, Services extends BrandedService[]>(id: ServiceIdentifier<T>, ctorOrDescriptor: { new(...services: Services): T } | SyncDescriptor<any>, supportsDelayedInstantiation?: boolean | InstantiationType): void {
	if (!(ctorOrDescriptor instanceof SyncDescriptor)) {
		ctorOrDescriptor = new SyncDescriptor<T>(ctorOrDescriptor as new (...args: any[]) => T, [], Boolean(supportsDelayedInstantiation));
	}

	_registry.push([id, ctorOrDescriptor]);
}

export function getSingletonServiceDescriptors(): [ServiceIdentifier<any>, SyncDescriptor<any>][] {
	return _registry;
}
