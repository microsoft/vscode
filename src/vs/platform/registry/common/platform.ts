/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Types = require('vs/base/common/types');
import Assert = require('vs/base/common/assert');
import { IInstantiationService, IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';

export interface IRegistry {

	/**
	 * Adds the extension functions and properties defined by data to the
	 * platform. The provided id must be unique.
	 * @param id a unique identifier
	 * @param data a contribution
	 */
	add(id: string, data: any): void;

	/**
	 * Returns true iff there is an extension with the provided id.
	 * @param id an extension identifier
	 */
	knows(id: string): boolean;

	/**
	 * Returns the extension functions and properties defined by the specified key or null.
	 * @param id an extension identifier
	 */
	as(id: string): any;
	as<T>(id: string): T;
}

class RegistryImpl implements IRegistry {

	private data: { [id: string]: any; };

	constructor() {
		this.data = {};
	}

	public add(id: string, data: any): void {
		Assert.ok(Types.isString(id));
		Assert.ok(Types.isObject(data));
		Assert.ok(!this.data.hasOwnProperty(id), 'There is already an extension with this id');

		this.data[id] = data;
	}

	public knows(id: string): boolean {
		return this.data.hasOwnProperty(id);
	}

	public as(id: string): any {
		return this.data[id] || null;
	}
}

export const Registry = <IRegistry>new RegistryImpl();

/**
 * A base class for registries that leverage the instantiation service to create instances.
 */
export class BaseRegistry<T> {
	private toBeInstantiated: IConstructorSignature0<T>[] = [];
	private instances: T[] = [];
	private instantiationService: IInstantiationService;

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;

		while (this.toBeInstantiated.length > 0) {
			let entry = this.toBeInstantiated.shift();
			this.instantiate(entry);
		}
	}

	private instantiate(ctor: IConstructorSignature0<T>): void {
		let instance = this.instantiationService.createInstance(ctor);
		this.instances.push(instance);
	}

	_register(ctor: IConstructorSignature0<T>): void {
		if (this.instantiationService) {
			this.instantiate(ctor);
		} else {
			this.toBeInstantiated.push(ctor);
		}
	}

	_getInstances(): T[] {
		return this.instances.slice(0);
	}

	_setInstances(instances: T[]): void {
		this.instances = instances;
	}
}
