/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import * as descriptors from './descriptors.js';
import { ServiceCollection } from './serviceCollection.js';

// ------ internal util

export namespace _util {

	export const serviceIds = new Map<string, ServiceIdentifier<any>>();

	export const DI_TARGET = '$di$target';
	export const DI_DEPENDENCIES = '$di$dependencies';

	export function getServiceDependencies(ctor: DI_TARGET_OBJ): { id: ServiceIdentifier<any>; index: number }[] {
		return ctor[DI_DEPENDENCIES] || [];
	}

	export interface DI_TARGET_OBJ extends Function {
		[DI_TARGET]: Function;
		[DI_DEPENDENCIES]: { id: ServiceIdentifier<any>; index: number }[];
	}
}

// --- interfaces ------

export type BrandedService = { _serviceBrand: undefined };

export interface IConstructorSignature<T, Args extends any[] = []> {
	new <Services extends BrandedService[]>(...args: [...Args, ...Services]): T;
}

export interface ServicesAccessor {
	get<T>(id: ServiceIdentifier<T>): T;
}

export const IInstantiationService = createDecorator<IInstantiationService>('instantiationService');

/**
 * Given a list of arguments as a tuple, attempt to extract the leading, non-service arguments
 * to their own tuple.
 */
export type GetLeadingNonServiceArgs<TArgs extends any[]> =
	TArgs extends [] ? []
	: TArgs extends [...infer TFirst, BrandedService] ? GetLeadingNonServiceArgs<TFirst>
	: TArgs;

export interface IInstantiationService {

	readonly _serviceBrand: undefined;

	/**
	 * Synchronously creates an instance that is denoted by the descriptor
	 */
	createInstance<T>(descriptor: descriptors.SyncDescriptor0<T>): T;
	createInstance<Ctor extends new (...args: any[]) => unknown, R extends InstanceType<Ctor>>(ctor: Ctor, ...args: GetLeadingNonServiceArgs<ConstructorParameters<Ctor>>): R;

	/**
	 * Calls a function with a service accessor.
	 */
	invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R;

	/**
	 * Creates a child of this service which inherits all current services
	 * and adds/overwrites the given services.
	 *
	 * NOTE that the returned child is `disposable` and should be disposed when not used
	 * anymore. This will also dispose all the services that this service has created.
	 */
	createChild(services: ServiceCollection, store?: DisposableStore): IInstantiationService;

	/**
	 * Disposes this instantiation service.
	 *
	 * - Will dispose all services that this instantiation service has created.
	 * - Will dispose all its children but not its parent.
	 * - Will NOT dispose services-instances that this service has been created with
	 * - Will NOT dispose consumer-instances this service has created
	 */
	dispose(): void;
}


/**
 * Identifies a service of type `T`.
 */
export interface ServiceIdentifier<T> {
	(...args: any[]): void;
	type: T;
}


function storeServiceDependency(id: ServiceIdentifier<unknown>, target: Function, index: number): void {
	if ((target as _util.DI_TARGET_OBJ)[_util.DI_TARGET] === target) {
		(target as _util.DI_TARGET_OBJ)[_util.DI_DEPENDENCIES].push({ id, index });
	} else {
		(target as _util.DI_TARGET_OBJ)[_util.DI_DEPENDENCIES] = [{ id, index }];
		(target as _util.DI_TARGET_OBJ)[_util.DI_TARGET] = target;
	}
}

/**
 * The *only* valid way to create a {{ServiceIdentifier}}.
 */
export function createDecorator<T>(serviceId: string): ServiceIdentifier<T> {

	if (_util.serviceIds.has(serviceId)) {
		return _util.serviceIds.get(serviceId)!;
	}

	const id = function (target: Function, key: string, index: number) {
		if (arguments.length !== 3) {
			throw new Error('@IServiceName-decorator can only be used to decorate a parameter');
		}
		storeServiceDependency(id, target, index);
	} as ServiceIdentifier<T>;

	id.toString = () => serviceId;

	_util.serviceIds.set(serviceId, id);
	return id;
}

export function refineServiceDecorator<T1, T extends T1>(serviceIdentifier: ServiceIdentifier<T1>): ServiceIdentifier<T> {
	return <ServiceIdentifier<T>>serviceIdentifier;
}
