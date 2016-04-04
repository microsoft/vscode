/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import * as descriptors from './descriptors';

// ----------------------- internal util -----------------------

export namespace _util {

	export const DI_TARGET = '$di$target';
	export const DI_DEPENDENCIES = '$di$dependencies';
	export const DI_PROVIDES = '$di$provides_service';

	export function getServiceId(id: ServiceIdentifier<any>): string {
		return id[DI_PROVIDES];
	}

	export function getServiceDependencies(ctor: any): { serviceId: string, index: number }[] {
		return ctor[DI_DEPENDENCIES];
	}
}

// ----------------------- interfaces -----------------------


export interface IConstructorSignature0<T> {
	new (...services: { serviceId: ServiceIdentifier<any>; }[]): T;
}

export interface IConstructorSignature1<A1, T> {
	new (first: A1, ...services: { serviceId: ServiceIdentifier<any>; }[]): T;
}

export interface IConstructorSignature2<A1, A2, T> {
	new (first: A1, second: A2, ...services: { serviceId: ServiceIdentifier<any>; }[]): T;
}

export interface IConstructorSignature3<A1, A2, A3, T> {
	new (first: A1, second: A2, third: A3, ...services: { serviceId: ServiceIdentifier<any>; }[]): T;
}

export interface IConstructorSignature4<A1, A2, A3, A4, T> {
	new (first: A1, second: A2, third: A3, forth: A4, ...services: { serviceId: ServiceIdentifier<any>; }[]): T;
}

export interface IConstructorSignature5<A1, A2, A3, A4, A5, T> {
	new (first: A1, second: A2, third: A3, forth: A4, fifth: A5, ...services: { serviceId: ServiceIdentifier<any>; }[]): T;
}

export interface IConstructorSignature6<A1, A2, A3, A4, A5, A6, T> {
	new (first: A1, second: A2, third: A3, forth: A4, fifth: A5, sixth: A6, ...services: { serviceId: ServiceIdentifier<any>; }[]): T;
}

export interface IConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T> {
	new (first: A1, second: A2, third: A3, forth: A4, fifth: A5, sixth: A6, seventh: A7, ...services: { serviceId: ServiceIdentifier<any>; }[]): T;
}

export interface IConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T> {
	new (first: A1, second: A2, third: A3, forth: A4, fifth: A5, sixth: A6, seventh: A7, eigth: A8, ...services: { serviceId: ServiceIdentifier<any>; }[]): T;
}

export interface ServicesAccessor {
	get<T>(id: ServiceIdentifier<T>): T;
}

export interface IFunctionSignature0<R> {
	(accessor: ServicesAccessor): R;
}

export interface IFunctionSignature1<A1, R> {
	(accessor: ServicesAccessor, first: A1): R;
}

export interface IFunctionSignature2<A1, A2, R> {
	(accessor: ServicesAccessor, first: A1, second: A2): R;
}

export interface IFunctionSignature3<A1, A2, A3, R> {
	(accessor: ServicesAccessor, first: A1, second: A2, third: A3): R;
}

export interface IFunctionSignature4<A1, A2, A3, A4, R> {
	(accessor: ServicesAccessor, first: A1, second: A2, third: A3, forth: A4): R;
}

export interface IFunctionSignature5<A1, A2, A3, A4, A5, R> {
	(accessor: ServicesAccessor, first: A1, second: A2, third: A3, forth: A4, fifth: A5): R;
}

export interface IFunctionSignature6<A1, A2, A3, A4, A5, A6, R> {
	(accessor: ServicesAccessor, first: A1, second: A2, third: A3, forth: A4, fifth: A5, sixth: A6): R;
}

export interface IFunctionSignature7<A1, A2, A3, A4, A5, A6, A7, R> {
	(accessor: ServicesAccessor, first: A1, second: A2, third: A3, forth: A4, fifth: A5, sixth: A6, seventh: A7): R;
}

export interface IFunctionSignature8<A1, A2, A3, A4, A5, A6, A7, A8, R> {
	(accessor: ServicesAccessor, first: A1, second: A2, third: A3, forth: A4, fifth: A5, sixth: A6, seventh: A7, eigth: A8): R;
}


export var IInstantiationService = createDecorator<IInstantiationService>('instantiationService');

export interface IInstantiationService {
	serviceId: ServiceIdentifier<any>;

