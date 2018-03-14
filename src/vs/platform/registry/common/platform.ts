/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Types = require('vs/base/common/types');
import Assert = require('vs/base/common/assert');

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
