/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServiceIdentifier, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';

export class StaticServiceAccessor implements ServicesAccessor {
	private services = new Map<ServiceIdentifier<unknown>, unknown>();

	public withService<T>(id: ServiceIdentifier<T>, service: T): this {
		this.services.set(id, service);
		return this;
	}

	public get<T>(id: ServiceIdentifier<T>): T {
		const value = this.services.get(id);
		if (!value) {
			throw new Error('Service does not exist');
		}
		return value as T;
	}

	getIfExists<T>(id: ServiceIdentifier<T>): T | undefined {
		const value = this.services.get(id);
		return value as T | undefined;
	}
}