	/**
	 * Returns an instance of the service identified by
	 * {{id}}. If the service is not known {{undefined}}
	 * is returned. If the service has not been created
	 * yet it will be created.
	 */
	getInstance<T>(id: ServiceIdentifier<T>): T;


	/**
	 * Synchronously creates an instance that is denoted by
	 * the descriptor
	 */
	createInstance<T>(descriptor: descriptors.SyncDescriptor0<T>): T;
	createInstance<A1, T>(descriptor: descriptors.SyncDescriptor1<A1, T>, a1: A1): T;
	createInstance<A1, A2, T>(descriptor: descriptors.SyncDescriptor2<A1, A2, T>, a1: A1, a2: A2): T;
	createInstance<A1, A2, A3, T>(descriptor: descriptors.SyncDescriptor3<A1, A2, A3, T>, a1: A1, a2: A2, a3: A3): T;
	createInstance<A1, A2, A3, A4, T>(descriptor: descriptors.SyncDescriptor4<A1, A2, A3, A4, T>, a1: A1, a2: A2, a3: A3, a4: A4): T;
	createInstance<A1, A2, A3, A4, A5, T>(descriptor: descriptors.SyncDescriptor5<A1, A2, A3, A4, A5, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): T;
	createInstance<A1, A2, A3, A4, A5, A6, T>(descriptor: descriptors.SyncDescriptor6<A1, A2, A3, A4, A5, A6, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): T;
	createInstance<A1, A2, A3, A4, A5, A6, A7, T>(descriptor: descriptors.SyncDescriptor7<A1, A2, A3, A4, A5, A6, A7, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): T;
	createInstance<A1, A2, A3, A4, A5, A6, A7, A8, T>(descriptor: descriptors.SyncDescriptor8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7, a8: A8): T;

	createInstance<T>(ctor: IConstructorSignature0<T>): T;
	createInstance<A1, T>(ctor: IConstructorSignature1<A1, T>, first: A1): T;
	createInstance<A1, A2, T>(ctor: IConstructorSignature2<A1, A2, T>, first: A1, second: A2): T;
	createInstance<A1, A2, A3, T>(ctor: IConstructorSignature3<A1, A2, A3, T>, first: A1, second: A2, third: A3): T;
	createInstance<A1, A2, A3, A4, T>(ctor: IConstructorSignature4<A1, A2, A3, A4, T>, first: A1, second: A2, third: A3, fourth: A4): T;
	createInstance<A1, A2, A3, A4, A5, T>(ctor: IConstructorSignature5<A1, A2, A3, A4, A5, T>, first: A1, second: A2, third: A3, fourth: A4, fifth: A5): T;
	createInstance<A1, A2, A3, A4, A5, A6, T>(ctor: IConstructorSignature6<A1, A2, A3, A4, A5, A6, T>, first: A1, second: A2, third: A3, fourth: A4, fifth: A5, sixth: A6): T;
	createInstance<A1, A2, A3, A4, A5, A6, A7, T>(ctor: IConstructorSignature7<A1, A2, A3, A4, A5, A6, A7, T>, first: A1, second: A2, third: A3, fourth: A4, fifth: A5, sixth: A6, seventh: A7): T;
	createInstance<A1, A2, A3, A4, A5, A6, A7, A8, T>(ctor: IConstructorSignature8<A1, A2, A3, A4, A5, A6, A7, A8, T>, first: A1, second: A2, third: A3, fourth: A4, fifth: A5, sixth: A6, seventh: A7, eigth: A8): T;

	/**
	 * Asynchronously creates an instance that is denoted by
	 * the descriptor
	 */
	createInstance<T>(descriptor: descriptors.AsyncDescriptor0<T>): TPromise<T>;
	createInstance<A1, T>(descriptor: descriptors.AsyncDescriptor1<A1, T>, a1: A1): TPromise<T>;
	createInstance<A1, A2, T>(descriptor: descriptors.AsyncDescriptor2<A1, A2, T>, a1: A1, a2: A2): TPromise<T>;
	createInstance<A1, A2, A3, T>(descriptor: descriptors.AsyncDescriptor3<A1, A2, A3, T>, a1: A1, a2: A2, a3: A3): TPromise<T>;
	createInstance<A1, A2, A3, A4, T>(descriptor: descriptors.AsyncDescriptor4<A1, A2, A3, A4, T>, a1: A1, a2: A2, a3: A3, a4: A4): TPromise<T>;
	createInstance<A1, A2, A3, A4, A5, T>(descriptor: descriptors.AsyncDescriptor5<A1, A2, A3, A4, A5, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5): TPromise<T>;
	createInstance<A1, A2, A3, A4, A5, A6, T>(descriptor: descriptors.AsyncDescriptor6<A1, A2, A3, A4, A5, A6, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6): TPromise<T>;
	createInstance<A1, A2, A3, A4, A5, A6, A7, T>(descriptor: descriptors.AsyncDescriptor7<A1, A2, A3, A4, A5, A6, A7, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7): TPromise<T>;
	createInstance<A1, A2, A3, A4, A5, A6, A7, A8, T>(descriptor: descriptors.AsyncDescriptor8<A1, A2, A3, A4, A5, A6, A7, A8, T>, a1: A1, a2: A2, a3: A3, a4: A4, a5: A5, a6: A6, a7: A7, a8: A8): TPromise<T>;

	createInstance<T>(descriptor: descriptors.AsyncDescriptor<T>, ...args: any[]): TPromise<T>;

	/**
	 *
	 */
	invokeFunction<R>(ctor: IFunctionSignature0<R>): R;
	invokeFunction<A1, R>(ctor: IFunctionSignature1<A1, R>, first: A1): R;
	invokeFunction<A1, A2, R>(ctor: IFunctionSignature2<A1, A2, R>, first: A1, second: A2): R;
	invokeFunction<A1, A2, A3, R>(ctor: IFunctionSignature3<A1, A2, A3, R>, first: A1, second: A2, third: A3): R;
	invokeFunction<A1, A2, A3, A4, R>(ctor: IFunctionSignature4<A1, A2, A3, A4, R>, first: A1, second: A2, third: A3, fourth: A4): R;
	invokeFunction<A1, A2, A3, A4, A5, R>(ctor: IFunctionSignature5<A1, A2, A3, A4, A5, R>, first: A1, second: A2, third: A3, fourth: A4, fifth: A5): R;
	invokeFunction<A1, A2, A3, A4, A5, A6, R>(ctor: IFunctionSignature6<A1, A2, A3, A4, A5, A6, R>, first: A1, second: A2, third: A3, fourth: A4, fifth: A5, sixth: A6): R;
	invokeFunction<A1, A2, A3, A4, A5, A6, A7, R>(ctor: IFunctionSignature7<A1, A2, A3, A4, A5, A6, A7, R>, first: A1, second: A2, third: A3, fourth: A4, fifth: A5, sixth: A6, seventh: A7): R;
	invokeFunction<A1, A2, A3, A4, A5, A6, A7, A8, R>(ctor: IFunctionSignature8<A1, A2, A3, A4, A5, A6, A7, A8, R>, first: A1, second: A2, third: A3, fourth: A4, fifth: A5, sixth: A6, seventh: A7, eigth: A8): R;

	/**
	 * Creates a child of this service which inherts all current services
	 * and adds/overwrites the given services
	 */
	createChild(services: any): IInstantiationService;

	/**
	 * Registers a new service to this instantation service.
	 */
	registerService(name: string, service: any): void;

	/**
	 * Adds a service or a descriptor to the collection of services and
	 * treats it as a singleton which means every consumer will receive
	 * the same instance.
	 */
	addSingleton<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | descriptors.SyncDescriptor<T>): void;
}


/**
 * Identifies a service of type T
 */
export interface ServiceIdentifier<T> {
	(...args: any[]): void;
	type: T;
}

/**
 * A *only* valid way to create a {{ServiceIdentifier}}.
 */
export function createDecorator<T>(serviceId: string): { (...args: any[]): void; type: T; } {

	let ret = function(target: any, key: string, index: number): any {

		if (arguments.length !== 3) {
			throw new Error('@IServiceName-decorator can only be used to decorate a parameter');
		}

		if (target[_util.DI_TARGET] === target) {
			target[_util.DI_DEPENDENCIES].push({ serviceId, index });
		} else {
			target[_util.DI_DEPENDENCIES] = [{ serviceId, index }];
			target[_util.DI_TARGET] = target;
		}
	};

	ret[_util.DI_PROVIDES] = serviceId;
	// ret['type'] = undefined;
	return <any>ret;
}

/**
 * A service context which can be used to retrieve services
 * given a valid service identifer is being presented
 */
export interface Context {
	get<T>(id: ServiceIdentifier<T>): T;
}
